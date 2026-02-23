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
 * Helper to calculate world position from wall-relative coordinates
 */
function getWallWorldPos(wall: PSGNode, xRel: number, yRel: number, zOffset: number = 0.1) {
    const halfW = wall.dimensions.x / 2;
    const localX = xRel - halfW;
    const angle = (wall.rotation.yaw * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const distFromCenter = wall.dimensions.z / 2 + zOffset;

    return {
        x: wall.position.x + localX * cosA - distFromCenter * sinA,
        y: wall.position.y - (wall.dimensions.y / 2) + yRel,
        z: wall.position.z - localX * sinA - distFromCenter * cosA,
    };
}

/**
 * Generates a plumbing layout based on room functions.
 */
export function generatePlumbingLayout(project: PSGProject): PlumbingLayout {
    const fixtures: PlumbingFixture[] = [];

    // Global entry/exit points (Source of Truth)
    const house = project.nodes[project.root_node_id];
    const mainsEntry = house ? { x: house.position.x - 3, y: -0.5, z: house.position.z } : { x: -3, y: -0.5, z: 0 };
    const drainExit = house ? { x: house.position.x + 3, y: -0.8, z: house.position.z + 5 } : { x: 3, y: -0.8, z: 5 };

    // Find wet rooms
    const rooms = Object.values(project.nodes).filter(n => n.type === 'Room');
    rooms.forEach(room => {
        const func = room.room_function || '';
        if (['bathroom', 'kitchen', 'utility', 'ensuite', 'wc'].includes(func)) {
            fixtures.push(...getFixturesForRoom(room, project));
        }
    });

    const pipes = generatePipesForFixtures(fixtures, mainsEntry, drainExit, project);

    return {
        fixtures,
        pipes,
        mains_entry: mainsEntry,
        drain_exit: drainExit,
        total_fixture_units: fixtures.length * 5,
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
    }

    return fixtures;
}

function generatePipesForFixtures(
    fixtures: PlumbingFixture[],
    mainsEntry: Vec3,
    drainExit: Vec3,
    project: PSGProject
): PipeSegment[] {
    const pipes: PipeSegment[] = [];

    fixtures.forEach(fixture => {
        const wall = project.nodes[Object.values(project.nodes).find(n => fixture.id.includes(n.id))?.id || ''];

        // 1. Drain: Fixture -> Vertical to below floor -> Drain Exit
        const floorY = -0.5;
        const fixtureBase = { ...fixture.position, y: floorY };

        pipes.push({
            id: `d_v_${fixture.id}`,
            type: 'drain',
            diameter_mm: fixture.type === 'toilet' ? 110 : 40,
            from: fixture.position,
            to: fixtureBase,
            in_wall_id: wall?.id || '',
            gradient: 0,
        });

        pipes.push({
            id: `d_h_${fixture.id}`,
            type: 'drain',
            diameter_mm: fixture.type === 'toilet' ? 110 : 40,
            from: fixtureBase,
            to: drainExit,
            in_wall_id: '',
            gradient: 0.02,
        });

        // 2. Supply: Fixture -> Vertical to floor -> Mains Entry
        const supplyFloorY = -0.3;
        const supplyBase = { ...fixture.position, y: supplyFloorY };

        pipes.push({
            id: `s_v_${fixture.id}`,
            type: 'supply_cold',
            diameter_mm: 15,
            from: fixture.position,
            to: supplyBase,
            in_wall_id: wall?.id || '',
            gradient: 0,
        });

        pipes.push({
            id: `s_h_${fixture.id}`,
            type: 'supply_cold',
            diameter_mm: 15,
            from: supplyBase,
            to: mainsEntry,
            in_wall_id: '',
            gradient: 0,
        });
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
