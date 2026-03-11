/**
 * =============================================================================
 * LIB/AI/LANDMARK-CHECKLISTS.TS — Landmark Checklist Engine
 * =============================================================================
 *
 * FIX FOR BUG #2 (extended): The most important new feature for ensuring
 * complex requests produce jaw-dropping results.
 *
 * When the complexity classifier returns LANDMARK tier, the research_specialist
 * generates a landmark checklist as part of the buildBrief. This checklist
 * becomes the completion contract — auto-stop is gated on ALL items being
 * marked complete.
 *
 * =============================================================================
 */

import type { ChecklistItem } from './completion';

// =============================================================================
// KNOWN LANDMARK CHECKLISTS
// =============================================================================

/**
 * Pre-defined checklist hints for well-known landmarks.
 * The research_specialist may augment these with additional items.
 */
const KNOWN_LANDMARKS: Record<string, ChecklistItem[]> = {};

// =============================================================================
// CHECKLIST GENERATION
// =============================================================================

/**
 * Look up a pre-defined checklist for a known landmark.
 * Returns null if no pre-defined checklist exists.
 */
export function getKnownLandmarkChecklist(message: string): ChecklistItem[] | null {
    const normalized = message.toLowerCase();

    for (const [keyword, checklist] of Object.entries(KNOWN_LANDMARKS)) {
        if (normalized.includes(keyword)) {
            // Deep clone to avoid mutation
            return JSON.parse(JSON.stringify(checklist));
        }
    }

    return null;
}

/**
 * Parse checklist items from the research specialist's buildBrief output.
 */
export function parseChecklistFromBrief(
    landmarkChecklistItems: string[]
): ChecklistItem[] {
    return landmarkChecklistItems.map((desc, i) => ({
        id: `checklist_${i}`,
        description: desc,
        requiredNodeType: inferNodeType(desc),
        priority: inferPriority(desc),
        complete: false,
        nodeIds: [],
    }));
}

/**
 * Merge a known checklist with research-generated items,
 * deduplicating entries that cover the same concept.
 */
export function mergeChecklists(
    known: ChecklistItem[],
    researched: ChecklistItem[]
): ChecklistItem[] {
    const merged = [...known];

    for (const item of researched) {
        const isDuplicate = merged.some(existing =>
            existing.description.toLowerCase().includes(item.description.toLowerCase().substring(0, 20)) ||
            item.description.toLowerCase().includes(existing.description.toLowerCase().substring(0, 20))
        );

        if (!isDuplicate) {
            merged.push(item);
        }
    }

    return merged;
}

/**
 * Format checklist for agent context injection.
 */
export function formatChecklist(items: ChecklistItem[]): string {
    if (items.length === 0) return '';

    const lines = [`LANDMARK CHECKLIST (${items.filter(i => i.complete).length}/${items.length} complete):`];

    for (const item of items) {
        const status = item.complete ? '✅' : '⬜';
        const priority = item.priority;
        lines.push(`  ${status} [${priority}] ${item.description}`);
        if (item.nodeIds.length > 0) {
            lines.push(`      nodes: ${item.nodeIds.join(', ')}`);
        }
    }

    return lines.join('\n');
}

// =============================================================================
// HELPERS
// =============================================================================

function inferNodeType(description: string): string {
    const desc = description.toLowerCase();
    if (desc.includes('wall') || desc.includes('perimeter')) return 'Wall';
    if (desc.includes('tower') || desc.includes('dome') || desc.includes('star') || desc.includes('clock')) return 'Custom';
    if (desc.includes('cathedral') || desc.includes('palace') || desc.includes('building') || desc.includes('arsenal')) return 'Room';
    if (desc.includes('roof') || desc.includes('copper')) return 'Roof';
    if (desc.includes('column')) return 'Column';
    if (desc.includes('window')) return 'Window';
    if (desc.includes('door') || desc.includes('gate')) return 'Door';
    if (desc.includes('material') || desc.includes('brick') || desc.includes('paint')) return 'Wall';
    if (desc.includes('precision') || desc.includes('solve')) return '';
    return '';
}

function inferPriority(description: string): 'P0' | 'P1' | 'P2' {
    const desc = description.toLowerCase();
    if (desc.includes('critical') || desc.includes('main') || desc.includes('primary') || desc.includes('perimeter') || desc.includes('precision')) return 'P0';
    if (desc.includes('important') || desc.includes('major') || desc.includes('material') || desc.includes('roof')) return 'P1';
    return 'P2';
}
