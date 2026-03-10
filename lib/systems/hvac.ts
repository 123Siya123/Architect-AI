/**
 * =============================================================================
 * LIB/SYSTEMS/HVAC.TS — Heating, Ventilation, and Air Conditioning System
 * =============================================================================
 *
 * Manages the HVAC system layer of the house. This system:
 * 1. Auto-places HVAC units (indoor/outdoor)
 * 2. Places supply and return vents in rooms based on size and function
 * 3. Generates ductwork connecting vents to the central unit
 * 4. Generates the HVAC layer data for 3D visualization
 *
 * VISUALIZATION:
 * When the "HVAC" layer is toggled on in the viewport:
 * - Ducts are shown as silver/galvanized rectangular or round tubes
 * - Vents appear as grilles on ceilings/walls
 * - The central unit is shown as a large box
 *
 * AUTO-PLACEMENT RULES:
 * - Central Unit: Placed in attic or utility area (defaulting to house center top for now)
 * - Supply Vents: 1 per 15m² of room area, placed on ceiling
 * - Return Vents: 1 per large room (>20m²) or in hallways
 * - Ducts: Routed from unit to vents with 90-degree bends where possible
 * =============================================================================
 */

import type { PSGProject, PSGNode, Vec3 } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export type HVACComponentType =
    | 'hvac_unit_indoor'
    | 'hvac_unit_outdoor'
    | 'vent_supply_ceiling'
    | 'vent_return_ceiling'
    | 'vent_supply_wall'
    | 'vent_return_wall'
    | 'thermostat';

export interface HVACComponent {
    id: string;
    type: HVACComponentType;
    position: Vec3;
    rotation: Vec3; // Euler angles
    dimensions: Vec3;
    roomId?: string;
}

export interface DuctSegment {
    id: string;
    from: Vec3;
    to: Vec3;
    width: number;  // meters
    height: number; // meters
    shape: 'rectangular' | 'round';
    type: 'supply' | 'return';
}

export interface HVACLayout {
    components: HVACComponent[];
    ducts: DuctSegment[];
}

// =============================================================================
// AUTO-PLACEMENT
// =============================================================================

/**
 * Generates an HVAC layout for the house.
 * Using localized mini-split units per room to avoid huge ugly central duct systems.
 */
export function generateHVACLayout(project: PSGProject): HVACLayout {
    const components: HVACComponent[] = [];
    const ducts: DuctSegment[] = [];

    const rooms = Object.values(project.nodes).filter(n => n.type === 'Room');

    // Add an outdoor compressor unit for the house
    const house = project.nodes[project.root_node_id];
    components.push({
        id: 'hvac_outdoor_unit',
        type: 'hvac_unit_outdoor',
        position: { x: -3, y: 0.5, z: -3 }, // Typical outdoor placement
        rotation: { x: 0, y: 0, z: 0 },
        dimensions: { x: 0.8, y: 0.8, z: 0.4 }
    });

    rooms.forEach(room => {
        // Evaluate if room needs an AC unit (living, bedroom, office)
        if (['bathroom', 'closet', 'hallway'].includes(room.room_function || '')) return;

        // Place a clean mini-split unit on a wall (approximate position)
        const unitPos = {
            x: room.position.x,
            y: room.position.y + room.dimensions.y - 0.4, // High on the wall
            z: room.position.z - (room.dimensions.z / 2) + 0.1 // Near back wall
        };

        const unitId = `hvac_split_${room.id}`;
        components.push({
            id: unitId,
            type: 'hvac_unit_indoor',
            position: unitPos,
            rotation: { x: 0, y: 0, z: 0 },
            dimensions: { x: 0.8, y: 0.25, z: 0.2 }, // Sleek mini-split shape
            roomId: room.id
        });

        // Add a simple circular vent/diffuser for exhaust
        components.push({
            id: `vent_exhaust_${room.id}`,
            type: 'vent_return_ceiling',
            position: {
                x: room.position.x,
                y: room.position.y + room.dimensions.y - 0.05,
                z: room.position.z
            },
            rotation: { x: Math.PI / 2, y: 0, z: 0 },
            dimensions: { x: 0.2, y: 0.02, z: 0.2 },
            roomId: room.id
        });
    });

    return { components, ducts };
}
