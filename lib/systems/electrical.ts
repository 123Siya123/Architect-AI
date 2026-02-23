/**
 * =============================================================================
 * LIB/SYSTEMS/ELECTRICAL.TS — Electrical Wiring System
 * =============================================================================
 *
 * Manages the electrical wiring layer of the house. This system:
 * 1. Auto-places sockets, switches, and lighting based on room function
 * 2. Routes cables through walls from each device to the distribution board
 * 3. Calculates circuit loads and cable sizing
 * 4. Generates the electrical layer data for 3D visualization
 *
 * VISUALIZATION:
 * When the "Electrical" layer is toggled on in the viewport:
 * - Cables are shown as yellow lines running through walls
 * - Sockets appear as small rectangles on walls
 * - Switches appear near doors
 * - The distribution board is shown at the entry point
 *
 * AUTO-PLACEMENT RULES (based on room function):
 * - Kitchen: socket every 0.6m along worktop wall, dedicated oven circuit
 * - Bedroom: 2 double sockets per wall, ceiling light, bedside sockets
 * - Bathroom: shaver socket only, IP-rated light, extractor fan
 * - Living room: sockets every 1.5m, TV point, multiple lighting circuits
 * - Hallway: switch at each end, landing light
 *
 * TODO (Phase 4): Implement full auto-placement and routing
 * TODO (Phase 4): Circuit load calculations and RCD groups
 * =============================================================================
 */

import type { PSGProject, PSGNode, Vec3 } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/** Types of electrical devices */
export type ElectricalDeviceType =
    | 'socket_single'
    | 'socket_double'
    | 'socket_usb'
    | 'switch_single'
    | 'switch_double'
    | 'switch_dimmer'
    | 'light_ceiling'
    | 'light_wall'
    | 'light_recessed'
    | 'distribution_board'
    | 'smoke_detector'
    | 'extractor_fan'
    | 'tv_outlet'
    | 'ethernet_outlet';

/** An electrical device placed in the house */
export interface ElectricalDevice {
    id: string;
    type: ElectricalDeviceType;
    wall_id: string;         // The wall this device is mounted on
    position: Vec3;          // Position relative to the wall
    circuit_id: string;      // Which circuit it belongs to
    power_watts: number;     // Power draw
}

/** A cable segment between two points */
export interface CableSegment {
    id: string;
    from: Vec3;
    to: Vec3;
    circuit_id: string;
    cable_type: string;      // e.g., "2.5mm² twin & earth"
    in_wall_id: string;      // Which wall the cable runs through
}

/** An electrical circuit */
export interface Circuit {
    id: string;
    name: string;            // e.g., "Kitchen Ring", "Upstairs Lighting"
    type: 'ring' | 'radial' | 'lighting' | 'dedicated';
    breaker_amps: number;    // MCB rating (6A, 16A, 20A, 32A)
    cable_size_mm2: number;  // Cable cross-section
    devices: string[];       // Device IDs on this circuit
    total_load_watts: number;
    rcd_group: string;       // RCD protection group
}

/** Complete electrical layout */
export interface ElectricalLayout {
    devices: ElectricalDevice[];
    cables: CableSegment[];
    circuits: Circuit[];
    distribution_board_position: Vec3;
    total_load_watts: number;
    supply_amps: number;     // Required supply (typically 60-100A residential)
}

// =============================================================================
// AUTO-PLACEMENT
// =============================================================================

/**
 * Generates an electrical layout for the house based on room functions.
 *
 * HOW IT WORKS:
 * 1. Finds all Room nodes in the PSG
 * 2. For each room, determines the socket/light requirements based on function
 * 3. Places devices on walls at standard heights
 * 4. Groups devices into circuits
 * 5. Routes cables through walls
 *
 * STANDARD HEIGHTS:
 * - Sockets: 0.3m from floor (300mm)
 * - Switches: 1.2m from floor
 * - Ceiling lights: at ceiling height
 * - Wall lights: 2.0m from floor
 *
 * @param project - The PSG project
 * @returns Complete electrical layout
 */
export function generateElectricalLayout(project: PSGProject): ElectricalLayout {
    const devices: ElectricalDevice[] = [];

    // Find entrance for DB (Center of house root node)
    const house = project.nodes[project.root_node_id];
    const dbPos = house
        ? { x: house.position.x, y: 1.5, z: house.position.z }
        : { x: 0, y: 1.5, z: 0 };

    // Process rooms and place devices
    const rooms = Object.values(project.nodes).filter(n => n.type === 'Room');
    rooms.forEach(room => {
        devices.push(...getDevicesForRoom(room, project));
    });

    // Generate cables connecting everything to DB
    const cables = generateCables(devices, dbPos, project);

    return {
        devices,
        cables,
        circuits: [],
        distribution_board_position: dbPos,
        total_load_watts: devices.reduce((s, d) => s + d.power_watts, 0),
        supply_amps: 100,
    };
}

/**
 * Helper to calculate world position from wall-relative coordinates
 */
function getWallWorldPos(wall: PSGNode, xRel: number, yRel: number, zOffset: number = 0.05) {
    const halfW = wall.dimensions.x / 2;
    const localX = xRel - halfW;
    const angle = (wall.rotation.yaw * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Position slightly proud of the wall face
    const distFromCenter = wall.dimensions.z / 2 + zOffset;

    return {
        x: wall.position.x + localX * cosA - distFromCenter * sinA,
        y: wall.position.y - (wall.dimensions.y / 2) + yRel,
        z: wall.position.z - localX * sinA - distFromCenter * cosA,
    };
}

/**
 * Determines what devices a room needs based on its function.
 */
function getDevicesForRoom(
    room: PSGNode,
    project: PSGProject
): ElectricalDevice[] {
    const devices: ElectricalDevice[] = [];
    const roomFunc = room.room_function || 'generic';

    const roomWalls = room.children_ids
        .map(id => project.nodes[id])
        .filter(n => n && (n.type === 'Wall' || n.type === 'Partition'));

    // 1. Ceiling light (world space)
    devices.push({
        id: `light_${room.id}`,
        type: 'light_ceiling',
        wall_id: '',
        position: { x: room.position.x, y: room.position.y + room.dimensions.y / 2 - 0.1, z: room.position.z },
        circuit_id: 'circuit_lights',
        power_watts: 60,
    });

    const placeOnWall = (wall: PSGNode, type: ElectricalDeviceType, xRel: number, yRel: number, circuit: string, watts: number) => {
        devices.push({
            id: `${type}_${wall.id}_${devices.length}`,
            type,
            wall_id: wall.id,
            position: getWallWorldPos(wall, xRel, yRel),
            circuit_id: circuit,
            power_watts: watts,
        });
    };

    // Placement logic
    roomWalls.forEach((wall, idx) => {
        if (roomFunc === 'kitchen') {
            const num = Math.floor(wall.dimensions.x / 1.5);
            for (let i = 1; i <= num; i++) placeOnWall(wall, 'socket_double', i * 1.5, 1.1, 'circuit_kitchen', 3000);
        } else if (roomFunc === 'bathroom') {
            if (idx === 0) placeOnWall(wall, 'socket_single', 0.5, 1.6, 'circuit_lights', 100);
        } else {
            // Standard: one socket per wall, one switch near door
            placeOnWall(wall, 'socket_double', wall.dimensions.x / 2, 0.45, 'circuit_radial', 500);
            if (idx === 0) placeOnWall(wall, 'switch_single', 0.2, 1.2, 'circuit_lights', 0);
        }
    });

    return devices;
}

/** 
 * Routes cables from devices back to Distribution Board
 */
function generateCables(devices: ElectricalDevice[], dbPos: Vec3, project: PSGProject): CableSegment[] {
    const cables: CableSegment[] = [];

    devices.forEach(dev => {
        const wall = project.nodes[dev.wall_id];

        if (wall) {
            // Vertical to floor routing level (0.1m)
            const floorY = wall.position.y - wall.dimensions.y / 2 + 0.1;
            const wallBase = { ...dev.position, y: floorY };

            cables.push({
                id: `c_v_${dev.id}`,
                from: dev.position,
                to: wallBase,
                circuit_id: dev.circuit_id,
                cable_type: '2.5mm',
                in_wall_id: wall.id
            });

            // Horizontal to DB x/z coordinate
            const dbBase = { x: dbPos.x, y: floorY, z: dbPos.z };
            cables.push({
                id: `c_h_${dev.id}`,
                from: wallBase,
                to: dbBase,
                circuit_id: dev.circuit_id,
                cable_type: '2.5mm',
                in_wall_id: ''
            });

            // Vertical to DB
            cables.push({
                id: `c_db_${dev.id}`,
                from: dbBase,
                to: dbPos,
                circuit_id: dev.circuit_id,
                cable_type: '2.5mm',
                in_wall_id: ''
            });
        }
    });

    return cables;
}
