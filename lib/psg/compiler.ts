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
    const stairWidth = node.dimensions.x;

    const numSteps = Math.ceil(totalHeight / riserHeight);
    const group = new THREE.Group();

    if (node.stair_style === 'spiral') {
        const radius = stairWidth / 2;
        const poleRadius = 0.05;

        // 1. Central Pole
        const poleGeom = new THREE.CylinderGeometry(poleRadius, poleRadius, totalHeight, 16);
        const pole = new THREE.Mesh(poleGeom);
        // Position at local Y center since pole geometry is centered at its own Y origin
        pole.position.set(0, totalHeight / 2, 0);
        group.add(pole);

        // 2. Spiral Steps
        const degreesPerStep = 360 / 15; // roughly 15 steps per revolution
        const radPerStep = (degreesPerStep * Math.PI) / 180;
        const stepWidth = radius - poleRadius;

        for (let i = 0; i < numSteps; i++) {
            // A wedge-like step using box geometry
            // The step spans from the pole to the outer radius
            const stepGeom = new THREE.BoxGeometry(stepWidth, riserHeight, treadDepth);
            const step = new THREE.Mesh(stepGeom);

            // Move step so its inner edge touches the pole
            step.position.set(stepWidth / 2 + poleRadius, 0, 0);

            // Create a pivot group to rotate the step around the pole
            const pivot = new THREE.Group();
            pivot.position.set(0, i * riserHeight + riserHeight / 2, 0);
            pivot.rotation.y = -i * radPerStep;

            pivot.add(step);
            group.add(pivot);
        }
    } else {
        // Default / Straight stairs
        for (let i = 0; i < numSteps; i++) {
            const stepGeometry = new THREE.BoxGeometry(stairWidth, riserHeight, treadDepth);
            const step = new THREE.Mesh(stepGeometry);

            // Each step is positioned progressively higher and further forward
            step.position.set(
                0,
                i * riserHeight + riserHeight / 2,
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

/** Custom geometry — renders a box for now, will use cad_script in Phase 3 */
export function compileCustomGeometry(node: PSGNode): THREE.BufferGeometry {
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
    const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(material.color_hex),
        roughness: 0.7,
        metalness: 0.1,
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
        // texture_scale is meters per repeat — so 1/scale gives repeats per meter
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
    Foundation: compileFoundationGeometry,
    Window: compileWindowGeometry,
    Door: compileDoorGeometry,
    Roof: compileRoofGeometry,
    Stairs: compileStairsGeometry,
    Column: compileColumnGeometry,
    Beam: compileBeamGeometry,
    Balcony: compileBalconyGeometry,
    Custom: compileCustomGeometry,
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
    // Fallback: 1m cube placeholder
    return new THREE.BoxGeometry(1, 1, 1);
}
