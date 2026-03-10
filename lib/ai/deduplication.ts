/**
 * =============================================================================
 * LIB/AI/DEDUPLICATION.TS — Duplicate Node Prevention System
 * =============================================================================
 *
 * FIX FOR BUG #1: Double Roof.
 * Before any add_node call is executed, this module checks if a duplicate
 * singleton element (Roof, Floor, Foundation) already exists under the same
 * parent. If it does, the add is BLOCKED and the agent is told to use
 * set_node_position or resize_node instead.
 *
 * Also maintains a persistent operationLog that maps semantic labels to
 * node IDs so agents always modify existing nodes rather than recreating them.
 *
 * =============================================================================
 */

import type { PSGNode, PSGProject } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export type NodeType = PSGNode['type'];

export interface DedupeResult {
    action: 'ALLOW' | 'BLOCK';
    existingId?: string;
    message?: string;
}

// Singleton types — only one per parent is allowed
const SINGLETON_TYPES: NodeType[] = ['Roof', 'Foundation', 'Floor'];

// =============================================================================
// OPERATION LOG — Persistent map of semantic labels → node IDs
// =============================================================================

export class OperationLog {
    private log: Record<string, string> = {};

    /**
     * Register a node with a semantic label.
     * Example: operationLog.set('main_roof', 'node_uuid_abc123')
     */
    set(label: string, nodeId: string): void {
        this.log[label] = nodeId;
    }

    /**
     * Get the node ID for a semantic label.
     */
    get(label: string): string | undefined {
        return this.log[label];
    }

    /**
     * Check if a label already exists.
     */
    has(label: string): boolean {
        return label in this.log;
    }

    /**
     * Remove a label (e.g., when a node is deleted).
     */
    remove(label: string): void {
        delete this.log[label];
    }

    /**
     * Remove all entries pointing to a specific node ID.
     */
    removeByNodeId(nodeId: string): void {
        for (const [label, id] of Object.entries(this.log)) {
            if (id === nodeId) {
                delete this.log[label];
            }
        }
    }

    /**
     * Auto-register a node based on its type and parent.
     * Creates a predictable semantic label.
     */
    autoRegister(node: PSGNode): void {
        const label = this.generateLabel(node);
        this.log[label] = node.id;
    }

    /**
     * Generate a semantic label for a node.
     */
    private generateLabel(node: PSGNode): string {
        const parentSuffix = node.parent_id ? `_${node.parent_id.substring(0, 8)}` : '';
        const typeLower = node.type.toLowerCase();
        return `${typeLower}${parentSuffix}`;
    }

    /**
     * Get all entries as a readable string for agent context injection.
     */
    serialize(): string {
        const entries = Object.entries(this.log);
        if (entries.length === 0) return 'OPERATION LOG: (empty)';

        const lines = entries.map(([label, id]) => `  ${label} → ${id}`);
        return `OPERATION LOG (${entries.length} entries):\n${lines.join('\n')}`;
    }

    /**
     * Get the raw log object.
     */
    getAll(): Record<string, string> {
        return { ...this.log };
    }

    /**
     * Initialize from an existing project by scanning all nodes.
     */
    initFromProject(project: PSGProject): void {
        this.log = {};
        for (const node of Object.values(project.nodes)) {
            this.autoRegister(node);
        }
    }
}

// =============================================================================
// DEDUPLICATION CHECK
// =============================================================================

/**
 * Check if adding a node of the given type under the given parent is allowed.
 * For singleton types (Roof, Floor, Foundation), only one per parent is permitted.
 *
 * @param parentId - The ID of the parent node
 * @param type - The type of node being added
 * @param project - The current project state
 * @returns DedupeResult with action ALLOW or BLOCK
 */
export function checkBeforeAdd(
    parentId: string,
    type: NodeType,
    project: PSGProject
): DedupeResult {
    // Only check singleton types
    if (!SINGLETON_TYPES.includes(type)) {
        return { action: 'ALLOW' };
    }

    const parent = project.nodes[parentId];
    if (!parent) {
        return { action: 'ALLOW' }; // Parent not found — let downstream validation handle it
    }

    // Find existing siblings of the same type
    const existingSiblings = parent.children_ids
        .map(id => project.nodes[id])
        .filter(child => child && child.type === type);

    if (existingSiblings.length > 0) {
        return {
            action: 'BLOCK',
            existingId: existingSiblings[0].id,
            message: `${type} already exists as node ${existingSiblings[0].id} (\"${existingSiblings[0].name}\"). Use resize_node or set_node_position instead.`,
        };
    }

    return { action: 'ALLOW' };
}

/**
 * Auto-correct window/door depth to match parent wall thickness.
 * Prevents the "window doesn't cut through wall" bug.
 *
 * @param args - The add_node arguments
 * @param project - Current project
 * @returns Modified args with corrected depth if applicable
 */
export function autoCorrectOpeningDepth(
    args: Record<string, unknown>,
    project: PSGProject
): { args: Record<string, unknown>; corrected: boolean; message?: string } {
    const type = args.type as string;
    const parentId = args.parent_id as string;

    if (type !== 'Window' && type !== 'Door') {
        return { args, corrected: false };
    }

    const parentWall = project.nodes[parentId];
    if (!parentWall) {
        return { args, corrected: false };
    }

    const wallDepth = parentWall.dimensions.z; // Wall thickness
    const currentDepth = args.depth as number | undefined;

    if (currentDepth === undefined || currentDepth < wallDepth) {
        const correctedArgs = { ...args, depth: wallDepth };
        return {
            args: correctedArgs,
            corrected: true,
            message: `AUTO-CORRECTED: ${type} depth set to wall thickness: ${wallDepth}m`,
        };
    }

    return { args, corrected: false };
}

/**
 * Validate that geometry is physically possible (no negative dimensions, etc.)
 * This is the IMPOSSIBLE severity level — blocks at the API level.
 */
export function validateGeometryPossible(
    args: Record<string, unknown>
): { valid: boolean; message?: string } {
    const width = args.width as number | undefined;
    const height = args.height as number | undefined;
    const depth = args.depth as number | undefined;

    if (width !== undefined && width <= 0) {
        return { valid: false, message: `IMPOSSIBLE: width ${width}m is non-positive` };
    }
    if (height !== undefined && height <= 0) {
        return { valid: false, message: `IMPOSSIBLE: height ${height}m is non-positive` };
    }
    if (depth !== undefined && depth <= 0) {
        return { valid: false, message: `IMPOSSIBLE: depth ${depth}m is non-positive` };
    }

    return { valid: true };
}
