/**
 * =============================================================================
 * LIB/AI/AGENTS/QUALITY-INSPECTOR.TS — Final Audit Agent
 * =============================================================================
 *
 * The final agent called in the last phase. It does not build — it audits.
 * It walks every checklist item, scans for duplicates, verifies materials,
 * checks roof styles, and outputs a structured quality report.
 *
 * =============================================================================
 */

// =============================================================================
// QUALITY REPORT SCHEMA
// =============================================================================

export interface QualityReport {
    overallScore: number;           // 0-100
    passedItems: string[];
    failedItems: string[];
    duplicateNodes: Array<{
        type: string;
        parentId: string;
        nodeIds: string[];
    }>;
    missingMaterials: string[];     // Node IDs with default materials
    floatingElements: string[];     // Node IDs not supported by parent
    recommendations: string[];
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

export const QUALITY_INSPECTOR_PROMPT = `You are the Quality Inspector. You receive the complete scene tree and the landmark checklist. Your job:

1. Walk every checklist item and verify it is physically present in the scene tree.
2. Scan for duplicate nodes of the same type under the same parent — report any found.
3. Verify all walls have non-default materials.
4. Verify all roof nodes have correct roof_style set (not 'flat' for landmark architecture unless historically accurate).
5. Verify no floating elements (every node's Y position must be supported by a parent structure).
6. Output a QualityReport JSON with: overallScore (0-100), passedItems[], failedItems[], duplicateNodes[], missingMaterials[], floatingElements[].

If overallScore < 90, list which failed items should be delegated to which specialist agent:
- Missing structures → structural_engineer
- Missing surface details → facade_artist
- Missing materials → materials_specialist
- Missing fine details → detail_specialist
- Structural violations → structural_engineer

OUTPUT FORMAT (strict JSON):
{
  "overallScore": 95,
  "passedItems": ["Perimeter wall verified", "20 towers present", ...],
  "failedItems": ["Ruby stars missing on towers 3 and 7"],
  "duplicateNodes": [],
  "missingMaterials": ["node_id_123", "node_id_456"],
  "floatingElements": [],
  "recommendations": [
    "delegate to detail_specialist: Add ruby stars to towers 3 and 7",
    "delegate to materials_specialist: Apply material to 2 unmarked walls"
  ]
}

CRITICAL RULES:
1. Do NOT call any construction tools — you are read-only.
2. Be thorough — check EVERY checklist item.
3. For duplicates: scan every parent's children for same-type siblings (especially Roof, Floor, Foundation).
4. Material check: "default", "", "mat_default", "mat_plaster_white" all count as "missing".
5. Float check: Wall must sit on Floor/Slab. Roof must sit on Wall. Window/Door must sit in Wall.
6. Score calculation:
   - Start at 100
   - -5 for each failed P0 checklist item
   - -3 for each failed P1 item
   - -1 for each failed P2 item
   - -3 for each duplicate node pair
   - -1 for each missing material
   - -5 for each floating element`;

/**
 * Validate a quality report response from the inspector.
 */
export function validateQualityReport(report: unknown): report is QualityReport {
    if (!report || typeof report !== 'object') return false;
    const r = report as Record<string, unknown>;

    return (
        typeof r.overallScore === 'number' &&
        Array.isArray(r.passedItems) &&
        Array.isArray(r.failedItems) &&
        Array.isArray(r.duplicateNodes) &&
        Array.isArray(r.missingMaterials) &&
        Array.isArray(r.floatingElements)
    );
}

/**
 * Format quality report for logging.
 */
export function formatQualityReport(report: QualityReport): string {
    const lines = [
        `╔════════════════════════════════════════════════════╗`,
        `║  QUALITY INSPECTION REPORT                        ║`,
        `╠════════════════════════════════════════════════════╣`,
        `║  Overall Score:       ${String(report.overallScore).padEnd(28)}║`,
        `║  Passed Items:        ${String(report.passedItems.length).padEnd(28)}║`,
        `║  Failed Items:        ${String(report.failedItems.length).padEnd(28)}║`,
        `║  Duplicate Nodes:     ${String(report.duplicateNodes.length).padEnd(28)}║`,
        `║  Missing Materials:   ${String(report.missingMaterials.length).padEnd(28)}║`,
        `║  Floating Elements:   ${String(report.floatingElements.length).padEnd(28)}║`,
        `╚════════════════════════════════════════════════════╝`,
    ];

    if (report.failedItems.length > 0) {
        lines.push(`\nFAILED ITEMS:`);
        for (const item of report.failedItems) {
            lines.push(`  ❌ ${item}`);
        }
    }

    if (report.recommendations.length > 0) {
        lines.push(`\nRECOMMENDATIONS:`);
        for (const rec of report.recommendations) {
            lines.push(`  💡 ${rec}`);
        }
    }

    return lines.join('\n');
}
