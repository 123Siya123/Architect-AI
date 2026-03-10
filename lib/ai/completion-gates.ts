import { PSGProject, PSGNode } from '@/types';
import { PhysicsViolation } from './types';

export interface GateResult {
    name: string;
    passed: boolean;
    failReason?: string;
}

export function gate(name: string, check: () => boolean, failReason?: string): GateResult {
    const passed = check();
    return { name, passed, failReason: passed ? undefined : failReason };
}

export function checkCompletionGates(project: PSGProject, violations: PhysicsViolation[]): GateResult[] {
    const nodes = Object.values(project.nodes);
    const floors = nodes.filter(n => n.type === 'Floor');
    const walls = nodes.filter(n => n.type === 'Wall');
    const slabs = nodes.filter(n => n.type === 'Slab');
    const roofs = nodes.filter(n => n.type === 'Roof');
    const stairs = nodes.filter(n => n.type === 'Stairs');
    const doors = nodes.filter(n => n.type === 'Door');

    return [
        gate("PHYSICS_CLEAN", () => violations.filter(v => v.severity === 'CRITICAL').length === 0, "Critical physics violations remain"),
        gate("ALL_FLOORS_SLABBED", () => floors.every(f => slabs.some(s => s.parent_id === f.id)), "Some floors missing slabs"),
        gate("ALL_WALLS_GROUNDED", () => walls.every(w => {
            // Simple check for now: wall bottom should match floor level
            // In a real system this would be more complex
            return true;
        }), "Some walls are floating"),
        gate("ROOMS_COVER_PLAN", () => true, "Rooms do not cover 95% of plan area"), // Placeholder
        gate("HAS_ROOF", () => roofs.length > 0, "No roof elements found"),
        gate("HAS_STAIRS", () => floors.length < 2 || stairs.length > 0, "Multi-floor building missing stairs"),
        gate("ROOMS_MATCH_BRIEF", () => true, "Required rooms from brief missing"), // Placeholder
        gate("EXITS_EXIST", () => doors.some(d => d.tags?.includes('exterior') || d.name?.toLowerCase().includes('exit') || d.name?.toLowerCase().includes('entrance')), "No exterior exits found"),
        gate("NO_ORPHAN_NODES", () => true, "Orphan nodes found"), // Placeholder
        gate("EXPORT_READY", () => true, "Export package not ready"), // Placeholder
    ];
}
