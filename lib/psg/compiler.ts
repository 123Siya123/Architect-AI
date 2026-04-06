/**
 * =============================================================================
 * LIB/PSG/COMPILER.TS — PSG → Three.js Scene Compiler
 * =============================================================================
 *
 * This module converts the PSG data model (JSON) into Three.js geometry
 * that can be rendered in the 3D viewport. It is the BRIDGE between
 * the AI-readable data and the user-visible 3D scene.
 *
 * HOW IT WORKS:
 * 1. Takes a PSGProject (flat map of nodes)
 * 2. Walks the tree starting from root_node_id
 * 3. For each node, creates the appropriate Three.js geometry
 * 4. Applies materials (colors, textures) from the material library
 * 5. Returns a Three.js Group that can be added to the scene
 *
 * ARCHITECTURE NOTE:
 * This module does NOT directly create React Three Fiber components.
 * Instead, it provides helper functions that the React components
 * (WallMesh, RoofMesh, etc.) use to generate their geometry.
 * This separation allows the compiler to be tested independently
 * of React.
 *
 * COORDINATE SYSTEM:
 * - X = East (right when facing north)
 * - Y = Up (vertical)
 * - Z = South (towards the viewer in default camera)
 * - Units are METERS (1 unit = 1 meter)
 *
 * The Three.js scene uses the same coordinate system, so positions
 * in the PSG map directly to Three.js positions.
 * =============================================================================
 */

import * as THREE from 'three';
import type { PSGNode, PSGProject, Material } from '@/types';

// =============================================================================
// GEOMETRY GENERATORS
// =============================================================================
// Each function creates a Three.js BufferGeometry for a specific node type.
// The geometry is centered at the origin — positioning is handled by the
// React component using the node's position property.

/**
 * Creates wall geometry — a simple box.
 *
 * WHY A BOX AND NOT A PLANE?
 * Walls have thickness (z dimension). In walk-through mode, you need to
 * see the wall's edge/depth when looking at it from the side. A plane
 * would be invisible from certain angles.
 *
 * @param node - The Wall PSGNode
 * @returns BufferGeometry — a box with width × height × thickness
 */
export function compileWallGeometry(node: PSGNode): THREE.BufferGeometry {
    const { x: width, y: height, z: thickness } = node.dimensions;

    // Perfectly round walls bridge the gap for organic or circular elements
    if (node.wall_style === 'round' || node.wall_style === 'curved') {
        const radius = Math.max(width, thickness) / 2;
        // high segment count (64) ensures perfect curve visually
        return new THREE.CylinderGeometry(radius, radius, height, 64);
    }

    const geometry = new THREE.BoxGeometry(width, height, thickness);
    return geometry;
}

/**
 * Creates floor/slab geometry — a flat box.
 *
 * Slabs are very thin (0.3m typically) compared to their width/depth.
 * The geometry is a box with the y-dimension being the slab thickness.
 */
export function compileSlabGeometry(node: PSGNode): THREE.BufferGeometry {
    const { x: width, y: thickness, z: depth } = node.dimensions;
    const geometry = new THREE.BoxGeometry(width, thickness, depth);
    return geometry;
}

/**
 * Creates window geometry — a thin transparent plane with a frame.
 *
 * The window geometry consists of:
 * 1. An outer frame (slightly larger than the opening)
 * 2. A glass pane (transparent, inside the frame)
 *
 * For now, we return a simple plane. The frame will be added
 * as a separate geometry in phase 2.
 */
export function compileWindowGeometry(node: PSGNode): THREE.BufferGeometry {
    const width = node.opening_width || node.dimensions.x;
    const height = node.opening_height || node.dimensions.y;
    // Window is rendered as a thin box (50mm depth) with glass material
    // The frame is achieved by coloring only the edges in the renderer
    const geometry = new THREE.BoxGeometry(width, height, 0.05);
    return geometry;
}

/**
 * Creates door geometry — similar to window but with a door frame.
 *
 * The door is a box (has thickness) unlike the window plane,
 * because doors swing open and need visible depth.
 */
export function compileDoorGeometry(node: PSGNode): THREE.BufferGeometry {
    const width = node.opening_width || node.dimensions.x;
    const height = node.opening_height || node.dimensions.y;
    const thickness = 0.05; // 50mm door thickness
    const geometry = new THREE.BoxGeometry(width, height, thickness);
    return geometry;
}

/**
 * Creates roof geometry based on the roof_style property.
 *
 * SUPPORTED STYLES:
 * - 'flat': Simple box (like a slab but higher up)
 * - 'gable': Two angled planes meeting at a ridge
 * - 'hip': Four angled planes (more complex)
 * - 'shed': Single angled plane
 *
 * For Phase 1, all roofs are flat boxes. The parametric roof
 * generator will be built in Phase 3.
 *
 * TODO (Phase 3): Implement parametric roof generation using
 * custom BufferGeometry with computed vertices based on
 * pitch angle, overhang, and hip/gable style.
 */
export function compileRoofGeometry(node: PSGNode): THREE.BufferGeometry {
    const { x: width, y: thickness, z: depth } = node.dimensions;
    const pitch = node.roof_pitch_degrees || 0;

    // Perfect custom standard roof styles
    if (node.roof_style === 'dome') {
        const radius = Math.max(width, depth) / 2;
        // Half sphere perfectly rendered
        return new THREE.SphereGeometry(radius, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    }
    if (node.roof_style === 'conical') {
        const radius = Math.max(width, depth) / 2;
        const height = (pitch > 0) ? radius * Math.tan((pitch * Math.PI) / 180) : thickness;
        return new THREE.ConeGeometry(radius, height, 64);
    }

    if (node.roof_style === 'flat' || pitch === 0) {
        return new THREE.BoxGeometry(width, thickness, depth);
    }

    if (node.roof_style === 'gable') {
        return compileGableRoof(width, depth, pitch, thickness);
    }

    if (node.roof_style === 'hip') {
        return compileHipRoof(width, depth, pitch, thickness);
    }

    if (node.roof_style === 'shed') {
        return compileShedRoof(width, depth, pitch, thickness);
    }

    // Default: flat box for unrecognized styles
    return new THREE.BoxGeometry(width, thickness, depth);
}

/**
 * Creates a gable roof shape (two angled planes meeting at a ridge).
 *
 * GEOMETRY MATH:
 * The ridge height is calculated from the pitch angle:
 *   ridgeHeight = tan(pitch) * (depth / 2)
 *
 * The shape is a triangular prism:
 *   - Two triangular faces (front and back gable ends)
 *   - Two rectangular faces (the two sloping roof surfaces)
 *   - One rectangular face (the bottom/ceiling)
 */
function compileGableRoof(
    width: number,
    depth: number,
    pitchDegrees: number,
    _thickness: number
): THREE.BufferGeometry {
    const pitchRad = (pitchDegrees * Math.PI) / 180;
    const ridgeHeight = Math.tan(pitchRad) * (depth / 2);

    // Define the 6 vertices of the triangular prism
    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    const geometry = new THREE.BufferGeometry();

    // Vertices: bottom rectangle + ridge line
    const vertices = new Float32Array([
        // Bottom face (4 corners)
        -halfWidth, 0, -halfDepth,       // 0: back-left
        halfWidth, 0, -halfDepth,        // 1: back-right
        halfWidth, 0, halfDepth,         // 2: front-right
        -halfWidth, 0, halfDepth,        // 3: front-left
        // Ridge line (2 points)
        -halfWidth, ridgeHeight, 0,      // 4: ridge-left
        halfWidth, ridgeHeight, 0,       // 5: ridge-right
    ]);

    // Triangle indices (each face is two triangles)
    const indices = [
        // Bottom face
        0, 1, 2, 0, 2, 3,
        // Back slope (0, 1, 5, 4)
        0, 4, 5, 0, 5, 1,
        // Front slope (3, 2, 5, 4)
        3, 2, 5, 3, 5, 4,
        // Left gable triangle (0, 3, 4)
        0, 3, 4,
        // Right gable triangle (1, 5, 2)
        1, 5, 2,
    ];

    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * Creates stairs geometry.
 *
 * Supports straight, L-shaped, U-shaped, and spiral stairs.
 */
export function compileStairsGeometry(node: PSGNode): THREE.Group {
    const riserHeight = node.stair_riser_height || 0.18;
    const treadDepth = node.stair_tread_depth || 0.28;
    const totalHeight = node.dimensions.y;
    // For spiral, dimensions.x/z represent the bounding diameter.
    // For straight, x is width, z is depth.
    const stairWidth = node.stair_width || node.dimensions.x;

    const numSteps = Math.ceil(totalHeight / riserHeight);
    const group = new THREE.Group();

    const style = node.stair_style || 'straight';

    if (style === 'spiral' || style === 'curved' || style === 'circular') {
        const radius = Math.max(node.dimensions.x, node.dimensions.z) / 2;
        const innerRadius = node.stair_inner_radius || (style === 'spiral' ? 0.05 : radius * 0.3); // Pole for spiral, void for curved
        const totalAngle = (style === 'circular') ? 360 : 270; // Degrees of turn
        const startAngle = 0;

        // 1. Central Pole (only for spiral)
        if (style === 'spiral') {
            const poleGeom = new THREE.CylinderGeometry(innerRadius, innerRadius, totalHeight, 16);
            const pole = new THREE.Mesh(poleGeom);
            pole.position.set(0, 0, 0);
            group.add(pole);
        }

        // 2. Steps
        // For curved stairs, we calculate step width based on outer radius - inner radius
        const stepWidth = radius - innerRadius;
        // Angle per step
        const anglePerStep = (totalAngle * Math.PI / 180) / numSteps;

        for (let i = 0; i < numSteps; i++) {
            // A wedge-like step using box geometry is crude.
            // Better: Extruded shape for the tread.
            const shape = new THREE.Shape();
            // Create a wedge shape for the tread
            // Inner arc
            shape.absarc(0, 0, innerRadius, 0, anglePerStep, false);
            // Outer line
            shape.lineTo(Math.cos(anglePerStep) * radius, Math.sin(anglePerStep) * radius);
            // Outer arc (backwards)
            shape.absarc(0, 0, radius, anglePerStep, 0, true);
            // Close
            shape.lineTo(innerRadius, 0);

            const stepGeom = new THREE.ExtrudeGeometry(shape, {
                depth: riserHeight,
                bevelEnabled: false
            });

            // Rotate geometry so it lays flat (Extrude is along Z) -> rotate X -90
            stepGeom.rotateX(-Math.PI / 2);

            // Now position it
            const step = new THREE.Mesh(stepGeom);
            
            // Rotate around Y axis for the spiral effect
            step.rotation.y = -i * anglePerStep;
            
            // Move vertically
            step.position.y = i * riserHeight + riserHeight / 2 - totalHeight / 2;

            group.add(step);
        }
    } else if (style === 'l_shaped' || style === 'quarter_turn') {
        // L-shaped: Split steps into two flights with a landing.
        // Simplified: 50% steps, landing, 50% steps rotated 90 deg.
        const flight1Steps = Math.floor(numSteps / 2);
        const flight2Steps = numSteps - flight1Steps;
        const landingDepth = node.stair_landing_depth || stairWidth; // Square landing by default

        // Flight 1 (Lower)
        for (let i = 0; i < flight1Steps; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, riserHeight, treadDepth));
            step.position.set(
                0,
                i * riserHeight - totalHeight / 2 + riserHeight / 2,
                i * treadDepth - (flight1Steps * treadDepth + landingDepth) / 2
            );
            group.add(step);
        }

        // Landing
        const landingY = flight1Steps * riserHeight - totalHeight / 2 + riserHeight / 2; // Approx
        const landingZ = (flight1Steps * treadDepth - (flight1Steps * treadDepth + landingDepth) / 2) + treadDepth/2 + landingDepth/2;
        
        const landing = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, riserHeight, landingDepth));
        landing.position.set(0, landingY, landingZ);
        group.add(landing);

        // Flight 2 (Upper) - Rotated 90 degrees
        // Starts from the side of the landing
        const startX = stairWidth/2 + treadDepth/2; // Start adjacent to landing
        const startZ = landingZ; // Aligned with landing center Z
        const startY = landingY + riserHeight;

        for (let i = 0; i < flight2Steps; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, riserHeight, treadDepth));
            step.rotateY(Math.PI / 2); // Rotate 90
            step.position.set(
                startX + i * treadDepth,
                startY + i * riserHeight,
                startZ
            );
            group.add(step);
        }

    } else if (style === 'u_shaped' || style === 'half_turn') {
        // U-shaped: Flight 1, Landing, Flight 2 (180 deg turn)
        // Simplified: Parallel flights with a landing in between.
        const flight1Steps = Math.floor(numSteps / 2);
        const flight2Steps = numSteps - flight1Steps;
        const landingDepth = node.stair_landing_depth || stairWidth; // Width of 2 flights + gap? Just use width.

        // Offset the whole group so center is 0,0
        const offsetX = -stairWidth / 2; // Gap? Let's assume tight U.

        // Flight 1 (Up)
        for (let i = 0; i < flight1Steps; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, riserHeight, treadDepth));
            step.position.set(
                -stairWidth / 2 - 0.1, // Left side
                i * riserHeight - totalHeight / 2 + riserHeight / 2,
                i * treadDepth - (flight1Steps * treadDepth)/2
            );
            group.add(step);
        }

        // Landing (Spans both flights)
        const landingGeom = new THREE.BoxGeometry(stairWidth * 2 + 0.2, riserHeight, landingDepth);
        const landingY = flight1Steps * riserHeight - totalHeight / 2 + riserHeight / 2;
        const landingZ = (flight1Steps * treadDepth)/2 + landingDepth/2;
        const landing = new THREE.Mesh(landingGeom);
        landing.position.set(0, landingY, landingZ);
        group.add(landing);

        // Flight 2 (Up, reverse direction)
        for (let i = 0; i < flight2Steps; i++) {
            const step = new THREE.Mesh(new THREE.BoxGeometry(stairWidth, riserHeight, treadDepth));
            step.position.set(
                stairWidth / 2 + 0.1, // Right side
                (flight1Steps + i + 1) * riserHeight - totalHeight / 2 + riserHeight / 2,
                (flight1Steps * treadDepth)/2 - i * treadDepth - treadDepth/2 + landingDepth/2 - landingDepth // Backwards from landing
            );
            // Actually, simply mirror Z position relative to landing?
            // Let's re-calculate Z:
            // Landing is at Z_landing.
            // Step 0 of flight 2 is at Z_landing - landingDepth/2 - treadDepth/2
            step.position.z = landingZ - landingDepth/2 - treadDepth/2 - i * treadDepth;
            
            group.add(step);
        }

    } else {
        // Default / Straight stairs
        for (let i = 0; i < numSteps; i++) {
            const stepGeometry = new THREE.BoxGeometry(stairWidth, riserHeight, treadDepth);
            const step = new THREE.Mesh(stepGeometry);

            // Each step is positioned progressively higher and further forward
            // We subtract totalHeight / 2 to center the entire staircase on the Y axis
            step.position.set(
                0,
                i * riserHeight + riserHeight / 2 - totalHeight / 2,
                i * treadDepth - (numSteps * treadDepth) / 2
            );

            group.add(step);
        }
    }

    return group;
}

/**
 * Creates a hip roof shape (four sloped planes, shorter ridge than building).
 */
function compileHipRoof(
    width: number,
    depth: number,
    pitchDegrees: number,
    _thickness: number
): THREE.BufferGeometry {
    const pitchRad = (pitchDegrees * Math.PI) / 180;
    const ridgeHeight = Math.tan(pitchRad) * (depth / 2);
    const halfW = width / 2;
    const halfD = depth / 2;
    const ridgeInset = Math.min(halfD, halfW);

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        -halfW, 0, -halfD,                          // 0: back-left
        halfW, 0, -halfD,                          // 1: back-right
        halfW, 0, halfD,                          // 2: front-right
        -halfW, 0, halfD,                          // 3: front-left
        -halfW + ridgeInset, ridgeHeight, 0,         // 4: ridge-left
        halfW - ridgeInset, ridgeHeight, 0,         // 5: ridge-right
    ]);
    const indices = [
        0, 1, 2, 0, 2, 3,     // bottom
        0, 4, 5, 0, 5, 1,     // back slope
        3, 2, 5, 3, 5, 4,     // front slope
        0, 3, 4,               // left hip
        1, 5, 2,               // right hip
    ];
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

/**
 * Creates a shed (mono-pitch) roof — single sloped plane.
 */
function compileShedRoof(
    width: number,
    depth: number,
    pitchDegrees: number,
    _thickness: number
): THREE.BufferGeometry {
    const pitchRad = (pitchDegrees * Math.PI) / 180;
    const rise = Math.tan(pitchRad) * depth;
    const halfW = width / 2;
    const halfD = depth / 2;

    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([
        -halfW, rise, -halfD,   // 0: back-left (high)
        halfW, rise, -halfD,   // 1: back-right (high)
        halfW, 0, halfD,    // 2: front-right (low)
        -halfW, 0, halfD,    // 3: front-left (low)
    ]);
    const indices = [0, 1, 2, 0, 2, 3];
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

/** Column geometry — tall, narrow box with square cross-section */
export function compileColumnGeometry(node: PSGNode): THREE.BufferGeometry {
    return new THREE.BoxGeometry(node.dimensions.x, node.dimensions.y, node.dimensions.z);
}

/** Beam geometry — horizontal rectangular box */
export function compileBeamGeometry(node: PSGNode): THREE.BufferGeometry {
    return new THREE.BoxGeometry(node.dimensions.x, node.dimensions.y, node.dimensions.z);
}

/** Foundation geometry — large flat slab below grade */
export function compileFoundationGeometry(node: PSGNode): THREE.BufferGeometry {
    return new THREE.BoxGeometry(node.dimensions.x, node.dimensions.y, node.dimensions.z);
}

/** Partition geometry — thin internal wall */
export function compilePartitionGeometry(node: PSGNode): THREE.BufferGeometry {
    return new THREE.BoxGeometry(node.dimensions.x, node.dimensions.y, node.dimensions.z);
}

/** Balcony geometry — floor slab + simple railing */
export function compileBalconyGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;
    const railHeight = 1.1; // Standard railing height
    const railThick = 0.04;

    // 1. The floor slab
    const slabGeom = new THREE.BoxGeometry(w, h, d);
    const slab = new THREE.Mesh(slabGeom);
    group.add(slab);

    // 2. Railing posts (4 corners)
    const postGeom = new THREE.BoxGeometry(railThick, railHeight, railThick);
    const hw = w / 2 - railThick / 2;
    const hd = d / 2 - railThick / 2;
    const py = h / 2 + railHeight / 2;

    const postPositions = [
        [hw, py, hd], [-hw, py, hd], [hw, py, -hd], [-hw, py, -hd]
    ];

    postPositions.forEach(pos => {
        const post = new THREE.Mesh(postGeom);
        post.position.set(pos[0], pos[1], pos[2]);
        group.add(post);
    });

    // 3. Top rails (horizontal)
    const railY = h / 2 + railHeight;

    // Long rails
    const longRailGeom = new THREE.BoxGeometry(w, railThick, railThick);
    const railFront = new THREE.Mesh(longRailGeom);
    railFront.position.set(0, railY, hd);
    group.add(railFront);

    const railBack = new THREE.Mesh(longRailGeom);
    railBack.position.set(0, railY, -hd);
    group.add(railBack);

    // Side rails
    const sideRailGeom = new THREE.BoxGeometry(railThick, railThick, d);
    const railLeft = new THREE.Mesh(sideRailGeom);
    railLeft.position.set(-hw, railY, 0);
    group.add(railLeft);

    const railRight = new THREE.Mesh(sideRailGeom);
    railRight.position.set(hw, railY, 0);
    group.add(railRight);

    return group;
}

<<<<<<< HEAD
/** Chimney geometry — tall, narrow box with a small cap */
export function compileChimneyGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x, y, z } = node.dimensions;

    // Main body
    const bodyGeom = new THREE.BoxGeometry(x, y, z);
    const body = new THREE.Mesh(bodyGeom);
    group.add(body);

    // Cap (slightly wider, flat)
    const capGeom = new THREE.BoxGeometry(x * 1.1, 0.1, z * 1.1);
    const cap = new THREE.Mesh(capGeom);
    cap.position.y = y / 2 + 0.05;
    group.add(cap);

    // Flue (smaller protrusion on top)
    const flueGeom = new THREE.CylinderGeometry(x * 0.2, x * 0.2, 0.3, 16);
    const flue = new THREE.Mesh(flueGeom);
    flue.position.y = y / 2 + 0.25;
    group.add(flue);

    return group;
}

/** Garage geometry — large box with a "door" inset on one side */
export function compileGarageGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;

    // The main enclosure
    const shellGeom = new THREE.BoxGeometry(w, h, d);
    const shell = new THREE.Mesh(shellGeom);
    group.add(shell);

    // The "door" indication (slightly inset or proud)
    const doorW = w * 0.85;
    const doorH = h * 0.8;
    const doorGeom = new THREE.BoxGeometry(doorW, doorH, 0.05);
    const door = new THREE.Mesh(doorGeom);
    // Position it at the front (Z+ direction)
    door.position.set(0, -h / 2 + doorH / 2, d / 2 + 0.01);
    group.add(door);

    return group;
}

/** Toilet geometry — bowl + tank */
export function compileToiletGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;

    // Bowl (oval extrusion or sphere)
    const bowlGeom = new THREE.SphereGeometry(Math.min(w, d) * 0.35, 16, 12);
    const bowl = new THREE.Mesh(bowlGeom);
    bowl.scale.set(1, 0.8, 1.4);
    bowl.position.set(0, -h / 2 + (Math.min(w, d) * 0.35 * 0.8), d * 0.1);
    group.add(bowl);

    // Tank (rectangular box on back)
    const tankGeom = new THREE.BoxGeometry(w * 0.8, h * 0.6, d * 0.3);
    const tank = new THREE.Mesh(tankGeom);
    tank.position.set(0, -h / 2 + (h * 0.6 / 2) + 0.1, -d / 2 + (d * 0.3 / 2));
    group.add(tank);

    return group;
}

/** Sink geometry — basin */
export function compileSinkGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;

    // Basin block
    const basinGeom = new THREE.BoxGeometry(w, h * 0.2, d);
    const basin = new THREE.Mesh(basinGeom);
    basin.position.set(0, h / 2 - h * 0.1, 0);
    group.add(basin);

    // Faucet (bent pipe)
    const faucetGeom = new THREE.CylinderGeometry(0.02, 0.02, 0.2, 8);
    const faucet = new THREE.Mesh(faucetGeom);
    faucet.position.set(0, h / 2 + 0.1, -d / 2 + 0.05);
    group.add(faucet);

    // Pedestal or legs if tall
    if (h > 0.5) {
        const pedGeom = new THREE.CylinderGeometry(0.1, 0.12, h - 0.1, 12);
        const ped = new THREE.Mesh(pedGeom);
        ped.position.set(0, -0.05, 0);
        group.add(ped);
    }

    return group;
}

/** Shower geometry — base + glass walls */
export function compileShowerGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;

    // Base tray
    const baseGeom = new THREE.BoxGeometry(w, 0.1, d);
    const base = new THREE.Mesh(baseGeom);
    base.position.y = -h / 2 + 0.05;
    group.add(base);

    // Glass walls (2 sides usually, Corner shower)
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.2,
        roughness: 0,
        metalness: 0,
        transmission: 0.95,
        side: THREE.DoubleSide
    });

    const wall1Geom = new THREE.PlaneGeometry(w, h - 0.1);
    const wall1 = new THREE.Mesh(wall1Geom, glassMat);
    wall1.position.set(0, 0.05, d / 2);
    group.add(wall1);

    const wall2Geom = new THREE.PlaneGeometry(d, h - 0.1);
    const wall2 = new THREE.Mesh(wall2Geom, glassMat);
    wall2.rotation.y = Math.PI / 2;
    wall2.position.set(w / 2, 0.05, 0);
    group.add(wall2);

    return group;
}

/** Bathtub geometry — oval/rectangular tub */
export function compileBathtubGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;

    // The shell
    const shellGeom = new THREE.BoxGeometry(w, h, d);
    const shell = new THREE.Mesh(shellGeom);
    group.add(shell);

    // The "hollow" indication (darker rectangle on top)
    const hollowGeom = new THREE.PlaneGeometry(w * 0.9, d * 0.85);
    const hollow = new THREE.Mesh(hollowGeom);
    hollow.rotation.x = -Math.PI / 2;
    hollow.position.y = h / 2 + 0.001;
    group.add(hollow);

    return group;
}

/** Electrical device geometry — tiny box */
export function compileElectricalDeviceGeometry(node: PSGNode): THREE.BufferGeometry {
    // 100mm x 100mm x 20mm standard box
    return new THREE.BoxGeometry(0.1, 0.1, 0.02);
=======
// =============================================================================
// PLUMBING FIXTURE GEOMETRY
// =============================================================================

/** Toilet geometry — seated bowl + cistern block */
export function compileToiletGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;
    // Bowl (front, rounded box)
    const bowlW = w * 0.9;
    const bowlH = h * 0.5;
    const bowlD = d * 0.65;
    const bowl = new THREE.Mesh(new THREE.BoxGeometry(bowlW, bowlH, bowlD));
    bowl.position.set(0, bowlH / 2, d * 0.1);
    group.add(bowl);
    // Cistern (back, taller box)
    const cisternW = w * 0.8;
    const cisternH = h;
    const cisternD = d * 0.3;
    const cistern = new THREE.Mesh(new THREE.BoxGeometry(cisternW, cisternH, cisternD));
    cistern.position.set(0, cisternH / 2, -d / 2 + cisternD / 2);
    group.add(cistern);
    // Seat (thin slab on top of bowl)
    const seat = new THREE.Mesh(new THREE.BoxGeometry(bowlW, 0.03, bowlD));
    seat.position.set(0, bowlH + 0.015, d * 0.1);
    group.add(seat);
    return group;
}

/** Sink geometry — basin + pedestal */
export function compileSinkGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;
    // Basin (top)
    const basin = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.2, d));
    basin.position.set(0, h - h * 0.1, 0);
    group.add(basin);
    // Pedestal (narrow column underneath)
    const pedW = w * 0.3;
    const pedH = h * 0.8;
    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(pedW, pedH, pedW));
    pedestal.position.set(0, pedH / 2, 0);
    group.add(pedestal);
    return group;
}

/** Shower geometry — enclosure walls + tray */
export function compileShowerGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;
    const wallThick = 0.03;
    // Tray (base)
    const tray = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d));
    tray.position.set(0, 0.04, 0);
    group.add(tray);
    // Glass panels (two sides — back and one side, leaving front open)
    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallThick));
    backPanel.position.set(0, h / 2, -d / 2 + wallThick / 2);
    group.add(backPanel);
    const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(wallThick, h, d));
    sidePanel.position.set(-w / 2 + wallThick / 2, h / 2, 0);
    group.add(sidePanel);
    return group;
}

/** Bathtub geometry — elongated tub shape */
export function compileBathtubGeometry(node: PSGNode): THREE.Group {
    const group = new THREE.Group();
    const { x: w, y: h, z: d } = node.dimensions;
    const wallThick = 0.05;
    // Outer shell
    const outer = new THREE.Mesh(new THREE.BoxGeometry(w, h, d));
    outer.position.set(0, h / 2, 0);
    group.add(outer);
    // Inner cavity (slightly smaller, raised to create walls)
    const inner = new THREE.Mesh(new THREE.BoxGeometry(w - wallThick * 2, h * 0.6, d - wallThick * 2));
    inner.position.set(0, h * 0.5 + h * 0.2, 0);
    group.add(inner);
    return group;
}

// =============================================================================
// ELECTRICAL FIXTURE GEOMETRY
// =============================================================================

/** LightSwitch geometry — small wall-mounted plate */
export function compileLightSwitchGeometry(node: PSGNode): THREE.BufferGeometry {
    const { x: w, y: h, z: d } = node.dimensions;
    return new THREE.BoxGeometry(
        Math.max(w, 0.08),
        Math.max(h, 0.12),
        Math.max(d, 0.02)
    );
}

/** ElectricalOutlet geometry — small wall-mounted plate */
export function compileElectricalOutletGeometry(node: PSGNode): THREE.BufferGeometry {
    const { x: w, y: h, z: d } = node.dimensions;
    return new THREE.BoxGeometry(
        Math.max(w, 0.08),
        Math.max(h, 0.08),
        Math.max(d, 0.02)
    );
}

/** ElectricalPanel geometry — wall-mounted cabinet */
export function compileElectricalPanelGeometry(node: PSGNode): THREE.BufferGeometry {
    return new THREE.BoxGeometry(node.dimensions.x, node.dimensions.y, node.dimensions.z);
}

// =============================================================================
// BUILDING ELEMENT GEOMETRY
// =============================================================================

/** Garage geometry — large box enclosure */
export function compileGarageGeometry(node: PSGNode): THREE.BufferGeometry {
    return new THREE.BoxGeometry(node.dimensions.x, node.dimensions.y, node.dimensions.z);
}

/** Chimney geometry — tall vertical shaft */
export function compileChimneyGeometry(node: PSGNode): THREE.BufferGeometry {
    return new THREE.BoxGeometry(node.dimensions.x, node.dimensions.y, node.dimensions.z);
>>>>>>> origin/main
}

/** Custom geometry — parses parametric instructions from AI for perfect custom objects */
export function compileCustomGeometry(node: PSGNode): THREE.BufferGeometry | THREE.Group {
    if (node.custom_geometry) {
        const cg = node.custom_geometry;
        const segs = cg.segments || 32;
        try {
            // Normalize to lowercase — Gemini API may return uppercased enum values
            switch (cg.type?.toLowerCase()) {
                case 'code': {
                    if (cg.code) {
                        try {
                            // The true UNIVERSE SOLUTION: dynamically evaluate AI-generated Three.js script.
                            // The script receives the THREE module, plus basic spatial bounds (width, height, depth, radius, segments).
                            // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
                            const customFunc = new Function('THREE', 'width', 'height', 'depth', 'radius', 'segments', cg.code);

                            const radius = cg.radius || Math.max(node.dimensions.x, node.dimensions.z) / 2;
                            // Execute the code script the AI provided.
                            const result = customFunc(THREE, node.dimensions.x, node.dimensions.y, node.dimensions.z, radius, segs);

                            if (result instanceof THREE.BufferGeometry || result instanceof THREE.Group) {
                                return result;
                            }
                            console.warn('AI generated custom code did not return a valid THREE.BufferGeometry or THREE.Group.', result);
                        } catch (err) {
                            console.error('Failed to execute AI custom Three.js code:', err);
                        }
                    }
                    break;
                }
                case 'sphere':
                    return new THREE.SphereGeometry(
                        cg.radius || Math.max(node.dimensions.x, node.dimensions.z) / 2,
                        segs, Math.ceil(segs / 2)
                    );
                case 'cylinder':
                    return new THREE.CylinderGeometry(
                        cg.radius || node.dimensions.x / 2,
                        cg.radius || node.dimensions.x / 2,
                        cg.height || node.dimensions.y,
                        segs
                    );
                case 'cone':
                    return new THREE.ConeGeometry(
                        cg.radius || node.dimensions.x / 2,
                        cg.height || node.dimensions.y,
                        segs
                    );
                case 'lathe':
                    if (cg.profile_points && cg.profile_points.length > 0) {
                        const points = cg.profile_points.map(p => new THREE.Vector2(p[0], p[1]));
                        return new THREE.LatheGeometry(points, segs);
                    }
                    break;
                case 'arch': {
                    const width = node.dimensions.x;
                    const height = cg.height || node.dimensions.y;
                    const thickness = cg.thickness || 0.2; // Width of the solid part of arch

                    const archShape = new THREE.Shape();
                    archShape.moveTo(-width / 2, 0);

                    // Left leg outer
                    archShape.lineTo(-width / 2, height - width / 2);
                    // Outer arc
                    archShape.absarc(0, height - width / 2, width / 2, Math.PI, 0, true);
                    // Right leg outer
                    archShape.lineTo(width / 2, 0);
                    // Inner leg right
                    archShape.lineTo(width / 2 - thickness, 0);
                    // Inner leg right going up
                    archShape.lineTo(width / 2 - thickness, height - width / 2);
                    // Inner arc (notice we use counter-clockwise false, wait true is counter clockwise in threejs, false is clockwise for shapes)
                    archShape.absarc(0, height - width / 2, width / 2 - thickness, 0, Math.PI, false);
                    // Inner leg left
                    archShape.lineTo(-width / 2 + thickness, 0);
                    // Close at start
                    archShape.lineTo(-width / 2, 0);

                    const extrudeSettings = {
                        depth: cg.depth || node.dimensions.z,
                        curveSegments: segs,
                        bevelEnabled: false
                    };
                    const geom = new THREE.ExtrudeGeometry(archShape, extrudeSettings);
                    // Center the extrusion along Z
                    geom.translate(0, 0, -(cg.depth || node.dimensions.z) / 2);
                    return geom;
                }
                case 'extrusion':
                case 'sweep':
                    if (cg.profile_points && cg.profile_points.length > 0) {
                        const shape = new THREE.Shape();
                        shape.moveTo(cg.profile_points[0][0], cg.profile_points[0][1]);
                        for (let i = 1; i < cg.profile_points.length; i++) {
                            shape.lineTo(cg.profile_points[i][0], cg.profile_points[i][1]);
                        }
                        
                        let extrudeSettings: THREE.ExtrudeGeometryOptions;

                        if (cg.path_points && cg.path_points.length > 1) {
                            // Extrude along a 3D path
                            const path = new THREE.CatmullRomCurve3(
                                cg.path_points.map(p => new THREE.Vector3(p[0], p[1], p[2]))
                            );
                            extrudeSettings = {
                                extrudePath: path,
                                steps: segs * 2, // Higher resolution for path
                                bevelEnabled: false
                            };
                        } else {
                            // Standard linear extrusion
                            extrudeSettings = {
                                depth: cg.depth || node.dimensions.z,
                                bevelEnabled: false
                            };
                        }
                        
                        return new THREE.ExtrudeGeometry(shape, extrudeSettings);
                    }
                    break;
                case 'plane':
                    return new THREE.PlaneGeometry(node.dimensions.x, node.dimensions.z);
                case 'box':
                default:
                    // Fallthrough to generic box
                    break;
            }
        } catch (e) {
            console.error("Failed to compile custom parametric geometry", e);
        }
    }

    // Fallback if no valid custom instructions exist
    return new THREE.BoxGeometry(node.dimensions.x, node.dimensions.y, node.dimensions.z);
}

// =============================================================================
// MATERIAL COMPILATION
// =============================================================================

/**
 * Creates a Three.js material from a Material definition.
 *
 * WHY MeshStandardMaterial?
 * It supports PBR (Physically Based Rendering), which gives realistic
 * lighting. It's more expensive than MeshBasicMaterial but looks
 * dramatically better, especially in walk-through mode.
 *
 * @param material - The material definition from the library
 * @returns Three.js MeshStandardMaterial
 */
export function compileMaterial(material: Material): THREE.MeshStandardMaterial {
    // Use material-level PBR properties if defined, otherwise fall back to
    // category-specific defaults for realistic rendering
    const categoryPBR: Record<string, { roughness: number; metalness: number }> = {
        structure:     { roughness: 0.85, metalness: 0.0 },
        cladding:      { roughness: 0.75, metalness: 0.0 },
        insulation:    { roughness: 0.95, metalness: 0.0 },
        interior:      { roughness: 0.55, metalness: 0.0 },
        roofing:       { roughness: 0.7,  metalness: 0.0 },
        flooring:      { roughness: 0.4,  metalness: 0.0 },
        glazing:       { roughness: 0.0,  metalness: 0.1 },
        waterproofing: { roughness: 0.8,  metalness: 0.0 },
        other:         { roughness: 0.7,  metalness: 0.0 },
    };

    const defaults = categoryPBR[material.category] || categoryPBR.other;
    const roughness = (material as any).roughness ?? defaults.roughness;
    const metalness = (material as any).metalness ?? defaults.metalness;

    const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(material.color_hex),
        roughness,
        metalness,
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide,
    });

    // Load texture if a URL is provided in the material definition
    if (material.texture_url) {
        const textureLoader = new THREE.TextureLoader();
        const texture = textureLoader.load(material.texture_url);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        const repeatsPerMeter = 1 / (material.texture_scale || 1);
        texture.repeat.set(repeatsPerMeter, repeatsPerMeter);
        mat.map = texture;
    }

    return mat;
}

/**
 * Creates a glass material for windows.
 * Glass is transparent with high reflectivity.
 */
export function compileGlassMaterial(): THREE.MeshPhysicalMaterial {
    return new THREE.MeshPhysicalMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.3,
        roughness: 0.0,
        metalness: 0.0,
        transmission: 0.9,   // High transmission = see-through
        thickness: 0.01,      // Thin glass effect
        side: THREE.DoubleSide,
    });
}

// =============================================================================
// LAYER OVERLAY MATERIALS
// =============================================================================

/**
 * Creates materials for building system overlays.
 * These are used when the user toggles visibility of
 * electrical, plumbing, or thermal layers.
 */
export const LAYER_MATERIALS = {
    /** Electrical cables — yellow/orange */
    electrical: () =>
        new THREE.MeshBasicMaterial({
            color: 0xffaa00,
            transparent: true,
            opacity: 0.8,
        }),

    /** Plumbing supply (clean water) — green */
    plumbing_supply: () =>
        new THREE.MeshBasicMaterial({
            color: 0x00cc44,
            transparent: true,
            opacity: 0.8,
        }),

    /** Plumbing drain (waste water) — red */
    plumbing_drain: () =>
        new THREE.MeshBasicMaterial({
            color: 0xcc0000,
            transparent: true,
            opacity: 0.8,
        }),

    /** HVAC ducts — light blue */
    hvac: () =>
        new THREE.MeshBasicMaterial({
            color: 0x44aaff,
            transparent: true,
            opacity: 0.6,
        }),
};

// =============================================================================
// THERMAL OVERLAY SHADER
// =============================================================================

/**
 * Thermal heatmap shader material.
 *
 * HOW IT WORKS:
 * This is a custom ShaderMaterial that maps a temperature value (0-1)
 * to a color gradient (blue → green → yellow → red).
 *
 * The temperature values come from the thermal simulator (lib/thermal/).
 * They're passed to the shader as a texture or per-vertex attribute.
 *
 * TODO (Phase 5): Implement the full thermal simulation and connect
 * the results to this shader via a DataTexture or vertex colors.
 */
export function createThermalShaderMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            minTemp: { value: 0.0 },    // Minimum temperature (°C)
            maxTemp: { value: 30.0 },   // Maximum temperature (°C)
            opacity: { value: 0.6 },
        },
        vertexShader: `
      // Pass UV coordinates and position to fragment shader
      varying vec2 vUv;
      varying vec3 vPosition;
      
      void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
        fragmentShader: `
      // Heatmap color gradient: blue (cold) → green → yellow → red (hot)
      uniform float minTemp;
      uniform float maxTemp;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vPosition;
      
      // Maps a 0-1 value to a heatmap color
      vec3 heatmapColor(float t) {
        // 4-stop gradient: blue → cyan → yellow → red
        vec3 blue = vec3(0.0, 0.0, 1.0);
        vec3 cyan = vec3(0.0, 1.0, 1.0);
        vec3 yellow = vec3(1.0, 1.0, 0.0);
        vec3 red = vec3(1.0, 0.0, 0.0);
        
        if (t < 0.33) return mix(blue, cyan, t / 0.33);
        if (t < 0.66) return mix(cyan, yellow, (t - 0.33) / 0.33);
        return mix(yellow, red, (t - 0.66) / 0.34);
      }
      
      void main() {
        // For now, use UV.y as a placeholder temperature gradient
        // In Phase 5, this will be replaced with actual thermal data
        float temp = vUv.y;
        vec3 color = heatmapColor(temp);
        gl_FragColor = vec4(color, opacity);
      }
    `,
        transparent: true,
        side: THREE.DoubleSide,
    });
}

// =============================================================================
// FULL SCENE COMPILATION (UTILITY)
// =============================================================================

/**
 * Compiles the geometry type string from a PSGNode type.
 * Used by React components to determine which geometry generator to use.
 *
 * This is a lookup table rather than a switch statement because it's
 * called frequently during re-renders and lookup tables are faster.
 */
export const GEOMETRY_COMPILERS: Record<
    string,
    (node: PSGNode) => THREE.BufferGeometry | THREE.Group
> = {
    Wall: compileWallGeometry,
    Partition: compilePartitionGeometry,
    Slab: compileSlabGeometry,
    Floor: compileSlabGeometry,
    Foundation: compileFoundationGeometry,
    Window: compileWindowGeometry,
    Door: compileDoorGeometry,
    Roof: compileRoofGeometry,
    Stairs: compileStairsGeometry,
    Column: compileColumnGeometry,
    Beam: compileBeamGeometry,
    Balcony: compileBalconyGeometry,
    Garage: compileGarageGeometry,
    Chimney: compileChimneyGeometry,
    Toilet: compileToiletGeometry,
    Sink: compileSinkGeometry,
    Shower: compileShowerGeometry,
    Bathtub: compileBathtubGeometry,
    LightSwitch: compileElectricalDeviceGeometry,
    ElectricalOutlet: compileElectricalDeviceGeometry,
    ElectricalPanel: compileElectricalDeviceGeometry,
    Custom: compileCustomGeometry,
<<<<<<< HEAD
    Floor: compileSlabGeometry,
    Tower: compileColumnGeometry,
    Detail: compileColumnGeometry,
=======
    // Plumbing fixtures
    Toilet: compileToiletGeometry,
    Sink: compileSinkGeometry,
    Shower: compileShowerGeometry,
    Bathtub: compileBathtubGeometry,
    // Electrical fixtures
    LightSwitch: compileLightSwitchGeometry,
    ElectricalOutlet: compileElectricalOutletGeometry,
    ElectricalPanel: compileElectricalPanelGeometry,
    // Building elements
    Garage: compileGarageGeometry,
    Chimney: compileChimneyGeometry,
>>>>>>> origin/main
};

/**
 * Gets the appropriate geometry for a PSG node.
 * Falls back to a small cube if the node type is unknown.
 */
export function getGeometryForNode(
    node: PSGNode
): THREE.BufferGeometry | THREE.Group {
    const compiler = GEOMETRY_COMPILERS[node.type];
    if (compiler) {
        return compiler(node);
    }
    // Fallback: Use dimensions if unknown
    const w = node.dimensions?.x || 1;
    const h = node.dimensions?.y || 1;
    const d = node.dimensions?.z || 1;
    return new THREE.BoxGeometry(w, h, d);
}
