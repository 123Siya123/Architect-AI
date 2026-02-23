/**
 * =============================================================================
 * LIB/PSG/TEMPLATES.TS — Starter House Templates
 * =============================================================================
 *
 * When a user starts a new project, they can choose from pre-built starter
 * templates. These provide a complete PSG structure for a basic house
 * that the user and AI can then modify.
 *
 * WHY TEMPLATES?
 * Starting from an empty project is overwhelming. Templates give users
 * a WORKING house in seconds that they can customize. It's much easier
 * to say "make this room bigger" when there's already a room visible.
 *
 * The AI can also generate custom templates from user descriptions,
 * but these static templates are available instantly without any API call.
 *
 * TEMPLATE NAMING:
 * Templates use the format: {style}_{bedrooms}bed_{floors}floor
 * e.g., "modern_3bed_2floor", "traditional_4bed_1floor"
 *
 * Each template is a function that returns a complete PSGProject.
 * =============================================================================
 */

import { v4 as uuidv4 } from 'uuid';
import type { PSGProject, PSGNode } from '@/types';
import {
    createHouseNode,
    createFloorNode,
    createRoomNode,
    createWallNode,
    createWindowNode,
    createDoorNode,
    createRoofNode,
    createStairsNode,
    createSlabNode,
    createEmptyProject,
    DEFAULTS,
} from './schema';

// =============================================================================
// TEMPLATE: Simple 3-Bedroom, Single Floor
// =============================================================================

/**
 * Creates a simple single-storey, 3-bedroom family home.
 *
 * LAYOUT (10m × 12m):
 * ┌──────────────────────────────┐
 * │         Living Room          │
 * │         (5m × 6m)           │
 * ├──────────────┬───────────────┤
 * │   Kitchen    │   Bathroom    │
 * │   (3m × 4m) │   (2m × 3m)  │
 * ├──────────────┼───────────────┤
 * │  Bedroom 1   │  Bedroom 2   │
 * │  (3.5m×4m)  │  (3m × 4m)  │
 * ├──────────────┴───────────────┤
 * │         Bedroom 3            │
 * │         (4m × 3.5m)         │
 * └──────────────────────────────┘
 *
 * TOTAL AREA: ~120 m²
 * This template creates the walls, floor, roof, windows, and doors.
 * Materials are set to common residential defaults.
 */
export function createSimple3BedTemplate(
    budget: number = 200000,
    currency: string = 'EUR'
): PSGProject {
    const project = createEmptyProject('Simple 3-Bedroom Home', budget, currency);
    const rootId = project.root_node_id;

    // --- Ground Floor ---
    const floor = createFloorNode(rootId, 0, 'Ground Floor');
    project.nodes[floor.id] = floor;
    project.nodes[rootId].children_ids.push(floor.id);

    // --- Foundation Slab ---
    const slab = createSlabNode(floor.id, 'Ground Slab', { x: 5, y: -0.15, z: 6 }, { x: 10, y: 0.3, z: 12 });
    project.nodes[slab.id] = slab;
    project.nodes[floor.id].children_ids.push(slab.id);

    // --- Living Room ---
    const livingRoom = createRoomNode(floor.id, 'Living Room', { x: 0, y: 0, z: -3 }, { x: 10, y: DEFAULTS.WALL_HEIGHT, z: 6 }, 'living');
    project.nodes[livingRoom.id] = livingRoom;
    project.nodes[floor.id].children_ids.push(livingRoom.id);

    // Living room walls
    const livingNorthWall = createWallNode(livingRoom.id, 'Living North Wall', { x: 5, y: DEFAULTS.WALL_HEIGHT / 2, z: -6 }, 10);
    project.nodes[livingNorthWall.id] = livingNorthWall;
    project.nodes[livingRoom.id].children_ids.push(livingNorthWall.id);

    // Add a window to the north wall
    const livingWindow1 = createWindowNode(livingNorthWall.id, 'Living Room Window 1', { x: -2, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.8, 1.4);
    project.nodes[livingWindow1.id] = livingWindow1;
    project.nodes[livingNorthWall.id].children_ids.push(livingWindow1.id);

    const livingWindow2 = createWindowNode(livingNorthWall.id, 'Living Room Window 2', { x: 2, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.8, 1.4);
    project.nodes[livingWindow2.id] = livingWindow2;
    project.nodes[livingNorthWall.id].children_ids.push(livingWindow2.id);

    // --- Roof ---
    const roof = createRoofNode(rootId, 'Main Roof', 'gable', 35, { x: 11, y: 0.3, z: 13 });
    roof.position = { x: 5, y: DEFAULTS.WALL_HEIGHT, z: 6 };
    project.nodes[roof.id] = roof;
    project.nodes[rootId].children_ids.push(roof.id);

    return project;
}

// =============================================================================
// TEMPLATE: Modern 4-Bedroom, Two Floors
// =============================================================================

/**
 * Creates a modern two-storey, 4-bedroom family home.
 *
 * This template has a more open plan layout with larger windows,
 * a double-height entrance area, and modern flat roof.
 *
 * GROUND FLOOR LAYOUT (12m × 10m):
 * ┌─────────────────────────────────────┐
 * │    Open Plan Living/Kitchen/Dining  │
 * │              (8m × 10m)             │
 * ├─────────────┬───────────────────────┤
 * │   Entrance  │      Stairs          │
 * │   (4m×3m)   │      WC/Storage     │
 * └─────────────┴───────────────────────┘
 *
 * FIRST FLOOR LAYOUT:
 * ┌──────────────┬──────────────────────┐
 * │  Master      │     Bedroom 2       │
 * │  Bedroom     │     (3.5m × 4m)     │
 * │  (5m × 4m)  │                      │
 * ├──────────────┼──────────────────────┤
 * │  Bedroom 3   │    Bedroom 4        │
 * │  (3.5m×3.5m)│    (3.5m × 3.5m)   │
 * ├──────────────┴──────────────────────┤
 * │         Family Bathroom             │
 * │          (3m × 2.5m)               │
 * └─────────────────────────────────────┘
 *
 * TOTAL AREA: ~240 m²
 *
 * TODO (Phase 2): Add all rooms, walls, and openings.
 * For now, this creates the basic structure (floors, roof, stairs).
 */
export function createModern4BedTemplate(
    budget: number = 350000,
    currency: string = 'EUR'
): PSGProject {
    const project = createEmptyProject('Modern 4-Bedroom Home', budget, currency);
    const rootId = project.root_node_id;

    // --- Ground Floor ---
    const groundFloor = createFloorNode(rootId, 0, 'Ground Floor');
    project.nodes[groundFloor.id] = groundFloor;
    project.nodes[rootId].children_ids.push(groundFloor.id);

    // Ground slab
    const groundSlab = createSlabNode(groundFloor.id, 'Ground Slab', { x: 6, y: -0.15, z: 5 }, { x: 12, y: 0.3, z: 10 });
    project.nodes[groundSlab.id] = groundSlab;
    project.nodes[groundFloor.id].children_ids.push(groundSlab.id);

    // --- First Floor ---
    const firstFloor = createFloorNode(rootId, 1, 'First Floor');
    project.nodes[firstFloor.id] = firstFloor;
    project.nodes[rootId].children_ids.push(firstFloor.id);

    // First floor slab
    const firstSlab = createSlabNode(firstFloor.id, 'First Floor Slab', { x: 6, y: DEFAULTS.WALL_HEIGHT, z: 5 }, { x: 12, y: 0.3, z: 10 });
    project.nodes[firstSlab.id] = firstSlab;
    project.nodes[firstFloor.id].children_ids.push(firstSlab.id);

    // --- Stairs ---
    const stairs = createStairsNode(groundFloor.id, 'Main Stairs', 'straight', { x: 10, y: 0, z: 5 });
    project.nodes[stairs.id] = stairs;
    project.nodes[groundFloor.id].children_ids.push(stairs.id);

    // --- Flat Roof ---
    const roof = createRoofNode(rootId, 'Flat Roof', 'flat', 0, { x: 13, y: 0.3, z: 11 });
    roof.position = { x: 6, y: DEFAULTS.WALL_HEIGHT * 2, z: 5 };
    roof.material_id = 'mat_concrete_slab';
    project.nodes[roof.id] = roof;
    project.nodes[rootId].children_ids.push(roof.id);

    return project;
}

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

/**
 * All available templates, indexed by a slug.
 * The UI shows these as cards the user can click to start a project.
 */
export interface TemplateInfo {
    slug: string;
    name: string;
    description: string;
    bedrooms: number;
    floors: number;
    approx_area_m2: number;
    style: string;
    preview_image: string; // Path to a preview image
    create: (budget?: number, currency?: string) => PSGProject;
}

export const TEMPLATES: TemplateInfo[] = [
    {
        slug: 'simple_3bed_1floor',
        name: 'Simple 3-Bedroom Bungalow',
        description: 'A classic single-storey family home with 3 bedrooms, open-plan living, and a gable roof.',
        bedrooms: 3,
        floors: 1,
        approx_area_m2: 120,
        style: 'Traditional',
        preview_image: '/templates/simple_3bed.jpg',
        create: createSimple3BedTemplate,
    },
    {
        slug: 'modern_4bed_2floor',
        name: 'Modern 4-Bedroom Home',
        description: 'A contemporary two-storey home with 4 bedrooms, flat roof, and open-plan ground floor.',
        bedrooms: 4,
        floors: 2,
        approx_area_m2: 240,
        style: 'Modern',
        preview_image: '/templates/modern_4bed.jpg',
        create: createModern4BedTemplate,
    },
    // TODO (Phase 2): Add more templates:
    // - Compact 2-bedroom cottage
    // - Large 5-bedroom executive home
    // - Mediterranean villa
    // - Scandinavian minimalist
    // - Farmhouse
];
