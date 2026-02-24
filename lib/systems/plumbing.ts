/**
 * =============================================================================
 * LIB/SYSTEMS/PLUMBING.TS — Plumbing System
 * =============================================================================
 *
 * Manages the plumbing layer. Two pipe networks:
 * 1. SUPPLY (green): Clean water from mains → fixtures
 * 2. DRAIN (red): Waste water from fixtures → sewer/septic
 *
 * VISUALIZATION:
 * - Supply pipes: GREEN lines, typically 15-22mm diameter
 * - Drain pipes: RED lines, typically 40-110mm diameter
 * - Hot water pipes: ORANGE subset of supply
 *
 * AUTO-PLACEMENT RULES:
 * - Bathrooms: toilet (110mm drain), basin (40mm drain), shower/bath (50mm drain)
 * - Kitchen: sink (50mm drain), dishwasher connection
 * - Utility: washing machine connection
 * - Each wet room gets both hot and cold supply
 *
 * TODO (Phase 4): Implement pipe routing through walls
 * TODO (Phase 4): Calculate pipe sizing based on fixture units
 * TODO (Phase 4): Add hot water cylinder and boiler locations
 * =============================================================================
 */

import type { PSGProject, PSGNode, Vec3 } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export type FixtureType =
    | 'toilet'
    | 'basin'
    | 'bath'
    | 'shower'
    | 'kitchen_sink'
    | 'dishwasher'
    | 'washing_machine'
    | 'boiler'
    | 'hot_water_cylinder'
    | 'outside_tap';

export type PipeType = 'supply_cold' | 'supply_hot' | 'drain' | 'vent';

export interface PlumbingFixture {
    id: string;
    type: FixtureType;
    room_id: string;
    wall_id: string;                // Wall the fixture is mounted on
    position: Vec3;
    supply_connections: string[];   // Pipe IDs
    drain_connections: string[];    // Pipe IDs
}

export interface PipeSegment {
    id: string;
    type: PipeType;
    diameter_mm: number;           // 15, 22, 40, 50, 110mm
    from: Vec3;
    to: Vec3;
    in_wall_id: string;            // Wall the pipe runs through (or '' for floor)
    gradient: number;              // Fall per meter for drains (1:40 typical)
}

export interface PlumbingLayout {
    fixtures: PlumbingFixture[];
    pipes: PipeSegment[];
    mains_entry: Vec3;            // Where water enters the building
    drain_exit: Vec3;             // Where drain connects to sewer
    total_fixture_units: number;  // Plumbing sizing calculation
}

// =============================================================================
// AUTO-PLACEMENT
// =============================================================================

/**
 * Helper to calculate world position from wall-relative coordinates.
 * xRel = distance along the wall from the start end
 * yRel = height from the bottom of the wall
 * zOffset = offset from the wall surface (into the room)
 */
function getWallWorldPos(wall: PSGNode, xRel: number, yRel: number, zOffset: number = 0.05) {
    const halfW = wall.dimensions.x / 2;
    const localX = xRel - halfW;
    const angle = (wall.rotation.yaw * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    // Place just on the inside face of the wall
    const distFromCenter = wall.dimensions.z / 2 + zOffset;

    return {
        x: wall.position.x + localX * cosA - distFromCenter * sinA,
        y: wall.position.y - (wall.dimensions.y / 2) + yRel,
        z: wall.position.z - localX * sinA - distFromCenter * cosA,
    };
}


/**
 * Generates a plumbing layout based on room functions.
 * All pipes route INSIDE the building structure — through walls and along slabs.
 */
export function generatePlumbingLayout(project: PSGProject): PlumbingLayout {
    const fixtures: PlumbingFixture[] = [];

    // Find the ground slab to know where the floor is
    const slabs = Object.values(project.nodes).filter(n => n.type === 'Slab');
    const groundSlab = slabs.length > 0 ? slabs[0] : null;
    const slabTopY = groundSlab
        ? groundSlab.position.y + groundSlab.dimensions.y / 2
        : 0.15; // Default slab top

    // Central manifold point — inside the house, on the ground floor
    const house = project.nodes[project.root_node_id];
    const houseCenter = house
        ? { x: house.position.x, z: house.position.z }
        : { x: 5, z: 6 };

    // Manifold sits above slab, inside the house
    const manifoldPos: Vec3 = {
        x: houseCenter.x,
        y: slabTopY + 0.1,
        z: houseCenter.z,
    };

    // Mains entry and drain exit are at slab level at the edge of the house
    const houseW = house ? house.dimensions?.x || 10 : 10;
    const mainsEntry: Vec3 = {
        x: houseCenter.x - houseW / 2,
        y: slabTopY + 0.05,
        z: houseCenter.z,
    };
    const drainExit: Vec3 = {
        x: houseCenter.x + houseW / 2,
        y: slabTopY,
        z: houseCenter.z,
    };

    // Find wet rooms
    const rooms = Object.values(project.nodes).filter(n => n.type === 'Room');
    rooms.forEach(room => {
        const func = room.room_function || '';
        if (['bathroom', 'kitchen', 'utility', 'ensuite', 'wc'].includes(func)) {
            fixtures.push(...getFixturesForRoom(room, project));
        }
    });

    const pipes = generatePipesForFixtures(fixtures, manifoldPos, mainsEntry, drainExit, project, slabTopY);

    return {
        fixtures,
        pipes,
        mains_entry: mainsEntry,
        drain_exit: drainExit,
        total_fixture_units: fixtures.reduce((s, f) => s + getFixtureUnits(f.type), 0),
    };
}


function getFixturesForRoom(room: PSGNode, project: PSGProject): PlumbingFixture[] {
    const fixtures: PlumbingFixture[] = [];
    const roomWalls = room.children_ids
        .map(id => project.nodes[id])
        .filter(n => n && (n.type === 'Wall' || n.type === 'Partition'));

    if (roomWalls.length === 0) return fixtures;

    const placeOnWall = (wall: PSGNode, type: FixtureType, xRel: number, yRel: number) => {
        fixtures.push({
            id: `${type}_${wall.id}_${fixtures.length}`,
            type,
            room_id: room.id,
            wall_id: wall.id,
            position: getWallWorldPos(wall, xRel, yRel),
            supply_connections: [],
            drain_connections: [],
        });
    };

    const func = room.room_function || '';
    if (func === 'bathroom' || func === 'ensuite') {
        if (roomWalls[0]) {
            placeOnWall(roomWalls[0], 'toilet', 0.6, 0.4);
            placeOnWall(roomWalls[0], 'basin', 1.4, 0.85);
            if (roomWalls[0].dimensions.x > 2.5) placeOnWall(roomWalls[0], 'shower', 2.2, 0.2);
        }
    } else if (func === 'kitchen') {
        if (roomWalls[0]) placeOnWall(roomWalls[0], 'kitchen_sink', 1.5, 0.9);
    } else if (func === 'wc') {
        if (roomWalls[0]) {
            placeOnWall(roomWalls[0], 'toilet', 0.5, 0.4);
            placeOnWall(roomWalls[0], 'basin', 1.2, 0.85);
        }
    } else if (func === 'utility') {
        if (roomWalls[0]) placeOnWall(roomWalls[0], 'washing_machine', 0.8, 0.3);
    }

    return fixtures;
}

/**
 * Generates pipes that route INSIDE the building.
 * 
 * Routing strategy per fixture:
 * 1. VERTICAL DROP (in-wall): From fixture position straight down inside the wall
 *    to just above the floor slab.
 * 2. HORIZONTAL RUN (on-slab): From the wall base across the floor slab to the 
 *    central manifold point.
 * 3. Supply runs from manifold → wall base → up to fixture (reverse direction).
 * 4. Drain runs from fixture → wall base → across slab → to drain exit.
 */
function generatePipesForFixtures(
    fixtures: PlumbingFixture[],
    manifoldPos: Vec3,
    mainsEntry: Vec3,
    drainExit: Vec3,
    project: PSGProject,
    slabTopY: number
): PipeSegment[] {
    const pipes: PipeSegment[] = [];

    // Pipe heights above slab
    const drainPipeY = slabTopY + 0.05;    // Drain pipes sit just above slab
    const supplyPipeY = slabTopY + 0.12;   // Supply pipes run slightly higher

    fixtures.forEach(fixture => {
        // Find the wall context for this fixture
        const wallId = fixture.wall_id || '';

        // ─── DRAIN PIPES ───────────────────────────────────────────────
        // 1. Vertical drop: fixture → wall base (inside wall)
        const drainWallBase: Vec3 = { x: fixture.position.x, y: drainPipeY, z: fixture.position.z };

        pipes.push({
            id: `drain_v_${fixture.id}`,
            type: 'drain',
            diameter_mm: fixture.type === 'toilet' ? 110 : 40,
            from: fixture.position,
            to: drainWallBase,
            in_wall_id: wallId,
            gradient: 0,
        });

        // 2. Horizontal run: wall base → drain exit (along slab)
        pipes.push({
            id: `drain_h_${fixture.id}`,
            type: 'drain',
            diameter_mm: fixture.type === 'toilet' ? 110 : 40,
            from: drainWallBase,
            to: { x: drainExit.x, y: drainPipeY, z: drainWallBase.z },
            in_wall_id: '',
            gradient: 0.01,
        });

        // 3. Final stretch to drain exit
        pipes.push({
            id: `drain_e_${fixture.id}`,
            type: 'drain',
            diameter_mm: fixture.type === 'toilet' ? 110 : 40,
            from: { x: drainExit.x, y: drainPipeY, z: drainWallBase.z },
            to: { x: drainExit.x, y: drainPipeY, z: drainExit.z },
            in_wall_id: '',
            gradient: 0.01,
        });

        // ─── SUPPLY PIPES ──────────────────────────────────────────────
        // 1. From manifold along slab to below fixture
        const supplyWallBase: Vec3 = { x: fixture.position.x, y: supplyPipeY, z: fixture.position.z };

        pipes.push({
            id: `supply_h1_${fixture.id}`,
            type: 'supply_cold',
            diameter_mm: 15,
            from: { x: manifoldPos.x, y: supplyPipeY, z: manifoldPos.z },
            to: { x: supplyWallBase.x, y: supplyPipeY, z: manifoldPos.z },
            in_wall_id: '',
            gradient: 0,
        });

        pipes.push({
            id: `supply_h2_${fixture.id}`,
            type: 'supply_cold',
            diameter_mm: 15,
            from: { x: supplyWallBase.x, y: supplyPipeY, z: manifoldPos.z },
            to: supplyWallBase,
            in_wall_id: '',
            gradient: 0,
        });

        // 2. Vertical rise: wall base → fixture (inside wall)
        pipes.push({
            id: `supply_v_${fixture.id}`,
            type: 'supply_cold',
            diameter_mm: 15,
            from: supplyWallBase,
            to: fixture.position,
            in_wall_id: wallId,
            gradient: 0,
        });

        // Hot water supply for applicable fixtures
        if (['basin', 'bath', 'shower', 'kitchen_sink', 'washing_machine'].includes(fixture.type)) {
            const hotWallBase: Vec3 = {
                x: fixture.position.x + 0.05,
                y: supplyPipeY,
                z: fixture.position.z + 0.05,
            };

            pipes.push({
                id: `hot_h_${fixture.id}`,
                type: 'supply_hot',
                diameter_mm: 15,
                from: { x: manifoldPos.x, y: supplyPipeY, z: manifoldPos.z },
                to: hotWallBase,
                in_wall_id: '',
                gradient: 0,
            });

            pipes.push({
                id: `hot_v_${fixture.id}`,
                type: 'supply_hot',
                diameter_mm: 15,
                from: hotWallBase,
                to: { x: fixture.position.x + 0.05, y: fixture.position.y, z: fixture.position.z + 0.05 },
                in_wall_id: wallId,
                gradient: 0,
            });
        }
    });

    // Mains entry → manifold pipe
    pipes.push({
        id: 'mains_to_manifold',
        type: 'supply_cold',
        diameter_mm: 22,
        from: mainsEntry,
        to: { x: manifoldPos.x, y: supplyPipeY, z: manifoldPos.z },
        in_wall_id: '',
        gradient: 0,
    });

    return pipes;
}

/** Fixture units — used to size pipes and calculate demand */
function getFixtureUnits(type: FixtureType): number {
    const units: Record<FixtureType, number> = {
        toilet: 7, basin: 3, bath: 7, shower: 4, kitchen_sink: 6,
        dishwasher: 3, washing_machine: 4, boiler: 0,
        hot_water_cylinder: 0, outside_tap: 3,
    };
    return units[type] || 0;
}
