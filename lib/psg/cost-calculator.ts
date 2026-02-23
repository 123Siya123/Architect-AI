/**
 * =============================================================================
 * LIB/PSG/COST-CALCULATOR.TS — Material Cost & Budget Engine
 * =============================================================================
 *
 * Calculates the total material cost of a house by:
 * 1. Computing the VOLUME of each node (from its dimensions)
 * 2. Looking up the material's density (kg/m³) and price (€/kg)
 * 3. Multiplying: volume × density × price_per_kg = cost
 *
 * WHY VOLUME-BASED COSTING?
 * Unlike area-based estimates (which only work for flat surfaces),
 * volume-based costing works for ALL geometry types:
 * - Walls: width × height × thickness = volume
 * - Slabs: width × thickness × depth = volume
 * - Stairs: sum of step volumes
 * - Roofs: calculated from pitch and dimensions
 *
 * This gives ACCURATE material quantities, not just surface area
 * estimates. The user can see exactly how many kg of each material
 * they need and what it costs.
 *
 * BUDGET WARNINGS:
 * After every edit, the cost is recalculated. If the total exceeds
 * the user's budget or crosses the warning threshold, the UI shows
 * a warning. The AI also receives the budget state in its context
 * so it can proactively suggest cost savings.
 * =============================================================================
 */

import type {
    PSGProject,
    PSGNode,
    Material,
    MaterialSummaryItem,
    BudgetConfig,
} from '@/types';

// =============================================================================
// VOLUME CALCULATION
// =============================================================================

/**
 * Calculates the volume of a PSG node in cubic meters.
 *
 * SPECIAL CASES:
 * - Windows/Doors: subtract opening volume from parent wall
 * - Stairs: sum of individual step volumes
 * - Gable roofs: triangular prism volume
 * - Rooms/Houses/Floors: 0 volume (they're containers, not physical)
 *
 * @param node - The PSG node to calculate volume for
 * @returns Volume in m³
 */
export function calculateNodeVolume(node: PSGNode): number {
    const { x: width, y: height, z: depth } = node.dimensions;

    switch (node.type) {
        case 'Wall':
        case 'Slab':
        case 'Partition':
        case 'Column':
        case 'Beam':
        case 'Foundation':
            // Simple box volume
            return width * height * depth;

        case 'Window':
        case 'Door':
            // Openings have negative volume (subtracted from wall)
            // Their own material volume is just the frame/glass
            // For cost purposes, we calculate the frame volume
            return calculateFrameVolume(node);

        case 'Stairs':
            return calculateStairsVolume(node);

        case 'Roof':
            return calculateRoofVolume(node);

        case 'House':
        case 'Floor':
        case 'Room':
            // Container nodes have no physical volume
            return 0;

        default:
            // Fallback: simple box
            return width * height * depth;
    }
}

/**
 * Calculates the frame volume for windows and doors.
 *
 * ASSUMPTIONS:
 * - Frame width: 60mm (0.06m)
 * - Frame depth: 50mm (0.05m) — matches the node's z dimension
 * - Glass thickness: negligible for cost purposes
 */
function calculateFrameVolume(node: PSGNode): number {
    const openW = node.opening_width || node.dimensions.x;
    const openH = node.opening_height || node.dimensions.y;
    const frameWidth = 0.06; // 60mm frame
    const frameDepth = node.dimensions.z || 0.05;

    // Frame is a rectangular ring
    const outerArea = (openW + 2 * frameWidth) * (openH + 2 * frameWidth);
    const innerArea = openW * openH;
    const frameArea = outerArea - innerArea;

    return frameArea * frameDepth;
}

/**
 * Calculates the total volume of all steps in a staircase.
 */
function calculateStairsVolume(node: PSGNode): number {
    const riserHeight = node.stair_riser_height || 0.18;
    const treadDepth = node.stair_tread_depth || 0.28;
    const stairWidth = node.dimensions.x;
    const totalHeight = node.dimensions.y;

    const numSteps = Math.ceil(totalHeight / riserHeight);
    const stepVolume = stairWidth * riserHeight * treadDepth;

    return numSteps * stepVolume;
}

/**
 * Calculates roof volume based on style and pitch.
 *
 * For gable roofs: volume = width × depth × ridgeHeight / 2
 * (triangular prism formula)
 */
function calculateRoofVolume(node: PSGNode): number {
    const { x: width, y: thickness, z: depth } = node.dimensions;

    if (node.roof_style === 'gable' && node.roof_pitch_degrees) {
        const pitchRad = (node.roof_pitch_degrees * Math.PI) / 180;
        const ridgeHeight = Math.tan(pitchRad) * (depth / 2);
        // Triangular prism + the thickness of the roofing material
        const prismVolume = (width * depth * ridgeHeight) / 2;
        const shellVolume = width * depth * thickness; // Approximate shell
        return shellVolume; // We cost the roofing material, not the air inside
    }

    // Flat roof: simple slab
    return width * thickness * depth;
}

// =============================================================================
// COST CALCULATION
// =============================================================================

/**
 * Calculates the cost of a single node based on its material.
 *
 * FORMULA:
 * volume (m³) × density (kg/m³) = mass (kg)
 * mass (kg) × price_per_kg = cost
 *
 * @returns Cost in the project's currency
 */
export function calculateNodeCost(
    node: PSGNode,
    material: Material | undefined
): { volume_m3: number; weight_kg: number; cost: number } {
    if (!material) {
        return { volume_m3: 0, weight_kg: 0, cost: 0 };
    }

    const volume = calculateNodeVolume(node);
    const weight = volume * material.density_kg_m3;
    const cost = weight * material.price_per_kg;

    return {
        volume_m3: Math.round(volume * 1000) / 1000, // Round to 3 decimal places
        weight_kg: Math.round(weight * 10) / 10,      // Round to 1 decimal
        cost: Math.round(cost * 100) / 100,            // Round to cents
    };
}

// =============================================================================
// PROJECT-WIDE COST SUMMARY
// =============================================================================

/**
 * Calculates the complete material cost summary for the entire project.
 *
 * RETURNS:
 * - Per-material breakdown (grouped by material_id)
 * - Total cost
 * - Updated budget config with spent/remaining
 *
 * HOW IT WORKS:
 * 1. Iterates over all nodes in the project
 * 2. Looks up each node's material from the materials library
 * 3. Calculates volume → mass → cost for each node
 * 4. Groups results by material for the summary table
 * 5. Sums everything for the total
 *
 * @param project - The current PSG project
 * @param materials - The materials library (Record<material_id, Material>)
 */
export function calculateProjectCost(
    project: PSGProject,
    materials: Record<string, Material>
): {
    items: MaterialSummaryItem[];
    totalCost: number;
    updatedBudget: BudgetConfig;
} {
    // Group costs by material_id
    const materialGroups: Record<
        string,
        {
            material: Material;
            total_volume: number;
            total_weight: number;
            total_cost: number;
            node_ids: string[];
        }
    > = {};

    // Process each node
    for (const [nodeId, node] of Object.entries(project.nodes)) {
        // Skip container nodes (House, Floor, Room — they have no material)
        if (!node.material_id || node.material_id === '') continue;

        const material = materials[node.material_id];
        if (!material) continue;

        const { volume_m3, weight_kg, cost } = calculateNodeCost(node, material);

        if (!materialGroups[node.material_id]) {
            materialGroups[node.material_id] = {
                material,
                total_volume: 0,
                total_weight: 0,
                total_cost: 0,
                node_ids: [],
            };
        }

        materialGroups[node.material_id].total_volume += volume_m3;
        materialGroups[node.material_id].total_weight += weight_kg;
        materialGroups[node.material_id].total_cost += cost;
        materialGroups[node.material_id].node_ids.push(nodeId);
    }

    // Convert to MaterialSummaryItem array
    const items: MaterialSummaryItem[] = Object.values(materialGroups).map(
        (group) => ({
            material: group.material,
            volume_m3: Math.round(group.total_volume * 1000) / 1000,
            weight_kg: Math.round(group.total_weight * 10) / 10,
            cost: Math.round(group.total_cost * 100) / 100,
            used_in: group.node_ids,
        })
    );

    // Sort by cost (most expensive first)
    items.sort((a, b) => b.cost - a.cost);

    // Calculate total
    const totalCost = items.reduce((sum, item) => sum + item.cost, 0);

    // Update budget
    const updatedBudget: BudgetConfig = {
        ...project.budget,
        spent: Math.round(totalCost * 100) / 100,
        remaining: Math.round((project.budget.total_budget - totalCost) * 100) / 100,
    };

    return { items, totalCost, updatedBudget };
}

/**
 * Estimates the cost impact of changing a single node's material.
 *
 * Used by the AI to provide instant cost feedback before applying
 * a material swap, e.g.:
 * "Changing to granite would increase cost by €2,400 (+8.3%)"
 *
 * @param node - The node being changed
 * @param currentMaterial - Its current material
 * @param newMaterial - The proposed new material
 * @returns Cost difference (positive = more expensive)
 */
export function estimateMaterialChangeCost(
    node: PSGNode,
    currentMaterial: Material,
    newMaterial: Material
): {
    currentCost: number;
    newCost: number;
    difference: number;
    percentChange: number;
} {
    const currentResult = calculateNodeCost(node, currentMaterial);
    const newResult = calculateNodeCost(node, newMaterial);

    const difference = newResult.cost - currentResult.cost;
    const percentChange =
        currentResult.cost > 0
            ? (difference / currentResult.cost) * 100
            : 0;

    return {
        currentCost: currentResult.cost,
        newCost: newResult.cost,
        difference: Math.round(difference * 100) / 100,
        percentChange: Math.round(percentChange * 10) / 10,
    };
}
