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
 * TEMPLATE COORDINATE SYSTEM:
 * - X axis: East-West (positive = east)
 * - Y axis: Up-Down (positive = up, Y=0 is ground)
 * - Z axis: North-South (positive = south)
 * - All positions are CENTER points of nodes
 * - All dimensions are in meters
 *
 * HELPER PATTERN:
 * To keep templates readable, we use a helper function `add()` that
 * registers a node in the project and adds it to its parent's children.
 * =============================================================================
 */

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
    createFoundationNode,
    createPartitionNode,
    createEmptyProject,
    DEFAULTS,
} from './schema';

// =============================================================================
// HELPER: Add node to project and link to parent
// =============================================================================

/**
 * Registers a node in the project's flat map and appends its ID
 * to the parent's children_ids array. Returns the node for chaining.
 */
function add(project: PSGProject, node: PSGNode): PSGNode {
    project.nodes[node.id] = node;
    if (node.parent_id && project.nodes[node.parent_id]) {
        project.nodes[node.parent_id].children_ids.push(node.id);
    }
    return node;
}

// =============================================================================
// TEMPLATE: Simple 3-Bedroom, Single Floor
// =============================================================================

/**
 * Creates a simple single-storey, 3-bedroom family home.
 *
 * LAYOUT (10m × 12m, origin at bottom-left corner):
 *
 *     North (Z = 0)
 *     ┌──────────────────────────────┐
 *     │         Living Room          │
 *     │         (5m × 6m)            │  Z=0 to Z=6
 *     ├───────────────┬──────────────┤
 *     │    Kitchen    │   Bathroom   │
 *     │   (5m × 3m)  │  (5m × 3m)   │  Z=6 to Z=9
 *     ├───────────────┼──────────────┤
 *     │   Bedroom 1   │  Bedroom 2  │
 *     │  (5m × 3m)   │  (5m × 3m)  │  Z=9 to Z=12
 *     └───────────────┴──────────────┘
 *     South (Z = 12)
 *
 * TOTAL AREA: ~120 m²
 * All exterior walls are load-bearing brick.
 * Interior divisions are lighter partition walls.
 */
export function createSimple3BedTemplate(
    budget: number = 200000,
    currency: string = 'EUR'
): PSGProject {
    const project = createEmptyProject('Simple 3-Bedroom Home', budget, currency);
    const rootId = project.root_node_id;

    const H = DEFAULTS.WALL_HEIGHT;     // 2.7m
    const T = DEFAULTS.WALL_THICKNESS;  // 0.25m
    const halfH = H / 2;               // 1.35m — center of walls vertically

    // ─── Ground Floor ────────────────────────────────────────────────
    const floor = add(project, createFloorNode(rootId, 0, 'Ground Floor'));

    // ─── Foundation ──────────────────────────────────────────────────
    add(project, createFoundationNode(floor.id, 'Foundation', { x: 5, y: -0.15, z: 6 }, { x: 10, y: 0.3, z: 12 }));

    // ─── Ground Slab (floor surface) ─────────────────────────────────
    add(project, createSlabNode(floor.id, 'Ground Floor Slab', { x: 5, y: 0, z: 6 }, { x: 10, y: 0.15, z: 12 }));

    // ─────────────────────────────────────────────────────────────────
    // LIVING ROOM (north side: X=0..10, Z=0..6)
    // ─────────────────────────────────────────────────────────────────
    const living = add(project, createRoomNode(floor.id, 'Living Room', { x: 5, y: 0, z: 3 }, { x: 10, y: H, z: 6 }, 'living'));

    // North wall (front of house) — 10m wide
    const livingNorth = add(project, createWallNode(living.id, 'Living North Wall',
        { x: 5, y: halfH, z: 0 }, 10, H, T, ['load_bearing', 'exterior']));
    // Two large windows on the front
    add(project, createWindowNode(livingNorth.id, 'Living Window Left', { x: 3, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.8, 1.4));
    add(project, createWindowNode(livingNorth.id, 'Living Window Right', { x: 7, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.8, 1.4));

    // West wall — 6m long
    add(project, createWallNode(living.id, 'Living West Wall',
        { x: 0, y: halfH, z: 3 }, 6, H, T, ['load_bearing', 'exterior']));
    // Rotate 90° so it faces west
    project.nodes[Object.keys(project.nodes).pop()!].rotation = { yaw: 90, pitch: 0, roll: 0 };

    // East wall — 6m long
    add(project, createWallNode(living.id, 'Living East Wall',
        { x: 10, y: halfH, z: 3 }, 6, H, T, ['load_bearing', 'exterior']));
    project.nodes[Object.keys(project.nodes).pop()!].rotation = { yaw: 90, pitch: 0, roll: 0 };

    // South dividing wall (between living and kitchen/bathroom)
    const livingDivider = add(project, createPartitionNode(living.id, 'Living South Divider',
        { x: 5, y: halfH, z: 6 }, 10, H, 0.15));
    // Front door in the divider (center)
    add(project, createDoorNode(livingNorth.id, 'Front Door', { x: 5, y: DEFAULTS.DOOR_HEIGHT / 2 }, 1.0, DEFAULTS.DOOR_HEIGHT));

    // ─────────────────────────────────────────────────────────────────
    // KITCHEN (middle-left: X=0..5, Z=6..9)
    // ─────────────────────────────────────────────────────────────────
    const kitchen = add(project, createRoomNode(floor.id, 'Kitchen', { x: 2.5, y: 0, z: 7.5 }, { x: 5, y: H, z: 3 }, 'kitchen'));

    // Kitchen west wall
    const kitchenWest = add(project, createWallNode(kitchen.id, 'Kitchen West Wall',
        { x: 0, y: halfH, z: 7.5 }, 3, H, T, ['load_bearing', 'exterior']));
    kitchenWest.rotation = { yaw: 90, pitch: 0, roll: 0 };
    // Kitchen window (west-facing)
    add(project, createWindowNode(kitchenWest.id, 'Kitchen Window', { x: 0, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.6 }, 1.2, 1.2));

    // Kitchen-bathroom partition (vertical divider at X=5)
    const kitchenBathPartition = add(project, createPartitionNode(kitchen.id, 'Kitchen-Bath Partition',
        { x: 5, y: halfH, z: 7.5 }, 3, H, 0.12));
    kitchenBathPartition.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // Kitchen door (in the divider between living and kitchen)
    add(project, createDoorNode(livingDivider.id, 'Kitchen Door', { x: 2.5, y: DEFAULTS.DOOR_HEIGHT / 2 }, 0.9, DEFAULTS.DOOR_HEIGHT));

    // ─────────────────────────────────────────────────────────────────
    // BATHROOM (middle-right: X=5..10, Z=6..9)
    // ─────────────────────────────────────────────────────────────────
    const bathroom = add(project, createRoomNode(floor.id, 'Bathroom', { x: 7.5, y: 0, z: 7.5 }, { x: 5, y: H, z: 3 }, 'bathroom'));
    bathroom.tags = ['wet_room'];

    // Bathroom east wall
    const bathEast = add(project, createWallNode(bathroom.id, 'Bathroom East Wall',
        { x: 10, y: halfH, z: 7.5 }, 3, H, T, ['load_bearing', 'exterior']));
    bathEast.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // Small frosted window
    add(project, createWindowNode(bathEast.id, 'Bathroom Window', { x: 0, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 0.8, 0.6));

    // ─────────────────────────────────────────────────────────────────
    // Middle horizontal divider (Z=9, between kitchen/bath and bedrooms)
    // ─────────────────────────────────────────────────────────────────
    const midDivider = add(project, createPartitionNode(floor.id, 'Mid Floor Divider',
        { x: 5, y: halfH, z: 9 }, 10, H, 0.15));

    // ─────────────────────────────────────────────────────────────────
    // BEDROOM 1 (bottom-left: X=0..5, Z=9..12)
    // ─────────────────────────────────────────────────────────────────
    const bed1 = add(project, createRoomNode(floor.id, 'Bedroom 1', { x: 2.5, y: 0, z: 10.5 }, { x: 5, y: H, z: 3 }, 'bedroom'));

    // Bedroom 1 south wall
    const bed1South = add(project, createWallNode(bed1.id, 'Bedroom 1 South Wall',
        { x: 2.5, y: halfH, z: 12 }, 5, H, T, ['load_bearing', 'exterior']));
    add(project, createWindowNode(bed1South.id, 'Bedroom 1 Window', { x: 2.5, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.4, 1.4));

    // Bedroom 1 west wall
    const bed1West = add(project, createWallNode(bed1.id, 'Bedroom 1 West Wall',
        { x: 0, y: halfH, z: 10.5 }, 3, H, T, ['load_bearing', 'exterior']));
    bed1West.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // Bedroom 1 door (in mid divider)
    add(project, createDoorNode(midDivider.id, 'Bedroom 1 Door', { x: 2.5, y: DEFAULTS.DOOR_HEIGHT / 2 }, 0.9, DEFAULTS.DOOR_HEIGHT));

    // ─────────────────────────────────────────────────────────────────
    // BEDROOM 2 (bottom-right: X=5..10, Z=9..12)
    // ─────────────────────────────────────────────────────────────────
    const bed2 = add(project, createRoomNode(floor.id, 'Bedroom 2', { x: 7.5, y: 0, z: 10.5 }, { x: 5, y: H, z: 3 }, 'bedroom'));

    // Bedroom 2 south wall
    const bed2South = add(project, createWallNode(bed2.id, 'Bedroom 2 South Wall',
        { x: 7.5, y: halfH, z: 12 }, 5, H, T, ['load_bearing', 'exterior']));
    add(project, createWindowNode(bed2South.id, 'Bedroom 2 Window', { x: 7.5, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.4, 1.4));

    // Bedroom 2 east wall
    const bed2East = add(project, createWallNode(bed2.id, 'Bedroom 2 East Wall',
        { x: 10, y: halfH, z: 10.5 }, 3, H, T, ['load_bearing', 'exterior']));
    bed2East.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // Bedroom 2 door
    add(project, createDoorNode(midDivider.id, 'Bedroom 2 Door', { x: 7.5, y: DEFAULTS.DOOR_HEIGHT / 2 }, 0.9, DEFAULTS.DOOR_HEIGHT));

    // Partition between bedroom 1 and 2
    const bedPartition = add(project, createPartitionNode(floor.id, 'Bedroom Partition',
        { x: 5, y: halfH, z: 10.5 }, 3, H, 0.12));
    bedPartition.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // ─── Hallway / Corridor ──────────────────────────────────────────
    // The hallway is implicit — space between rooms connected by doors.
    // We don't need explicit walls for it in this simple template.

    // ─── Roof ────────────────────────────────────────────────────────
    const roof = add(project, createRoofNode(rootId, 'Main Roof', 'gable', 35, { x: 11, y: 0.3, z: 13 }));
    roof.position = { x: 5, y: H, z: 6 };

    return project;
}

// =============================================================================
// TEMPLATE: Modern 4-Bedroom, Two Floors
// =============================================================================

/**
 * Creates a modern two-storey, 4-bedroom family home.
 *
 * GROUND FLOOR (12m × 10m):
 *     North (Z=0)
 *     ┌─────────────────────────────────────────┐
 *     │    Open Plan Living / Kitchen / Dining   │
 *     │              (12m × 7m)                  │  Z=0..7
 *     ├────────────────────────┬─────────────────┤
 *     │   Entrance + Hallway   │  WC + Storage   │
 *     │      (8m × 3m)        │   (4m × 3m)     │  Z=7..10
 *     └────────────────────────┴─────────────────┘
 *     South (Z=10)
 *
 * FIRST FLOOR (12m × 10m):
 *     ┌──────────────┬──────────────┬────────────┐
 *     │  Master Bed   │  Bedroom 2   │  En-Suite  │
 *     │  (6m × 5m)   │  (4m × 5m)  │ (2m × 5m) │  Z=0..5
 *     ├──────────────┼──────────────┼────────────┤
 *     │  Bedroom 3   │  Bedroom 4   │  Family    │
 *     │  (4m × 5m)  │  (4m × 5m)  │  Bath      │
 *     │              │              │ (4m × 5m) │  Z=5..10
 *     └──────────────┴──────────────┴────────────┘
 *
 * TOTAL AREA: ~240 m²
 */
export function createModern4BedTemplate(
    budget: number = 350000,
    currency: string = 'EUR'
): PSGProject {
    const project = createEmptyProject('Modern 4-Bedroom Home', budget, currency);
    const rootId = project.root_node_id;

    const H = DEFAULTS.WALL_HEIGHT;
    const T = DEFAULTS.WALL_THICKNESS;
    const halfH = H / 2;

    // ─── Foundation ──────────────────────────────────────────────────
    add(project, createFoundationNode(rootId, 'Foundation', { x: 6, y: -0.15, z: 5 }, { x: 12, y: 0.3, z: 10 }));

    // ═══════════════════════════════════════════════════════════════════
    // GROUND FLOOR
    // ═══════════════════════════════════════════════════════════════════
    const gf = add(project, createFloorNode(rootId, 0, 'Ground Floor'));

    // Ground slab
    add(project, createSlabNode(gf.id, 'Ground Slab', { x: 6, y: 0, z: 5 }, { x: 12, y: 0.15, z: 10 }));

    // ─── Open Plan Living/Kitchen/Dining (Z=0..7) ────────────────────
    const openPlan = add(project, createRoomNode(gf.id, 'Open Plan Living',
        { x: 6, y: 0, z: 3.5 }, { x: 12, y: H, z: 7 }, 'living'));

    // North wall (full width, large windows)
    const gfNorth = add(project, createWallNode(openPlan.id, 'GF North Wall',
        { x: 6, y: halfH, z: 0 }, 12, H, T, ['load_bearing', 'exterior']));
    add(project, createWindowNode(gfNorth.id, 'Living Window 1', { x: 2, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 2.4, 1.6));
    add(project, createWindowNode(gfNorth.id, 'Living Window 2', { x: 6, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 2.4, 1.6));
    add(project, createWindowNode(gfNorth.id, 'Kitchen Window', { x: 10, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.8, 1.4));

    // West wall (living area)
    const gfWest = add(project, createWallNode(openPlan.id, 'GF West Wall',
        { x: 0, y: halfH, z: 3.5 }, 7, H, T, ['load_bearing', 'exterior']));
    gfWest.rotation = { yaw: 90, pitch: 0, roll: 0 };
    add(project, createWindowNode(gfWest.id, 'West Window', { x: 0, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.6, 1.4));

    // East wall (kitchen area)
    const gfEast = add(project, createWallNode(openPlan.id, 'GF East Wall',
        { x: 12, y: halfH, z: 3.5 }, 7, H, T, ['load_bearing', 'exterior']));
    gfEast.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // Divider between open plan and entrance (Z=7)
    const gfDivider = add(project, createPartitionNode(openPlan.id, 'GF Living-Entry Divider',
        { x: 6, y: halfH, z: 7 }, 12, H, 0.15));

    // ─── Entrance/Hallway (X=0..8, Z=7..10) ─────────────────────────
    const entrance = add(project, createRoomNode(gf.id, 'Entrance Hall',
        { x: 4, y: 0, z: 8.5 }, { x: 8, y: H, z: 3 }, 'hallway'));

    // South wall (front of house)
    const gfSouth = add(project, createWallNode(entrance.id, 'GF South Wall',
        { x: 6, y: halfH, z: 10 }, 12, H, T, ['load_bearing', 'exterior']));
    // Front door
    add(project, createDoorNode(gfSouth.id, 'Front Door', { x: 4, y: DEFAULTS.DOOR_HEIGHT / 2 }, 1.2, DEFAULTS.DOOR_HEIGHT));

    // West wall (entrance section)
    const entryWest = add(project, createWallNode(entrance.id, 'Entry West Wall',
        { x: 0, y: halfH, z: 8.5 }, 3, H, T, ['load_bearing', 'exterior']));
    entryWest.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // Entry-to-living door
    add(project, createDoorNode(gfDivider.id, 'Living Door', { x: 4, y: DEFAULTS.DOOR_HEIGHT / 2 }, 1.0, DEFAULTS.DOOR_HEIGHT));

    // ─── WC/Storage (X=8..12, Z=7..10) ──────────────────────────────
    const wc = add(project, createRoomNode(gf.id, 'WC / Storage',
        { x: 10, y: 0, z: 8.5 }, { x: 4, y: H, z: 3 }, 'bathroom'));
    wc.tags = ['wet_room'];

    // Entry-WC partition (X=8, vertical)
    const wcPartition = add(project, createPartitionNode(wc.id, 'WC Partition',
        { x: 8, y: halfH, z: 8.5 }, 3, H, 0.12));
    wcPartition.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // WC door
    add(project, createDoorNode(wcPartition.id, 'WC Door', { x: 0, y: DEFAULTS.DOOR_HEIGHT / 2 }, 0.8, DEFAULTS.DOOR_HEIGHT));

    // East wall (WC section)
    const wcEast = add(project, createWallNode(wc.id, 'WC East Wall',
        { x: 12, y: halfH, z: 8.5 }, 3, H, T, ['load_bearing', 'exterior']));
    wcEast.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // ─── Stairs ──────────────────────────────────────────────────────
    const stairs = add(project, createStairsNode(gf.id, 'Main Stairs', 'straight', { x: 7, y: 0, z: 8.5 }));

    // ═══════════════════════════════════════════════════════════════════
    // FIRST FLOOR
    // ═══════════════════════════════════════════════════════════════════
    const ff = add(project, createFloorNode(rootId, 1, 'First Floor'));

    // First floor slab
    add(project, createSlabNode(ff.id, 'First Floor Slab', { x: 6, y: H, z: 5 }, { x: 12, y: 0.2, z: 10 }));

    // ─── Master Bedroom (X=0..6, Z=0..5) ────────────────────────────
    const master = add(project, createRoomNode(ff.id, 'Master Bedroom',
        { x: 3, y: H, z: 2.5 }, { x: 6, y: H, z: 5 }, 'bedroom'));

    // Master north wall
    const masterNorth = add(project, createWallNode(master.id, 'Master North Wall',
        { x: 3, y: H + halfH, z: 0 }, 6, H, T, ['load_bearing', 'exterior']));
    add(project, createWindowNode(masterNorth.id, 'Master Window', { x: 3, y: H + DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 2.0, 1.6));

    // Master west wall
    const masterWest = add(project, createWallNode(master.id, 'Master West Wall',
        { x: 0, y: H + halfH, z: 2.5 }, 5, H, T, ['load_bearing', 'exterior']));
    masterWest.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // ─── Bedroom 2 (X=6..10, Z=0..5) ────────────────────────────────
    const bed2 = add(project, createRoomNode(ff.id, 'Bedroom 2',
        { x: 8, y: H, z: 2.5 }, { x: 4, y: H, z: 5 }, 'bedroom'));

    // Bed 2 north wall
    const bed2North = add(project, createWallNode(bed2.id, 'Bed 2 North Wall',
        { x: 8, y: H + halfH, z: 0 }, 4, H, T, ['load_bearing', 'exterior']));
    add(project, createWindowNode(bed2North.id, 'Bed 2 Window', { x: 8, y: H + DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.4, 1.4));

    // ─── En-Suite (X=10..12, Z=0..5) ────────────────────────────────
    const ensuite = add(project, createRoomNode(ff.id, 'En-Suite Bathroom',
        { x: 11, y: H, z: 2.5 }, { x: 2, y: H, z: 5 }, 'bathroom'));
    ensuite.tags = ['wet_room'];

    // En-suite east wall
    const ensuiteEast = add(project, createWallNode(ensuite.id, 'En-Suite East Wall',
        { x: 12, y: H + halfH, z: 2.5 }, 5, H, T, ['load_bearing', 'exterior']));
    ensuiteEast.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // En-suite small window
    add(project, createWindowNode(ensuiteEast.id, 'En-Suite Window', { x: 0, y: H + DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 0.6, 0.6));

    // ─── First Floor Mid Divider (Z=5) ──────────────────────────────
    const ffMidDivider = add(project, createPartitionNode(ff.id, 'FF Mid Divider',
        { x: 6, y: H + halfH, z: 5 }, 12, H, 0.15));

    // ─── Bedroom 3 (X=0..4, Z=5..10) ────────────────────────────────
    const bed3 = add(project, createRoomNode(ff.id, 'Bedroom 3',
        { x: 2, y: H, z: 7.5 }, { x: 4, y: H, z: 5 }, 'bedroom'));

    // Bed 3 south wall
    const bed3South = add(project, createWallNode(bed3.id, 'Bed 3 South Wall',
        { x: 2, y: H + halfH, z: 10 }, 4, H, T, ['load_bearing', 'exterior']));
    add(project, createWindowNode(bed3South.id, 'Bed 3 Window', { x: 2, y: H + DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.4, 1.4));

    // Bed 3 west wall (first floor)
    const bed3West = add(project, createWallNode(bed3.id, 'Bed 3 West Wall',
        { x: 0, y: H + halfH, z: 7.5 }, 5, H, T, ['load_bearing', 'exterior']));
    bed3West.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // Bed 3 door
    add(project, createDoorNode(ffMidDivider.id, 'Bed 3 Door', { x: 2, y: H + DEFAULTS.DOOR_HEIGHT / 2 }, 0.9, DEFAULTS.DOOR_HEIGHT));

    // ─── Bedroom 4 (X=4..8, Z=5..10) ────────────────────────────────
    const bed4 = add(project, createRoomNode(ff.id, 'Bedroom 4',
        { x: 6, y: H, z: 7.5 }, { x: 4, y: H, z: 5 }, 'bedroom'));

    // Bed 4 south wall
    const bed4South = add(project, createWallNode(bed4.id, 'Bed 4 South Wall',
        { x: 6, y: H + halfH, z: 10 }, 4, H, T, ['load_bearing', 'exterior']));
    add(project, createWindowNode(bed4South.id, 'Bed 4 Window', { x: 6, y: H + DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 1.4, 1.4));

    // Bed 4 door
    add(project, createDoorNode(ffMidDivider.id, 'Bed 4 Door', { x: 6, y: H + DEFAULTS.DOOR_HEIGHT / 2 }, 0.9, DEFAULTS.DOOR_HEIGHT));

    // Partition between bed 3 and bed 4
    const bed34part = add(project, createPartitionNode(ff.id, 'Bed 3-4 Partition',
        { x: 4, y: H + halfH, z: 7.5 }, 5, H, 0.12));
    bed34part.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // ─── Family Bathroom (X=8..12, Z=5..10) ─────────────────────────
    const famBath = add(project, createRoomNode(ff.id, 'Family Bathroom',
        { x: 10, y: H, z: 7.5 }, { x: 4, y: H, z: 5 }, 'bathroom'));
    famBath.tags = ['wet_room'];

    // Family bath east wall
    const famBathEast = add(project, createWallNode(famBath.id, 'Family Bath East Wall',
        { x: 12, y: H + halfH, z: 7.5 }, 5, H, T, ['load_bearing', 'exterior']));
    famBathEast.rotation = { yaw: 90, pitch: 0, roll: 0 };
    add(project, createWindowNode(famBathEast.id, 'Family Bath Window', { x: 0, y: H + DEFAULTS.WINDOW_SILL_HEIGHT + 0.7 }, 0.8, 0.6));

    // Family bath south wall
    const famBathSouth = add(project, createWallNode(famBath.id, 'Family Bath South Wall',
        { x: 10, y: H + halfH, z: 10 }, 4, H, T, ['load_bearing', 'exterior']));

    // Partition between bed 4 and bath
    const bathPartition = add(project, createPartitionNode(ff.id, 'Bed-Bath Partition',
        { x: 8, y: H + halfH, z: 7.5 }, 5, H, 0.12));
    bathPartition.rotation = { yaw: 90, pitch: 0, roll: 0 };

    // Bath door
    add(project, createDoorNode(bathPartition.id, 'Family Bath Door', { x: 0, y: H + DEFAULTS.DOOR_HEIGHT / 2 }, 0.8, DEFAULTS.DOOR_HEIGHT));

    // ─── First Floor North Wall (shared across all north rooms) ──────
    const ffNorth = add(project, createWallNode(ff.id, 'FF Full North Wall',
        { x: 6, y: H + halfH, z: 0 }, 12, H, T, ['load_bearing', 'exterior']));

    // ─── Flat Roof ───────────────────────────────────────────────────
    const roof = add(project, createRoofNode(rootId, 'Flat Roof', 'flat', 0, { x: 13, y: 0.3, z: 11 }));
    roof.position = { x: 6, y: H * 2, z: 5 };
    roof.material_id = 'mat_concrete_slab';

    return project;
}

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

/**
 * All available templates, indexed by a slug.
 * The UI shows these as cards the user can click to start a project.
 *
 * ADDING A NEW TEMPLATE:
 * 1. Write a createXxxTemplate() function above
 * 2. Add an entry to this array with metadata
 * 3. The UI will automatically pick it up
 */
export interface TemplateInfo {
    slug: string;
    name: string;
    description: string;
    bedrooms: number;
    floors: number;
    approx_area_m2: number;
    style: string;
    preview_image: string;
    create: (budget?: number, currency?: string) => PSGProject;
}

export const TEMPLATES: TemplateInfo[] = [
    {
        slug: 'simple_3bed_1floor',
        name: 'Simple 3-Bedroom Bungalow',
        description: 'A classic single-storey family home with 3 bedrooms, open-plan living, kitchen, bathroom, and a gable roof. ~120 m².',
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
        description: 'A contemporary two-storey home with 4 bedrooms, en-suite, family bathroom, open-plan ground floor, and flat roof. ~240 m².',
        bedrooms: 4,
        floors: 2,
        approx_area_m2: 240,
        style: 'Modern',
        preview_image: '/templates/modern_4bed.jpg',
        create: createModern4BedTemplate,
    },
];
