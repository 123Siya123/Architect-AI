/**
 * =============================================================================
 * LIB/AI/AGENTS/RESEARCH-SPECIALIST.TS — Pre-Build Research Agent
 * =============================================================================
 *
 * FIX FOR BUG #4: No Knowledge / Research Phase.
 * 
 * For COMPLEX, LANDMARK, and MEGA tier requests, this agent runs as
 * Phase 0 BEFORE any construction begins. It produces a structured
 * BuildBrief JSON with real dimensions, materials, and a landmark checklist.
 *
 * =============================================================================
 */

// =============================================================================
// BUILD BRIEF SCHEMA
// =============================================================================

export interface BuildBrief {
    totalFootprintMeters: {
        width: number;
        depth: number;
    };
    overallHeightMeters: number;
    primaryStructures: Array<{
        name: string;
        type: string;
        positionX: number;
        positionZ: number;
        widthM: number;
        depthM: number;
        heightM: number;
        roofStyle: string;
        specialFeatures: string[];
    }>;
    wallSegments: Array<{
        id: string;
        startX: number;
        startZ: number;
        endX: number;
        endZ: number;
        heightM: number;
        thicknessM: number;
        battlements: boolean;
    }>;
    towers: Array<{
        name: string;
        posX: number;
        posZ: number;
        baseWidthM: number;
        heightM: number;
        roofStyle: string;
    }>;
    materials: {
        primaryWall: string;
        roof: string;
        floor: string;
        accent: string;
    };
    colorPalette: {
        walls: string;
        roofs: string;
        trim: string;
    };
    landmarkChecklistItems: string[];
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

export const RESEARCH_SPECIALIST_PROMPT = `You are the Landmark Research Specialist for Architect AI. Your ONLY job is to produce a structured BuildBrief JSON object. You do NOT call any construction tools. You output ONLY JSON.

Your output must conform to this schema:
{
  "totalFootprintMeters": { "width": number, "depth": number },
  "overallHeightMeters": number,
  "primaryStructures": [
    {
      "name": string,
      "type": string,
      "positionX": number,
      "positionZ": number,
      "widthM": number,
      "depthM": number,
      "heightM": number,
      "roofStyle": string,
      "specialFeatures": string[]
    }
  ],
  "wallSegments": [
    {
      "id": string,
      "startX": number,
      "startZ": number,
      "endX": number,
      "endZ": number,
      "heightM": number,
      "thicknessM": number,
      "battlements": boolean
    }
  ],
  "towers": [
    {
      "name": string,
      "posX": number,
      "posZ": number,
      "baseWidthM": number,
      "heightM": number,
      "roofStyle": string
    }
  ],
  "materials": {
    "primaryWall": string,
    "roof": string,
    "floor": string,
    "accent": string
  },
  "colorPalette": {
    "walls": string,
    "roofs": string,
    "trim": string
  },
  "landmarkChecklistItems": string[]
}

CRITICAL RULES:
1. Use REAL dimensions sourced from your knowledge. For landmarks, use historically accurate measurements.
2. All positions use a centroid origin at (0, 0, 0). Place structures relative to this origin.
3. For non-landmark COMPLEX tier, use realistic residential/commercial dimensions.
4. The landmarkChecklistItems array must contain every required architectural element as a string description.
5. Include ALL major structures, not just the primary one.
6. Wall segments should define the perimeter walls with start/end coordinates.
7. Materials should reference real-world materials appropriate to the structure's era and style.
8. Scale appropriately — do not invent tiny dimensions for massive buildings.
9. Output ONLY the JSON object, no explanation text.`;

// =============================================================================
// HELPER: Format build brief for agent context
// =============================================================================

export function formatBuildBrief(brief: BuildBrief): string {
    const lines = [
        `BUILD BRIEF (from Research Phase):`,
        `  Footprint: ${brief.totalFootprintMeters.width}m × ${brief.totalFootprintMeters.depth}m`,
        `  Max Height: ${brief.overallHeightMeters}m`,
        `  Structures: ${brief.primaryStructures.length} primary`,
        `  Wall Segments: ${brief.wallSegments.length}`,
        `  Towers: ${brief.towers.length}`,
        `  Materials: walls=${brief.materials.primaryWall}, roof=${brief.materials.roof}`,
        `  Colors: walls=${brief.colorPalette.walls}, roof=${brief.colorPalette.roofs}`,
    ];

    if (brief.primaryStructures.length > 0) {
        lines.push(`  PRIMARY STRUCTURES:`);
        for (const s of brief.primaryStructures) {
            lines.push(`    - ${s.name}: ${s.widthM}×${s.depthM}m, H=${s.heightM}m at (${s.positionX}, ${s.positionZ})`);
        }
    }

    if (brief.towers.length > 0) {
        lines.push(`  TOWERS:`);
        for (const t of brief.towers.slice(0, 10)) {
            lines.push(`    - ${t.name}: H=${t.heightM}m, base=${t.baseWidthM}m at (${t.posX}, ${t.posZ})`);
        }
        if (brief.towers.length > 10) {
            lines.push(`    ... and ${brief.towers.length - 10} more`);
        }
    }

    return lines.join('\n');
}

/**
 * Validate that a BuildBrief has all required fields.
 */
export function validateBuildBrief(brief: unknown): brief is BuildBrief {
    if (!brief || typeof brief !== 'object') return false;
    const b = brief as Record<string, unknown>;

    return (
        typeof b.totalFootprintMeters === 'object' &&
        typeof b.overallHeightMeters === 'number' &&
        Array.isArray(b.primaryStructures) &&
        Array.isArray(b.wallSegments) &&
        Array.isArray(b.towers) &&
        typeof b.materials === 'object' &&
        typeof b.colorPalette === 'object' &&
        Array.isArray(b.landmarkChecklistItems)
    );
}
