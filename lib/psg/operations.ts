/**
 * =============================================================================
 * LIB/PSG/OPERATIONS.TS — PSG Edit Operations
 * =============================================================================
 *
 * This is the ONLY module that can mutate the PSG. Every edit — whether from
 * the AI, the UI sliders, or direct manipulation — goes through these functions.
 *
 * WHY A SINGLE MUTATION POINT?
 * 1. Every edit is validated before application (via validator.ts)
 * 2. Every edit is recorded for undo/redo
 * 3. Every edit triggers a state update that the 3D renderer picks up
 * 4. Budget is recalculated after every edit
 *
 * OPERATION FLOW:
 * User/AI action → create PSGOperation → validate → apply → update state
 *
 * IMMUTABILITY:
 * All functions return a NEW PSGProject. They never mutate the input.
 * This is critical for React's rendering (Zustand uses immutable updates)
 * and for undo/redo (we can store snapshots).
 * =============================================================================
 */

import type {
    PSGNode,
    PSGProject,
    PSGOperation,
    OperationResult,
    OperationWarning,
    Vec3,
} from '@/types';
import { validateOperation } from './validator';

// =============================================================================
// OPERATION APPLICATION
// =============================================================================

/**
 * Applies a single operation to a project, with validation.
 *
 * @param project - Current project state (NOT mutated)
 * @param operation - The operation to apply
 * @returns OperationResult with the updated project or errors
 *
 * USAGE:
 * const result = applyOperation(currentProject, {
 *   type: 'move_node',
 *   target_id: 'wall_living_north',
 *   params: { delta_x: 0, delta_y: 0, delta_z: -1.0 },
 *   timestamp: new Date().toISOString(),
 * });
 * if (result.success) {
 *   setProject(result.project);
 * }
 */
export function applyOperation(
    project: PSGProject,
    operation: PSGOperation
): OperationResult & { project?: PSGProject } {
    // Step 1: Validate
    const validation = validateOperation(operation, project);

    if (!validation.valid) {
        return {
            success: false,
            operation,
            warnings: validation.warnings,
            errors: validation.errors,
        };
    }

    // Step 2: Snapshot the current state of the target node (for undo)
    const targetNode = project.nodes[operation.target_id];
    if (targetNode) {
        operation.previous_state = { ...targetNode };
    }

    // Step 3: Apply the operation
    let updatedProject: PSGProject;

    try {
        switch (operation.type) {
            case 'move_node':
                updatedProject = moveNode(project, operation);
                break;
            case 'resize_node':
                updatedProject = resizeNode(project, operation);
                break;
            case 'rotate_node':
                updatedProject = rotateNode(project, operation);
                break;
            case 'replace_material':
                updatedProject = replaceMaterial(project, operation);
                break;
            case 'add_node':
                updatedProject = addNode(project, operation);
                break;
            case 'delete_node':
                updatedProject = deleteNode(project, operation);
                break;
            case 'replace_node':
                updatedProject = replaceNode(project, operation);
                break;
            default:
                return {
                    success: false,
                    operation,
                    warnings: [],
                    errors: [`Unknown operation type: ${operation.type}`],
                };
        }
    } catch (error) {
        return {
            success: false,
            operation,
            warnings: validation.warnings,
            errors: [`Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        };
    }

    // Step 4: Update project metadata
    updatedProject = {
        ...updatedProject,
        modified_at: new Date().toISOString(),
        version: updatedProject.version + 1,
    };

    return {
        success: true,
        operation,
        project: updatedProject,
        warnings: validation.warnings,
        errors: [],
    };
}

/**
 * Applies multiple operations as a batch (atomic).
 * If any operation fails, NONE are applied.
 *
 * WHY BATCH?
 * When the AI says "move this wall and extend the roof to match,"
 * both changes must happen together. If we moved the wall but the
 * roof extension failed, the house would be inconsistent.
 */
export function applyBatchOperations(
    project: PSGProject,
    operations: PSGOperation[]
): OperationResult & { project?: PSGProject } {
    let currentProject = project;
    const allWarnings: OperationWarning[] = [];
    const allErrors: string[] = [];

    // Validate ALL operations first (dry run)
    for (const op of operations) {
        const validation = validateOperation(op, currentProject);
        if (!validation.valid) {
            return {
                success: false,
                operation: op,
                warnings: validation.warnings,
                errors: [...allErrors, ...validation.errors],
            };
        }
        allWarnings.push(...validation.warnings);
    }

    // Apply all operations sequentially
    for (const op of operations) {
        const result = applyOperation(currentProject, op);
        if (!result.success) {
            // Rollback by returning the original project
            return {
                success: false,
                operation: op,
                warnings: allWarnings,
                errors: result.errors,
            };
        }
        currentProject = result.project!;
        allWarnings.push(...result.warnings);
    }

    return {
        success: true,
        operation: operations[0], // Primary operation
        project: currentProject,
        warnings: allWarnings,
        errors: [],
    };
}

// =============================================================================
// INDIVIDUAL OPERATION IMPLEMENTATIONS
// =============================================================================
// Each function takes the current project and returns a NEW project.
// They use the spread operator for immutability.

/**
 * Moves a node by a delta offset (in meters).
 * Also moves all children by the same delta to maintain relative positions.
 */
function moveNode(project: PSGProject, operation: PSGOperation): PSGProject {
    const { delta_x = 0, delta_y = 0, delta_z = 0 } = operation.params as {
        delta_x?: number;
        delta_y?: number;
        delta_z?: number;
    };

    const node = project.nodes[operation.target_id];
    const updatedNode: PSGNode = {
        ...node,
        position: {
            x: node.position.x + (delta_x as number),
            y: node.position.y + (delta_y as number),
            z: node.position.z + (delta_z as number),
        },
        modified_at: new Date().toISOString(),
        version: node.version + 1,
    };

    // Recursively move all children by the same delta
    const updatedNodes = { ...project.nodes, [operation.target_id]: updatedNode };
    moveChildrenRecursive(updatedNodes, node, delta_x as number, delta_y as number, delta_z as number);

    return { ...project, nodes: updatedNodes };
}

/**
 * Helper: recursively moves all descendant nodes.
 * Mutates the nodes map in place (but it's already a shallow copy).
 */
function moveChildrenRecursive(
    nodes: Record<string, PSGNode>,
    parent: PSGNode,
    dx: number,
    dy: number,
    dz: number
): void {
    for (const childId of parent.children_ids) {
        const child = nodes[childId];
        if (child) {
            nodes[childId] = {
                ...child,
                position: {
                    x: child.position.x + dx,
                    y: child.position.y + dy,
                    z: child.position.z + dz,
                },
                modified_at: new Date().toISOString(),
                version: child.version + 1,
            };
            moveChildrenRecursive(nodes, child, dx, dy, dz);
        }
    }
}

/**
 * Resizes a node by setting new absolute dimensions.
 *
 * NOTE: This sets ABSOLUTE dimensions, not deltas.
 * The AI or UI provides the new width/height/depth.
 */
function resizeNode(project: PSGProject, operation: PSGOperation): PSGProject {
    const node = project.nodes[operation.target_id];
    const { width, height, depth } = operation.params as {
        width?: number;
        height?: number;
        depth?: number;
    };

    const updatedNode: PSGNode = {
        ...node,
        dimensions: {
            x: width ?? node.dimensions.x,
            y: height ?? node.dimensions.y,
            z: depth ?? node.dimensions.z,
        },
        modified_at: new Date().toISOString(),
        version: node.version + 1,
    };

    return {
        ...project,
        nodes: { ...project.nodes, [operation.target_id]: updatedNode },
    };
}

/**
 * Rotates a node by setting new rotation values(in degrees).
 */
function rotateNode(project: PSGProject, operation: PSGOperation): PSGProject {
    const node = project.nodes[operation.target_id];
    const { yaw, pitch, roll } = operation.params as {
        yaw?: number;
        pitch?: number;
        roll?: number;
    };

    const updatedNode: PSGNode = {
        ...node,
        rotation: {
            yaw: yaw ?? node.rotation.yaw,
            pitch: pitch ?? node.rotation.pitch,
            roll: roll ?? node.rotation.roll,
        },
        modified_at: new Date().toISOString(),
        version: node.version + 1,
    };

    return {
        ...project,
        nodes: { ...project.nodes, [operation.target_id]: updatedNode },
    };
}

/**
 * Replaces the material of a node.
 *
 * This is one of the most common AI operations. The user says
 * "make this wall stone" and the AI calls replace_material with
 * the appropriate material_id.
 */
function replaceMaterial(project: PSGProject, operation: PSGOperation): PSGProject {
    const node = project.nodes[operation.target_id];
    const { material_id } = operation.params as { material_id: string };

    const updatedNode: PSGNode = {
        ...node,
        material_id,
        modified_at: new Date().toISOString(),
        version: node.version + 1,
    };

    return {
        ...project,
        nodes: { ...project.nodes, [operation.target_id]: updatedNode },
    };
}

/**
 * Builds a valid PSGNode from the flat args the AI sends via tool call.
 * The AI sends: { type, parent_id, name, position_x, position_y, position_z, width, height, depth, material_id }
 * We need to turn that into a full PSGNode with id, systems, constraints, etc.
 */
function createNodeFromAIArgs(params: Record<string, unknown>): PSGNode {
    const {
        type = 'Wall',
        parent_id = null,
        name = 'New Element',
        position_x = 0,
        position_y = 0,
        position_z = 0,
        width = 4,
        height = 2.7,
        depth = 0.25,
        material_id = '',
        stair_style,
        roof_style,
        roof_pitch_degrees,
        room_function,
    } = params as Record<string, unknown>;

    const now = new Date().toISOString();
    const nodeType = type as string;
    const shortId = Math.random().toString(36).slice(2, 10);
    const id = `${nodeType.toLowerCase()}_${shortId}`;

    return {
        id,
        type: nodeType as PSGNode['type'],
        name: name as string,
        position: {
            x: Number(position_x),
            y: Number(position_y),
            z: Number(position_z),
        },
        dimensions: {
            x: Number(width),
            y: Number(height),
            z: Number(depth),
        },
        rotation: { yaw: 0, pitch: 0, roll: 0 },
        material_id: (material_id as string) || '',
        opacity: nodeType === 'Window' ? 0.3 : 1,
        tags: nodeType === 'Wall' || nodeType === 'Slab' || nodeType === 'Column' || nodeType === 'Beam' || nodeType === 'Foundation'
            ? ['load_bearing']
            : [],
        constraints: { connected_to: [], fixed_position: nodeType === 'Foundation' },
        systems: { electrical: [], plumbing: [], hvac: [] },
        parent_id: (parent_id as string | null),
        children_ids: [],
        stair_style: stair_style as PSGNode['stair_style'],
        roof_style: roof_style as PSGNode['roof_style'],
        roof_pitch_degrees: roof_pitch_degrees ? Number(roof_pitch_degrees) : undefined,
        room_function: room_function as string | undefined,
        created_at: now,
        modified_at: now,
        version: 1,
    };
}

/**
 * Adds a new node to the project.
 *
 * Accepts either a complete PSGNode in params (legacy) or flat AI tool call
 * args like { type, parent_id, name, position_x, width, height, ... }.
 * The AI sends flat args; the factory functions send complete nodes.
 */
function addNode(project: PSGProject, operation: PSGOperation): PSGProject {
    const params = operation.params as Record<string, unknown>;

    // Detect whether the AI sent flat args or a complete PSGNode.
    // A complete node always has an `id` field set.
    let newNode: PSGNode;
    if (params.id) {
        // Already a full node (e.g. from old code paths)
        newNode = params as unknown as PSGNode;
    } else {
        // AI sent flat tool args — build a proper PSGNode from them
        newNode = createNodeFromAIArgs(params);
    }

    // Verify parent exists
    if (newNode.parent_id && !project.nodes[newNode.parent_id]) {
        throw new Error(`add_node: parent "${newNode.parent_id}" not found`);
    }

    // Add the node to the nodes map
    const updatedNodes = { ...project.nodes, [newNode.id]: newNode };

    // Add to parent's children_ids
    if (newNode.parent_id) {
        const parent = updatedNodes[newNode.parent_id];
        updatedNodes[newNode.parent_id] = {
            ...parent,
            children_ids: [...parent.children_ids, newNode.id],
            modified_at: new Date().toISOString(),
        };
    }

    return { ...project, nodes: updatedNodes };
}

/**
 * Deletes a node and all its descendants from the project.
 *
 * IMPORTANT: Also removes the node from its parent's children_ids.
 * All children are deleted recursively (cascade delete).
 */
function deleteNode(project: PSGProject, operation: PSGOperation): PSGProject {
    const nodeId = operation.target_id;
    const node = project.nodes[nodeId];

    if (!node) {
        throw new Error(`delete_node: node "${nodeId}" not found`);
    }

    // Collect all descendant IDs to delete
    const idsToDelete = new Set<string>();
    collectDescendants(project.nodes, nodeId, idsToDelete);

    // Create new nodes map without deleted nodes
    const updatedNodes: Record<string, PSGNode> = {};
    for (const [id, n] of Object.entries(project.nodes)) {
        if (!idsToDelete.has(id)) {
            updatedNodes[id] = n;
        }
    }

    // Remove from parent's children_ids
    if (node.parent_id && updatedNodes[node.parent_id]) {
        const parent = updatedNodes[node.parent_id];
        updatedNodes[node.parent_id] = {
            ...parent,
            children_ids: parent.children_ids.filter((id) => id !== nodeId),
            modified_at: new Date().toISOString(),
        };
    }

    return { ...project, nodes: updatedNodes };
}

/**
 * Helper: collects a node and all its descendants into a set.
 */
function collectDescendants(
    nodes: Record<string, PSGNode>,
    nodeId: string,
    result: Set<string>
): void {
    result.add(nodeId);
    const node = nodes[nodeId];
    if (node) {
        for (const childId of node.children_ids) {
            collectDescendants(nodes, childId, result);
        }
    }
}

/**
 * Replaces a node with a new version, optionally preserving children.
 *
 * USE CASE: "Replace this straight staircase with a curved one"
 * The old stairs node is replaced with a new stairs node of a different
 * style, but the children (handrails, etc.) are preserved.
 */
function replaceNode(project: PSGProject, operation: PSGOperation): PSGProject {
    const { new_node, preserve_children = true } = operation.params as {
        new_node: PSGNode;
        preserve_children?: boolean;
    };

    const oldNode = project.nodes[operation.target_id];

    // Copy children if preserving
    const updatedNewNode: PSGNode = {
        ...new_node,
        id: operation.target_id,  // Keep the same ID for reference stability
        parent_id: oldNode.parent_id,
        children_ids: preserve_children ? oldNode.children_ids : [],
        modified_at: new Date().toISOString(),
        version: oldNode.version + 1,
    };

    return {
        ...project,
        nodes: { ...project.nodes, [operation.target_id]: updatedNewNode },
    };
}

// =============================================================================
// UNDO / REDO SUPPORT
// =============================================================================

/**
 * Creates an undo operation from a previously applied operation.
 *
 * HOW IT WORKS:
 * When an operation is applied, we store the previous_state.
 * To undo, we create a new operation that restores that state.
 */
export function createUndoOperation(operation: PSGOperation): PSGOperation | null {
    if (!operation.previous_state) {
        return null; // Cannot undo without previous state
    }

    // For move operations, calculate the inverse delta
    if (operation.type === 'move_node') {
        const { delta_x = 0, delta_y = 0, delta_z = 0 } = operation.params as Record<string, number>;
        return {
            type: 'move_node',
            target_id: operation.target_id,
            params: {
                delta_x: -(delta_x),
                delta_y: -(delta_y),
                delta_z: -(delta_z),
            },
            timestamp: new Date().toISOString(),
        };
    }

    // For other operations, restore the previous state directly
    return {
        type: 'replace_node',
        target_id: operation.target_id,
        params: {
            new_node: operation.previous_state,
            preserve_children: false,
        },
        timestamp: new Date().toISOString(),
    };
}
