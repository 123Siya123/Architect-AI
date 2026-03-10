import type { PSGProject, PSGNode, Material } from '@/types';

// =============================================================================
// DECISION HISTORY — Hierarchical Memory for Agent Context
// =============================================================================

export interface DecisionEntry {
    turn: number;
    agent: string;
    decision: string;
    reasoning: string;
    result: 'success' | 'failed' | 'violation';
}

export class DecisionHistory {
    private entries: DecisionEntry[] = [];

    add(entry: DecisionEntry) {
        this.entries.push(entry);
    }

    getAll(): DecisionEntry[] {
        return [...this.entries];
    }

    getRecent(count: number = 10): DecisionEntry[] {
        return this.entries.slice(-count);
    }

    format(): string {
        if (this.entries.length === 0) return 'No decisions yet.';
        return this.entries.map(e =>
            `[Turn ${e.turn}] ${e.agent}: ${e.decision} (${e.result})${e.reasoning ? ` — ${e.reasoning}` : ''}`
        ).join('\n');
    }

    formatRecent(count: number = 10): string {
        const recent = this.getRecent(count);
        if (recent.length === 0) return 'No decisions yet.';
        return recent.map(e =>
            `[Turn ${e.turn}] ${e.agent}: ${e.decision} (${e.result})${e.reasoning ? ` — ${e.reasoning}` : ''}`
        ).join('\n');
    }
}

// =============================================================================
// 3D NODE TREE — Single Source of Truth for All Agents
// =============================================================================

/**
 * Prepares a detailed, hierarchical 3D node tree with full coordinates.
 * This is the SHARED state that every agent receives.
 */
export function prepare3DNodeTree(project: PSGProject): string {
    const nodes = project.nodes;
    const lines: string[] = [];

    // Find root nodes (no parent or parent not in nodes)
    const rootIds = Object.keys(nodes).filter(id => {
        const node = nodes[id];
        return !node.parent_id || !nodes[node.parent_id];
    });

    const printNode = (id: string, depth: number) => {
        const node = nodes[id];
        if (!node) return;

        const indent = '  '.repeat(depth);
        const pos = `pos(${round(node.position.x, 4)}, ${round(node.position.y, 4)}, ${round(node.position.z, 4)})`;
        const dim = `dim(${round(node.dimensions.x, 4)} × ${round(node.dimensions.y, 4)} × ${round(node.dimensions.z, 4)})`;
        const rot = node.rotation.yaw !== 0 ? ` rot(yaw=${node.rotation.yaw}°)` : '';
        const mat = node.material_id ? ` [${node.material_id}]` : '';
        const fn = node.room_function ? ` (${node.room_function})` : '';
        const style = node.roof_style ? ` style=${node.roof_style}` : '';
        const stairStyle = node.stair_style ? ` style=${node.stair_style}` : '';
        const surf = node.surface_matrix
            ? node.surface_matrix.code
                ? ` surface(procedural,res=${node.surface_matrix.resolution || 48},range=${node.surface_matrix.min_value ?? 0}-${node.surface_matrix.max_value ?? 10},hole<=${node.surface_matrix.hole_threshold ?? 0.01})`
                : ` surface(matrix=${node.surface_matrix.rows}x${node.surface_matrix.cols},range=${node.surface_matrix.min_value ?? 0}-${node.surface_matrix.max_value ?? 10},hole<=${node.surface_matrix.hole_threshold ?? 0.01})`
            : '';

        lines.push(`${indent}├─ ${node.type}: "${node.name}" [${id}]`);
        lines.push(`${indent}│  ${pos} ${dim}${rot}${mat}${fn}${style}${stairStyle}${surf ? ` ${surf}` : ''}`);

        // Print children
        if (node.children_ids && node.children_ids.length > 0) {
            for (const childId of node.children_ids) {
                printNode(childId, depth + 1);
            }
        }
    };

    if (rootIds.length === 0) {
        return 'EMPTY — No nodes in the building.';
    }

    lines.push('3D NODE TREE (use the IDs in [brackets] for all operations):');
    for (const rootId of rootIds) {
        printNode(rootId, 0);
    }

    // Add flat ID reference table — impossible for agents to miss
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('🚨 AVAILABLE NODE IDS — YOU MUST USE THESE EXACT IDs 🚨');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('DO NOT INVENT IDs. If a node does not exist in this list, you');
    lines.push('CANNOT use it as a parent_id or target_id. Create it first.');
    lines.push('───────────────────────────────────────────────────────────────');
    
    const allNodes = Object.values(nodes).sort((a, b) => a.type.localeCompare(b.type));
    for (const node of allNodes) {
        const parentInfo = node.parent_id ? ` (parent: ${node.parent_id})` : ' (ROOT)';
        lines.push(`  ${node.type.padEnd(12)} │ ID: ${node.id} │ "${node.name}"${parentInfo}`);
    }
    lines.push('───────────────────────────────────────────────────────────────');

    return lines.join('\n');
}

// =============================================================================
// PROGRESS CHECKLIST — What exists vs. what's needed
// =============================================================================

/**
 * Generates a progress checklist showing what structural elements exist.
 */
export function prepareProgressChecklist(project: PSGProject): string {
    const nodes = Object.values(project.nodes);
    const counts: Record<string, number> = {};

    for (const node of nodes) {
        counts[node.type] = (counts[node.type] || 0) + 1;
    }

    const lines: string[] = ['STRUCTURAL INVENTORY:'];
    const typeOrder = ['Floor', 'Slab', 'Room', 'Wall', 'Partition', 'Door', 'Window', 'Stairs', 'Roof', 'Balcony', 'Column', 'Beam', 'Chimney', 'Skylight'];

    for (const type of typeOrder) {
        if (counts[type]) {
            lines.push(`  ✓ ${type}: ${counts[type]}`);
            delete counts[type];
        }
    }

    // Any remaining types
    for (const [type, count] of Object.entries(counts)) {
        lines.push(`  ✓ ${type}: ${count}`);
    }

    if (nodes.length === 0) {
        lines.push('  (empty — no elements placed yet)');
    }

    lines.push(`  TOTAL: ${nodes.length} elements`);
    return lines.join('\n');
}


function round(value: number, decimals: number): number {
    const w = Math.pow(10, decimals);
    return Math.round(value * w) / w;
}

function formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
    }).format(amount);
}

/**
 * Prepares readable project context for the LLM.
 * Uses FULL readable key names: position, dimensions, rotation
 */
export function prepareProjectContext(project: PSGProject): string {
    const readableNodes: Record<string, unknown> = {};

    for (const [id, node] of Object.entries(project.nodes)) {
        const readable: Record<string, unknown> = {
            t: node.type,
            pos: [round(node.position.x, 4), round(node.position.y, 4), round(node.position.z, 4)],
            dim: [round(node.dimensions.x, 4), round(node.dimensions.y, 4), round(node.dimensions.z, 4)],
        };

        if (node.rotation.yaw !== 0) readable.yaw = node.rotation.yaw;
        if (node.parent_id) readable.p = node.parent_id;
        if (node.custom_geometry) readable.cg = node.custom_geometry;

        if (node.surface_matrix) {
            const matrixMeta = {
                range: [
                    node.surface_matrix.min_value ?? 0,
                    node.surface_matrix.max_value ?? 10,
                ],
                hole: node.surface_matrix.hole_threshold ?? 0.01,
                interp: node.surface_matrix.interpolation ?? 'bilinear',
            };
            if (node.surface_matrix.code) {
                readable.surface = {
                    mode: 'procedural',
                    desc: node.surface_matrix.description,
                    res: node.surface_matrix.resolution || 32,
                    ...matrixMeta,
                };
            } else {
                readable.surface = {
                    mode: 'data',
                    desc: node.surface_matrix.description,
                    grid: `${node.surface_matrix.rows}x${node.surface_matrix.cols}`,
                    ...matrixMeta,
                };
            }
        }

        readableNodes[id] = readable;
    }

    return JSON.stringify(readableNodes);
}

/**
 * Prepares a concise material library for the LLM context.
 */
export function prepareMaterialContext(materials: Record<string, Material>): string {
    const lines = Object.entries(materials).map(([id, mat]) => {
        return `${id}: ${mat.name} (${mat.category}, €${mat.price_per_m3}/m3)`;
    });
    return lines.join(' | ');
}

/**
 * Prepares human-readable budget context.
 */
export function prepareBudgetContext(project: PSGProject): string {
    const b = project.budget;
    const pct = b.total_budget > 0 ? ((b.spent / b.total_budget) * 100).toFixed(1) : '0.0';
    return `Total: ${formatCurrency(b.total_budget, b.currency)} | Spent: ${formatCurrency(b.spent, b.currency)} (${pct}%) | Remaining: ${formatCurrency(b.remaining, b.currency)}`;
}

// =============================================================================
// ASCII FLOOR PLAN GENERATOR
// =============================================================================

export function generateASCIIFloorPlan(project: PSGProject): string {
    const lines: string[] = [];
    const nodes = project.nodes;

    // Group rooms by floor
    const floors: Map<string, { floorNode: PSGNode; rooms: PSGNode[] }> = new Map();

    for (const node of Object.values(nodes)) {
        if (node.type === 'Floor') {
            floors.set(node.id, { floorNode: node, rooms: [] });
        }
    }

    for (const node of Object.values(nodes)) {
        if (node.type === 'Room' && node.parent_id && floors.has(node.parent_id)) {
            floors.get(node.parent_id)!.rooms.push(node);
        }
    }

    // If no explicit Floor nodes, try to find rooms directly
    if (floors.size === 0) {
        const rootRooms = Object.values(nodes).filter(n => n.type === 'Room');
        if (rootRooms.length > 0) {
            floors.set('default', {
                floorNode: { name: 'Ground Floor', position: { x: 0, y: 0, z: 0 } } as PSGNode,
                rooms: rootRooms,
            });
        }
    }

    // Sort floors by Y position
    const sortedFloors = [...floors.entries()].sort(
        (a, b) => a[1].floorNode.position.y - b[1].floorNode.position.y
    );

    for (const [floorId, { floorNode, rooms }] of sortedFloors) {
        lines.push(`═══ ${floorNode.name} (Y=${round(floorNode.position.y, 4)}m) [ID: ${floorId}] ═══`);

        if (rooms.length === 0) {
            lines.push('  (no rooms defined)');
            lines.push('');
            continue;
        }

        rooms.sort((a, b) => {
            const dz = a.position.z - b.position.z;
            if (Math.abs(dz) > 0.5) return dz;
            return a.position.x - b.position.x;
        });

        for (const room of rooms) {
            const w = round(room.dimensions.x, 3);
            const d = round(room.dimensions.z, 3);
            const cx = round(room.position.x, 4);
            const cz = round(room.position.z, 4);
            const area = round(w * d, 2);
            const fn = room.room_function ? ` [${room.room_function}]` : '';
            const tags = room.tags.length > 0 ? ` {${room.tags.join(', ')}}` : '';

            // Count child features
            const childNodes = room.children_ids.map(id => nodes[id]).filter(Boolean);
            const wallCount = childNodes.filter(c => c.type === 'Wall' || c.type === 'Partition').length;

            let windowCount = 0;
            let doorCount = 0;
            for (const child of childNodes) {
                if (child.type === 'Wall' || child.type === 'Partition') {
                    const wallKids = child.children_ids.map(id => nodes[id]).filter(Boolean);
                    windowCount += wallKids.filter(k => k.type === 'Window').length;
                    doorCount += wallKids.filter(k => k.type === 'Door').length;
                }
                if (child.type === 'Window') windowCount++;
                if (child.type === 'Door') doorCount++;
            }

            const features: string[] = [];
            if (wallCount > 0) features.push(`${wallCount} walls`);
            if (windowCount > 0) features.push(`${windowCount} windows`);
            if (doorCount > 0) features.push(`${doorCount} doors`);

            lines.push(
                `  ${room.name} (${w}×${d}m = ${area}m²) @ position(${cx}, ${cz})${fn}${tags}` +
                (features.length > 0 ? ` — ${features.join(', ')}` : '')
            );
            lines.push(`    ID: ${room.id}`);
        }

        // Show non-room children of the floor
        const floorChildren = floorNode.children_ids
            ? floorNode.children_ids.map(id => nodes[id]).filter(Boolean).filter(n => n.type !== 'Room')
            : [];

        for (const child of floorChildren) {
            if (child.type === 'Stairs') {
                lines.push(`  📶 ${child.name} (${child.stair_style || 'straight'}) @ position(${round(child.position.x, 4)}, ${round(child.position.z, 4)}) — ID: ${child.id}`);
            } else if (child.type === 'Slab') {
                lines.push(`  🟫 ${child.name} (${round(child.dimensions.x, 3)}×${round(child.dimensions.z, 3)}m) @ Y=${round(child.position.y, 4)} — ID: ${child.id}`);
            }
        }

        lines.push('');
    }

    if (lines.length === 0) {
        lines.push('No floors or rooms defined.');
    }

    return lines.join('\n');
}
