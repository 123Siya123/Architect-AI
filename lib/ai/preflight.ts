import { wallCenterY } from './geometry-formulas';
import { IdempotencyRegistry } from './idempotency-registry';

export interface PreflightResult {
    passed: boolean;
    blockers: string[];
    warnings: string[];
    suggestedAbsoluteY: number | null;
}

export function runPreflightChecks(
    proposedNode: any, // ProposedNode type
    graph: any,        // BuildingGraph type
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
        const supportFloor = graph.getFloorAtY(proposedNode.bottomY - 0.001);
        if (!supportFloor) {
            blockers.push(`UNSUPPORTED: No floor slab exists at Y=${proposedNode.bottomY}. Create floor first.`);
        } else {
            const correctY = wallCenterY(supportFloor.topY, proposedNode.height);
            if (Math.abs(proposedNode.centerY - correctY) > 0.001) {
                warnings.push(`Y_CORRECTION: Adjusting wall center from ${proposedNode.centerY} to ${correctY}`);
                proposedNode.centerY = correctY; // Auto-correct before creation
            }
        }
    }

    // CHECK 3: Boundary — is this within the building footprint?
    if (graph.isWithinBuildingBounds && !graph.isWithinBuildingBounds(proposedNode)) {
        warnings.push(`BOUNDARY: Element extends outside building footprint`);
    }

    // CHECK 4: Collision — does this intersect any existing element?
    if (graph.getCollisions) {
        const collisions = graph.getCollisions(proposedNode);
        if (collisions.length > 0) {
            blockers.push(`COLLISION: Intersects ${collisions.map((c: any) => c.id).join(", ")}`);
        }
    }

    return { passed: blockers.length === 0, blockers, warnings, suggestedAbsoluteY: proposedNode.centerY };
}
