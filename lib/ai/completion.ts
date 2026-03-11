/**
 * =============================================================================
 * LIB/AI/COMPLETION.TS — Multi-Condition Completion Scoring Engine
 * =============================================================================
 *
 * FIX FOR BUG #2: Catastrophically premature AUTO STOP.
 * 
 * Replaces the single physics-valid gate with a multi-stage scoring system.
 * Auto-stop only fires when:
 *   - totalScore >= 95
 *   - physicsValid === true
 *   - turnCount >= minTurnsForComplexity
 *   - All landmark checklist items are complete
 *
 * =============================================================================
 */

import type { PSGNode, PSGProject } from '@/types';
import type { ComplexityClassification } from './complexity';

// =============================================================================
// TYPES
// =============================================================================

export interface ChecklistItem {
    id: string;
    description: string;
    requiredNodeType: string;
    priority: 'P0' | 'P1' | 'P2';
    complete: boolean;
    nodeIds: string[];
}

export interface CompletionState {
    structuralScore: number;    // 0-30: foundation, walls, roof, floors present and valid
    detailScore: number;        // 0-30: windows, doors, stairs, balconies, ornaments
    materialScore: number;      // 0-20: all surfaces have non-default materials
    landmarkScore: number;      // 0-20: landmark checklist items completed (0 if not landmark)
    totalScore: number;         // sum of above — must reach 95 to auto-stop
    physicsValid: boolean;
    checklistItems: ChecklistItem[];
    missingElements: string[];
    autoStopAllowed: boolean;
    reason: string;
}

// Default materials that don't count as "applied"
const DEFAULT_MATERIALS = ['', 'default', 'mat_default', 'mat_plaster_white'];

// =============================================================================
// SCORING ENGINE
// =============================================================================

/**
 * Evaluate the current completion state of the project.
 * Returns a detailed scoring breakdown and whether auto-stop is allowed.
 */
export function evaluateCompletionState(
    project: PSGProject,
    complexity: ComplexityClassification,
    pendingViolations: Array<{ severity: string; issue: string }>,
    currentTurn: number,
    checklistItems: ChecklistItem[] = []
): CompletionState {
    const nodes = Object.values(project.nodes);
    const count = (type: PSGNode['type']) => nodes.filter(n => n.type === type).length;

    // --- STRUCTURAL SCORE (0-30) ---
    let structuralScore = 0;
    const missingElements: string[] = [];

    const floors = count('Floor');
    const rooms = count('Room');
    const walls = count('Wall') + count('Partition');
    const roofs = count('Roof');
    const foundations = count('Foundation');
    const slabs = count('Slab');
    const stairs = count('Stairs');

    // Foundation/Floor (0-8)
    if (floors >= complexity.requiredFloors) {
        structuralScore += 8;
    } else {
        structuralScore += Math.floor((floors / complexity.requiredFloors) * 8);
        missingElements.push(`${complexity.requiredFloors - floors} more floor(s)`);
    }

    // Walls (0-8)
    const requiredWalls = complexity.requiredFloors * 4;
    if (walls >= requiredWalls) {
        structuralScore += 8;
    } else {
        structuralScore += Math.floor((walls / requiredWalls) * 8);
        missingElements.push(`${requiredWalls - walls} more wall(s)`);
    }

    // Roof (0-6)
    if (roofs >= 1) {
        structuralScore += 6;
    } else {
        missingElements.push('roof');
    }

    // Rooms (0-4)
    if (rooms >= complexity.requiredFloors) {
        structuralScore += 4;
    } else {
        structuralScore += Math.floor((rooms / Math.max(1, complexity.requiredFloors)) * 4);
        missingElements.push('more rooms');
    }

    // Stairs for multi-floor (0-4)
    if (complexity.requiredFloors > 1) {
        if (stairs >= 1) {
            structuralScore += 4;
        } else {
            missingElements.push('stairs');
        }
    } else {
        structuralScore += 4; // N/A — full score
    }

    // --- DETAIL SCORE (0-30) ---
    let detailScore = 0;

    const doors = count('Door');
    const windows = count('Window');
    const balconies = count('Balcony');
    const columns = count('Column');
    const beams = count('Beam');
    const customs = count('Custom');

    // Doors (0-8)
    const minDoors = Math.max(1, complexity.requiredFloors);
    if (doors >= minDoors) {
        detailScore += 8;
    } else if (doors > 0) {
        detailScore += Math.floor((doors / minDoors) * 8);
    } else {
        missingElements.push('entrance door');
    }

    // Windows (0-10)
    const minWindows = Math.max(4, complexity.requiredFloors * 3);
    if (windows >= minWindows) {
        detailScore += 10;
    } else {
        detailScore += Math.floor((windows / minWindows) * 10);
        if (windows < 2) missingElements.push('windows');
    }

    // Additional details (0-12) — balconies, columns, custom elements
    const detailItems = balconies + columns + beams + customs;
    if (complexity.tier === 'TRIVIAL' || complexity.tier === 'STANDARD') {
        detailScore += 12; // No extra details required for simple builds
    } else {
        const requiredDetails = complexity.tier === 'LANDMARK' ? 5 : complexity.tier === 'MEGA' ? 8 : 3;
        detailScore += Math.min(12, Math.floor((detailItems / requiredDetails) * 12));
    }

    // --- MATERIAL SCORE (0-20) ---
    let materialScore = 0;
    const totalNonRootNodes = nodes.filter(n => n.type !== 'House');
    const materialApplied = totalNonRootNodes.filter(n =>
        n.material_id && !DEFAULT_MATERIALS.includes(n.material_id)
    );

    if (totalNonRootNodes.length === 0) {
        materialScore = 0;
    } else {
        const ratio = materialApplied.length / totalNonRootNodes.length;
        materialScore = Math.round(ratio * 20);
    }

    if (materialScore < 10 && totalNonRootNodes.length > 5) {
        missingElements.push('material assignments');
    }

    // --- LANDMARK SCORE (0-20) ---
    let landmarkScore = 0;
    if (complexity.requiresLandmarkChecklist && checklistItems.length > 0) {
        const completedItems = checklistItems.filter(item => item.complete);
        landmarkScore = Math.round((completedItems.length / checklistItems.length) * 20);

        const incompleteP0 = checklistItems.filter(item => !item.complete && item.priority === 'P0');
        if (incompleteP0.length > 0) {
            missingElements.push(`${incompleteP0.length} critical landmark items`);
        }
    } else if (!complexity.requiresLandmarkChecklist) {
        landmarkScore = 20; // N/A — full score
    }

    // --- TOTAL ---
    const totalScore = structuralScore + detailScore + materialScore + landmarkScore;

    // --- PHYSICS CHECK ---
    const criticalViolations = pendingViolations.filter(v => v.severity === 'CRITICAL');
    const physicsValid = criticalViolations.length === 0;

    // --- AUTO-STOP DECISION ---
    const allChecklistComplete = checklistItems.length === 0 ||
        checklistItems.every(item => item.complete);
    const meetsMinTurns = currentTurn >= complexity.minTurns;

    const autoStopAllowed =
        totalScore >= 95 &&
        physicsValid &&
        meetsMinTurns &&
        allChecklistComplete;

    let reason = '';
    if (!autoStopAllowed) {
        const reasons: string[] = [];
        if (totalScore < 95) reasons.push(`score ${totalScore}/95`);
        if (!physicsValid) reasons.push(`${criticalViolations.length} critical violations`);
        if (!meetsMinTurns) reasons.push(`turn ${currentTurn}/${complexity.minTurns} min`);
        if (!allChecklistComplete) reasons.push('checklist incomplete');
        reason = `CONTINUE: ${reasons.join(', ')}`;
    } else {
        reason = `COMPLETE: score=${totalScore}, physics=valid, turns=${currentTurn}`;
    }

    return {
        structuralScore,
        detailScore,
        materialScore,
        landmarkScore,
        totalScore,
        physicsValid,
        checklistItems,
        missingElements,
        autoStopAllowed,
        reason,
    };
}

/**
 * Format completion state for agent context injection.
 */
export function formatCompletionState(state: CompletionState): string {
    const lines = [
        `COMPLETION STATE:`,
        `  Structural:  ${state.structuralScore}/30`,
        `  Detail:      ${state.detailScore}/30`,
        `  Materials:   ${state.materialScore}/20`,
        `  Landmark:    ${state.landmarkScore}/20`,
        `  ─────────────────`,
        `  TOTAL:       ${state.totalScore}/100`,
        `  Physics:     ${state.physicsValid ? '✅ VALID' : '❌ VIOLATIONS'}`,
        `  Auto-Stop:   ${state.autoStopAllowed ? '✅ ALLOWED' : '⛔ BLOCKED'}`,
        `  Status:      ${state.reason}`,
    ];

    if (state.missingElements.length > 0) {
        lines.push(`  Missing:     ${state.missingElements.join(', ')}`);
    }

    if (state.checklistItems.length > 0) {
        const done = state.checklistItems.filter(i => i.complete).length;
        lines.push(`  Checklist:   ${done}/${state.checklistItems.length} items complete`);
    }

    return lines.join('\n');
}

/**
 * Update checklist items by scanning the scene tree.
 * MONOTONIC: Once an item is marked complete, it stays complete.
 * This prevents the scoring oscillation bug where the landmark score
 * would jump from 2/20 to 20/20 and back based on fuzzy name matching.
 */
export function updateChecklist(
    checklistItems: ChecklistItem[],
    project: PSGProject
): ChecklistItem[] {
    const nodes = Object.values(project.nodes);

    return checklistItems.map(item => {
        // MONOTONIC: If already complete, keep it complete
        if (item.complete) {
            // Only verify the nodes still exist
            const existingIds = item.nodeIds.filter(id => project.nodes[id]);
            return {
                ...item,
                complete: true, // Never un-complete
                nodeIds: existingIds.length > 0 ? existingIds : item.nodeIds,
            };
        }

        const matchingNodes = findMatchingNodes(item, nodes);
        return {
            ...item,
            complete: matchingNodes.length > 0,
            nodeIds: matchingNodes.map(n => n.id),
        };
    });
}

/**
 * Find nodes in the scene that match a checklist item.
 * Improved: uses significant keywords only (≥4 chars, excludes stopwords),
 * and requires fewer matches for short descriptions.
 */
function findMatchingNodes(item: ChecklistItem, nodes: PSGNode[]): PSGNode[] {
    const desc = item.description.toLowerCase();
    const type = item.requiredNodeType.toLowerCase();

    // Skip non-node checklist items (like "solve_precision() called")
    if (!type) return [];

    const STOPWORDS = new Set(['with', 'from', 'that', 'this', 'must', 'have', 'been', 'should', 'called', 'total', 'style', 'along', 'entire']);

    return nodes.filter(node => {
        // Type match — check node type or node name contains the type keyword
        if (type && !node.type.toLowerCase().includes(type) &&
            !node.name.toLowerCase().includes(type)) {
            return false;
        }

        // Name match (fuzzy but more stable)
        const nodeName = node.name.toLowerCase();
        const keywords = desc.split(/[\s,()]+/)
            .filter(w => w.length >= 4 && !STOPWORDS.has(w));

        if (keywords.length === 0) return false;

        const matchCount = keywords.filter(kw => nodeName.includes(kw)).length;

        // Require at least 1 keyword match for short descriptions, 2 for longer
        const threshold = keywords.length <= 3 ? 1 : 2;
        return matchCount >= threshold;
    });
}

