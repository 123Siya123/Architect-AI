/**
 * =============================================================================
 * LIB/AI/COMPLEXITY.TS — 5-Tier Complexity Classification Engine
 * =============================================================================
 *
 * FIX FOR BUG #3: Kremlin classified as 'standard (Min Turns: 4)'.
 * 
 * Replaces the old 3-tier system (standard/high/extreme) with a 5-tier
 * system that properly classifies landmark buildings, campus-scale projects,
 * and everything in between.
 *
 * =============================================================================
 */

// =============================================================================
// TYPES
// =============================================================================

export type ComplexityTier = 'TRIVIAL' | 'STANDARD' | 'COMPLEX' | 'LANDMARK' | 'MEGA';

export interface ComplexityClassification {
    tier: ComplexityTier;
    minTurns: number;
    maxTurns: number;
    requiredPhases: string[];
    requiresResearch: boolean;
    requiresLandmarkChecklist: boolean;
    description: string;
    matchedKeywords: string[];
    requiredFloors: number;
    customSurfaceRequested: boolean;
    preferredShapeMode: 'smooth' | 'linear';
}

// =============================================================================
// TIER DEFINITIONS
// =============================================================================

interface TierDefinition {
    tier: ComplexityTier;
    minTurns: number;
    maxTurns: number;
    requiresResearch: boolean;
    requiresLandmarkChecklist: boolean;
    requiredPhases: string[];
    keywords: RegExp[];
    description: string;
}

const TIER_DEFINITIONS: TierDefinition[] = [
    {
        tier: 'MEGA',
        minTurns: 35,
        maxTurns: 60,
        requiresResearch: true,
        requiresLandmarkChecklist: true,
        requiredPhases: ['research', 'site_plan', 'primary_structure', 'secondary_structure', 'facades', 'openings', 'materials', 'details', 'precision', 'inspection'],
        description: 'Campus-scale or city-block project with multiple distinct structures',
        keywords: [
            /campus/i, /city\s*block/i, /full\s*site/i, /complex\s+of/i,
            /university/i, /hospital\s+campus/i, /military\s+base/i,
            /entire\s+(?:city|town|district)/i, /multiple\s+buildings/i,
            /theme\s+park/i, /resort/i, /airport/i, /mall/i, /shopping\s+center/i,
        ],
    },
    {
        tier: 'LANDMARK',
        minTurns: 20,
        maxTurns: 45,
        requiresResearch: true,
        requiresLandmarkChecklist: true,
        requiredPhases: ['research', 'site_plan', 'primary_structure', 'secondary_structure', 'facades', 'openings', 'materials', 'details', 'precision', 'inspection'],
        description: 'Iconic landmark building requiring research and historical accuracy',
        keywords: [
            /kremlin/i, /white\s*house/i, /castle/i, /palace/i, /cathedral/i,
            /mosque/i, /temple/i, /basilica/i, /monument/i, /fortress/i,
            /colosseum/i, /coliseum/i, /parthenon/i, /pantheon/i,
            /taj\s*mahal/i, /buckingham/i, /versailles/i, /notre\s*dame/i,
            /big\s*ben/i, /eiffel/i, /tower\s+of\s+london/i, /windsor/i,
            /replica/i, /rebuild\s+the/i, /recreat/i,
            /capitol\s+building/i, /parliament/i, /hagia\s*sophia/i,
            /sydney\s+opera/i, /sagrada/i, /sistine/i, /louvre/i,
            /burj/i, /petronas/i, /empire\s+state/i, /chrysler/i,
            /gothic\s+cathedral/i, /medieval\s+(?:castle|fortress)/i,
            /ancient\s+(?:temple|fortress|citadel)/i,
            /historic(?:al)?\s+(?:building|structure|monument)/i,
        ],
    },
    {
        tier: 'COMPLEX',
        minTurns: 12,
        maxTurns: 25,
        requiresResearch: true,
        requiresLandmarkChecklist: false,
        requiredPhases: ['research', 'site_plan', 'primary_structure', 'facades', 'openings', 'materials', 'details', 'precision', 'inspection'],
        description: 'Multi-story custom home, villa, or mansion with complex features',
        keywords: [
            /villa/i, /mansion/i, /penthouse/i, /estate/i,
            /custom\s+(?:home|house)/i, /luxury/i, /grand/i,
            /multi[\s-]*(?:level|story|storey)/i,
            /spectacular/i, /impressive/i, /masterpiece/i,
            /complex/i, /dynamic/i, /futuristic/i,
            /bond\s*villain/i, /huge/i, /massive/i,
            /(?:5|6|7|8|9|10)\s*(?:bed|floor|stor)/i,
            /infinity\s+pool/i, /underground/i, /bunker/i,
            /(?:very\s+)?(?:big|large)/i,
        ],
    },
    {
        tier: 'STANDARD',
        minTurns: 6,
        maxTurns: 15,
        requiresResearch: false,
        requiresLandmarkChecklist: false,
        requiredPhases: ['primary_structure', 'openings', 'materials', 'precision', 'inspection'],
        description: 'Standard residential home, apartment, or office',
        keywords: [
            /house/i, /home/i, /apartment/i, /flat/i, /office/i,
            /bungalow/i, /cottage/i, /cabin/i, /studio/i,
            /(?:2|3|4)\s*(?:bed|floor|stor)/i,
            /(?:family|modern|traditional)\s+(?:home|house)/i,
            /duplex/i, /townhouse/i, /rowhouse/i,
        ],
    },
    {
        tier: 'TRIVIAL',
        minTurns: 3,
        maxTurns: 8,
        requiresResearch: false,
        requiresLandmarkChecklist: false,
        requiredPhases: ['primary_structure', 'openings', 'inspection'],
        description: 'Single room, minor addition, or simple modification',
        keywords: [
            /single\s+room/i, /add\s+a\s+(?:window|door|wall|room)/i,
            /extend/i, /addition/i, /garage/i, /shed/i,
            /modify/i, /change/i, /update/i, /fix/i,
            /bathroom/i, /kitchen\s+(?:only|extension)/i,
            /porch/i, /deck/i, /patio/i, /carport/i,
        ],
    },
];

// =============================================================================
// CLASSIFICATION ENGINE
// =============================================================================

/**
 * Classify the complexity of a user's design request.
 * Scans for keywords matching each tier and returns the highest-matching tier.
 *
 * @param message - The user's design request message
 * @returns ComplexityClassification with tier, min/max turns, and required phases
 */
export function classifyComplexity(message: string): ComplexityClassification {
    const normalized = message.toLowerCase();

    // Extract floor count
    const floorMatch = normalized.match(/(\d+)\s*[- ]?(?:floor|stor(?:e?y|ies))/);
    const requiredFloors = floorMatch ? Math.max(1, Number(floorMatch[1])) : 1;

    // Check for custom surface requests
    const customSurfaceRequested = /matrix|surface|bulb|carv|relief|sculpt|custom design|thickness|battlement|merlon/.test(normalized);
    const preferredShapeMode: 'smooth' | 'linear' = /linear|sharp|cornery|blocky/.test(normalized) ? 'linear' : 'smooth';

    // Find the highest matching tier
    let bestMatch: { tier: TierDefinition; matchedKeywords: string[] } | null = null;

    for (const tierDef of TIER_DEFINITIONS) {
        const matched: string[] = [];
        for (const kw of tierDef.keywords) {
            if (kw.test(message)) {
                matched.push(kw.source);
            }
        }

        if (matched.length > 0) {
            if (!bestMatch) {
                bestMatch = { tier: tierDef, matchedKeywords: matched };
            }
            // TIER_DEFINITIONS is ordered from MEGA to TRIVIAL
            // We want the HIGHEST matching tier, so first match wins
            break;
        }
    }

    // Default to STANDARD if no keywords match
    const tierDef = bestMatch?.tier || TIER_DEFINITIONS.find(t => t.tier === 'STANDARD')!;
    const matchedKeywords = bestMatch?.matchedKeywords || [];

    // Adjust for floor count
    let adjustedMinTurns = tierDef.minTurns;
    if (requiredFloors > 2 && tierDef.tier === 'STANDARD') {
        adjustedMinTurns = Math.max(adjustedMinTurns, 8);
    }
    if (requiredFloors > 3) {
        adjustedMinTurns = Math.max(adjustedMinTurns, 10);
    }

    return {
        tier: tierDef.tier,
        minTurns: adjustedMinTurns,
        maxTurns: tierDef.maxTurns,
        requiredPhases: tierDef.requiredPhases,
        requiresResearch: tierDef.requiresResearch,
        requiresLandmarkChecklist: tierDef.requiresLandmarkChecklist,
        description: tierDef.description,
        matchedKeywords,
        requiredFloors,
        customSurfaceRequested,
        preferredShapeMode,
    };
}

/**
 * Get the maximum number of turns allowed for a given tier.
 * Used to set the maxTurns in the orchestrator main loop.
 */
export function getMaxTurnsForTier(tier: ComplexityTier): number {
    const def = TIER_DEFINITIONS.find(t => t.tier === tier);
    return def?.maxTurns || 20;
}

/**
 * Format the complexity classification for display/logging.
 */
export function formatComplexity(classification: ComplexityClassification): string {
    return `Tier: ${classification.tier} | Min Turns: ${classification.minTurns} | ` +
        `Max Turns: ${classification.maxTurns} | Research: ${classification.requiresResearch ? 'YES' : 'NO'} | ` +
        `Checklist: ${classification.requiresLandmarkChecklist ? 'YES' : 'NO'} | ` +
        `Description: ${classification.description}`;
}
