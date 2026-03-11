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
const SINGLETON_TYPES: NodeType[] = ['Roof', 'Foundation'];

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
        const existing = existingSiblings[0];
        const dims = existing.dimensions;
        const pos = existing.position;
        return {
            action: 'BLOCK',
            existingId: existing.id,
            message: `${type} already exists: ID="${existing.id}" ("${existing.name}") at Y=${pos.y.toFixed(2)}, size=${dims.x.toFixed(1)}×${dims.y.toFixed(1)}×${dims.z.toFixed(1)}m. Use resize_node(target_id="${existing.id}", ...) or set_node_position(target_id="${existing.id}", ...) instead of add_node.`,
        };
    }

    return { action: 'ALLOW' };
}

/**
 * Auto-correct window/door depth to match parent wall thickness,
 * but CAPPED at a reasonable maximum to prevent absurdities like 9m deep doors.
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

    const MAX_DOOR_DEPTH = 0.6;   // 60cm max — even for castle doors
    const MAX_WINDOW_DEPTH = 0.5; // 50cm max — deep embrasures

    const wallThickness = parentWall.dimensions.z;
    const maxDepth = type === 'Door' ? MAX_DOOR_DEPTH : MAX_WINDOW_DEPTH;
    const currentDepth = args.depth as number | undefined;

    // Correct depth: match wall thickness, but never exceed reasonable cap
    const targetDepth = Math.min(wallThickness, maxDepth);

    if (currentDepth === undefined || currentDepth < targetDepth * 0.8 || currentDepth > maxDepth) {
        const correctedArgs = { ...args, depth: targetDepth };
        return {
            args: correctedArgs,
            corrected: true,
            message: `AUTO-CORRECTED: ${type} depth = ${targetDepth.toFixed(2)}m (wall=${wallThickness.toFixed(2)}m, cap=${maxDepth}m)`,
        };
    }

    return { args, corrected: false };
}

// =============================================================================
// AUTO-CORRECT: Y-Position (Bug #1 — systemic Y-coordinate confusion)
// =============================================================================

/**
 * Auto-correct Y position for add_node operations.
 * The most common agent error: using wallHeight/2 as Y instead of floorTop + wallHeight/2.
 * This deterministic pre-processor catches and fixes it BEFORE the operation is submitted.
 */
export function autoCorrectYPosition(
    args: Record<string, unknown>,
    project: PSGProject
): { args: Record<string, unknown>; corrected: boolean; message?: string } {
    const type = args.type as string;
    const parentId = args.parent_id as string;
    const posY = args.position_y as number | undefined;
    const height = args.height as number | undefined;

    if (!posY || !height) return { args, corrected: false };

    // Find the floor this element should sit on
    const floors = Object.values(project.nodes).filter(n => n.type === 'Floor');
    if (floors.length === 0) return { args, corrected: false };

    // Sort floors by Y position (lowest first)
    floors.sort((a, b) => a.position.y - b.position.y);

    if (type === 'Wall' || type === 'Partition') {
        // Wall Y should be floorTop + height/2
        // Detect if agent used height/2 (forgot floor offset)
        for (const floor of floors) {
            const floorTop = floor.position.y + floor.dimensions.y / 2;
            const correctY = floorTop + height / 2;
            const naiveY = height / 2; // What agents incorrectly calculate

            // Check if the agent used the naive formula (within tolerance)
            if (Math.abs(posY - naiveY) < 0.02 && Math.abs(posY - correctY) > 0.02) {
                const correctedArgs = { ...args, position_y: correctY };
                return {
                    args: correctedArgs,
                    corrected: true,
                    message: `Y-FIX: Wall Y ${posY.toFixed(3)} → ${correctY.toFixed(3)} (floorTop=${floorTop.toFixed(3)} + h/2)`,
                };
            }
        }
    } else if (type === 'Roof') {
        // Roof Y should be on top of the highest wall
        const walls = Object.values(project.nodes).filter(n => n.type === 'Wall' || n.type === 'Partition');
        if (walls.length > 0) {
            let maxWallTop = -Infinity;
            for (const wall of walls) {
                const wallTop = wall.position.y + wall.dimensions.y / 2;
                if (wallTop > maxWallTop) maxWallTop = wallTop;
            }
            
            // BoxGeometry (flat/default) is center-origin -> needs + height/2
            // Custom geometries (gable, hip, shed) have their base at Y=0 -> need EXACTLY wallTop
            const roofStyle = args.roof_style as string | undefined;
            const isBaseOrigin = roofStyle === 'gable' || roofStyle === 'hip' || roofStyle === 'shed' || roofStyle === 'cone' || roofStyle === 'dome';
            const correctY = isBaseOrigin ? maxWallTop : (maxWallTop + (height || 0) / 2);

            if (Math.abs(posY - correctY) > 0.05) {
                const correctedArgs = { ...args, position_y: correctY };
                return {
                    args: correctedArgs,
                    corrected: true,
                    message: `Y-FIX: Roof Y ${posY.toFixed(3)} → ${correctY.toFixed(3)} (wallTop=${maxWallTop.toFixed(3)}${!isBaseOrigin ? ' + h/2' : ''})`,
                };
            }
        }
    } else if (type === 'Door') {
        // Door bottom should sit on the floor / wall bottom
        const parent = project.nodes[parentId];
        if (parent && (parent.type === 'Wall' || parent.type === 'Partition')) {
            const wallBottom = parent.position.y - parent.dimensions.y / 2;
            const correctY = wallBottom + height / 2;

            if (Math.abs(posY - correctY) > 0.05) {
                const correctedArgs = { ...args, position_y: correctY };
                return {
                    args: correctedArgs,
                    corrected: true,
                    message: `Y-FIX: Door Y ${posY.toFixed(3)} → ${correctY.toFixed(3)} (wallBottom + h/2)`,
                };
            }
        }
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

