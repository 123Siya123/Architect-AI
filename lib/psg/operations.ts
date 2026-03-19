/**
 * =============================================================================
 * LIB/PSG/OPERATIONS.TS — PSG Edit Operations
 * =============================================================================
 *
 * UPGRADE v2 — Grid snapping + move_room compound operation
 *
 * This is the ONLY module that can mutate the PSG. Every edit — whether from
 * the AI, the UI sliders, or direct manipulation — goes through these functions.
 *
 * Changes from v1:
 * 1. Grid snapping (5cm) on ALL position/dimension changes — eliminates
 *    floating-point micro-gaps between walls
 * 2. move_room compound operation — moves a room + all children atomically
 * 3. create_custom_element stub — generates a node from natural language description
 *
 * WHY A SINGLE MUTATION POINT?
 * 1. Every edit is validated before application (via validator.ts)
 * 2. Every edit is recorded for undo/redo
 * 3. Every edit triggers a state update that the 3D renderer picks up
 * 4. Budget is recalculated after every edit
 *
 * OPERATION FLOW:
 * User/AI action → create PSGOperation → validate → apply → snap → update state
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
    SurfaceMatrix,
} from '@/types';
import { validateOperation } from './validator';
import {
    createModern4BedTemplate,
    createSimple3BedTemplate,
    createMinimalistStudioTemplate,
    createWhiteHouseTemplate
} from './templates';

// =============================================================================
// GRID SNAPPING — Eliminates floating-point drift
// =============================================================================

/**
 * Default grid size: 5cm (0.05m).
 * Every position and dimension is snapped to this grid after edits.
 * This prevents micro-gaps between walls (e.g., 3.00001 instead of 3.0).
 *
 * WHY 5CM?
 * - 1cm is too fine (no architectural significance at residential scale)
 * - 10cm is too coarse (can't do 0.25m wall thickness cleanly)
 * - 5cm divides evenly into all standard dimensions:
 *   0.25m walls, 0.9m doors, 1.2m windows, 2.7m ceilings
 */
const GRID_SIZE = 0.05; // 5cm

/** Snaps a single value to the nearest grid increment. */
function snapToGrid(value: number, gridSize: number): number {
    return Math.round(value / gridSize) * gridSize;
}

/** Snaps a Vec3 position to the grid. */
function snapVec3(vec: Vec3, gridSize: number): Vec3 {
    return {
        x: snapToGrid(vec.x, gridSize),
        y: snapToGrid(vec.y, gridSize),
        z: snapToGrid(vec.z, gridSize),
    };
}

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
): OperationResult & { project?: PSGProject; nodeId?: string } {
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
            case 'set_node_position':
                updatedProject = setNodePosition(project, operation);
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
            case 'move_room':
                // Compound operation: move_room is just move_node that
                // verifies target is a Room first
                updatedProject = moveRoom(project, operation);
                break;
            case 'create_custom_element':
                updatedProject = createCustomElement(project, operation);
                break;
            case 'solve_precision':
                // High-precision architectural solver (Archicad mode)
                updatedProject = solvePrecision(project, operation);
                break;
            case 'set_precision_level':
                // Toggle between Conceptual (5cm) and Construction (0.5mm)
                updatedProject = setPrecisionLevel(project, operation);
                break;
            case 'edit_wall_surface':
                updatedProject = editWallSurface(project, operation);
                break;
            case 'use_template':
                updatedProject = useTemplate(project, operation);
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
        nodeId: operation.type === 'add_node' ? (updatedProject.nodes[Object.keys(updatedProject.nodes).pop()!]?.id) : operation.target_id,
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
// ALL position/dimension changes are grid-snapped.

/**
 * Moves a node by a delta offset (in meters).
 * Also moves all children by the same delta to maintain relative positions.
 * All resulting positions are snapped to the 5cm grid.
 */
function moveNode(project: PSGProject, operation: PSGOperation): PSGProject {
    const { delta_x = 0, delta_y = 0, delta_z = 0 } = operation.params as {
        delta_x?: number;
        delta_y?: number;
        delta_z?: number;
    };

    const gridSize = project.settings.grid_size;
    const node = project.nodes[operation.target_id];
    const updatedNode: PSGNode = {
        ...node,
        position: snapVec3({
            x: node.position.x + (delta_x as number),
            y: node.position.y + (delta_y as number),
            z: node.position.z + (delta_z as number),
        }, gridSize),
        modified_at: new Date().toISOString(),
        version: node.version + 1,
    };

    // Recursively move all children by the same delta
    const updatedNodes = { ...project.nodes, [operation.target_id]: updatedNode };
    moveChildrenRecursive(updatedNodes, node, delta_x as number, delta_y as number, delta_z as number, gridSize);

    return { ...project, nodes: updatedNodes };
}

/**
 * Sets the absolute position of a node (in meters).
 * Also moves all children to maintain relative positions.
 * All resulting positions are snapped to the 5cm grid.
 */
function setNodePosition(project: PSGProject, operation: PSGOperation): PSGProject {
    const { position_x, position_y, position_z } = operation.params as {
        position_x?: number;
        position_y?: number;
        position_z?: number;
    };

    const gridSize = project.settings.grid_size;
    const node = project.nodes[operation.target_id];

    const currentX = node.position.x;
    const currentY = node.position.y;
    const currentZ = node.position.z;

    const newX = position_x !== undefined ? position_x : currentX;
    const newY = position_y !== undefined ? position_y : currentY;
    const newZ = position_z !== undefined ? position_z : currentZ;

    const deltaX = newX - currentX;
    const deltaY = newY - currentY;
    const deltaZ = newZ - currentZ;

    const updatedNode: PSGNode = {
        ...node,
        position: snapVec3({
            x: newX,
            y: newY,
            z: newZ,
        }, gridSize),
        modified_at: new Date().toISOString(),
        version: node.version + 1,
    };

    const updatedNodes = { ...project.nodes, [operation.target_id]: updatedNode };
    moveChildrenRecursive(updatedNodes, node, deltaX, deltaY, deltaZ, gridSize);

    return { ...project, nodes: updatedNodes };
}

/**
 * Helper: recursively moves all descendant nodes.
 * Mutates the nodes map in place (but it's already a shallow copy).
 * Snaps all positions to grid.
 */
function moveChildrenRecursive(
    nodes: Record<string, PSGNode>,
    parent: PSGNode,
    dx: number,
    dy: number,
    dz: number,
    gridSize: number
): void {
    for (const childId of parent.children_ids) {
        const child = nodes[childId];
        if (child) {
            nodes[childId] = {
                ...child,
                position: snapVec3({
                    x: child.position.x + dx,
                    y: child.position.y + dy,
                    z: child.position.z + dz,
                }, gridSize),
                modified_at: new Date().toISOString(),
                version: child.version + 1,
            };
            moveChildrenRecursive(nodes, child, dx, dy, dz, gridSize);
        }
    }
}

/**
 * Resizes a node by setting new absolute dimensions.
 * All dimensions are snapped to the 5cm grid.
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

    const gridSize = project.settings.grid_size;
    const updatedNode: PSGNode = {
        ...node,
        dimensions: snapVec3({
            x: width ?? node.dimensions.x,
            y: height ?? node.dimensions.y,
            z: depth ?? node.dimensions.z,
        }, gridSize),
        modified_at: new Date().toISOString(),
        version: node.version + 1,
    };

    return {
        ...project,
        nodes: { ...project.nodes, [operation.target_id]: updatedNode },
    };
}

/**
 * Rotates a node by setting new rotation values (in degrees).
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
 * All positions and dimensions are grid-snapped.
 */
function createNodeFromAIArgs(params: Record<string, unknown>): PSGNode {
    const {
        id: providedId,
        type = 'Wall',
        parent_id = null,
        name = 'New Element',
        position_x = 0,
        position_y = 0,
        position_z = 0,
        width,
        height,
        depth,
        yaw = 0,
        pitch = 0,
        roll = 0,
        material_id = '',
        stair_style,
        stair_riser_height,
        stair_tread_depth,
        roof_style,
        roof_pitch_degrees,
        room_function,
    } = params as Record<string, unknown>;

    const now = new Date().toISOString();
    const nodeType = type as string;
    const shortId = Math.random().toString(36).slice(2, 10);
    const id = (providedId as string) || `${nodeType.toLowerCase()}_${shortId}`;

    // Type-specific sensible defaults — prevents zero-dimension nodes
    const typeDefaults: Record<string, { w: number; h: number; d: number }> = {
        Wall: { w: 4, h: 2.7, d: 0.25 },
        Partition: { w: 3, h: 2.7, d: 0.12 },
        Window: { w: 1.2, h: 1.4, d: 0.05 },
        Door: { w: 0.9, h: 2.1, d: 0.1 },
        Room: { w: 4, h: 2.7, d: 4 },
        Floor: { w: 10, h: 0.3, d: 12 },
        Slab: { w: 10, h: 0.2, d: 12 },
        Roof: { w: 12, h: 0.3, d: 14 },
        Stairs: { w: 1, h: 2.7, d: 3 },
        Column: { w: 0.3, h: 2.7, d: 0.3 },
        Beam: { w: 4, h: 0.3, d: 0.2 },
        Foundation: { w: 10, h: 0.6, d: 12 },
        Balcony: { w: 3, h: 0.15, d: 1.5 },
        House: { w: 10, h: 6, d: 12 },
        Toilet: { w: 0.4, h: 0.8, d: 0.6 },
        Sink: { w: 0.6, h: 0.85, d: 0.5 },
        Shower: { w: 0.9, h: 2.1, d: 0.9 },
        Bathtub: { w: 1.7, h: 0.5, d: 0.75 },
        LightSwitch: { w: 0.1, h: 0.1, d: 0.02 },
        ElectricalOutlet: { w: 0.1, h: 0.1, d: 0.02 },
        ElectricalPanel: { w: 0.4, h: 0.6, d: 0.1 },
        Garage: { w: 6, h: 3, d: 6 },
        Chimney: { w: 0.8, h: 4, d: 0.8 },
    };

    const defaults = typeDefaults[nodeType] || { w: 1, h: 1, d: 1 };

    // Use LLM-provided values, but clamp zeros to type defaults
    const finalWidth = (width !== undefined && Number(width) > 0) ? Number(width) : defaults.w;
    const finalHeight = (height !== undefined && Number(height) > 0) ? Number(height) : defaults.h;
    const finalDepth = (depth !== undefined && Number(depth) > 0) ? Number(depth) : defaults.d;

    const gridSize = 0.0005; // Force high precision for AI creation, then snap to project level

    return {
        id,
        type: nodeType as PSGNode['type'],
        name: name as string,
        position: snapVec3({
            x: Number(position_x),
            y: Number(position_y),
            z: Number(position_z),
        }, gridSize),
        dimensions: snapVec3({
            x: finalWidth,
            y: finalHeight,
            z: finalDepth,
        }, gridSize),
        rotation: { yaw: Number(yaw) || 0, pitch: Number(pitch) || 0, roll: Number(roll) || 0 },
        material_id: (material_id as string) || '',
        opacity: nodeType === 'Window' || (material_id as string)?.toLowerCase().includes('glass') ? 0.3 : 1,
        tags: nodeType === 'Wall' || nodeType === 'Slab' || nodeType === 'Column' || nodeType === 'Beam' || nodeType === 'Foundation'
            ? ['load_bearing']
            : [],
        constraints: { connected_to: [], fixed_position: nodeType === 'Foundation' },
        systems: { electrical: [], plumbing: [], hvac: [] },
        parent_id: (parent_id as string | null),
        children_ids: [],
        stair_style: stair_style as PSGNode['stair_style'],
        stair_riser_height: stair_riser_height ? Number(stair_riser_height) : undefined,
        stair_tread_depth: stair_tread_depth ? Number(stair_tread_depth) : undefined,
        roof_style: roof_style as PSGNode['roof_style'],
        roof_pitch_degrees: roof_pitch_degrees ? Number(roof_pitch_degrees) : undefined,
        room_function: room_function as string | undefined,
        // High-precision architectural extensions
        assembly: params.assembly as PSGNode['assembly'],
        junctions: params.junctions as PSGNode['junctions'],
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

    // A complete node always has an `id` field set AND an object `position`.
    let newNode: PSGNode;
    if (params.id && params.position && typeof params.position === 'object') {
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
    const params = operation.params as {
        new_node?: PSGNode;
        new_type?: string;
        roof_style?: string;
        stair_style?: string;
        stair_riser_height?: number;
        stair_tread_depth?: number;
        roof_pitch_degrees?: number;
        preserve_children?: boolean;
        yaw?: number;
        pitch?: number;
        roll?: number;
        assembly?: PSGNode['assembly'];
        junctions?: PSGNode['junctions'];
    };

    const preserve_children = params.preserve_children !== false; // default true
    const oldNode = project.nodes[operation.target_id];

    let updatedNewNode: PSGNode;

    if (params.new_node) {
        // Legacy path: a full PSGNode was supplied directly
        updatedNewNode = {
            ...params.new_node,
            id: operation.target_id,
            parent_id: oldNode.parent_id,
            children_ids: preserve_children ? oldNode.children_ids : [],
            modified_at: new Date().toISOString(),
            version: oldNode.version + 1,
        };
    } else {
        // ✅ AI path: flat args — clone the existing node then overlay changed fields only
        updatedNewNode = {
            ...oldNode,
            // Allow type change (e.g. Stairs → Stairs with different style)
            type: (params.new_type as PSGNode['type']) ?? oldNode.type,
            // Roof-specific overrides
            ...(params.roof_style !== undefined && { roof_style: params.roof_style as PSGNode['roof_style'] }),
            ...(params.roof_pitch_degrees !== undefined && { roof_pitch_degrees: params.roof_pitch_degrees }),
            // Stair-specific overrides
            ...(params.stair_style !== undefined && { stair_style: params.stair_style as PSGNode['stair_style'] }),
            ...(params.stair_riser_height !== undefined && { stair_riser_height: params.stair_riser_height }),
            ...(params.stair_tread_depth !== undefined && { stair_tread_depth: params.stair_tread_depth }),
            // Rotation overrides
            rotation: {
                yaw: params.yaw !== undefined ? params.yaw : oldNode.rotation.yaw,
                pitch: params.pitch !== undefined ? params.pitch : oldNode.rotation.pitch,
                roll: params.roll !== undefined ? params.roll : oldNode.rotation.roll,
            },
            // Preservation
            children_ids: preserve_children ? oldNode.children_ids : [],
            // Precision
            assembly: params.assembly as PSGNode['assembly'] ?? oldNode.assembly,
            junctions: params.junctions as PSGNode['junctions'] ?? oldNode.junctions,
            modified_at: new Date().toISOString(),
            version: oldNode.version + 1,
        };
    }

    return {
        ...project,
        nodes: { ...project.nodes, [operation.target_id]: updatedNewNode },
    };
}

// =============================================================================
// COMPOUND OPERATIONS (NEW)
// =============================================================================

/**
 * Moves an entire room including all its child nodes (walls, windows, doors).
 * This is a COMPOUND operation that ensures the room + children stay consistent.
 *
 * WHY NOT JUST move_node?
 * move_node already moves children recursively. But move_room adds validation:
 * 1. Verifies the target is actually a Room type
 * 2. Logs the operation type distinctly for the undo stack
 * 3. Could add room-specific logic (e.g., checking adjacent rooms)
 */
function moveRoom(project: PSGProject, operation: PSGOperation): PSGProject {
    const node = project.nodes[operation.target_id];
    if (!node) {
        throw new Error(`move_room: node "${operation.target_id}" not found`);
    }
    if (node.type !== 'Room') {
        throw new Error(`move_room: node "${operation.target_id}" is type "${node.type}", not Room`);
    }

    // Delegate to moveNode — it already handles children recursively
    return moveNode(project, operation);
}

/**
 * Creates a custom architectural element from a natural language description.
 * The description is stored in a `shape_description` field on the node
 * for future processing by a CAD backend.
 *
 * For now, this creates a standard box node with the given dimensions.
 * When a CadQuery backend is integrated, the shape_description field
 * will be used to generate accurate B-rep geometry.
 */
function createCustomElement(project: PSGProject, operation: PSGOperation): PSGProject {
    const params = operation.params as Record<string, unknown>;
    const {
        parent_id,
        name = 'Custom Element',
        description = '',
        position_x = 0,
        position_y = 0,
        position_z = 0,
        width = 1,
        height = 1,
        depth = 1,
        material_id = '',
    } = params;

    const now = new Date().toISOString();
    const shortId = Math.random().toString(36).slice(2, 10);
    const id = `custom_${shortId}`;

    const gridSize = 0.0005; // Force high precision for AI custom elements (same as createNodeFromAIArgs)
    const newNode: PSGNode = {
        id,
        type: 'Custom', // Properly set to Custom type
        name: name as string,
        position: snapVec3({
            x: Number(position_x),
            y: Number(position_y),
            z: Number(position_z),
        }, gridSize),
        dimensions: snapVec3({
            x: Number(width),
            y: Number(height),
            z: Number(depth),
        }, gridSize),
        rotation: { yaw: 0, pitch: 0, roll: 0 },
        material_id: (material_id as string) || '',
        opacity: 1,
        tags: ['custom'],
        constraints: { connected_to: [], fixed_position: false },
        systems: { electrical: [], plumbing: [], hvac: [] },
        parent_id: (parent_id as string | null),
        children_ids: [],
        // Mathematical geometry definition
        custom_geometry: params.custom_geometry as PSGNode['custom_geometry'],
        // Store the natural language description for future CAD processing
        cad_script: `# Custom element: ${name}\n# Description: ${description}\n# TODO: Replace with CadQuery script when backend is ready`,
        created_at: now,
        modified_at: now,
        version: 1,
    };

    // Verify parent exists
    if (newNode.parent_id && !project.nodes[newNode.parent_id]) {
        throw new Error(`create_custom_element: parent "${newNode.parent_id}" not found`);
    }

    const updatedNodes = { ...project.nodes, [newNode.id]: newNode };

    if (newNode.parent_id) {
        const parent = updatedNodes[newNode.parent_id];
        updatedNodes[newNode.parent_id] = {
            ...parent,
            children_ids: [...parent.children_ids, newNode.id],
            modified_at: now,
        };
    }

    return { ...project, nodes: updatedNodes };
}

/**
 * Advanced surface editing for walls (bulbs, curves, holes, procedural code)
 */
type SurfaceCommand =
    | 'reset'
    | 'set_bulb'
    | 'cut_hole'
    | 'set_matrix'
    | 'draw_curve'
    | 'set_code'
    | 'stamp'
    | 'smooth'
    | 'normalize'
    | 'invert'
    | 'set_cell';

type StampShape = 'gaussian' | 'cone' | 'dome' | 'ring' | 'ridge_x' | 'ridge_y';
type BlendMode = 'set' | 'add' | 'subtract' | 'max' | 'min' | 'multiply';

type EditWallSurfaceParams = {
    command: SurfaceCommand;
    rows?: number;
    cols?: number;
    resolution?: number;
    cx?: number;
    cy?: number;
    radius?: number;
    inner_radius?: number;
    strength?: number;
    shape?: StampShape;
    blend?: BlendMode;
    falloff?: number;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    axis?: 'x' | 'y';
    frequency?: number;
    phase?: number;
    amplitude?: number;
    passes?: number;
    min_value?: number;
    max_value?: number;
    hole_threshold?: number;
    interpolation?: 'nearest' | 'bilinear';
    shape_mode?: 'linear' | 'smooth';
    data?: number[][];
    code?: string;
    row?: number;
    col?: number;
    value?: number;
    description?: string;
};

function editWallSurface(project: PSGProject, operation: PSGOperation): PSGProject {
    const node = project.nodes[operation.target_id];
    if (!node || (node.type !== 'Wall' && node.type !== 'Partition')) {
        throw new Error(`edit_wall_surface: node "${operation.target_id}" must be a Wall or Partition`);
    }

    const params = operation.params as EditWallSurfaceParams;
    const existing = node.surface_matrix;

    if (params.command === 'reset') {
        const updatedNode: PSGNode = {
            ...node,
            surface_matrix: undefined,
            version: node.version + 1,
            modified_at: new Date().toISOString(),
        };
        return { ...project, nodes: { ...project.nodes, [node.id]: updatedNode } };
    }

    const rows = toIntInRange(params.rows, existing?.rows ?? 24, 2, 256);
    const cols = toIntInRange(params.cols, existing?.cols ?? 24, 2, 256);
    const minValue = toFinite(params.min_value, existing?.min_value ?? 0);
    const maxValueRaw = toFinite(params.max_value, existing?.max_value ?? 10);
    const maxValue = maxValueRaw > minValue ? maxValueRaw : minValue + 0.001;
    const holeThreshold = clamp(toFinite(params.hole_threshold, existing?.hole_threshold ?? 0.01), minValue, maxValue);
    const shapeMode = params.shape_mode;
    const interpolationFromMode: 'nearest' | 'bilinear' | undefined =
        shapeMode === 'linear' ? 'nearest' : shapeMode === 'smooth' ? 'bilinear' : undefined;
    const interpolation: 'nearest' | 'bilinear' = interpolationFromMode ?? params.interpolation ?? existing?.interpolation ?? 'bilinear';
    const description = params.description ?? existing?.description ?? `Custom ${node.type} shape`;

    if (params.command === 'set_code') {
        if (!params.code || !params.code.trim()) {
            throw new Error('edit_wall_surface set_code requires a non-empty code expression');
        }
        const resolution = toIntInRange(params.resolution, existing?.resolution ?? 48, 8, 128);
        const updatedNode: PSGNode = {
            ...node,
            surface_matrix: {
                code: params.code.trim(),
                resolution,
                min_value: minValue,
                max_value: maxValue,
                hole_threshold: holeThreshold,
                interpolation,
                rows,
                cols,
                data: createFilledMatrix(rows, cols, 1),
                description,
            },
            version: node.version + 1,
            modified_at: new Date().toISOString(),
        };
        return { ...project, nodes: { ...project.nodes, [node.id]: updatedNode } };
    }

    let matrixData: number[][];
    if (params.command === 'set_matrix') {
        if (!params.data) {
            throw new Error('edit_wall_surface set_matrix requires data');
        }
        matrixData = sanitizeAndNormalizeMatrix(params.data, minValue, maxValue);
    } else {
        matrixData = materializeSurfaceToMatrix(existing, rows, cols, minValue, maxValue);
    }

    if (params.command === 'set_bulb') {
        applyStamp(
            matrixData,
            {
                shape: 'gaussian',
                blend: params.blend ?? 'max',
                cx: toFinite(params.cx, 0.5),
                cy: toFinite(params.cy, 0.5),
                radius: clamp(toFinite(params.radius, 0.2), 0.01, 1),
                innerRadius: clamp(toFinite(params.inner_radius, 0), 0, 1),
                strength: toFinite(params.strength, 2),
                falloff: clamp(toFinite(params.falloff, 2), 0.2, 6),
            },
            minValue,
            maxValue
        );
    } else if (params.command === 'stamp') {
        applyStamp(
            matrixData,
            {
                shape: params.shape ?? 'gaussian',
                blend: params.blend ?? 'add',
                cx: toFinite(params.cx, 0.5),
                cy: toFinite(params.cy, 0.5),
                radius: clamp(toFinite(params.radius, 0.2), 0.01, 1),
                innerRadius: clamp(toFinite(params.inner_radius, 0), 0, 1),
                strength: toFinite(params.strength, 0.6),
                falloff: clamp(toFinite(params.falloff, 2), 0.2, 8),
            },
            minValue,
            maxValue
        );
    } else if (params.command === 'cut_hole') {
        applyRectHole(
            matrixData,
            clamp(toFinite(params.x, 0.4), 0, 1),
            clamp(toFinite(params.y, 0.4), 0, 1),
            clamp(toFinite(params.w, 0.2), 0.001, 1),
            clamp(toFinite(params.h, 0.2), 0.001, 1),
            minValue
        );
    } else if (params.command === 'draw_curve') {
        applyCurve(
            matrixData,
            params.axis ?? 'x',
            Math.max(0.05, toFinite(params.amplitude, 0.5)),
            Math.max(0.1, toFinite(params.frequency, 1)),
            toFinite(params.phase, 0),
            minValue,
            maxValue
        );
    } else if (params.command === 'smooth') {
        smoothMatrix(matrixData, toIntInRange(params.passes, 1, 1, 8), minValue, maxValue);
    } else if (params.command === 'normalize') {
        normalizeMatrix(matrixData, minValue, maxValue);
    } else if (params.command === 'invert') {
        invertMatrix(matrixData, minValue, maxValue);
    } else if (params.command === 'set_cell') {
        setCellValue(
            matrixData,
            toIntInRange(params.row, 0, 0, matrixData.length - 1),
            toIntInRange(params.col, 0, 0, matrixData[0].length - 1),
            clamp(toFinite(params.value, 1), minValue, maxValue)
        );
    }

    sanitizeMatrixInPlace(matrixData, minValue, maxValue);
    const updatedNode: PSGNode = {
        ...node,
        surface_matrix: {
            rows: matrixData.length,
            cols: matrixData[0].length,
            data: matrixData,
            min_value: minValue,
            max_value: maxValue,
            hole_threshold: holeThreshold,
            interpolation,
            description,
        },
        version: node.version + 1,
        modified_at: new Date().toISOString(),
    };

    return { ...project, nodes: { ...project.nodes, [node.id]: updatedNode } };
}

function toFinite(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return value;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function toIntInRange(value: unknown, fallback: number, min: number, max: number): number {
    const candidate = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
    const int = Math.round(candidate);
    return Math.min(max, Math.max(min, int));
}

function createFilledMatrix(rows: number, cols: number, fill: number): number[][] {
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

function sanitizeAndNormalizeMatrix(data: number[][], minValue: number, maxValue: number): number[][] {
    if (!Array.isArray(data) || data.length < 2 || !Array.isArray(data[0]) || data[0].length < 2) {
        throw new Error('set_matrix data must be at least 2x2');
    }
    const cols = data[0].length;
    const normalized = data.map((row) => {
        if (!Array.isArray(row) || row.length !== cols) {
            throw new Error('set_matrix data must be a rectangular matrix');
        }
        return row.map((value) => clamp(toFinite(value, 1), minValue, maxValue));
    });
    return normalized;
}

function sanitizeMatrixInPlace(data: number[][], minValue: number, maxValue: number): void {
    for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
            data[r][c] = clamp(toFinite(data[r][c], 1), minValue, maxValue);
        }
    }
}

function sampleNearest(data: number[][], u: number, v: number): number {
    const rows = data.length;
    const cols = data[0].length;
    const c = Math.min(cols - 1, Math.max(0, Math.round(u * (cols - 1))));
    const vTop = 1 - clamp(v, 0, 1);
    const r = Math.min(rows - 1, Math.max(0, Math.round(vTop * (rows - 1))));
    return data[r][c];
}

function sampleBilinear(data: number[][], u: number, v: number): number {
    const rows = data.length;
    const cols = data[0].length;
    const fx = clamp(u, 0, 1) * (cols - 1);
    const vTop = 1 - clamp(v, 0, 1);
    const fy = vTop * (rows - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(cols - 1, x0 + 1);
    const y1 = Math.min(rows - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const a = data[y0][x0] * (1 - tx) + data[y0][x1] * tx;
    const b = data[y1][x0] * (1 - tx) + data[y1][x1] * tx;
    return a * (1 - ty) + b * ty;
}

function buildCodeEvaluator(code: string, minValue: number, maxValue: number): (u: number, v: number) => number {
    try {
        const fn = new Function('u', 'v', `
            "use strict";
            const result = ${code};
            if (typeof result !== 'number' || !isFinite(result)) return 1;
            return result;
        `) as (u: number, v: number) => number;
        return (u: number, v: number) => {
            try {
                return clamp(fn(u, v), minValue, maxValue);
            } catch {
                return 1;
            }
        };
    } catch {
        return () => 1;
    }
}

function materializeSurfaceToMatrix(
    surface: SurfaceMatrix | undefined,
    rows: number,
    cols: number,
    minValue: number,
    maxValue: number
): number[][] {
    if (!surface) {
        return createFilledMatrix(rows, cols, 1);
    }

    if (surface.code) {
        const evalCode = buildCodeEvaluator(surface.code, minValue, maxValue);
        const materialized = createFilledMatrix(rows, cols, 1);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const u = cols === 1 ? 0 : c / (cols - 1);
                const v = rows === 1 ? 0 : r / (rows - 1);
                materialized[r][c] = evalCode(u, v);
            }
        }
        return materialized;
    }

    const source = sanitizeAndNormalizeMatrix(surface.data, minValue, maxValue);
    if (source.length === rows && source[0].length === cols) return source;
    const interpolation = surface.interpolation ?? 'bilinear';
    const resized = createFilledMatrix(rows, cols, 1);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const u = cols === 1 ? 0 : c / (cols - 1);
            const v = rows === 1 ? 0 : r / (rows - 1);
            resized[r][c] = interpolation === 'nearest' ? sampleNearest(source, u, v) : sampleBilinear(source, u, v);
        }
    }
    return resized;
}

function blendValues(current: number, next: number, mode: BlendMode): number {
    if (mode === 'set') return next;
    if (mode === 'add') return current + next;
    if (mode === 'subtract') return current - next;
    if (mode === 'max') return Math.max(current, next);
    if (mode === 'min') return Math.min(current, next);
    return current * next;
}

function profileValue(
    shape: StampShape,
    nx: number,
    ny: number,
    dist: number,
    normalizedRadius: number,
    innerRadius: number,
    falloff: number
): number {
    if (dist > normalizedRadius || dist < innerRadius) return 0;
    const t = normalizedRadius <= 0 ? 0 : clamp((dist - innerRadius) / Math.max(0.000001, normalizedRadius - innerRadius), 0, 1);
    if (shape === 'gaussian') return Math.exp(-falloff * t * t);
    if (shape === 'cone') return 1 - t;
    if (shape === 'dome') return Math.sqrt(Math.max(0, 1 - t * t));
    if (shape === 'ring') return Math.sin((1 - t) * Math.PI);
    if (shape === 'ridge_x') return Math.max(0, 1 - Math.abs(nx));
    return Math.max(0, 1 - Math.abs(ny));
}

function applyStamp(
    data: number[][],
    options: {
        shape: StampShape;
        blend: BlendMode;
        cx: number;
        cy: number;
        radius: number;
        innerRadius: number;
        strength: number;
        falloff: number;
    },
    minValue: number,
    maxValue: number
): void {
    const rows = data.length;
    const cols = data[0].length;
    const radius = clamp(options.radius, 0.01, 1);
    const innerRadius = clamp(options.innerRadius, 0, radius * 0.95);
    for (let r = 0; r < rows; r++) {
        const v = rows === 1 ? 0 : r / (rows - 1);
        for (let c = 0; c < cols; c++) {
            const u = cols === 1 ? 0 : c / (cols - 1);
            const dx = u - options.cx;
            const dy = v - options.cy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const nv = profileValue(options.shape, dx / radius, dy / radius, dist, radius, innerRadius, options.falloff);
            if (nv <= 0) continue;
            const target = options.blend === 'add' || options.blend === 'subtract'
                ? nv * options.strength
                : 1 + (options.strength - 1) * nv;
            data[r][c] = clamp(blendValues(data[r][c], target, options.blend), minValue, maxValue);
        }
    }
}

function applyRectHole(data: number[][], x: number, y: number, w: number, h: number, holeValue: number): void {
    const rows = data.length;
    const cols = data[0].length;
    const x2 = x + w;
    const y2 = y + h;
    for (let r = 0; r < rows; r++) {
        const v = rows === 1 ? 0 : r / (rows - 1);
        for (let c = 0; c < cols; c++) {
            const u = cols === 1 ? 0 : c / (cols - 1);
            if (u >= x && u <= x2 && v >= y && v <= y2) {
                data[r][c] = holeValue;
            }
        }
    }
}

function applyCurve(
    data: number[][],
    axis: 'x' | 'y',
    amplitude: number,
    frequency: number,
    phase: number,
    minValue: number,
    maxValue: number
): void {
    const rows = data.length;
    const cols = data[0].length;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const u = cols === 1 ? 0 : c / (cols - 1);
            const v = rows === 1 ? 0 : r / (rows - 1);
            const t = axis === 'x' ? u : v;
            const value = 1 + amplitude * Math.sin((t * frequency + phase) * Math.PI * 2);
            data[r][c] = clamp(value, minValue, maxValue);
        }
    }
}

function smoothMatrix(data: number[][], passes: number, minValue: number, maxValue: number): void {
    const rows = data.length;
    const cols = data[0].length;
    for (let pass = 0; pass < passes; pass++) {
        const clone = data.map((row) => [...row]);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let total = 0;
                let count = 0;
                for (let dr = -1; dr <= 1; dr++) {
                    for (let dc = -1; dc <= 1; dc++) {
                        const rr = r + dr;
                        const cc = c + dc;
                        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
                        total += clone[rr][cc];
                        count++;
                    }
                }
                data[r][c] = clamp(total / Math.max(1, count), minValue, maxValue);
            }
        }
    }
}

function normalizeMatrix(data: number[][], minTarget: number, maxTarget: number): void {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const row of data) {
        for (const value of row) {
            if (value < min) min = value;
            if (value > max) max = value;
        }
    }
    const span = max - min;
    if (span <= 1e-9) {
        const flat = (minTarget + maxTarget) / 2;
        for (let r = 0; r < data.length; r++) {
            for (let c = 0; c < data[r].length; c++) data[r][c] = flat;
        }
        return;
    }
    for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
            const t = (data[r][c] - min) / span;
            data[r][c] = minTarget + t * (maxTarget - minTarget);
        }
    }
}

function invertMatrix(data: number[][], minValue: number, maxValue: number): void {
    for (let r = 0; r < data.length; r++) {
        for (let c = 0; c < data[r].length; c++) {
            data[r][c] = maxValue + minValue - data[r][c];
        }
    }
}

function setCellValue(data: number[][], row: number, col: number, value: number): void {
    if (!data[row] || data[row][col] === undefined) return;
    data[row][col] = value;
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
    if (operation.type === 'move_node' || operation.type === 'move_room') {
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

// =============================================================================
// PRECISION SOLVER IMPLEMENTATIONS
// =============================================================================

/**
 * ARCHITECTURAL PRECISION SOLVER
 * Iterates through all nodes and attempts to "harden" them into 
 * mathematically perfect constructions with 0.5mm tolerance.
 */
function solvePrecision(project: PSGProject, operation: PSGOperation): PSGProject {
    let updatedProject = { ...project };
    const precisionGrid = 0.0005; // 0.5mm

    // Simple implementation: snap everything to 0.5mm and re-run corner resolver
    const updatedNodes: Record<string, PSGNode> = {};
    for (const [id, node] of Object.entries(project.nodes)) {
        updatedNodes[id] = {
            ...node,
            position: snapVec3(node.position, precisionGrid),
            dimensions: snapVec3(node.dimensions, precisionGrid),
            modified_at: new Date().toISOString(),
            version: node.version + 1,
        };
    }

    updatedProject.nodes = updatedNodes;
    updatedProject.settings.grid_size = precisionGrid;
    updatedProject.settings.precision_level = 2;

    return updatedProject;
}

/**
 * Sets the precision level for the project.
 * Level 0: Conceptual (5cm grid)
 * Level 1: Standard (1cm grid)
 * Level 2: Construction (0.5mm grid)
 */
function setPrecisionLevel(project: PSGProject, operation: PSGOperation): PSGProject {
    const { level } = operation.params as { level: number | string };
    const levelInt = Number(level) as 0 | 1 | 2;
    const gridMap = { 0: 0.05, 1: 0.01, 2: 0.0005 };
    const newGridSize = gridMap[levelInt] || 0.05;

    return {
        ...project,
        settings: {
            ...project.settings,
            precision_level: levelInt,
            grid_size: newGridSize,
        }
    };
}

/**
 * Applies a pre-built house template to the project.
 */
function useTemplate(project: PSGProject, operation: PSGOperation): PSGProject {
    const { template_slug } = operation.params as { template_slug: string };

    let newProject: PSGProject;
    switch (template_slug) {
        case 'white_house':
            newProject = createWhiteHouseTemplate();
            break;
        case 'modern_4bed_2floor':
        case 'modern_4bed':
            newProject = createModern4BedTemplate();
            break;
        case 'simple_3bed_1floor':
        case 'simple_3bed':
            newProject = createSimple3BedTemplate();
            break;
        case 'minimalist_studio':
            newProject = createMinimalistStudioTemplate();
            break;
        default:
            throw new Error(`Template "${template_slug}" not found.`);
    }

    // Preserve metadata but replace structure
    return {
        ...newProject,
        id: project.id,
        created_at: project.created_at,
        modified_at: new Date().toISOString(),
        version: project.version + 1,
        settings: {
            ...project.settings,
            grid_size: project.settings.grid_size,
            precision_level: project.settings.precision_level,
        },
        budget: {
            ...project.budget,
            total_budget: project.budget.total_budget,
            currency: project.budget.currency,
        }
    };
}
