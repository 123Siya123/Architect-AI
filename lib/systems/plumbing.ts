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
 * Generates a plumbing layout based on room functions.
 * Identifies wet rooms (bathrooms, kitchen, utility) and places fixtures.
 *
 * @param project - The PSG project
 * @returns Complete plumbing layout
 */
export function generatePlumbingLayout(project: PSGProject): PlumbingLayout {
    const fixtures: PlumbingFixture[] = [];

    // Find wet rooms
    const rooms = Object.values(project.nodes).filter((n) => n.type === 'Room');

    for (const room of rooms) {
        const func = room.room_function || '';
        if (['bathroom', 'kitchen', 'utility', 'ensuite', 'wc'].includes(func)) {
            const roomFixtures = getFixturesForRoom(room, project);
            fixtures.push(...roomFixtures);
        }
    }

    const pipes = generatePipesForFixtures(fixtures, project);
    const totalFU = fixtures.reduce((sum: number, f: PlumbingFixture) => sum + getFixtureUnits(f.type), 0);

    return {
        fixtures,
        pipes,
        mains_entry: { x: 0, y: -0.5, z: 0 },
        drain_exit: { x: 0, y: -0.5, z: -1 },
        total_fixture_units: totalFU,
    };
}

function getFixturesForRoom(room: PSGNode, project: PSGProject): PlumbingFixture[] {
    const fixtures: PlumbingFixture[] = [];
    const func = room.room_function || '';

    // Find all walls belonging to this room
    const roomWalls = room.children_ids
        .map(id => project.nodes[id])
        .filter(n => n && (n.type === 'Wall' || n.type === 'Partition'));

    if (roomWalls.length === 0) return fixtures;

    // Helper to place a fixture on a wall
    const placeOnWall = (wall: PSGNode, type: FixtureType, xPos: number, yPos: number) => {
        fixtures.push({
            id: `${type}_${wall.id}_${fixtures.length}`,
            type,
            room_id: room.id,
            position: { x: xPos, y: yPos, z: 0.1 }, // Offset from wall
            supply_connections: [],
            drain_connections: [],
        });
    };

    switch (func) {
        case 'bathroom': case 'ensuite':
            // Common layout: Toilet, Basin, and Shower along the first available wall
            if (roomWalls[0]) {
                const wall = roomWalls[0];
                placeOnWall(wall, 'toilet', 0.5, 0);
                placeOnWall(wall, 'basin', 1.5, 0.85);
                if (wall.dimensions.x > 3) {
                    placeOnWall(wall, 'shower', 2.5, 0);
                }
            }
            break;

        case 'wc':
            if (roomWalls[0]) {
                placeOnWall(roomWalls[0], 'toilet', 0.5, 0);
                placeOnWall(roomWalls[0], 'basin', 1.2, 0.85);
            }
            break;

        case 'kitchen':
            if (roomWalls[0]) {
                placeOnWall(roomWalls[0], 'kitchen_sink', 1.5, 0.9);
                placeOnWall(roomWalls[0], 'dishwasher', 2.2, 0);
            }
            break;

        case 'utility':
            if (roomWalls[0]) {
                placeOnWall(roomWalls[0], 'washing_machine', 0.8, 0);
                placeOnWall(roomWalls[0], 'outside_tap', 1.5, 0.5);
            }
            break;
    }

    return fixtures;
}

/**
 * Generates the pipe network connecting fixtures.
 * Routes through walls and floors.
 * TODO (Phase 5): Full A* routing for pipes
 */
function generatePipesForFixtures(fixtures: PlumbingFixture[], _project: PSGProject): PipeSegment[] {
    const pipes: PipeSegment[] = [];

    fixtures.forEach(fixture => {
        // Every fixture needs a drain
        pipes.push({
            id: `drain_${fixture.id}`,
            type: 'drain',
            diameter_mm: fixture.type === 'toilet' ? 110 : 40,
            from: fixture.position,
            to: { x: fixture.position.x, y: -0.2, z: fixture.position.z }, // Drops to floor
            in_wall_id: '',
            gradient: fixture.type === 'toilet' ? 0.025 : 0.0125,
        });

        // Every fixture needs cold supply
        pipes.push({
            id: `cold_${fixture.id}`,
            type: 'supply_cold',
            diameter_mm: 15,
            from: fixture.position,
            to: { x: fixture.position.x, y: fixture.position.y - 0.3, z: fixture.position.z },
            in_wall_id: '',
            gradient: 0,
        });

        // Some fixtures need hot supply
        if (['basin', 'bath', 'shower', 'kitchen_sink', 'washing_machine'].includes(fixture.type)) {
            pipes.push({
                id: `hot_${fixture.id}`,
                type: 'supply_hot',
                diameter_mm: 15,
                from: fixture.position,
                to: { x: fixture.position.x + 0.1, y: fixture.position.y - 0.3, z: fixture.position.z },
                in_wall_id: '',
                gradient: 0,
            });
        }
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
