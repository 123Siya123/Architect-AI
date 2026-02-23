/**
 * =============================================================================
 * LIB/THERMAL/SIMULATOR.TS — Thermal Simulation Engine
 * =============================================================================
 *
 * Calculates heat flow through the house structure based on materials,
 * dimensions, and environmental conditions. Outputs a heatmap that
 * the Three.js thermal overlay shader can render.
 *
 * HOW IT WORKS:
 * Uses a simplified steady-state heat transfer model:
 * Q = U × A × ΔT
 * Where:
 *   Q = heat flow rate (Watts)
 *   U = 1/R = material thermal conductivity / thickness (W/m²K)
 *   A = surface area (m²)
 *   ΔT = temperature difference indoor vs outdoor (K)
 *
 * For each wall/window/roof surface:
 * 1. Calculate U-value from material properties and thickness
 * 2. Calculate area from dimensions
 * 3. Compute heat loss = U × A × ΔT
 * 4. Assign a normalized temperature to each surface (0-1 range)
 * 5. Return as a map of node_id → temperature value
 *
 * The Three.js shader then maps these values to a blue-red gradient.
 *
 * LIMITATIONS:
 * - Steady-state only (no time-varying simulation)
 * - No air flow / convection modeling
 * - No solar gain calculation
 * - No thermal mass / inertia
 * These would require FEM (Finite Element Method) which is Phase 5+.
 *
 * TODO (Phase 5): Implement full FEM thermal simulation
 * TODO (Phase 5): Add solar gain based on window orientation
 * TODO (Phase 5): Add thermal bridging at wall junctions
 * =============================================================================
 */

import type { PSGProject, PSGNode, Material } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/** Configuration for a thermal simulation run */
export interface ThermalConfig {
    outdoor_temp_c: number;    // Outside temperature in Celsius
    indoor_target_c: number;   // Desired inside temperature
    wind_speed_ms: number;     // Wind speed (affects external surface resistance)
    ground_temp_c: number;     // Ground temperature (for floor heat loss)
}

/** Results of the thermal simulation */
export interface ThermalResult {
    /** Temperature value (0-1) for each node, keyed by node ID */
    node_temperatures: Record<string, number>;
    /** Total heat loss in Watts */
    total_heat_loss_watts: number;
    /** Annual heating energy estimate in kWh */
    annual_heating_kwh: number;
    /** Breakdown by element type */
    loss_breakdown: {
        walls: number;
        windows: number;
        roof: number;
        floor: number;
    };
    /** Cold spots — surfaces with highest heat loss */
    cold_spots: Array<{
        node_id: string;
        node_name: string;
        u_value: number;
        heat_loss_watts: number;
    }>;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

export const DEFAULT_THERMAL_CONFIG: ThermalConfig = {
    outdoor_temp_c: 0,       // Winter condition
    indoor_target_c: 21,     // Comfortable indoor temp
    wind_speed_ms: 3,        // Light breeze
    ground_temp_c: 10,       // Ground is warmer than air in winter
};

// =============================================================================
// SIMULATION
// =============================================================================

/**
 * Runs the thermal simulation on the entire house.
 *
 * @param project - The PSG project (house structure)
 * @param materials - Materials library (for thermal conductivity)
 * @param config - Simulation parameters (temperatures, wind)
 * @returns ThermalResult with per-node temperatures and total losses
 */
export function runThermalSimulation(
    project: PSGProject,
    materials: Record<string, Material>,
    config: ThermalConfig = DEFAULT_THERMAL_CONFIG
): ThermalResult {
    const nodeTemps: Record<string, number> = {};
    const coldSpots: ThermalResult['cold_spots'] = [];
    let totalLoss = 0;
    const breakdown = { walls: 0, windows: 0, roof: 0, floor: 0 };

    const deltaT = config.indoor_target_c - config.outdoor_temp_c;

    // Helper to calculate opening areas for a parent wall
    const getOpeningsArea = (wallId: string): number => {
        return Object.values(project.nodes)
            .filter(n => (n.type === 'Window' || n.type === 'Door') && n.parent_id === wallId)
            .reduce((sum, n) => sum + calculateSurfaceArea(n), 0);
    };

    for (const [nodeId, node] of Object.entries(project.nodes)) {
        // Only process physical envelope elements
        if (!isEnvelopeNode(node)) {
            nodeTemps[nodeId] = 0.5; // Neutral temp for non-envelope elements
            continue;
        }

        const material = materials[node.material_id];
        if (!material) {
            nodeTemps[nodeId] = 0.5;
            continue;
        }

        // Calculate U-value (thermal transmittance)
        const thickness = getEnvelopeThickness(node);
        const uValue = calculateUValue(material.thermal_conductivity, thickness);

        // Calculate area
        let area = calculateSurfaceArea(node);

        // If it's a wall, subtract the areas of its windows and doors
        if (node.type === 'Wall' || node.type === 'Partition') {
            area -= getOpeningsArea(nodeId);
            area = Math.max(area, 0); // Safety check
        }

        // Calculate heat loss through this element
        const effectiveDeltaT = (node.type === 'Slab' || node.type === 'Foundation') && !node.tags.includes('exterior')
            ? config.indoor_target_c - config.ground_temp_c  // Floor loses to ground
            : deltaT;  // Walls/roof/windows lose to outside air

        const heatLoss = uValue * area * effectiveDeltaT;
        totalLoss += heatLoss;

        // Normalize temperature: 0 = coldest surface, 1 = warmest
        // Higher U-value = more heat loss = colder surface = lower number
        const maxU = 6.0; // Single-glazed window as reference worst case
        const normalizedTemp = 1 - Math.min(uValue / maxU, 1);
        nodeTemps[nodeId] = normalizedTemp;

        // Track breakdown by type
        switch (node.type) {
            case 'Wall': case 'Partition': breakdown.walls += heatLoss; break;
            case 'Window': breakdown.windows += heatLoss; break;
            case 'Roof': breakdown.roof += heatLoss; break;
            case 'Slab': case 'Foundation': breakdown.floor += heatLoss; break;
            case 'Door': breakdown.walls += heatLoss; break; // Count doors with walls for breakdown
        }

        // Track cold spots (highest heat loss per unit area)
        coldSpots.push({
            node_id: nodeId,
            node_name: node.name,
            u_value: Math.round(uValue * 100) / 100,
            heat_loss_watts: Math.round(heatLoss),
        });
    }

    // Sort cold spots by severity (absolute heat loss)
    coldSpots.sort((a, b) => b.heat_loss_watts - a.heat_loss_watts);

    // Annual heating estimate using degree-days concept
    // Simplified: 2500 heating degree-days (typical for mild-to-cold climates)
    // Energy (kWh) = (Total Loss / deltaT) * HDD * 24 / 1000
    const hdd = 2500;
    const heatLossPerDegree = totalLoss / deltaT;
    const annualKwh = heatLossPerDegree * hdd * 24 / 1000;

    return {
        node_temperatures: nodeTemps,
        total_heat_loss_watts: Math.round(totalLoss),
        annual_heating_kwh: Math.round(annualKwh),
        loss_breakdown: {
            walls: Math.round(breakdown.walls),
            windows: Math.round(breakdown.windows),
            roof: Math.round(breakdown.roof),
            floor: Math.round(breakdown.floor),
        },
        cold_spots: coldSpots.slice(0, 10), // Top 10 worst spots
    };
}

// =============================================================================
// HELPERS
// =============================================================================

/** Checks if a node is part of the building envelope (loses heat) */
function isEnvelopeNode(node: PSGNode): boolean {
    // Rooms, groups, etc. are not physical surfaces
    if (['Room', 'Group', 'House', 'Floor'].includes(node.type)) return false;

    // Windows and Doors are always part of the envelope
    if (['Window', 'Door'].includes(node.type)) return true;

    // Roofs are almost always envelope (exposed to sky)
    if (node.type === 'Roof') return true;

    // Slabs/Foundations are envelope (exposed to ground or air)
    if (['Slab', 'Foundation'].includes(node.type)) return true;

    // Walls/Partitions are envelope IF they are tagged exterior
    // or if they are the primary boundary.
    if (node.type === 'Wall' || node.type === 'Partition') {
        return node.tags.includes('exterior') || node.tags.includes('load_bearing');
    }

    return false;
}

/** Gets the thickness relevant for thermal calculation */
function getEnvelopeThickness(node: PSGNode): number {
    if (node.type === 'Window') return 0.024; // Double glazing ~24mm
    if (node.type === 'Door') return 0.044;   // External door ~44mm
    // For walls/slabs, depth (z) is usually thickness
    return node.dimensions.z || 0.25;
}

/** U = k / d  (thermal conductivity / thickness) + surface resistances */
function calculateUValue(thermalConductivity: number, thickness: number): number {
    if (thickness <= 0 || thermalConductivity <= 0) return 5.0; // Fallback high U-value
    const Rsi = 0.13;  // Internal surface resistance (m²K/W)
    const Rse = 0.04;  // External surface resistance (m²K/W)
    const Rmaterial = thickness / thermalConductivity;
    const Rtotal = Rsi + Rmaterial + Rse;
    return 1 / Rtotal;
}

/** Calculates the raw surface area of a node */
function calculateSurfaceArea(node: PSGNode): number {
    switch (node.type) {
        case 'Wall': case 'Partition':
            return node.dimensions.x * node.dimensions.y; // width × height
        case 'Window': case 'Door':
            // Use specific opening dimensions if available, otherwise node dimensions
            const w = node.opening_width || node.dimensions.x;
            const h = node.opening_height || node.dimensions.y;
            return w * h;
        case 'Slab': case 'Roof': case 'Foundation':
            // These are horizontal or sloped surfaces
            return node.dimensions.x * node.dimensions.z; // width × depth
        default:
            return 0;
    }
}
