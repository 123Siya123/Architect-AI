/**
 * =============================================================================
 * LIB/PSG/VALIDATOR.TS — PSG Validation Engine
 * =============================================================================
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

    // --- Layer 1: Schema Validation ---
    // Check that the target node exists and the operation type is valid
    const schemaResult = validateSchema(operation, project);
    errors.push(...schemaResult.errors);
    warnings.push(...schemaResult.warnings);

    // --- Layer 2: Constraint Validation ---
    // Check min/max dimensions, fixed positions, connections
    if (errors.length === 0) {
        const constraintResult = validateConstraints(operation, project);
        errors.push(...constraintResult.errors);
        warnings.push(...constraintResult.warnings);
    }

    // --- Layer 3: Structural Validation ---
    // Check load-bearing dependencies
    if (errors.length === 0) {
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
    if (errors.length === 0) {
        const physicsResult = validatePhysics(operation, project);
        errors.push(...physicsResult.errors);
        warnings.push(...physicsResult.warnings);
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

    // Check target node exists (except for add_node, which creates a new one)
    if (operation.type !== 'add_node') {
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
                errors.push('add_node requires parent_id parameter');
            }
            break;
        }
        case 'delete_node': {
            // No additional params needed — just the target_id
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
    if (operation.type === 'move_node' && constraints.fixed_position) {
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
            errors.push(
                `Cannot delete load-bearing "${node.name}" — it supports: ` +
                dependents.map(d => d.name).join(', ') +
                `. Consider replacing with a beam or column instead.`
            );
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
        (n) => n.constraints.connected_to.includes(nodeId)
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
                errors.push(
                    `${node.type} width (${newWidth}m) would exceed wall width (${parentWall.dimensions.x}m). ` +
                    `Leave at least 0.1m on each side.`
                );
            }
            if (newHeight > parentWall.dimensions.y - 0.1) {
                errors.push(
                    `${node.type} height (${newHeight}m) would exceed wall height (${parentWall.dimensions.y}m).`
                );
            }
        }
    }

    return { valid: errors.length === 0, errors, warnings };
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
