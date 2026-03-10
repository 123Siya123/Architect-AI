/**
 * =============================================================================
 * LIB/AI/MODELS.TS — Centralized Model Configuration
 * =============================================================================
 *
 * FIX FOR BUG #7: Hallucinated model names.
 * All model strings are centralized here. No agent file should hardcode a model.
 * This allows hot-swapping models per agent role without touching agent logic.
 *
 * =============================================================================
 */

export interface ModelConfig {
    orchestrator: string;
    research_specialist: string;
    structural_engineer: string;
    facade_artist: string;
    materials_specialist: string;
    interior_architect: string;
    quality_inspector: string;
    master_planner: string;
    detail_specialist: string;
    spatial_physicist: string;
    aesthetic_designer: string;
}

/**
 * Centralized model configuration.
 * NEVER hardcode model strings in agent files — always import from here.
 */
export const MODEL_CONFIG: ModelConfig = {
    orchestrator:          'gemini-2.5-pro-preview-05-06',
    research_specialist:   'gemini-2.5-pro-preview-05-06',
    structural_engineer:   'gemini-2.5-pro-preview-05-06',
    facade_artist:         'gemini-2.5-pro-preview-05-06',
    materials_specialist:  'gemini-2.0-flash',
    interior_architect:    'gemini-2.5-pro-preview-05-06',
    quality_inspector:     'gemini-2.0-flash',
    master_planner:        'gemini-2.5-pro-preview-05-06',
    detail_specialist:     'gemini-2.5-pro-preview-05-06',
    spatial_physicist:      'gemini-2.5-pro-preview-05-06',
    aesthetic_designer:    'gemini-2.0-flash',
};

/**
 * Get the model for a specific agent role.
 * Falls back to orchestrator model if role not found.
 */
export function getModelForRole(role: keyof ModelConfig): string {
    return MODEL_CONFIG[role] || MODEL_CONFIG.orchestrator;
}

/**
 * Override a model for a specific role at runtime.
 * Useful for A/B testing or degraded-mode fallbacks.
 */
export function overrideModel(role: keyof ModelConfig, model: string): void {
    (MODEL_CONFIG as unknown as Record<string, string>)[role] = model;
    console.log(`[ModelConfig] Overrode ${role} model to: ${model}`);
}
