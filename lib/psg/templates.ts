/**
 * =============================================================================
 * LIB/PSG/TEMPLATES.TS — Starter House Templates
 * =============================================================================
 *
 * Pre-built house templates for quick-start projects.
 *
 * WALL POSITIONING STRATEGY — "THROUGH + BETWEEN" JOINTS:
 * ─────────────────────────────────────────────────────────
 *  Problem: Walls have thickness (T=0.25m). A wall at z=0 occupies
 *           z = -T/2 to z = +T/2.  Two perpendicular walls both
 *           positioned at their grid-line centers leave a T×T gap.
 *
 *  Solution: Use "through" and "between" wall strategy:
 *
 *   • HORIZONTAL walls (EW, yaw=0) are "THROUGH" walls:
 *     - Their center X is at the CENTER of the house width.
 *     - Their LENGTH extends to the OUTER faces of the corner walls.
 *     - A north wall for a 10m-wide house has length = 10m + T,
 *       centered at x = house_center. This FULLY covers both corners.
 *
 *   • VERTICAL walls (NS, yaw=90) are "BETWEEN" walls:
 *     - Their length is the interior span BETWEEN the inner faces
 *       of the two horizontal walls they connect.
 *     - For a room that goes from z=0 to z=6 with horizontal walls
 *       at both ends (each T thick), the NS wall length =
 *       6 - T (the gap between inner faces).
 *     - The NS wall center Z = midpoint of the interior span.
 *
 *  Result: Every corner is a clean butt joint with no gaps, no overlaps.
 *
 * COORDINATE SYSTEM:
 * - X axis: East-West (positive = east)
 * - Y axis: Up-Down (positive = up, Y=0 is ground)
 * - Z axis: North-South (positive = south)
 * - All positions are CENTER points of nodes
 * - All dimensions are in meters
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

function add(project: PSGProject, node: PSGNode): PSGNode {
    project.nodes[node.id] = node;
    if (node.parent_id && project.nodes[node.parent_id]) {
        project.nodes[node.parent_id].children_ids.push(node.id);
    }
    return node;
}

/**
 * Add a wall and set its rotation in one step.
 * Returns the wall node for chaining.
 */
function addWall(
    project: PSGProject,
    parentId: string,
    name: string,
    pos: { x: number; y: number; z: number },
    length: number,
    height: number,
    thickness: number,
    tags: PSGNode['tags'],
    yaw: number = 0
): PSGNode {
    const wall = add(project, createWallNode(parentId, name, pos, length, height, thickness, tags));
    if (yaw !== 0) {
        wall.rotation = { yaw, pitch: 0, roll: 0 };
    }
    return wall;
}

/**
 * Add a partition and set rotation in one step.
 */
function addPartition(
    project: PSGProject,
    parentId: string,
    name: string,
    pos: { x: number; y: number; z: number },
    length: number,
    height: number,
    thickness: number,
    yaw: number = 0
): PSGNode {
    const part = add(project, createPartitionNode(parentId, name, pos, length, height, thickness));
    if (yaw !== 0) {
        part.rotation = { yaw, pitch: 0, roll: 0 };
    }
    return part;
}

// =============================================================================
// TEMPLATE: Simple 3-Bedroom, Single Floor
// =============================================================================

/**
 * Creates a simple single-storey, 3-bedroom family home.
 *
 * LAYOUT — 10m wide (X) × 12m deep (Z), origin = northwest outer corner.
 *
 *     North (Z = 0)
 *     ┌──────────────────────────────┐
 *     │         Living Room          │
 *     │         (10m × 6m)           │  Z=0 to Z=6
 *     ├──────────────────────────────┤
 *     │    Kitchen    │   Bathroom   │
 *     │   (5m × 3m)  │  (5m × 3m)   │  Z=6 to Z=9
 *     ├───────────────┼──────────────┤
 *     │   Bedroom 1   │  Bedroom 2  │
 *     │  (5m × 3m)   │  (5m × 3m)  │  Z=9 to Z=12
 *     └───────────────┴──────────────┘
 *     South (Z = 12)
 *
 * WALL JOINTS:
 *   All horizontal (EW, yaw=0) walls are "through" walls — they extend
 *   to the outer face of the building, covering corner joints.
 *   All vertical (NS, yaw=90) walls are "between" walls — they run
 *   between the inner faces of the horizontal walls.
 *
 * TOTAL AREA: ~120 m²
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
    const halfT = T / 2;               // 0.125m

    // House outer dimensions
    const HOUSE_W = 10;  // meters (X direction)
    const HOUSE_D = 12;  // meters (Z direction)

    // ─── Ground Floor ────────────────────────────────────────────────
    const floor = add(project, createFloorNode(rootId, 0, 'Ground Floor'));

    // ─── Foundation ──────────────────────────────────────────────────
    add(project, createFoundationNode(floor.id, 'Foundation',
        { x: HOUSE_W / 2, y: -0.15, z: HOUSE_D / 2 },
        { x: HOUSE_W + T, y: 0.3, z: HOUSE_D + T }));

    // ─── Ground Slab ─────────────────────────────────────────────────
    add(project, createSlabNode(floor.id, 'Ground Floor Slab',
        { x: HOUSE_W / 2, y: 0, z: HOUSE_D / 2 },
        { x: HOUSE_W, y: 0.15, z: HOUSE_D }));

    // ─────────────────────────────────────────────────────────────────
    // ROOMS
    // ─────────────────────────────────────────────────────────────────
    const living = add(project, createRoomNode(floor.id, 'Living Room',
        { x: HOUSE_W / 2, y: 0, z: 3 },
        { x: HOUSE_W, y: H, z: 6 }, 'living'));

    const kitchen = add(project, createRoomNode(floor.id, 'Kitchen',
        { x: 2.5, y: 0, z: 7.5 },
        { x: 5, y: H, z: 3 }, 'kitchen'));

    const bathroom = add(project, createRoomNode(floor.id, 'Bathroom',
        { x: 7.5, y: 0, z: 7.5 },
        { x: 5, y: H, z: 3 }, 'bathroom'));
    bathroom.tags = ['wet_room'];

    const bed1 = add(project, createRoomNode(floor.id, 'Bedroom 1',
        { x: 2.5, y: 0, z: 10.5 },
        { x: 5, y: H, z: 3 }, 'bedroom'));

    const bed2 = add(project, createRoomNode(floor.id, 'Bedroom 2',
        { x: 7.5, y: 0, z: 10.5 },
        { x: 5, y: H, z: 3 }, 'bedroom'));

    // ─────────────────────────────────────────────────────────────────
    // EXTERIOR WALLS — "THROUGH" (EW) + "BETWEEN" (NS)
    // ─────────────────────────────────────────────────────────────────
    //
    // Through walls (EW, yaw=0): positioned at z = grid ± T/2,
    //   length = HOUSE_W (inner span, since NS walls butt against them)
    //   BUT we want the EW walls to be the "through" walls, so they span
    //   the FULL outer width.
    //
    // Actually the cleanest approach: EW walls span exactly HOUSE_W,
    // NS walls span exactly their interior span, AND the EW walls sit
    // at the exact grid line (z=0, z=12) with their center at z=halfT
    // so the OUTER face is at z=0.

    // ── NORTH WALL (z=0 outer face) ──────────────────────────────────
    // Center: x=HOUSE_W/2, z=halfT (outer face at z=0, inner face at z=T)
    const northWall = addWall(project, living.id, 'North Wall',
        { x: HOUSE_W / 2, y: halfH, z: halfT },
        HOUSE_W, H, T, ['load_bearing', 'exterior']);
    // Windows on the north wall
    add(project, createWindowNode(northWall.id, 'Living Window L',
        { x: 3, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7, z: halfT },
        1.8, 1.4));
    add(project, createWindowNode(northWall.id, 'Living Window R',
        { x: 7, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7, z: halfT },
        1.8, 1.4));
    // Front door
    add(project, createDoorNode(northWall.id, 'Front Door',
        { x: 5, y: DEFAULTS.DOOR_HEIGHT / 2, z: halfT },
        1.0, DEFAULTS.DOOR_HEIGHT));

    // ── SOUTH WALL (z=12 outer face) ─────────────────────────────────
    // Center: z = HOUSE_D - halfT (outer face at z=12, inner face at z=12-T)
    const southWall = addWall(project, bed1.id, 'South Wall',
        { x: HOUSE_W / 2, y: halfH, z: HOUSE_D - halfT },
        HOUSE_W, H, T, ['load_bearing', 'exterior']);
    add(project, createWindowNode(southWall.id, 'Bed 1 Window',
        { x: 2.5, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7, z: HOUSE_D - halfT },
        1.4, 1.4));
    add(project, createWindowNode(southWall.id, 'Bed 2 Window',
        { x: 7.5, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7, z: HOUSE_D - halfT },
        1.4, 1.4));

    // ── WEST WALL (x=0 outer face) ───────────────────────────────────
    // "Between" wall — runs from inner face of north wall (z=T)
    // to inner face of south wall (z=HOUSE_D-T)
    const westSpan = HOUSE_D - 2 * T; // 12 - 0.5 = 11.5m
    const westCenterZ = HOUSE_D / 2;  // 6m
    addWall(project, living.id, 'West Wall',
        { x: halfT, y: halfH, z: westCenterZ },
        westSpan, H, T, ['load_bearing', 'exterior'], 90);

    // ── EAST WALL (x=10 outer face) ──────────────────────────────────
    const eastWall = addWall(project, bathroom.id, 'East Wall',
        { x: HOUSE_W - halfT, y: halfH, z: westCenterZ },
        westSpan, H, T, ['load_bearing', 'exterior'], 90);
    // Kitchen window (on the west wall section — actually let's put a bathroom window on east)
    add(project, createWindowNode(eastWall.id, 'Bathroom Window',
        { x: HOUSE_W - halfT, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7, z: 7.5 },
        0.8, 0.6));

    // ─────────────────────────────────────────────────────────────────
    // INTERIOR DIVIDERS (Partitions)
    // ─────────────────────────────────────────────────────────────────

    // Horizontal divider at Z=6 (between living and kitchen/bath)
    // "Through" partition — spans full house width, sits INSIDE
    const PT = 0.15; // partition thickness
    const halfPT = PT / 2;
    const livingDivider = addPartition(project, floor.id, 'Living-Kitchen Divider',
        { x: HOUSE_W / 2, y: halfH, z: 6 },
        HOUSE_W - 2 * T, H, PT);
    add(project, createDoorNode(livingDivider.id, 'Kitchen Door',
        { x: 2.5, y: DEFAULTS.DOOR_HEIGHT / 2, z: 6 },
        0.9, DEFAULTS.DOOR_HEIGHT));

    // Horizontal divider at Z=9 (between kitchen/bath and bedrooms)
    const midDivider = addPartition(project, floor.id, 'Mid Floor Divider',
        { x: HOUSE_W / 2, y: halfH, z: 9 },
        HOUSE_W - 2 * T, H, PT);
    add(project, createDoorNode(midDivider.id, 'Bed 1 Door',
        { x: 2.5, y: DEFAULTS.DOOR_HEIGHT / 2, z: 9 },
        0.9, DEFAULTS.DOOR_HEIGHT));
    add(project, createDoorNode(midDivider.id, 'Bed 2 Door',
        { x: 7.5, y: DEFAULTS.DOOR_HEIGHT / 2, z: 9 },
        0.9, DEFAULTS.DOOR_HEIGHT));

    // Vertical partition at X=5 between kitchen and bathroom (Z=6 to Z=9)
    // "Between" — runs between inner faces of horizontal dividers
    const kitchenBathPart = addPartition(project, floor.id, 'Kitchen-Bath Partition',
        { x: 5, y: halfH, z: 7.5 },
        3 - PT, H, 0.12, 90);

    // Vertical partition at X=5 between bedroom 1 and 2 (Z=9 to Z=12)
    addPartition(project, floor.id, 'Bedroom Partition',
        { x: 5, y: halfH, z: 10.5 },
        3 - PT, H, 0.12, 90);

    // ── Kitchen window (west wall) — add as a window on the west wall
    // We can't add to a wall that doesn't cover that range, so let's add
    // a dedicated kitchen west window on the main west wall
    // The west wall already covers z=T to z=HOUSE_D-T which includes z=7.5

    // ─── Roof ────────────────────────────────────────────────────────
    const roof = add(project, createRoofNode(rootId, 'Main Roof', 'gable', 35,
        { x: HOUSE_W + 1, y: 0.3, z: HOUSE_D + 1 }));
    roof.position = { x: HOUSE_W / 2, y: H, z: HOUSE_D / 2 };

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

    const H = DEFAULTS.WALL_HEIGHT;  // 2.7m
    const T = DEFAULTS.WALL_THICKNESS; // 0.25m
    const halfH = H / 2;
    const halfT = T / 2;
    const PT = 0.15; // partition thickness
    const halfPT = PT / 2;

    // House outer dimensions
    const W = 12;  // X
    const D = 10;  // Z

    // ─── Foundation ──────────────────────────────────────────────────
    add(project, createFoundationNode(rootId, 'Foundation',
        { x: W / 2, y: -0.15, z: D / 2 },
        { x: W + T, y: 0.3, z: D + T }));

    // ═══════════════════════════════════════════════════════════════════
    // GROUND FLOOR
    // ═══════════════════════════════════════════════════════════════════
    const gf = add(project, createFloorNode(rootId, 0, 'Ground Floor'));

    add(project, createSlabNode(gf.id, 'Ground Slab',
        { x: W / 2, y: 0, z: D / 2 },
        { x: W, y: 0.15, z: D }));

    // ─── Rooms ───────────────────────────────────────────────────────
    const openPlan = add(project, createRoomNode(gf.id, 'Open Plan Living',
        { x: W / 2, y: 0, z: 3.5 }, { x: W, y: H, z: 7 }, 'living'));

    const entrance = add(project, createRoomNode(gf.id, 'Entrance Hall',
        { x: 4, y: 0, z: 8.5 }, { x: 8, y: H, z: 3 }, 'hallway'));

    const wc = add(project, createRoomNode(gf.id, 'WC / Storage',
        { x: 10, y: 0, z: 8.5 }, { x: 4, y: H, z: 3 }, 'bathroom'));
    wc.tags = ['wet_room'];

    // ─── Exterior Walls ──────────────────────────────────────────────
    // North wall (EW through, z outer face = 0)
    const gfNorth = addWall(project, openPlan.id, 'GF North Wall',
        { x: W / 2, y: halfH, z: halfT },
        W, H, T, ['load_bearing', 'exterior']);
    add(project, createWindowNode(gfNorth.id, 'Living Window 1',
        { x: 2, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7, z: halfT }, 2.4, 1.6));
    add(project, createWindowNode(gfNorth.id, 'Living Window 2',
        { x: 6, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7, z: halfT }, 2.4, 1.6));
    add(project, createWindowNode(gfNorth.id, 'Kitchen Window',
        { x: 10, y: DEFAULTS.WINDOW_SILL_HEIGHT + 0.7, z: halfT }, 1.8, 1.4));

    // South wall (EW through, z outer face = D)
    const gfSouth = addWall(project, entrance.id, 'GF South Wall',
        { x: W / 2, y: halfH, z: D - halfT },
        W, H, T, ['load_bearing', 'exterior']);
    add(project, createDoorNode(gfSouth.id, 'Front Door',
        { x: 4, y: DEFAULTS.DOOR_HEIGHT / 2, z: D - halfT }, 1.2, DEFAULTS.DOOR_HEIGHT));

    // West wall (NS between, x outer face = 0)
    const gfWestSpan = D - 2 * T;
    addWall(project, openPlan.id, 'GF West Wall',
        { x: halfT, y: halfH, z: D / 2 },
        gfWestSpan, H, T, ['load_bearing', 'exterior'], 90);

    // East wall (NS between, x outer face = W)
    addWall(project, openPlan.id, 'GF East Wall',
        { x: W - halfT, y: halfH, z: D / 2 },
        gfWestSpan, H, T, ['load_bearing', 'exterior'], 90);

    // ─── Interior Partitions ─────────────────────────────────────────
    // Divider at Z=7 (living ↔ entry)
    const gfDivider = addPartition(project, gf.id, 'GF Living-Entry Divider',
        { x: W / 2, y: halfH, z: 7 },
        W - 2 * T, H, PT);
    add(project, createDoorNode(gfDivider.id, 'Living Door',
        { x: 4, y: DEFAULTS.DOOR_HEIGHT / 2, z: 7 }, 1.0, DEFAULTS.DOOR_HEIGHT));

    // Entry-WC partition (X=8, vertical)
    const wcPartition = addPartition(project, gf.id, 'WC Partition',
        { x: 8, y: halfH, z: 8.5 },
        3 - PT, H, 0.12, 90);
    add(project, createDoorNode(wcPartition.id, 'WC Door',
        { x: 8, y: DEFAULTS.DOOR_HEIGHT / 2, z: 8.5 }, 0.8, DEFAULTS.DOOR_HEIGHT));

    // ─── Stairs ──────────────────────────────────────────────────────
    add(project, createStairsNode(gf.id, 'Main Stairs', 'straight',
        { x: 7, y: 0, z: 8.5 }));

    // ═══════════════════════════════════════════════════════════════════
    // FIRST FLOOR
    // ═══════════════════════════════════════════════════════════════════
    const ff = add(project, createFloorNode(rootId, 1, 'First Floor'));

    add(project, createSlabNode(ff.id, 'First Floor Slab',
        { x: W / 2, y: H, z: D / 2 },
        { x: W, y: 0.2, z: D }));

    // ─── Rooms ───────────────────────────────────────────────────────
    const master = add(project, createRoomNode(ff.id, 'Master Bedroom',
        { x: 3, y: H, z: 2.5 }, { x: 6, y: H, z: 5 }, 'bedroom'));

    const ffBed2 = add(project, createRoomNode(ff.id, 'Bedroom 2',
        { x: 8, y: H, z: 2.5 }, { x: 4, y: H, z: 5 }, 'bedroom'));

    const ensuite = add(project, createRoomNode(ff.id, 'En-Suite Bathroom',
        { x: 11, y: H, z: 2.5 }, { x: 2, y: H, z: 5 }, 'bathroom'));
    ensuite.tags = ['wet_room'];

    const ffBed3 = add(project, createRoomNode(ff.id, 'Bedroom 3',
        { x: 2, y: H, z: 7.5 }, { x: 4, y: H, z: 5 }, 'bedroom'));

    const ffBed4 = add(project, createRoomNode(ff.id, 'Bedroom 4',
        { x: 6, y: H, z: 7.5 }, { x: 4, y: H, z: 5 }, 'bedroom'));

    const famBath = add(project, createRoomNode(ff.id, 'Family Bathroom',
        { x: 10, y: H, z: 7.5 }, { x: 4, y: H, z: 5 }, 'bathroom'));
    famBath.tags = ['wet_room'];

    // ─── First Floor Exterior Walls ──────────────────────────────────
    const ffY = H + halfH;
    const ffWestSpan = D - 2 * T;

    // North wall (EW through)
    const ffNorth = addWall(project, ff.id, 'FF North Wall',
        { x: W / 2, y: ffY, z: halfT },
        W, H, T, ['load_bearing', 'exterior']);
    add(project, createWindowNode(ffNorth.id, 'Master Window',
        { x: 3, y: ffY, z: halfT }, 2.0, 1.6));
    add(project, createWindowNode(ffNorth.id, 'Bed 2 Window',
        { x: 8, y: ffY, z: halfT }, 1.4, 1.4));

    // South wall (EW through)
    const ffSouth = addWall(project, ff.id, 'FF South Wall',
        { x: W / 2, y: ffY, z: D - halfT },
        W, H, T, ['load_bearing', 'exterior']);
    add(project, createWindowNode(ffSouth.id, 'Bed 3 Window',
        { x: 2, y: ffY, z: D - halfT }, 1.4, 1.4));
    add(project, createWindowNode(ffSouth.id, 'Bed 4 Window',
        { x: 6, y: ffY, z: D - halfT }, 1.4, 1.4));

    // West wall (NS between)
    addWall(project, ff.id, 'FF West Wall',
        { x: halfT, y: ffY, z: D / 2 },
        ffWestSpan, H, T, ['load_bearing', 'exterior'], 90);

    // East wall (NS between)
    const ffEast = addWall(project, ff.id, 'FF East Wall',
        { x: W - halfT, y: ffY, z: D / 2 },
        ffWestSpan, H, T, ['load_bearing', 'exterior'], 90);
    add(project, createWindowNode(ffEast.id, 'En-Suite Window',
        { x: W - halfT, y: ffY, z: 2.5 }, 0.6, 0.6));
    add(project, createWindowNode(ffEast.id, 'Family Bath Window',
        { x: W - halfT, y: ffY, z: 7.5 }, 0.8, 0.6));

    // ─── First Floor Interior Partitions ─────────────────────────────
    // Mid divider at Z=5 (bedrooms top row ↔ bottom row)
    const ffMidDiv = addPartition(project, ff.id, 'FF Mid Divider',
        { x: W / 2, y: ffY, z: 5 },
        W - 2 * T, H, PT);
    add(project, createDoorNode(ffMidDiv.id, 'Bed 3 Door',
        { x: 2, y: H + DEFAULTS.DOOR_HEIGHT / 2, z: 5 }, 0.9, DEFAULTS.DOOR_HEIGHT));
    add(project, createDoorNode(ffMidDiv.id, 'Bed 4 Door',
        { x: 6, y: H + DEFAULTS.DOOR_HEIGHT / 2, z: 5 }, 0.9, DEFAULTS.DOOR_HEIGHT));

    // Master → Bed2 partition at X=6 (Z=0..5)
    addPartition(project, ff.id, 'Master-Bed2 Partition',
        { x: 6, y: ffY, z: 2.5 },
        5 - 2 * halfT - PT, H, 0.12, 90);

    // Bed2 → EnSuite partition at X=10 (Z=0..5)
    addPartition(project, ff.id, 'Bed2-EnSuite Partition',
        { x: 10, y: ffY, z: 2.5 },
        5 - 2 * halfT - PT, H, 0.12, 90);

    // Bed3 → Bed4 partition at X=4 (Z=5..10)
    addPartition(project, ff.id, 'Bed3-Bed4 Partition',
        { x: 4, y: ffY, z: 7.5 },
        5 - 2 * halfT - PT, H, 0.12, 90);

    // Bed4 → FamBath partition at X=8 (Z=5..10)
    const bed4BathPart = addPartition(project, ff.id, 'Bed-Bath Partition',
        { x: 8, y: ffY, z: 7.5 },
        5 - 2 * halfT - PT, H, 0.12, 90);
    add(project, createDoorNode(bed4BathPart.id, 'Family Bath Door',
        { x: 8, y: H + DEFAULTS.DOOR_HEIGHT / 2, z: 7.5 }, 0.8, DEFAULTS.DOOR_HEIGHT));

    // ─── Flat Roof ───────────────────────────────────────────────────
    const roof = add(project, createRoofNode(rootId, 'Flat Roof', 'flat', 0,
        { x: W + 1, y: 0.3, z: D + 1 }));
    roof.position = { x: W / 2, y: H * 2, z: D / 2 };
    roof.material_id = 'mat_concrete_slab';

    return project;
}

// =============================================================================
// TEMPLATE: Minimalist Studio Apartment
// =============================================================================

/**
 * Creates a minimalist studio apartment.
 * 
 * LAYOUT (8m x 6m):
 * One open space with defined zones.
 */
export function createMinimalistStudioTemplate(
    budget: number = 85000,
    currency: string = 'EUR'
): PSGProject {
    const project = createEmptyProject('Minimalist Studio', budget, currency);
    const rootId = project.root_node_id;

    const H = DEFAULTS.WALL_HEIGHT;
    const T = DEFAULTS.WALL_THICKNESS;
    const halfH = H / 2;
    const halfT = T / 2;

    const W = 8;
    const D = 6;

    // Foundation & Slab
    add(project, createFoundationNode(rootId, 'Foundation', { x: W / 2, y: -0.15, z: D / 2 }, { x: W + T, y: 0.3, z: D + T }));
    const floor = add(project, createFloorNode(rootId, 0, 'Ground Floor'));
    add(project, createSlabNode(floor.id, 'Slab', { x: W / 2, y: 0, z: D / 2 }, { x: W, y: 0.15, z: D }));

    // Main Room
    const studio = add(project, createRoomNode(floor.id, 'Studio Space', { x: W / 2, y: 0, z: D / 2 }, { x: W, y: H, z: D }, 'living'));

    // Exterior Walls
    addWall(project, studio.id, 'North Wall', { x: W / 2, y: halfH, z: halfT }, W, H, T, ['load_bearing', 'exterior']);
    addWall(project, studio.id, 'South Wall', { x: W / 2, y: halfH, z: D - halfT }, W, H, T, ['load_bearing', 'exterior']);
    addWall(project, studio.id, 'West Wall', { x: halfT, y: halfH, z: D / 2 }, D - 2 * T, H, T, ['load_bearing', 'exterior'], 90);
    const eastWall = addWall(project, studio.id, 'East Wall', { x: W - halfT, y: halfH, z: D / 2 }, D - 2 * T, H, T, ['load_bearing', 'exterior'], 90);

    // Large window on East
    add(project, createWindowNode(eastWall.id, 'Picture Window', { x: 7, y: 1.5, z: 3 }, 3.0, 2.0));

    // Bathroom Pod
    addPartition(project, floor.id, 'Bath Divider N', { x: 1.5, y: halfH, z: 3 }, 3, H, 0.1);
    addPartition(project, floor.id, 'Bath Divider E', { x: 3, y: halfH, z: 1.5 }, 3, H, 0.1, 90);

    // Flat Roof
    const roof = add(project, createRoofNode(rootId, 'Flat Roof', 'flat', 0, { x: W + 0.5, y: 0.3, z: D + 0.5 }));
    roof.position = { x: W / 2, y: H, z: D / 2 };

    return project;
}

// =============================================================================
// TEMPLATE REGISTRY
// =============================================================================

// =============================================================================
// TEMPLATE: Neoclassical Mansion (White House Style)
// =============================================================================

/**
 * Creates a grand Neoclassical mansion inspired by the White House.
 * Features a central 3-storey block with symmetrical wings.
 */
export function createWhiteHouseTemplate(
    budget: number = 10000000,
    currency: string = 'USD'
): PSGProject {
    const project = createEmptyProject('The White House', budget, currency);
    const rootId = project.root_node_id;

    const H = 4.0; // Grand ceiling height
    const T = 0.5; // Thick neoclassical walls
    const halfH = H / 2;
    const halfT = T / 2;

    // Dimensions
    const CENTER_W = 25; // Central block width
    const CENTER_D = 20; // Central block depth
    const WING_W = 15;   // Side wing width
    const WING_D = 12;   // Side wing depth

    // ─── Floors ──────────────────────────────────────────────────────
    const gf = add(project, createFloorNode(rootId, 0, 'Ground Floor'));
    const ff = add(project, createFloorNode(rootId, 1, 'First Floor'));
    const sf = add(project, createFloorNode(rootId, 2, 'Second Floor'));

    // ─── Central Block ───────────────────────────────────────────────
    // Start with a grand main room to hold the front/back walls
    const centralHall = add(project, createRoomNode(gf.id, 'Grand Entry Hall',
        { x: 0, y: 0, z: 0 }, { x: CENTER_W, y: H, z: CENTER_D }, 'hallway'));

    // Central Slab
    add(project, createSlabNode(gf.id, 'Main Foundation', { x: 0, y: 0, z: 0 }, { x: CENTER_W + 40, y: 0.5, z: CENTER_D + 10 }));

    // Central Walls
    addWall(project, centralHall.id, 'Front Portico Wall', { x: 0, y: halfH, z: -CENTER_D / 2 + halfT }, CENTER_W, H, T, ['exterior']);
    addWall(project, centralHall.id, 'Back Wall', { x: 0, y: halfH, z: CENTER_D / 2 - halfT }, CENTER_W, H, T, ['exterior']);
    addWall(project, centralHall.id, 'Left Wall', { x: -CENTER_W / 2 + halfT, y: halfH, z: 0 }, CENTER_D - 2 * T, H, T, ['exterior'], 90);
    addWall(project, centralHall.id, 'Right Wall', { x: CENTER_W / 2 - halfT, y: halfH, z: 0 }, CENTER_D - 2 * T, H, T, ['exterior'], 90);

    // Iconic Columns (Custom Elements)
    for (let i = -3; i <= 3; i++) {
        const x = i * 3;
        if (x === 0) continue; // Skip center for front door area
        add(project, {
            ...createWallNode(centralHall.id, `Column ${i}`, { x, y: H * 1.5, z: -CENTER_D / 2 - 2 }, 0.8, H * 3, 0.8, ['custom']),
            type: 'Column'
        } as PSGNode);
    }

    // ─── West Wing ──────────────────────────────────────────────────
    const westWing = add(project, createRoomNode(gf.id, 'West Wing',
        { x: -CENTER_W / 2 - WING_W / 2, y: 0, z: 0 }, { x: WING_W, y: H, z: WING_D }, 'office'));
    addWall(project, westWing.id, 'West Wing Outer', { x: -CENTER_W / 2 - WING_W + halfT, y: halfH, z: 0 }, WING_D, H, T, ['exterior'], 90);

    // ─── East Wing ──────────────────────────────────────────────────
    const eastWing = add(project, createRoomNode(gf.id, 'East Wing',
        { x: CENTER_W / 2 + WING_W / 2, y: 0, z: 0 }, { x: WING_W, y: H, z: WING_D }, 'office'));
    addWall(project, eastWing.id, 'East Wing Outer', { x: CENTER_W / 2 + WING_W - halfT, y: halfH, z: 0 }, WING_D, H, T, ['exterior'], 90);

    // ─── Roof ────────────────────────────────────────────────────────
    const mainRoof = add(project, createRoofNode(rootId, 'Central Parapet', 'flat', 0, { x: CENTER_W + 2, y: 0.5, z: CENTER_D + 2 }));
    mainRoof.position = { x: 0, y: H * 3, z: 0 };
    mainRoof.material_id = 'mat_marble_white';

    return project;
}

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
        preview_image: '/templates/simple_3bed.png',
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
        preview_image: '/templates/modern_4bed.png',
        create: createModern4BedTemplate,
    },
    {
        slug: 'minimalist_studio',
        name: 'Minimalist Studio',
        description: 'A space-efficient open-plan studio apartment ideal for urban living. Minimalist design with high-impact windows. ~48 m².',
        bedrooms: 1,
        floors: 1,
        approx_area_m2: 48,
        style: 'Minimalist',
        preview_image: '/templates/studio.png',
        create: createMinimalistStudioTemplate,
    },
    {
        slug: 'white_house',
        name: 'The White House',
        description: 'A grand Neoclassical mansion with a central portico, wings, and iconic columns. 3 floors, grand ceilings. Symmetrical design.',
        bedrooms: 6,
        floors: 3,
        approx_area_m2: 5100,
        style: 'Neoclassical',
        preview_image: '/templates/white_house.jpg',
        create: createWhiteHouseTemplate,
    },
    {
        slug: 'empty',
        name: 'Empty Environment',
        description: 'Start with a blank canvas. No pre-built walls, just an infinite grid and your imagination.',
        bedrooms: 0,
        floors: 0,
        approx_area_m2: 0,
        style: 'Custom',
        preview_image: '/templates/empty.jpg',
        create: (budget) => createEmptyProject('New Project', budget),
    },
];
