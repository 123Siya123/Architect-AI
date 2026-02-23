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
export function generateElectricalLayout(
    project: PSGProject
): ElectricalLayout {
    const devices: ElectricalDevice[] = [];
    const cables: CableSegment[] = [];
    const circuits: Circuit[] = [];

    // Find all rooms
    const rooms = Object.values(project.nodes).filter((n) => n.type === 'Room');

    // Create default circuits
    const kitchenRing = createCircuit('circuit_kitchen', 'Kitchen Ring', 'ring', 32);
    const downstairsRing = createCircuit('circuit_downstairs', 'Downstairs Ring', 'ring', 32);
    const upstairsRing = createCircuit('circuit_upstairs', 'Upstairs Ring', 'ring', 32);
    const lightingCircuit = createCircuit('circuit_lights', 'Lighting', 'lighting', 6);

    circuits.push(kitchenRing, downstairsRing, upstairsRing, lightingCircuit);

    // Process each room
    for (const room of rooms) {
        const roomDevices = getDevicesForRoom(room, project);
        devices.push(...roomDevices);
    }

    // Calculate total load
    const totalLoad = devices.reduce((sum, d) => sum + d.power_watts, 0);
    const supplyAmps = Math.ceil(totalLoad / 230); // 230V single phase

    return {
        devices,
        cables,
        circuits,
        distribution_board_position: { x: 0, y: 1.5, z: 0 }, // Near entrance
        total_load_watts: totalLoad,
        supply_amps: Math.max(supplyAmps, 60), // Minimum 60A supply
    };
}

// =============================================================================
// HELPERS
// =============================================================================

function createCircuit(
    id: string,
    name: string,
    type: Circuit['type'],
    breakerAmps: number
): Circuit {
    return {
        id,
        name,
        type,
        breaker_amps: breakerAmps,
        cable_size_mm2: breakerAmps <= 6 ? 1.5 : breakerAmps <= 20 ? 2.5 : 4.0,
        devices: [],
        total_load_watts: 0,
        rcd_group: 'rcd_main',
    };
}

/**
 * Determines what devices a room needs based on its function.
 * Returns device definitions with positions on walls.
 *
 * TODO (Phase 4): Implement full device placement with wall locations
 */
function getDevicesForRoom(
    room: PSGNode,
    _project: PSGProject
): ElectricalDevice[] {
    const devices: ElectricalDevice[] = [];
    const roomFunc = room.room_function || 'generic';

    // Ceiling light for every room
    devices.push({
        id: `light_${room.id}`,
        type: 'light_ceiling',
        wall_id: '',           // Ceiling-mounted, no wall
        position: { x: room.position.x, y: room.dimensions.y, z: room.position.z },
        circuit_id: 'circuit_lights',
        power_watts: 60,
    });

    // Room-specific devices
    switch (roomFunc) {
        case 'kitchen':
            // Many sockets for appliances
            for (let i = 0; i < 6; i++) {
                devices.push({
                    id: `socket_kitchen_${i}`,
                    type: 'socket_double',
                    wall_id: '',
                    position: { x: room.position.x + i * 0.6, y: 1.1, z: room.position.z },
                    circuit_id: 'circuit_kitchen',
                    power_watts: 3000,
                });
            }
            break;
        case 'bedroom':
            // Bedside sockets
            devices.push(
                { id: `socket_bed_l_${room.id}`, type: 'socket_double', wall_id: '', position: { x: room.position.x, y: 0.3, z: room.position.z }, circuit_id: 'circuit_upstairs', power_watts: 500 },
                { id: `socket_bed_r_${room.id}`, type: 'socket_double', wall_id: '', position: { x: room.position.x + room.dimensions.x, y: 0.3, z: room.position.z }, circuit_id: 'circuit_upstairs', power_watts: 500 }
            );
            break;
        case 'bathroom':
            // IP-rated light, shaver socket only
            devices.push({
                id: `shaver_${room.id}`,
                type: 'socket_single',
                wall_id: '',
                position: { x: room.position.x + 1, y: 1.5, z: room.position.z },
                circuit_id: 'circuit_upstairs',
                power_watts: 100,
            });
            break;
        default:
            // Standard: 2 double sockets
            devices.push(
                { id: `socket_${room.id}_1`, type: 'socket_double', wall_id: '', position: { x: room.position.x, y: 0.3, z: room.position.z }, circuit_id: 'circuit_downstairs', power_watts: 500 },
                { id: `socket_${room.id}_2`, type: 'socket_double', wall_id: '', position: { x: room.position.x + room.dimensions.x, y: 0.3, z: room.position.z }, circuit_id: 'circuit_downstairs', power_watts: 500 }
            );
    }

    return devices;
}
