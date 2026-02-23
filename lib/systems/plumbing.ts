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
    const pipes: PipeSegment[] = [];

    // Find wet rooms
    const rooms = Object.values(project.nodes).filter((n) => n.type === 'Room');

    for (const room of rooms) {
        const func = room.room_function || '';
        if (['bathroom', 'kitchen', 'utility', 'ensuite', 'wc'].includes(func)) {
            const roomFixtures = getFixturesForRoom(room);
            fixtures.push(...roomFixtures);
        }
    }

    const totalFU = fixtures.reduce((sum, f) => sum + getFixtureUnits(f.type), 0);

    return {
        fixtures,
        pipes,
        mains_entry: { x: 0, y: -0.5, z: 0 },
        drain_exit: { x: 0, y: -0.5, z: -1 },
        total_fixture_units: totalFU,
    };
}

function getFixturesForRoom(room: PSGNode): PlumbingFixture[] {
    const fixtures: PlumbingFixture[] = [];
    const func = room.room_function || '';

    switch (func) {
        case 'bathroom': case 'ensuite':
            fixtures.push(
                { id: `toilet_${room.id}`, type: 'toilet', room_id: room.id, position: { x: room.position.x + 0.2, y: 0, z: room.position.z + 0.2 }, supply_connections: [], drain_connections: [] },
                { id: `basin_${room.id}`, type: 'basin', room_id: room.id, position: { x: room.position.x + 1.2, y: 0.85, z: room.position.z + 0.2 }, supply_connections: [], drain_connections: [] },
                { id: `shower_${room.id}`, type: 'shower', room_id: room.id, position: { x: room.position.x + 2.2, y: 0, z: room.position.z + 0.2 }, supply_connections: [], drain_connections: [] }
            );
            break;
        case 'wc':
            fixtures.push(
                { id: `toilet_${room.id}`, type: 'toilet', room_id: room.id, position: { x: room.position.x + 0.2, y: 0, z: room.position.z + 0.2 }, supply_connections: [], drain_connections: [] },
                { id: `basin_${room.id}`, type: 'basin', room_id: room.id, position: { x: room.position.x + 1.2, y: 0.85, z: room.position.z + 0.2 }, supply_connections: [], drain_connections: [] }
            );
            break;
        case 'kitchen':
            fixtures.push(
                { id: `sink_${room.id}`, type: 'kitchen_sink', room_id: room.id, position: { x: room.position.x + 1, y: 0.9, z: room.position.z + 0.3 }, supply_connections: [], drain_connections: [] },
                { id: `dishwasher_${room.id}`, type: 'dishwasher', room_id: room.id, position: { x: room.position.x + 1.7, y: 0, z: room.position.z + 0.3 }, supply_connections: [], drain_connections: [] }
            );
            break;
    }

    return fixtures;
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
