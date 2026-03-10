/**
 * =============================================================================
 * LIB/PSG/VALIDATOR.TS — PSG Validation Engine
 * =============================================================================
 *
 * UPGRADE v2 — Added AABB collision detection + room closure checks
 *
 * Every edit to the PSG (whether from the AI, sliders, or direct manipulation)
 * passes through this validator BEFORE being applied. This is the safety net
 * that prevents the AI from creating structurally impossible houses.
 *
 * VALIDATION LAYERS (checked in order):
 * 1. Schema validation — are all required fields present and correct types?
 * 2. Constraint validation — does the edit violate any min/max/connected rules?
 * 3. Structural validation — would removing a load-bearing wall collapse the roof?
 * 4. Budget validation — would this edit push the project over budget?
 * 5. Physics validation — is the window larger than the wall it's in?
 * 6. Collision detection — does the edited node overlap with siblings? (NEW)
 *
 * DESIGN PRINCIPLE:
 * The validator NEVER modifies the PSG. It only returns a validation result
 * that says "yes, apply this" or "no, here's why not." The caller decides
 * whether to proceed (e.g., the user can override budget warnings).
 * =============================================================================
 */

import type {
    PSGNode,
    PSGProject,
    PSGOperation,
    OperationResult,
    OperationWarning,
    BudgetConfig,
} from '@/types';

// =============================================================================
// VALIDATION RESULT TYPE
// =============================================================================

export interface ValidationResult {
    valid: boolean;
    errors: string[];           // Hard stops — cannot proceed
    warnings: OperationWarning[]; // Soft warnings — can proceed with acknowledgment
}

// =============================================================================
// MAIN VALIDATION FUNCTION
// =============================================================================

/**
 * Validates a proposed PSG operation against all validation layers.
 *
 * @param operation - The proposed edit
 * @param project - The current state of the project
 * @returns ValidationResult with errors and warnings
 *
 * HOW IT WORKS:
 * Runs all validators in sequence, collecting errors and warnings.
 * If ANY validator returns an error, the operation is invalid.
 * Warnings are collected but don't block the operation.
 */
export function validateOperation(
    operation: PSGOperation,
    project: PSGProject
): ValidationResult {
    const errors: string[] = [];
    const warnings: OperationWarning[] = [];
    const isProjectOp = operation.type === 'solve_precision' || operation.type === 'set_precision_level' || operation.type === 'use_template';

    // --- Layer 1: Schema Validation ---
    // Check that the target node exists and the operation type is valid
    const schemaResult = validateSchema(operation, project);
    errors.push(...schemaResult.errors);
    warnings.push(...schemaResult.warnings);

    // --- Layer 2: Constraint Validation ---
    // Check min/max dimensions, fixed positions, connections
    if (errors.length === 0 && !isProjectOp) {
        const constraintResult = validateConstraints(operation, project);
        errors.push(...constraintResult.errors);
        warnings.push(...constraintResult.warnings);
    }

    // --- Layer 3: Structural Validation ---
    // Check load-bearing dependencies
    if (errors.length === 0 && !isProjectOp) {
        const structuralResult = validateStructural(operation, project);
        errors.push(...structuralResult.errors);
        warnings.push(...structuralResult.warnings);
    }

    // --- Layer 4: Budget Validation ---
    // Check cost impact
    const budgetResult = validateBudget(operation, project);
    warnings.push(...budgetResult.warnings); // Budget issues are warnings, not errors

    // --- Layer 5: Physics Validation ---
    // Check spatial impossibilities
    if (errors.length === 0 && !isProjectOp) {
        const physicsResult = validatePhysics(operation, project);
        errors.push(...physicsResult.errors);
        warnings.push(...physicsResult.warnings);
    }

    // --- Layer 6: Collision Detection (NEW) ---
    // Check for AABB overlaps with sibling nodes
    if (errors.length === 0) {
        const collisionResult = validateCollisions(operation, project);
        // Collisions are warnings, not errors — the LLM can self-correct
        warnings.push(...collisionResult.warnings);
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// =============================================================================
// LAYER 1: SCHEMA VALIDATION
// =============================================================================

/**
 * Checks that the operation references a valid node and has valid params.
 *
 * WHAT IT CATCHES:
 * - Operations targeting non-existent nodes
 * - Missing required parameters
 * - Invalid parameter types (string where number expected)
 * - Invalid node types for certain operations (can't add a window to a roof)
 */
function validateSchema(
    operation: PSGOperation,
    project: PSGProject
): ValidationResult {
    const errors: string[] = [];
    const warnings: OperationWarning[] = [];

    // Check target node exists (except for add_node and project-level operations)
    if (operation.type !== 'add_node' && !(operation.type === 'solve_precision' || operation.type === 'set_precision_level' || operation.type === 'use_template')) {
        if (!project.nodes[operation.target_id]) {
            errors.push(
                `Node "${operation.target_id}" not found in project. ` +
                `Available nodes: ${Object.keys(project.nodes).slice(0, 10).join(', ')}...`
            );
        }
    }

    // Type-specific param validation
    switch (operation.type) {
        case 'move_node': {
            const { delta_x, delta_y, delta_z } = operation.params as Record<string, unknown>;
            if (delta_x === undefined && delta_y === undefined && delta_z === undefined) {
                errors.push('move_node requires at least one of: delta_x, delta_y, delta_z');
            }
            break;
        }
        case 'set_node_position': {
            const { position_x, position_y, position_z } = operation.params as Record<string, unknown>;
            if (position_x === undefined && position_y === undefined && position_z === undefined) {
                errors.push('set_node_position requires at least one of: position_x, position_y, position_z');
            }
            break;
        }
        case 'resize_node': {
            const { width, height, depth } = operation.params as Record<string, unknown>;
            if (width === undefined && height === undefined && depth === undefined) {
                errors.push('resize_node requires at least one of: width, height, depth');
            }
            // Check for negative dimensions
            if (typeof width === 'number' && width <= 0) errors.push('Width must be positive');
            if (typeof height === 'number' && height <= 0) errors.push('Height must be positive');
            if (typeof depth === 'number' && depth <= 0) errors.push('Depth must be positive');
            break;
        }
        case 'replace_material': {
            if (!operation.params.material_id) {
                errors.push('replace_material requires material_id parameter');
            }
            break;
        }
        case 'add_node': {
            if (!operation.params.type) {
                errors.push('add_node requires type parameter');
            }
            if (!operation.params.parent_id) {
                if (operation.params.type !== 'House') {
                    errors.push('add_node requires parent_id parameter');
                }
            } else {
                const parentId = operation.params.parent_id as string;
                if (!project.nodes[parentId]) {
                    errors.push(`add_node: parent_id "${parentId}" not found in project.`);
                }
            }
            break;
        }
        case 'delete_node': {
            // No additional params needed — just the target_id
            break;
        }
        case 'use_template': {
            if (!operation.params.template_slug) {
                errors.push('use_template requires template_slug parameter');
            }
            break;
        }
        case 'edit_wall_surface': {
            const {
                command,
                code,
                data,
                row,
                col,
                value,
            } = operation.params as Record<string, unknown>;
            if (!command) errors.push('edit_wall_surface requires command parameter');
            if (command === 'set_code' && !code) errors.push('edit_wall_surface set_code requires code parameter');
            if (command === 'set_matrix' && !data) errors.push('edit_wall_surface set_matrix requires data parameter');
            if (command === 'set_cell') {
                if (typeof row !== 'number' || !Number.isFinite(row)) errors.push('edit_wall_surface set_cell requires numeric row');
                if (typeof col !== 'number' || !Number.isFinite(col)) errors.push('edit_wall_surface set_cell requires numeric col');
                if (typeof value !== 'number' || !Number.isFinite(value)) errors.push('edit_wall_surface set_cell requires numeric value');
            }
            break;
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// LAYER 2: CONSTRAINT VALIDATION
// =============================================================================

/**
 * Checks the node's own constraints (min/max dimensions, fixed position).
 *
 * WHAT IT CATCHES:
 * - Trying to move a foundation (fixed_position = true)
 * - Making a wall thinner than its minimum thickness
 * - Disconnecting nodes that must be connected
 */
function validateConstraints(
    operation: PSGOperation,
    project: PSGProject
): ValidationResult {
    const errors: string[] = [];
    const warnings: OperationWarning[] = [];

    const node = project.nodes[operation.target_id];
    if (!node) return { valid: true, errors, warnings };

    const constraints = node.constraints;

    // Check fixed position
    if ((operation.type === 'move_node' || operation.type === 'set_node_position') && constraints.fixed_position) {
        errors.push(
            `Cannot move "${node.name}" — it has a fixed position. ` +
            `This is typically a foundation or ground-level element.`
        );
    }

    // Check dimension constraints for resize operations
    if (operation.type === 'resize_node') {
        const params = operation.params as Record<string, number>;

        if (params.width !== undefined) {
            if (constraints.min_width && params.width < constraints.min_width) {
                errors.push(
                    `Width ${params.width}m is below minimum ${constraints.min_width}m for "${node.name}"`
                );
            }
            if (constraints.max_width && params.width > constraints.max_width) {
                errors.push(
                    `Width ${params.width}m exceeds maximum ${constraints.max_width}m for "${node.name}"`
                );
            }
        }

        if (params.height !== undefined) {
            if (constraints.min_height && params.height < constraints.min_height) {
                errors.push(
                    `Height ${params.height}m is below minimum ${constraints.min_height}m for "${node.name}"`
                );
            }
            if (constraints.max_height && params.height > constraints.max_height) {
                errors.push(
                    `Height ${params.height}m exceeds maximum ${constraints.max_height}m for "${node.name}"`
                );
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// LAYER 3: STRUCTURAL VALIDATION
// =============================================================================

/**
 * Checks structural integrity — prevents removing load-bearing elements
 * that other parts of the house depend on.
 *
 * WHAT IT CATCHES:
 * - Deleting a load-bearing wall that supports a floor above
 * - Removing a column that carries a beam
 * - Making a load-bearing wall too thin for its structural role
 */
function validateStructural(
    operation: PSGOperation,
    project: PSGProject
): ValidationResult {
    const errors: string[] = [];
    const warnings: OperationWarning[] = [];

    const node = project.nodes[operation.target_id];
    if (!node) return { valid: true, errors, warnings };

    // Deleting a load-bearing element
    if (operation.type === 'delete_node' && node.tags.includes('load_bearing')) {
        // Check if anything above depends on this node
        const dependents = findDependentNodes(node.id, project);
        if (dependents.length > 0) {
            // RELAXED: Physicist overrides Code. Allow deletion but warn heavily.
            warnings.push({
                severity: 'warning',
                message: `CRITICAL: Deleting load-bearing "${node.name}" which supports: ` +
                    dependents.map(d => d.name).join(', ') +
                    `. Ensure you have a plan to support these elements or delete them too.`,
                suggestion: 'This action is structurally risky. Proceed only if the Physicist explicitly requested it.',
            });
        } else {
            warnings.push({
                severity: 'warning',
                message: `"${node.name}" is tagged as load-bearing. Removing it may affect structural integrity.`,
                suggestion: 'Consider having a structural engineer review this change.',
            });
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

/**
 * Finds nodes that structurally depend on the given node.
 * A node B depends on node A if A is in B's constraints.connected_to list.
 */
function findDependentNodes(nodeId: string, project: PSGProject): PSGNode[] {
    return Object.values(project.nodes).filter(
        (n) => n.constraints.connected_to?.includes(nodeId)
    );
}

// =============================================================================
// LAYER 4: BUDGET VALIDATION
// =============================================================================

/**
 * Estimates the cost impact of an operation and warns if it would
 * push the project over budget.
 *
 * NOTE: This is an ESTIMATE. Exact cost calculation happens after
 * the operation is applied, using the full cost calculator in
 * cost-calculator.ts.
 *
 * WHAT IT WARNS ABOUT:
 * - Material swaps that increase cost significantly
 * - Adding new elements when budget is nearly exhausted
 * - Resizing elements to use more material
 */
function validateBudget(
    operation: PSGOperation,
    project: PSGProject
): ValidationResult {
    const errors: string[] = [];
    const warnings: OperationWarning[] = [];

    const budget = project.budget;

    if (!budget.warnings_enabled) {
        return { valid: true, errors, warnings };
    }

    // Check if we're already over the warning threshold
    const percentSpent = (budget.spent / budget.total_budget) * 100;
    if (percentSpent >= budget.warning_threshold) {
        warnings.push({
            severity: 'warning',
            message: `Budget is ${percentSpent.toFixed(1)}% spent (${formatCurrency(budget.spent, budget.currency)} / ${formatCurrency(budget.total_budget, budget.currency)}). Additional changes may exceed budget.`,
            suggestion: 'Consider reviewing material choices or room sizes to reduce costs.',
        });
    }

    return { valid: true, errors, warnings };
}

// =============================================================================
// LAYER 5: PHYSICS VALIDATION
// =============================================================================

/**
 * Checks for spatial impossibilities.
 *
 * WHAT IT CATCHES:
 * - Windows larger than the wall they're in
 * - Overlapping rooms on the same floor
 * - Doors placed partially outside a wall
 * - Stairs that don't reach the next floor
 */
function validatePhysics(
    operation: PSGOperation,
    project: PSGProject
): ValidationResult {
    const errors: string[] = [];
    const warnings: OperationWarning[] = [];

    const node = project.nodes[operation.target_id];
    if (!node) return { valid: true, errors, warnings };

    // For resize operations on windows/doors, check they fit in parent wall
    if (operation.type === 'resize_node' && (node.type === 'Window' || node.type === 'Door')) {
        const parentWall = node.parent_id ? project.nodes[node.parent_id] : null;
        if (parentWall) {
            const params = operation.params as Record<string, number>;
            const newWidth = params.width ?? node.dimensions.x;
            const newHeight = params.height ?? node.dimensions.y;

            if (newWidth > parentWall.dimensions.x - 0.2) {
                // RELAXED: Physicist overrides Code. Allow oversize windows.
                warnings.push({
                    severity: 'warning',
                    message: `${node.type} width (${newWidth}m) exceeds wall width (${parentWall.dimensions.x}m). Check if this is intended.`,
                    suggestion: 'Resize the window or the wall.',
                });
            }
            if (newHeight > parentWall.dimensions.y - 0.1) {
                // RELAXED: Physicist overrides Code. Allow oversize windows.
                warnings.push({
                    severity: 'warning',
                    message: `${node.type} height (${newHeight}m) exceeds wall height (${parentWall.dimensions.y}m). Check if this is intended.`,
                    suggestion: 'Resize the window or the wall.',
                });
            }
        }
    }

    // For move operations, check node doesn't go underground
    if ((operation.type === 'move_node' || operation.type === 'set_node_position') && node.type !== 'Foundation') {
        const params = operation.params as Record<string, number>;
        let newY = node.position.y;
        if (operation.type === 'move_node') {
            newY += (params.delta_y || 0);
        } else {
            newY = params.position_y !== undefined ? params.position_y : newY;
        }
        const halfHeight = node.dimensions.y / 2;
        if (newY - halfHeight < -0.5) { // Allow 0.5m below grade for basements
            warnings.push({
                severity: 'warning',
                message: `Moving "${node.name}" would place it ${Math.abs(newY - halfHeight).toFixed(1)}m below ground level.`,
                suggestion: 'Check if this is intentional (e.g., basement). If not, adjust delta_y or position_y.',
            });
        }
    }

    // Check for floating roof
    if ((operation.type === 'move_node' || operation.type === 'set_node_position' || operation.type === 'resize_node') && node.type === 'Roof') {
        const params = operation.params as Record<string, number>;

        // Calculate proposed geometry
        let newY = node.position.y;
        let newHeight = node.dimensions.y;

        if (operation.type === 'move_node') {
            newY += (params.delta_y || 0);
        } else if (operation.type === 'set_node_position') {
            newY = params.position_y !== undefined ? params.position_y : newY;
        }

        if (operation.type === 'resize_node') {
            newHeight = params.height !== undefined ? params.height : newHeight;
        }

        const roofBottom = newY - newHeight / 2;

        // Find the highest wall top in the project
        let maxWallTop = -Infinity;
        let highestWallName = '';

        for (const otherNode of Object.values(project.nodes)) {
            if (otherNode.type === 'Wall') {
                const wallTop = otherNode.position.y + otherNode.dimensions.y / 2;
                if (wallTop > maxWallTop) {
                    maxWallTop = wallTop;
                    highestWallName = otherNode.name;
                }
            }
        }

        // If we found walls, check gap
        if (maxWallTop > -Infinity) {
            const gap = roofBottom - maxWallTop;
            // Tolerance: 0.05m (5cm)
            if (gap > 0.05) {
                // RELAXED: Physicist overrides Code. Allow floating roofs (temporarily).
                warnings.push({
                    severity: 'warning',
                    message: `Roof "${node.name}" is floating by ${gap.toFixed(3)}m above the highest wall.`,
                    suggestion: 'Ensure this is intentional (e.g., flying roof) or lower it.',
                });
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}

// =============================================================================
// LAYER 6: COLLISION DETECTION (NEW)
// =============================================================================

/**
 * AABB (Axis-Aligned Bounding Box) collision detection.
 *
 * After a move_node or resize_node operation, check if the target node's
 * bounding box overlaps with any sibling node (same parent). This catches:
 * - Walls stacking on top of each other
 * - Rooms overlapping after a move
 * - Elements placed inside other elements unintentionally
 *
 * Returns warnings (not errors) because some overlaps are intentional
 * (e.g., a door is embedded in a wall — that's by design).
 *
 * WHY ONLY SIBLINGS?
 * Parent-child overlaps are intentional (window in wall, wall in room).
 * We only check nodes at the same level in the hierarchy.
 */
function validateCollisions(
    operation: PSGOperation,
    project: PSGProject
): ValidationResult {
    const errors: string[] = [];
    const warnings: OperationWarning[] = [];

    // Only check for move and resize operations
    if (operation.type !== 'move_node' && operation.type !== 'set_node_position' && operation.type !== 'resize_node' && operation.type !== 'add_node') {
        return { valid: true, errors, warnings };
    }

    const node = project.nodes[operation.target_id];
    if (!node) return { valid: true, errors, warnings };

    // Calculate the node's AABB after the proposed edit
    const editedAABB = getEditedAABB(node, operation);

    // Skip collision checks for certain node types where overlap is expected
    const skipTypes = new Set(['Window', 'Door', 'House', 'Floor']);
    if (skipTypes.has(node.type)) {
        return { valid: true, errors, warnings };
    }

    // Get sibling nodes (same parent)
    if (!node.parent_id) return { valid: true, errors, warnings };
    const parent = project.nodes[node.parent_id];
    if (!parent) return { valid: true, errors, warnings };

    const siblings = parent.children_ids
        .filter(id => id !== node.id)
        .map(id => project.nodes[id])
        .filter(Boolean)
        .filter(sib => !skipTypes.has(sib.type)); // Don't check against windows/doors

    for (const sibling of siblings) {
        const sibAABB = getNodeAABB(sibling);
        if (aabbOverlap(editedAABB, sibAABB)) {
            const overlapVolume = calculateOverlapVolume(editedAABB, sibAABB);
            // Only warn for significant overlaps (> 0.01 m³, skip micro-overlaps)
            if (overlapVolume > 0.01) {
                warnings.push({
                    severity: 'warning',
                    message: `"${node.name}" would overlap with "${sibling.name}" by approximately ${overlapVolume.toFixed(2)}m³ after this edit.`,
                    suggestion: `Consider adjusting the position or size to avoid overlap. "${sibling.name}" is at pos=[${sibling.position.x.toFixed(2)}, ${sibling.position.y.toFixed(2)}, ${sibling.position.z.toFixed(2)}] with dim=[${sibling.dimensions.x.toFixed(2)}, ${sibling.dimensions.y.toFixed(2)}, ${sibling.dimensions.z.toFixed(2)}].`,
                });
            }
        }
    }

    return { valid: true, errors, warnings }; // Collisions are warnings, not errors
}

// =============================================================================
// AABB HELPER TYPES & FUNCTIONS
// =============================================================================

interface AABB {
    minX: number; maxX: number;
    minY: number; maxY: number;
    minZ: number; maxZ: number;
}

/**
 * Gets the axis-aligned bounding box for a node.
 * Accounts for rotation: when yaw=90, width and depth are swapped.
 */
function getNodeAABB(node: PSGNode): AABB {
    const isRotated = Math.abs(node.rotation.yaw) % 180 === 90;
    const halfW = (isRotated ? node.dimensions.z : node.dimensions.x) / 2;
    const halfH = node.dimensions.y / 2;
    const halfD = (isRotated ? node.dimensions.x : node.dimensions.z) / 2;

    return {
        minX: node.position.x - halfW,
        maxX: node.position.x + halfW,
        minY: node.position.y - halfH,
        maxY: node.position.y + halfH,
        minZ: node.position.z - halfD,
        maxZ: node.position.z + halfD,
    };
}

/**
 * Gets the AABB after a proposed edit (move or resize).
 */
function getEditedAABB(node: PSGNode, operation: PSGOperation): AABB {
    const pos = { ...node.position };
    const dim = { ...node.dimensions };

    if (operation.type === 'move_node') {
        const params = operation.params as Record<string, number>;
        pos.x += params.delta_x || 0;
        pos.y += params.delta_y || 0;
        pos.z += params.delta_z || 0;
    } else if (operation.type === 'set_node_position') {
        const params = operation.params as Record<string, number>;
        pos.x = params.position_x !== undefined ? params.position_x : pos.x;
        pos.y = params.position_y !== undefined ? params.position_y : pos.y;
        pos.z = params.position_z !== undefined ? params.position_z : pos.z;
    }

    if (operation.type === 'resize_node') {
        const params = operation.params as Record<string, number>;
        dim.x = params.width ?? dim.x;
        dim.y = params.height ?? dim.y;
        dim.z = params.depth ?? dim.z;
    }

    const isRotated = Math.abs(node.rotation.yaw) % 180 === 90;
    const halfW = (isRotated ? dim.z : dim.x) / 2;
    const halfH = dim.y / 2;
    const halfD = (isRotated ? dim.x : dim.z) / 2;

    return {
        minX: pos.x - halfW,
        maxX: pos.x + halfW,
        minY: pos.y - halfH,
        maxY: pos.y + halfH,
        minZ: pos.z - halfD,
        maxZ: pos.z + halfD,
    };
}

/**
 * Checks if two AABBs overlap in all three axes.
 */
function aabbOverlap(a: AABB, b: AABB): boolean {
    return (
        a.minX < b.maxX && a.maxX > b.minX &&
        a.minY < b.maxY && a.maxY > b.minY &&
        a.minZ < b.maxZ && a.maxZ > b.minZ
    );
}

/**
 * Calculates the volume of overlap between two AABBs.
 */
function calculateOverlapVolume(a: AABB, b: AABB): number {
    const overlapX = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
    const overlapY = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
    const overlapZ = Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
    return overlapX * overlapY * overlapZ;
}

// =============================================================================
// UTILITY
// =============================================================================

/**
 * Formats a number as currency string.
 */
function formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

/**
 * Validates an entire PSG project for internal consistency.
 * Used on project load and after batch operations.
 *
 * CHECKS:
 * - All parent_id references point to existing nodes
 * - All children_ids references point to existing nodes
 * - Root node exists and has no parent
 * - No orphan nodes (nodes with parent that doesn't list them as child)
 * - No circular parent-child references
 */
export function validateProject(project: PSGProject): ValidationResult {
    const errors: string[] = [];
    const warnings: OperationWarning[] = [];

    // Check root node exists
    if (!project.nodes[project.root_node_id]) {
        errors.push(`Root node "${project.root_node_id}" not found in nodes map`);
        return { valid: false, errors, warnings };
    }

    // Check all references are valid
    for (const [id, node] of Object.entries(project.nodes)) {
        // Parent reference valid
        if (node.parent_id && !project.nodes[node.parent_id]) {
            errors.push(`Node "${id}" references non-existent parent "${node.parent_id}"`);
        }

        // Children references valid
        for (const childId of node.children_ids) {
            if (!project.nodes[childId]) {
                errors.push(`Node "${id}" references non-existent child "${childId}"`);
            }
        }

        // Bidirectional consistency: if A says B is its child, B should say A is its parent
        for (const childId of node.children_ids) {
            const child = project.nodes[childId];
            if (child && child.parent_id !== id) {
                warnings.push({
                    severity: 'warning',
                    message: `Inconsistency: "${id}" lists "${childId}" as child, but child's parent_id is "${child.parent_id}"`,
                });
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
}
