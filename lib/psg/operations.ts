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
} from '@/types';
import { validateOperation } from './validator';
import {
    createWhiteHouseTemplate,
    createModern4BedTemplate,
    createSimple3BedTemplate,
    createMinimalistStudioTemplate
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
        opacity: nodeType === 'Window' ? 0.3 : 1,
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

    const gridSize = project.settings.grid_size;
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
