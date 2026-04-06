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
    designVision?: string;
    primaryStructures: Array<string | {
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
    wallSegments: Array<string | {
        id: string;
        startX: number;
        startZ: number;
        endX: number;
        endZ: number;
        heightM: number;
        thicknessM: number;
        battlements: boolean;
    }>;
    towers: Array<string | {
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

export const RESEARCH_SPECIALIST_PROMPT = `You are a senior architectural design consultant. A client has described a building they want. Your job is to interpret their true intent and produce a structured design brief that a construction team can build from.

You are a professional, not a creative writer. Every word in your output must carry real, buildable information. Descriptions must be specific enough to sketch. Use plain material names ("white concrete", "dark timber cladding"), not invented compound jargon.

Your output must conform to this schema:
{
  "totalFootprintMeters": { "width": number, "depth": number },
  "overallHeightMeters": number,
  "designVision": "A dense 2-3 sentence description of the overall form, massing, and character. Reference real shapes and proportions someone could draw.",
  "primaryStructures": [
    "Plain-language description of each major building element with approximate dimensions. Example: 'Main living wing: 18m x 8m, single storey, 3.5m ceiling, flat roof'"
  ],
  "wallSegments": [
    "Description of perimeter and key walls. Example: 'North exterior wall: 18m long, 3.5m high, 0.25m thick concrete, no windows'"
  ],
  "towers": [],
  "materials": {
    "primaryWall": "plain recognizable name, e.g. 'white rendered concrete'",
    "roof": "e.g. 'flat concrete slab' or 'standing-seam zinc'",
    "floor": "e.g. 'polished concrete' or 'light oak hardwood'",
    "accent": "e.g. 'black steel window frames'"
  },
  "colorPalette": {
    "walls": "hex or plain name",
    "roofs": "hex or plain name",
    "trim": "hex or plain name"
  },
  "landmarkChecklistItems": [
    "Each item is a specific construction task. Example: 'Build ground floor slab: 22m x 14m, 0.3m thick at Y=0'"
  ]
}

CRITICAL RULES:
1. Interpret the client's intent. Fill in gaps with concrete architectural decisions.
2. Size everything realistically based on stated needs (family size, room counts, usage).
3. Describe forms by their shape, proportions, and spatial relationships — not with invented names.
4. Materials must be real and recognizable. Good: "smooth white concrete". Bad: "graphene-reinforced bio-concrete".
5. Every checklist item must be a specific, actionable construction task with dimensions.
6. Output ONLY the JSON object, no explanation text.`;

// =============================================================================
// HELPER: Format build brief for agent context
// =============================================================================

export function formatBuildBrief(brief: BuildBrief): string {
    const lines = [
        `BUILD BRIEF (from Research Phase):`,
        `  Footprint: ${brief.totalFootprintMeters.width}m × ${brief.totalFootprintMeters.depth}m`,
        `  Max Height: ${brief.overallHeightMeters}m`,
    ];

    if (brief.designVision) {
        lines.push(`  Design Vision: ${brief.designVision}`);
    }

    lines.push(`  Structures: ${brief.primaryStructures.length} primary`);
    lines.push(`  Wall Segments: ${brief.wallSegments.length}`);
    lines.push(`  Towers: ${brief.towers.length}`);
    lines.push(`  Materials: walls=${brief.materials.primaryWall}, roof=${brief.materials.roof}`);
    lines.push(`  Colors: walls=${brief.colorPalette.walls}, roof=${brief.colorPalette.roofs}`);

    if (brief.primaryStructures.length > 0) {
        lines.push(`  PRIMARY STRUCTURES:`);
        for (const s of brief.primaryStructures) {
            if (typeof s === 'string') {
                lines.push(`    - ${s}`);
            } else {
                lines.push(`    - ${s.name}: ${s.widthM}×${s.depthM}m, H=${s.heightM}m at (${s.positionX}, ${s.positionZ})`);
            }
        }
    }

    if (brief.towers.length > 0) {
        lines.push(`  TOWERS:`);
        for (const t of brief.towers.slice(0, 10)) {
            if (typeof t === 'string') {
                lines.push(`    - ${t}`);
            } else {
                lines.push(`    - ${t.name}: H=${t.heightM}m, base=${t.baseWidthM}m at (${t.posX}, ${t.posZ})`);
            }
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
