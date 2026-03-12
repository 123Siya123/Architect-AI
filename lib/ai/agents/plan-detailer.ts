/**
 * =============================================================================
 * LIB/AI/AGENTS/PLAN-DETAILER.TS — Opening & Layout Specialist
 * =============================================================================
 */

import { PSGNode, PSGProject } from '@/types';

/**
 * Summarizes the current structural shell for the Plan Detailer.
 * Lists all walls and floors that need openings or furniture.
 */
export function prepareShellContext(project: PSGProject): string {
    const nodes = Object.values(project.nodes);
    const shells = nodes.filter(n => ['Wall', 'Partition', 'Floor', 'Slab', 'Room'].includes(n.type));
    
    if (shells.length === 0) return "No structural shell found. Wait for Structural Engineer.";

    const lines = shells.map(n => {
        const children = n.children_ids.length;
        return `  [${n.id}] ${n.type}: "${n.name}" at [${n.position.x}, ${n.position.y}, ${n.position.z}], size [${n.dimensions.x}, ${n.dimensions.y}, ${n.dimensions.z}], children: ${children}`;
    });

    return `STRUCTURAL SHELL:\n${lines.join('\n')}`;
}
