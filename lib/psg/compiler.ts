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
    const geometry = new THREE.PlaneGeometry(width, height);
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
        // Flat roof — just a slab
        return new THREE.BoxGeometry(width, thickness, depth);
    }

    // Gable roof — create a triangular prism shape
    // This uses custom geometry with manually defined vertices
    if (node.roof_style === 'gable') {
        return compileGableRoof(width, depth, pitch, thickness);
    }

    // Default: flat box
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
 * The staircase is built from individual step boxes.
 * Number of steps = floor height / riser height.
 *
 * Each step is a box:
 * - Width = staircase width
 * - Height = riser height
 * - Depth = tread depth
 *
 * For spiral/curved stairs, we'll add radial positioning in Phase 3.
 *
 * TODO (Phase 3): Implement spiral, L-shaped, and U-shaped stairs
 * using parametric positioning of steps along curves.
 */
export function compileStairsGeometry(node: PSGNode): THREE.Group {
    const riserHeight = node.stair_riser_height || 0.18;
    const treadDepth = node.stair_tread_depth || 0.28;
    const totalHeight = node.dimensions.y;
    const stairWidth = node.dimensions.x;

    const numSteps = Math.ceil(totalHeight / riserHeight);
    const group = new THREE.Group();

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

    return group;
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
        roughness: 0.7,     // Most building materials are rough
        metalness: 0.1,     // Most are non-metallic
        transparent: false,
        opacity: 1,
        side: THREE.DoubleSide, // Render both sides (important for interiors)
    });

    // Load texture if provided
    // TODO (Phase 2): Implement texture loading with TextureLoader
    // if (material.texture_url) {
    //   const textureLoader = new THREE.TextureLoader();
    //   const texture = textureLoader.load(material.texture_url);
    //   texture.wrapS = THREE.RepeatWrapping;
    //   texture.wrapT = THREE.RepeatWrapping;
    //   texture.repeat.set(1 / material.texture_scale, 1 / material.texture_scale);
    //   mat.map = texture;
    // }

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
    Slab: compileSlabGeometry,
    Window: compileWindowGeometry,
    Door: compileDoorGeometry,
    Roof: compileRoofGeometry,
    Stairs: compileStairsGeometry,
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
