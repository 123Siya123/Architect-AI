import type { PSGProject, PSGNode, Material } from '@/types';

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
            pos: [round(node.position.x, 2), round(node.position.y, 2), round(node.position.z, 2)],
            dim: [round(node.dimensions.x, 2), round(node.dimensions.y, 2), round(node.dimensions.z, 2)],
        };

        if (node.rotation.yaw !== 0) readable.yaw = node.rotation.yaw;
        if (node.parent_id) readable.p = node.parent_id;
        if (node.custom_geometry) readable.cg = node.custom_geometry;

        if (node.surface_matrix) {
            readable.surface = {
                desc: node.surface_matrix.description,
                grid: `${node.surface_matrix.rows}x${node.surface_matrix.cols}`
            };
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
        lines.push(`═══ ${floorNode.name} (Y=${round(floorNode.position.y, 1)}m) [ID: ${floorId}] ═══`);

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
            const w = round(room.dimensions.x, 1);
            const d = round(room.dimensions.z, 1);
            const cx = round(room.position.x, 1);
            const cz = round(room.position.z, 1);
            const area = round(w * d, 1);
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
                lines.push(`  📶 ${child.name} (${child.stair_style || 'straight'}) @ position(${round(child.position.x, 1)}, ${round(child.position.z, 1)}) — ID: ${child.id}`);
            } else if (child.type === 'Slab') {
                lines.push(`  🟫 ${child.name} (${round(child.dimensions.x, 1)}×${round(child.dimensions.z, 1)}m) @ Y=${round(child.position.y, 1)} — ID: ${child.id}`);
            }
        }

        lines.push('');
    }

    if (lines.length === 0) {
        lines.push('No floors or rooms defined.');
    }

    return lines.join('\n');
}
