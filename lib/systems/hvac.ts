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
 */
export function generateHVACLayout(project: PSGProject): HVACLayout {
    const components: HVACComponent[] = [];
    const ducts: DuctSegment[] = [];

    // 1. Locate Central Unit
    // Ideally in an attic or mechanical room. For now, place it above the highest floor center.
    const house = project.nodes[project.root_node_id];
    const floors = Object.values(project.nodes).filter(n => n.type === 'Floor');
    const topFloor = floors.sort((a, b) => b.position.y - a.position.y)[0];
    
    // Default unit position (in attic space)
    const unitY = topFloor ? topFloor.position.y + 3.0 : 3.0; 
    const unitPos: Vec3 = { x: 0, y: unitY, z: 0 };
    
    components.push({
        id: 'hvac_main_unit',
        type: 'hvac_unit_indoor',
        position: unitPos,
        rotation: { x: 0, y: 0, z: 0 },
        dimensions: { x: 1.0, y: 1.2, z: 0.8 }
    });

    // 2. Process Rooms for Vents
    const rooms = Object.values(project.nodes).filter(n => n.type === 'Room');
    
    rooms.forEach(room => {
        // Determine number of vents based on area
        const area = room.dimensions.x * room.dimensions.z;
        const numSupply = Math.max(1, Math.ceil(area / 15));
        const hasReturn = area > 20 || room.room_function === 'hallway' || room.room_function === 'living';

        // Place Supply Vents (Ceiling)
        // Distribute them evenly
        for (let i = 0; i < numSupply; i++) {
            // Simple distribution: Center if 1, spread if more
            const offsetX = (i - (numSupply - 1) / 2) * (room.dimensions.x / (numSupply + 1)) * 2;
            
            const ventPos = {
                x: room.position.x + offsetX,
                y: room.position.y + room.dimensions.y - 0.05, // Just below ceiling
                z: room.position.z
            };

            const ventId = `vent_supply_${room.id}_${i}`;
            components.push({
                id: ventId,
                type: 'vent_supply_ceiling',
                position: ventPos,
                rotation: { x: Math.PI / 2, y: 0, z: 0 }, // Face down
                dimensions: { x: 0.3, y: 0.05, z: 0.3 },
                roomId: room.id
            });

            // Route Duct from Unit to Vent
            // Simple routing: Unit -> (UnitY, VentX, VentZ) -> Vent
            // This creates a vertical drop from the attic network
            
            // 1. Horizontal run at Unit level
            const junctionPoint = { x: ventPos.x, y: unitPos.y, z: ventPos.z };
            
            ducts.push({
                id: `duct_main_${ventId}`,
                from: unitPos, // Simplified: all radiate from unit. Real systems have trunks.
                to: junctionPoint,
                width: 0.4,
                height: 0.3,
                shape: 'rectangular',
                type: 'supply'
            });

            // 2. Vertical drop to Vent
            ducts.push({
                id: `duct_drop_${ventId}`,
                from: junctionPoint,
                to: { ...ventPos, y: ventPos.y + 0.05 }, // Connect to back of vent
                width: 0.3,
                height: 0.3,
                shape: 'round', // Flexible duct often used for drops
                type: 'supply'
            });
        }

        // Place Return Vent (if needed)
        if (hasReturn) {
            // Place near a wall, away from supply if possible
            const returnPos = {
                x: room.position.x - room.dimensions.x / 3,
                y: room.position.y + room.dimensions.y - 0.05,
                z: room.position.z - room.dimensions.z / 3
            };

            const returnId = `vent_return_${room.id}`;
            components.push({
                id: returnId,
                type: 'vent_return_ceiling',
                position: returnPos,
                rotation: { x: Math.PI / 2, y: 0, z: 0 },
                dimensions: { x: 0.5, y: 0.05, z: 0.5 },
                roomId: room.id
            });

             // Route Return Duct
             const junctionPoint = { x: returnPos.x, y: unitPos.y, z: returnPos.z };
             
             ducts.push({
                 id: `duct_return_main_${returnId}`,
                 from: unitPos,
                 to: junctionPoint,
                 width: 0.5,
                 height: 0.4,
                 shape: 'rectangular',
                 type: 'return'
             });
 
             ducts.push({
                 id: `duct_return_drop_${returnId}`,
                 from: junctionPoint,
                 to: { ...returnPos, y: returnPos.y + 0.05 },
                 width: 0.4,
                 height: 0.4,
                 shape: 'round',
                 type: 'return'
             });
        }
    });

    return { components, ducts };
}
