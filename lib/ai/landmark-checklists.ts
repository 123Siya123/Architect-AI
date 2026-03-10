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
const KNOWN_LANDMARKS: Record<string, ChecklistItem[]> = {
    kremlin: [
        { id: 'kremlin_perimeter', description: 'Triangular perimeter wall (3 sides, 2.235km total)', requiredNodeType: 'Wall', priority: 'P0', complete: false, nodeIds: [] },
        { id: 'kremlin_towers', description: '20 towers at correct positions along perimeter', requiredNodeType: 'Custom', priority: 'P0', complete: false, nodeIds: [] },
        { id: 'kremlin_spasskaya', description: 'Spasskaya Tower (68m, main entrance, clock face)', requiredNodeType: 'Custom', priority: 'P0', complete: false, nodeIds: [] },
        { id: 'kremlin_palace', description: 'Grand Kremlin Palace (125m wide)', requiredNodeType: 'Room', priority: 'P0', complete: false, nodeIds: [] },
        { id: 'kremlin_dormition', description: 'Cathedral of the Dormition (5 gold onion domes)', requiredNodeType: 'Room', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'kremlin_archangel', description: 'Cathedral of the Archangel (5 gold domes)', requiredNodeType: 'Room', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'kremlin_bell_tower', description: 'Ivan the Great Bell Tower (81m, white+gold)', requiredNodeType: 'Custom', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'kremlin_arsenal', description: 'Arsenal building (yellow facade)', requiredNodeType: 'Room', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'kremlin_senate', description: 'Senate building (green dome, 1787)', requiredNodeType: 'Room', priority: 'P2', complete: false, nodeIds: [] },
        { id: 'kremlin_borovitskaya', description: 'Borovitskaya Tower gate (arched gateway)', requiredNodeType: 'Custom', priority: 'P2', complete: false, nodeIds: [] },
        { id: 'kremlin_brick', description: 'Red brick wall material on entire perimeter', requiredNodeType: 'Wall', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'kremlin_green_roof', description: 'Green copper roof on palace buildings', requiredNodeType: 'Roof', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'kremlin_stars', description: 'Ruby stars on 5 main towers', requiredNodeType: 'Custom', priority: 'P2', complete: false, nodeIds: [] },
        { id: 'kremlin_merlons', description: 'Swallow-tail (Ghibelline) merlons on all walls', requiredNodeType: 'Wall', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'kremlin_precision', description: 'solve_precision() called for construction grade', requiredNodeType: '', priority: 'P0', complete: false, nodeIds: [] },
    ],
    white_house: [
        { id: 'wh_main', description: 'Main residence building (center section)', requiredNodeType: 'Room', priority: 'P0', complete: false, nodeIds: [] },
        { id: 'wh_east_wing', description: 'East Wing', requiredNodeType: 'Room', priority: 'P0', complete: false, nodeIds: [] },
        { id: 'wh_west_wing', description: 'West Wing (Oval Office)', requiredNodeType: 'Room', priority: 'P0', complete: false, nodeIds: [] },
        { id: 'wh_portico_north', description: 'North Portico with columns', requiredNodeType: 'Column', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'wh_portico_south', description: 'South Portico with curved facade', requiredNodeType: 'Column', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'wh_columns', description: 'Neoclassical columns (Ionic order)', requiredNodeType: 'Column', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'wh_roof', description: 'Flat roof with balustrade', requiredNodeType: 'Roof', priority: 'P0', complete: false, nodeIds: [] },
        { id: 'wh_windows', description: 'Symmetrical window arrangement (134 windows)', requiredNodeType: 'Window', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'wh_white_paint', description: 'White painted exterior (Aquia Creek sandstone)', requiredNodeType: 'Wall', priority: 'P1', complete: false, nodeIds: [] },
        { id: 'wh_precision', description: 'solve_precision() called', requiredNodeType: '', priority: 'P0', complete: false, nodeIds: [] },
    ],
};

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
