import { PSGProject, PSGNode, PSGOperation } from '@/types';
import { IdempotencyRegistry } from './idempotency-registry';
import { wallCenterY } from './geometry-formulas';

export interface PreflightResult {
    passed: boolean;
    blockers: string[];
    warnings: string[];
    suggestedAbsoluteY: number | null;
}

export interface ProposedNode {
    type: string;
    semanticRole: string;
    centerY: number;
    bottomY: number;
    height: number;
    // ...
}

export function runPreflightChecks(
    proposedNode: any, // Using any for now to keep it flexible
    project: PSGProject,
    registry: IdempotencyRegistry
): PreflightResult {
    const blockers: string[] = [];
    const warnings: string[] = [];

    // CHECK 1: Idempotency — does this semantic role already exist?
    const existing = registry.checkExists(proposedNode.semanticRole);
    if (existing) {
        blockers.push(`DUPLICATE: ${proposedNode.semanticRole} already exists as ${existing.id}. Use set_node_position instead.`);
        return { passed: false, blockers, warnings, suggestedAbsoluteY: null };
    }

    // CHECK 2: Support — is there a floor below this element?
    if (proposedNode.type === "Wall" || proposedNode.type === "Column") {
        // This requires a helper to find floor at Y. For now simple check.
        const floors = Object.values(project.nodes).filter(n => n.type === 'Floor' || n.type === 'Slab');
        const supportFloor = floors.find(f => Math.abs(f.position.y + f.dimensions.y / 2 - proposedNode.bottomY) < 0.1);

        if (!supportFloor) {
            blockers.push(`UNSUPPORTED: No floor slab exists at Y=${proposedNode.bottomY}. Create floor first.`);
        } else {
            const floorTopY = supportFloor.position.y + supportFloor.dimensions.y / 2;
            const correctY = wallCenterY(floorTopY, proposedNode.height);
            if (Math.abs(proposedNode.centerY - correctY) > 0.001) {
                warnings.push(`Y_CORRECTION: Adjusting wall center from ${proposedNode.centerY} to ${correctY}`);
                proposedNode.centerY = correctY; // Auto-correct
            }
        }
    }

    // CHECK 3: Boundary — simplified
    // CHECK 4: Collision — simplified

    return { passed: blockers.length === 0, blockers, warnings, suggestedAbsoluteY: proposedNode.centerY };
}
