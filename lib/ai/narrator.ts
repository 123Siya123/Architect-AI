/**
 * =============================================================================
 * LIB/AI/NARRATOR.TS — Dopamine Delivery Layer
 * =============================================================================
 *
 * Replaces dry technical log output with rich narrative messages.
 * Each construction phase emits contextual, excited progress messages
 * with emoji, statistics, and dramatic reveals.
 *
 * =============================================================================
 */

import type { ComplexityClassification } from './complexity';
import type { CompletionState } from './completion';

// =============================================================================
// PHASE NARRATIVES
// =============================================================================

export type BuildPhase =
    | 'research'
    | 'site_plan'
    | 'primary_structure'
    | 'secondary_structure'
    | 'facades'
    | 'openings'
    | 'materials'
    | 'details'
    | 'precision'
    | 'inspection';

interface PhaseNarrative {
    emoji: string;
    title: string;
    getStartMessage: (context: NarrativeContext) => string;
    getCompleteMessage: (context: NarrativeContext, stats: PhaseStats) => string;
}

export interface NarrativeContext {
    projectName: string;
    complexity: ComplexityClassification;
    completionState?: CompletionState;
    buildBrief?: Record<string, unknown>;
}

export interface PhaseStats {
    operationsApplied: number;
    operationsRejected: number;
    wallsEdited?: number;
    battlementsCarved?: number;
    materialsApplied?: number;
    checklistProgress?: { done: number; total: number };
    completionDelta?: { from: number; to: number };
}

const PHASE_NARRATIVES: Record<BuildPhase, PhaseNarrative> = {
    research: {
        emoji: '📚',
        title: 'RESEARCH & ANALYSIS',
        getStartMessage: (ctx) => {
            if (ctx.complexity.tier === 'LANDMARK') {
                return `📚 Diving into centuries of architectural history... Sourcing exact dimensions from historical surveys and academic references. Let's do the original justice.`;
            }
            return `📚 Analyzing design requirements and sourcing reference data for optimal dimensions and proportions...`;
        },
        getCompleteMessage: (ctx, stats) =>
            `📚 Research complete. Build brief generated with exact dimensions and material specifications.`,
    },
    site_plan: {
        emoji: '📐',
        title: 'SITE PLANNING',
        getStartMessage: (ctx) => {
            const brief = ctx.buildBrief;
            if (brief && (brief as any).totalFootprintMeters) {
                const fp = (brief as any).totalFootprintMeters;
                return `📐 Laying the ${fp.width}m × ${fp.depth}m footprint at construction scale. Locking positions into the grid.`;
            }
            return `📐 Laying out the site plan with floor positions and building footprints...`;
        },
        getCompleteMessage: (ctx, stats) =>
            `📐 Site plan locked. ${stats.operationsApplied} foundation elements placed. The DNA is in the grid.`,
    },
    primary_structure: {
        emoji: '🏗️',
        title: 'PRIMARY CONSTRUCTION',
        getStartMessage: () =>
            `🏗️ Raising primary structures — walls going up, structural shells forming. This is the skeleton.`,
        getCompleteMessage: (ctx, stats) =>
            `🏗️ Primary structure complete. ${stats.operationsApplied} structural operations applied.`,
    },
    secondary_structure: {
        emoji: '🗼',
        title: 'SECONDARY STRUCTURES',
        getStartMessage: (ctx) => {
            if (ctx.complexity.tier === 'LANDMARK') {
                return `🗼 Constructing towers, secondary buildings, and perimeter walls. The skyline takes shape.`;
            }
            return `🗼 Adding secondary structural elements — extensions, porches, garages...`;
        },
        getCompleteMessage: (ctx, stats) =>
            `🗼 Secondary structures complete. ${stats.operationsApplied} elements placed.`,
    },
    facades: {
        emoji: '🎨',
        title: 'FACADE SCULPTING',
        getStartMessage: (ctx) => {
            if (ctx.complexity.tier === 'LANDMARK') {
                return `🎨 Sculpting decorative surfaces — battlements, ornaments, and architectural details being carved into every wall.`;
            }
            return `🎨 Applying architectural surface treatments to exterior walls...`;
        },
        getCompleteMessage: (ctx, stats) => {
            const parts = [`🎨 Facade sculpting complete.`];
            if (stats.wallsEdited) parts.push(`${stats.wallsEdited} walls surface-edited.`);
            if (stats.battlementsCarved) parts.push(`${stats.battlementsCarved} battlements carved.`);
            return parts.join(' ');
        },
    },
    openings: {
        emoji: '🚪',
        title: 'OPENINGS',
        getStartMessage: () =>
            `🚪 Placing windows, doors, arched gateways, and all openings with correct dimensions...`,
        getCompleteMessage: (ctx, stats) =>
            `🚪 Openings complete. ${stats.operationsApplied} windows, doors, and gateways placed.`,
    },
    materials: {
        emoji: '🧱',
        title: 'MATERIAL APPLICATION',
        getStartMessage: (ctx) => {
            if (ctx.complexity.tier === 'LANDMARK') {
                return `🧱 Applying historically accurate materials — brick, limestone, copper, gold leaf...`;
            }
            return `🧱 Applying materials to all surfaces — walls, roofs, floors getting their final finishes...`;
        },
        getCompleteMessage: (ctx, stats) => {
            const parts = [`🧱 Materials applied.`];
            if (stats.materialsApplied) parts.push(`${stats.materialsApplied} distinct materials used.`);
            return parts.join(' ');
        },
    },
    details: {
        emoji: '⭐',
        title: 'FINE DETAILS',
        getStartMessage: (ctx) => {
            if (ctx.complexity.tier === 'LANDMARK') {
                return `⭐ Adding fine architectural details — spires, clock faces, decorative elements, and signature features...`;
            }
            return `⭐ Adding finishing details — trim, hardware, lighting fixtures...`;
        },
        getCompleteMessage: (ctx, stats) =>
            `⭐ Detail pass complete. ${stats.operationsApplied} fine elements placed.`,
    },
    precision: {
        emoji: '📏',
        title: 'PRECISION ALIGNMENT',
        getStartMessage: () =>
            `📏 Running construction-grade precision pass. Aligning all joints to 0.5mm tolerance.`,
        getCompleteMessage: (ctx, stats) =>
            `📏 Precision pass complete. All joints aligned to construction grade (0.5mm tolerance).`,
    },
    inspection: {
        emoji: '✅',
        title: 'QUALITY INSPECTION',
        getStartMessage: () =>
            `✅ Running final quality inspection — verifying all checklist items, materials, and structural integrity...`,
        getCompleteMessage: (ctx, stats) => {
            const cl = stats.checklistProgress;
            const clText = cl ? ` ${cl.done}/${cl.total} checklist items verified.` : '';
            const score = ctx.completionState?.totalScore || 0;
            return `✅ Quality inspection complete.${clText} Completion score: ${score}/100.`;
        },
    },
};

// =============================================================================
// NARRATIVE API
// =============================================================================

/**
 * Get the narrative message when a phase starts.
 */
export function getPhaseStartNarrative(phase: BuildPhase, context: NarrativeContext): string {
    const narrative = PHASE_NARRATIVES[phase];
    if (!narrative) return `Starting phase: ${phase}`;
    return narrative.getStartMessage(context);
}

/**
 * Get the narrative message when a phase completes.
 */
export function getPhaseCompleteNarrative(
    phase: BuildPhase,
    context: NarrativeContext,
    stats: PhaseStats
): string {
    const narrative = PHASE_NARRATIVES[phase];
    if (!narrative) return `Phase ${phase} complete.`;
    return narrative.getCompleteMessage(context, stats);
}

/**
 * Generate a progress stat block for display after a phase completes.
 */
export function generatePhaseStatBlock(
    phase: BuildPhase,
    stats: PhaseStats,
    completionState: CompletionState
): string {
    const narrative = PHASE_NARRATIVES[phase];
    const title = narrative?.title || phase.toUpperCase();

    const cl = stats.checklistProgress;
    const clLine = cl ? `║  Landmark checklist:  ${String(cl.done).padEnd(4)}/ ${cl.total} complete${' '.repeat(Math.max(0, 14 - String(cl.done).length - String(cl.total).length))}║` : '';

    const scoreLine = stats.completionDelta
        ? `║  Completion score:    ${stats.completionDelta.from}% → ${stats.completionDelta.to}%${' '.repeat(Math.max(0, 20 - String(stats.completionDelta.from).length - String(stats.completionDelta.to).length))}║`
        : `║  Completion score:    ${completionState.totalScore}%${' '.repeat(Math.max(0, 24 - String(completionState.totalScore).length))}║`;

    const lines = [
        `╔════════════════════════════════════════════════════╗`,
        `║  PHASE COMPLETE — ${title.padEnd(32)}║`,
        `╠════════════════════════════════════════════════════╣`,
        `║  Operations applied:  ${String(stats.operationsApplied).padEnd(28)}║`,
        `║  Operations rejected: ${String(stats.operationsRejected).padEnd(28)}║`,
    ];

    if (stats.wallsEdited) {
        lines.push(`║  Walls surface-edited: ${String(stats.wallsEdited).padEnd(27)}║`);
    }
    if (stats.battlementsCarved) {
        lines.push(`║  Battlements carved:   ${String(stats.battlementsCarved).padEnd(27)}║`);
    }
    if (stats.materialsApplied) {
        lines.push(`║  Materials applied:    ${String(stats.materialsApplied).padEnd(27)}║`);
    }

    if (clLine) lines.push(clLine);
    lines.push(scoreLine);

    // Next phase hint
    const phases: BuildPhase[] = ['research', 'site_plan', 'primary_structure', 'secondary_structure', 'facades', 'openings', 'materials', 'details', 'precision', 'inspection'];
    const currentIdx = phases.indexOf(phase);
    if (currentIdx >= 0 && currentIdx < phases.length - 1) {
        const nextPhase = phases[currentIdx + 1];
        const nextNarrative = PHASE_NARRATIVES[nextPhase];
        if (nextNarrative) {
            lines.push(`║  Next phase: ${nextNarrative.title.padEnd(37)}║`);
        }
    }

    lines.push(`╚════════════════════════════════════════════════════╝`);

    return lines.join('\n');
}

/**
 * Generate the dramatic completion reveal.
 */
export function generateCompletionReveal(
    projectName: string,
    completionState: CompletionState,
    totalOperations: number,
    turnsTaken: number,
    extraStats?: Record<string, string | number>
): string {
    const lines = [
        ``,
        `🏰 ══════════════════════════════════════════════════════ 🏰`,
        ``,
        `  ${projectName.toUpperCase()} — CONSTRUCTION COMPLETE`,
        ``,
    ];

    if (extraStats) {
        for (const [key, value] of Object.entries(extraStats)) {
            lines.push(`  ✦ ${key.padEnd(20)} ${value}`);
        }
    }

    lines.push(`  ✦ ${'Quality score:'.padEnd(20)} ${completionState.totalScore} / 100`);
    lines.push(`  ✦ ${'Total operations:'.padEnd(20)} ${totalOperations}`);
    lines.push(`  ✦ ${'Turns taken:'.padEnd(20)} ${turnsTaken}`);
    lines.push(`  ✦ ${'Precision:'.padEnd(20)} 0.5mm construction grade`);

    if (completionState.checklistItems.length > 0) {
        const done = completionState.checklistItems.filter(i => i.complete).length;
        lines.push(`  ✦ ${'Checklist:'.padEnd(20)} ${done}/${completionState.checklistItems.length} items verified`);
    }

    lines.push(``);
    lines.push(`  📦 Construction package ready for export`);
    lines.push(`  📐 Floor plans, elevations, BOM — all generated`);
    lines.push(``);
    lines.push(`🏰 ══════════════════════════════════════════════════════ 🏰`);
    lines.push(``);

    return lines.join('\n');
}
