/**
 * =============================================================================
 * LIB/PSG/SCHEMA.TS — PSG Schema Defaults & Factory Functions
 * =============================================================================
 *
 * This file provides factory functions to create properly initialized PSG nodes.
 * Instead of manually constructing PSGNode objects (which have 20+ fields),
 * you call createWall(), createRoom(), etc. to get a valid node with sensible
 * defaults.
 *
 * WHY FACTORY FUNCTIONS?
 * - Ensures every node has all required fields (no undefined errors at runtime)
 * - Provides sensible architectural defaults (2.7m wall height, 0.25m thickness)
 * - Generates unique IDs automatically
 * - Sets timestamps and version numbers
 * - The AI can also call these via tool functions to add new elements
 *
 * NAMING CONVENTION:
 * Node IDs follow the pattern: {type}_{room}_{direction}_{index}
 * Example: "wall_living_north_1", "window_bedroom_east_2"
 * This makes the PSG JSON human-readable when the LLM processes it.
 * =============================================================================
 */

import { v4 as uuidv4 } from 'uuid';
import type {
    PSGNode,
    PSGProject,
    PSGNodeType,
    Vec3,
    Rotation,
    StructuralTag,
    NodeConstraints,
    SystemConnections,
    ProjectSettings,
    BudgetConfig,
    Material,
} from '@/types';

// =============================================================================
// DEFAULT VALUES
// =============================================================================
// These defaults are based on standard European residential construction.
// They can be overridden per-project via ProjectSettings.

/** Default architectural dimensions in meters */
export const DEFAULTS = {
    WALL_HEIGHT: 2.7,        // Standard residential ceiling height
    WALL_THICKNESS: 0.25,    // 250mm cavity wall
    FLOOR_THICKNESS: 0.3,    // 300mm reinforced slab
    WINDOW_WIDTH: 1.2,       // Standard window
    WINDOW_HEIGHT: 1.4,
    WINDOW_SILL_HEIGHT: 0.9, // Height from floor to window bottom
    DOOR_WIDTH: 0.9,         // Standard interior door
    DOOR_HEIGHT: 2.1,
    GRID_SIZE: 0.1,          // 10cm grid snap
    ROOF_PITCH: 35,          // Degrees — common for tile roofs
    ROOF_OVERHANG: 0.5,      // 500mm overhang
    STAIR_RISER: 0.18,       // 180mm riser height
    STAIR_TREAD: 0.28,       // 280mm tread depth
} as const;

// =============================================================================
// HELPER: Generate Timestamp
// =============================================================================

function now(): string {
    return new Date().toISOString();
}

// =============================================================================
// HELPER: Default Spatial Values
// =============================================================================

function defaultPosition(): Vec3 {
    return { x: 0, y: 0, z: 0 };
}

function defaultDimensions(): Vec3 {
    return { x: 1, y: 1, z: 1 };
}

function defaultRotation(): Rotation {
    return { yaw: 0, pitch: 0, roll: 0 };
}

function defaultConstraints(): NodeConstraints {
    return {
        fixed_position: false,
        connected_to: [],
    };
}

function defaultSystems(): SystemConnections {
    return {
        electrical: [],
        plumbing: [],
        hvac: [],
    };
}

// =============================================================================
// NODE FACTORY FUNCTIONS
// =============================================================================
// Each function creates a PSGNode with type-appropriate defaults.
// All spatial values are in meters.

/**
 * Creates the root House node.
 * Every PSG project has exactly ONE House node as the root.
 * All floors, rooms, and elements are descendants of this node.
 */
export function createHouseNode(name: string = 'New House'): PSGNode {
    return {
        id: `house_${uuidv4().slice(0, 8)}`,
        type: 'House',
        name,
        position: defaultPosition(),
        dimensions: defaultDimensions(), // House dimensions are computed from children
        rotation: defaultRotation(),
        material_id: '',                 // House node has no material
        opacity: 1,
        tags: [],
        constraints: { ...defaultConstraints(), fixed_position: true },
        systems: defaultSystems(),
        parent_id: null,
        children_ids: [],
        created_at: now(),
        modified_at: now(),
        version: 1,
    };
}

/**
 * Creates a Floor node (storey/level).
 * Contains Rooms, which in turn contain Walls.
 * Position.y determines the vertical offset (0 = ground floor).
 */
export function createFloorNode(
    parentId: string,
    level: number = 0, // 0 = ground, 1 = first floor, etc.
    name?: string
): PSGNode {
    return {
        id: `floor_${level}_${uuidv4().slice(0, 8)}`,
        type: 'Floor',
        name: name || `Floor ${level}`,
        position: { x: 0, y: level * DEFAULTS.WALL_HEIGHT, z: 0 },
        dimensions: { x: 0, y: DEFAULTS.FLOOR_THICKNESS, z: 0 }, // Computed from children
        rotation: defaultRotation(),
        material_id: 'mat_concrete_slab',
        opacity: 1,
        tags: ['load_bearing'],
        constraints: { ...defaultConstraints(), fixed_position: true },
        systems: defaultSystems(),
        parent_id: parentId,
        children_ids: [],
        created_at: now(),
        modified_at: now(),
        version: 1,
    };
}

/**
 * Creates a Room node.
 * Rooms are containers for walls — they define a named space.
 * The room's position is relative to its floor.
 */
export function createRoomNode(
    parentId: string,
    name: string,
    position: Partial<Vec3> = {},
    dimensions: Partial<Vec3> = {},
    roomFunction?: string
): PSGNode {
    return {
        id: `room_${name.toLowerCase().replace(/\s+/g, '_')}_${uuidv4().slice(0, 8)}`,
        type: 'Room',
        name,
        position: { ...defaultPosition(), ...position },
        dimensions: { x: 4, y: DEFAULTS.WALL_HEIGHT, z: 5, ...dimensions },
        rotation: defaultRotation(),
        material_id: '',
        opacity: 1,
        tags: [],
        constraints: defaultConstraints(),
        systems: defaultSystems(),
        parent_id: parentId,
        children_ids: [],
        room_function: roomFunction,
        created_at: now(),
        modified_at: now(),
        version: 1,
    };
}

/**
 * Creates a Wall node.
 * Walls are the most common node type. They can be load-bearing or partitions.
 *
 * COORDINATE SYSTEM:
 * - x = width (horizontal span of the wall)
 * - y = height (floor to ceiling)
 * - z = thickness (depth of the wall construction)
 *
 * The wall's position is its CENTER point. A wall at position (4, 1.35, 0)
 * with dimensions (8, 2.7, 0.25) spans from x=0 to x=8, y=0 to y=2.7.
 */
export function createWallNode(
    parentId: string,
    name: string,
    position: Partial<Vec3> = {},
    width: number = 4,
    height: number = DEFAULTS.WALL_HEIGHT,
    thickness: number = DEFAULTS.WALL_THICKNESS,
    tags: StructuralTag[] = ['load_bearing', 'exterior']
): PSGNode {
    return {
        id: `wall_${name.toLowerCase().replace(/\s+/g, '_')}_${uuidv4().slice(0, 8)}`,
        type: 'Wall',
        name,
        position: { x: 0, y: height / 2, z: 0, ...position },
        dimensions: { x: width, y: height, z: thickness },
        rotation: defaultRotation(),
        material_id: 'mat_brick_red',
        opacity: 1,
        tags,
        constraints: {
            min_width: 0.5,
            min_height: 2.1,
            min_thickness: 0.1,
            connected_to: [],
        },
        systems: defaultSystems(),
        parent_id: parentId,
        children_ids: [],
        created_at: now(),
        modified_at: now(),
        version: 1,
    };
}

/**
 * Creates a Window node.
 * Windows are children of walls — their position is relative to the wall.
 */
export function createWindowNode(
    parentWallId: string,
    name: string,
    position: Partial<Vec3> = {},
    width: number = DEFAULTS.WINDOW_WIDTH,
    height: number = DEFAULTS.WINDOW_HEIGHT
): PSGNode {
    return {
        id: `window_${uuidv4().slice(0, 8)}`,
        type: 'Window',
        name,
        position: { x: 0, y: DEFAULTS.WINDOW_SILL_HEIGHT + height / 2, z: 0, ...position },
        dimensions: { x: width, y: height, z: 0.05 }, // ~50mm frame depth
        rotation: defaultRotation(),
        material_id: 'mat_glass_double',
        opacity: 0.3,
        tags: [],
        constraints: {
            min_width: 0.4,
            max_width: 3.0,
            min_height: 0.4,
            max_height: 2.4,
            connected_to: [parentWallId],
        },
        systems: defaultSystems(),
        parent_id: parentWallId,
        children_ids: [],
        opening_width: width,
        opening_height: height,
        created_at: now(),
        modified_at: now(),
        version: 1,
    };
}

/**
 * Creates a Door node.
 * Like windows, doors are children of walls.
 */
export function createDoorNode(
    parentWallId: string,
    name: string,
    position: Partial<Vec3> = {},
    width: number = DEFAULTS.DOOR_WIDTH,
    height: number = DEFAULTS.DOOR_HEIGHT
): PSGNode {
    return {
        id: `door_${uuidv4().slice(0, 8)}`,
        type: 'Door',
        name,
        position: { x: 0, y: height / 2, z: 0, ...position },
        dimensions: { x: width, y: height, z: 0.05 },
        rotation: defaultRotation(),
        material_id: 'mat_wood_oak',
        opacity: 1,
        tags: [],
        constraints: {
            min_width: 0.7,
            max_width: 1.8,
            min_height: 1.9,
            max_height: 2.4,
            connected_to: [parentWallId],
        },
        systems: defaultSystems(),
        parent_id: parentWallId,
        children_ids: [],
        opening_width: width,
        opening_height: height,
        created_at: now(),
        modified_at: now(),
        version: 1,
    };
}

/**
 * Creates a Roof node.
 * The roof's geometry is determined by roof_style and roof_pitch_degrees.
 * The Three.js compiler uses these to generate the appropriate mesh.
 */
export function createRoofNode(
    parentId: string,
    name: string = 'Main Roof',
    style: PSGNode['roof_style'] = 'gable',
    pitchDegrees: number = DEFAULTS.ROOF_PITCH,
    dimensions: Partial<Vec3> = {}
): PSGNode {
    return {
        id: `roof_${uuidv4().slice(0, 8)}`,
        type: 'Roof',
        name,
        position: defaultPosition(),
        dimensions: { x: 10, y: 0.3, z: 8, ...dimensions },
        rotation: defaultRotation(),
        material_id: 'mat_tile_clay',
        opacity: 1,
        tags: ['exterior'],
        constraints: defaultConstraints(),
        systems: defaultSystems(),
        parent_id: parentId,
        children_ids: [],
        roof_style: style,
        roof_pitch_degrees: pitchDegrees,
        roof_overhang: DEFAULTS.ROOF_OVERHANG,
        created_at: now(),
        modified_at: now(),
        version: 1,
    };
}

/**
 * Creates a Stairs node.
 * Stairs connect two floors vertically. The compiler calculates the
 * number of steps from the floor-to-floor height and riser height.
 */
export function createStairsNode(
    parentId: string,
    name: string = 'Main Stairs',
    style: PSGNode['stair_style'] = 'straight',
    position: Partial<Vec3> = {}
): PSGNode {
    return {
        id: `stairs_${uuidv4().slice(0, 8)}`,
        type: 'Stairs',
        name,
        position: { ...defaultPosition(), ...position },
        dimensions: { x: 1.0, y: DEFAULTS.WALL_HEIGHT, z: 3.0 },
        rotation: defaultRotation(),
        material_id: 'mat_wood_oak',
        opacity: 1,
        tags: [],
        constraints: defaultConstraints(),
        systems: defaultSystems(),
        parent_id: parentId,
        children_ids: [],
        stair_style: style,
        stair_riser_height: DEFAULTS.STAIR_RISER,
        stair_tread_depth: DEFAULTS.STAIR_TREAD,
        created_at: now(),
        modified_at: now(),
        version: 1,
    };
}

/**
 * Creates a Slab node (floor/ceiling structural element).
 */
export function createSlabNode(
    parentId: string,
    name: string,
    position: Partial<Vec3> = {},
    dimensions: Partial<Vec3> = {}
): PSGNode {
    return {
        id: `slab_${uuidv4().slice(0, 8)}`,
        type: 'Slab',
        name,
        position: { ...defaultPosition(), ...position },
        dimensions: { x: 10, y: DEFAULTS.FLOOR_THICKNESS, z: 8, ...dimensions },
        rotation: defaultRotation(),
        material_id: 'mat_concrete_slab',
        opacity: 1,
        tags: ['load_bearing'],
        constraints: { ...defaultConstraints(), fixed_position: true },
        systems: defaultSystems(),
        parent_id: parentId,
        children_ids: [],
        created_at: now(),
        modified_at: now(),
        version: 1,
    };
}

// =============================================================================
// PROJECT FACTORY
// =============================================================================

/**
 * Creates a new empty PSGProject with sensible defaults.
 * This is the starting point before the AI generates the house.
 */
export function createEmptyProject(
    name: string = 'Untitled Project',
    budget: number = 200000,
    currency: string = 'EUR'
): PSGProject {
    const houseNode = createHouseNode(name);

    return {
        id: uuidv4(),
        name,
        description: '',
        created_at: now(),
        modified_at: now(),
        version: 1,
        root_node_id: houseNode.id,
        nodes: {
            [houseNode.id]: houseNode,
        },
        settings: createDefaultSettings(),
        budget: {
            total_budget: budget,
            spent: 0,
            remaining: budget,
            currency,
            warnings_enabled: true,
            warning_threshold: 90, // Warn at 90% spent
        },
    };
}

function createDefaultSettings(): ProjectSettings {
    return {
        unit: 'metric',
        grid_size: DEFAULTS.GRID_SIZE,
        default_wall_height: DEFAULTS.WALL_HEIGHT,
        default_wall_thickness: DEFAULTS.WALL_THICKNESS,
        locale: 'en-US',
        currency: 'EUR',
    };
}
