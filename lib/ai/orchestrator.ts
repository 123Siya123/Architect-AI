/**
 * =============================================================================
 * LIB/AI/ORCHESTRATOR.TS — AI Request Orchestration
 * =============================================================================
 *
 * Handles the communication between the frontend and the LLM.
 * This module:
 * 1. Prepares the context (PSG state, materials, budget) for the LLM
 * 2. Sends the request with tool definitions
 * 3. Parses the LLM's tool call responses
 * 4. Converts them to PSGOperations
 * 5. Returns the operations + AI message to the frontend
 *
 * WHY A SEPARATE ORCHESTRATOR?
 * - Keeps LLM provider logic isolated (easy to swap Gemini ↔ GPT)
 * - Handles streaming responses
 * - Manages conversation history truncation (context window limits)
 * - Retries on failure
 * - Logs all interactions for debugging
 *
 * TODO (Phase 2): Implement actual LLM API calls.
 * For now, this file defines the interface and data flow.
 * =============================================================================
 */

import type {
    PSGProject,
    PSGOperation,
    ChatMessage,
    AIChatRequest,
    AIChatResponse,
    Material,
} from '@/types';
import { AI_TOOLS, toolCallToOperation } from './tools';
import {
    ARCHITECT_SYSTEM_PROMPT,
    createHouseContextPrompt,
} from './prompts';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * AI provider configuration.
 * Set via environment variables in .env.local
 */
export interface AIConfig {
    provider: 'gemini' | 'openai';
    apiKey: string;
    model: string;
    maxTokens: number;
    temperature: number;
}

/**
 * Default AI configuration.
 * In production, these come from environment variables.
 */
export function getAIConfig(): AIConfig {
    return {
        provider: (process.env.NEXT_PUBLIC_AI_PROVIDER as 'gemini' | 'openai') || 'gemini',
        apiKey: process.env.AI_API_KEY || '',
        model: process.env.AI_MODEL || 'gemini-2.0-flash',
        maxTokens: 4096,
        temperature: 0.7,
    };
}

// =============================================================================
// CONTEXT PREPARATION
// =============================================================================

/**
 * Prepares the PSG project for inclusion in the AI prompt.
 *
 * WHY NOT SEND THE ENTIRE PROJECT?
 * The full project JSON can be huge. We optimize by:
 * 1. Only including nodes that are relevant to the user's question
 * 2. Stripping timestamps and version numbers (AI doesn't need them)
 * 3. Limiting the depth of details for distant nodes
 *
 * For Phase 1, we send everything. Optimization comes in Phase 3.
 */
export function prepareProjectContext(project: PSGProject): string {
    // For now, serialize the entire project
    // In Phase 3, we'll implement smart context windowing
    const simplified = {
        name: project.name,
        root_node_id: project.root_node_id,
        nodes: Object.fromEntries(
            Object.entries(project.nodes).map(([id, node]) => [
                id,
                {
                    id: node.id,
                    type: node.type,
                    name: node.name,
                    position: node.position,
                    dimensions: node.dimensions,
                    rotation: node.rotation,
                    material_id: node.material_id,
                    tags: node.tags,
                    parent_id: node.parent_id,
                    children_ids: node.children_ids,
                    // Include type-specific fields only if they exist
                    ...(node.room_function && { room_function: node.room_function }),
                    ...(node.stair_style && { stair_style: node.stair_style }),
                    ...(node.roof_style && { roof_style: node.roof_style }),
                    ...(node.roof_pitch_degrees && { roof_pitch_degrees: node.roof_pitch_degrees }),
                },
            ])
        ),
        budget: project.budget,
    };

    return JSON.stringify(simplified, null, 2);
}

/**
 * Prepares a summary of available materials for the AI prompt.
 */
export function prepareMaterialsContext(
    materials: Record<string, Material>
): string {
    const lines = Object.values(materials).map(
        (m) =>
            `- ${m.id}: ${m.name} (${m.category}) — €${m.price_per_kg}/kg, ${m.density_kg_m3} kg/m³, thermal: ${m.thermal_conductivity} W/mK`
    );
    return lines.join('\n');
}

/**
 * Prepares the budget summary for the AI context.
 */
export function prepareBudgetContext(project: PSGProject): string {
    const b = project.budget;
    const pctSpent = b.total_budget > 0 ? ((b.spent / b.total_budget) * 100).toFixed(1) : '0';
    return `Total Budget: ${b.currency} ${b.total_budget.toLocaleString()}
Spent: ${b.currency} ${b.spent.toLocaleString()} (${pctSpent}%)
Remaining: ${b.currency} ${b.remaining.toLocaleString()}`;
}

// =============================================================================
// MAIN ORCHESTRATION FUNCTION
// =============================================================================

/**
 * Sends a chat message to the AI and returns its response + operations.
 *
 * FLOW:
 * 1. Build the messages array (system + context + history + user message)
 * 2. Call the LLM API with tool definitions
 * 3. Parse tool calls from the response
 * 4. Convert to PSGOperations
 * 5. Return text response + operations
 *
 * @param request - The chat request with message, project state, and history
 * @param materials - The materials library for context
 * @returns AI response with text and PSG operations
 */
export async function sendChatToAI(
    request: AIChatRequest,
    materials: Record<string, Material>
): Promise<AIChatResponse> {
    const config = getAIConfig();

    // Build context
    const projectContext = prepareProjectContext(request.project);
    const materialsContext = prepareMaterialsContext(materials);
    const budgetContext = prepareBudgetContext(request.project);
    const houseContext = createHouseContextPrompt(
        projectContext,
        materialsContext,
        budgetContext
    );

    // Build messages array
    const messages = [
        { role: 'system' as const, content: ARCHITECT_SYSTEM_PROMPT },
        { role: 'system' as const, content: houseContext },
        // Include recent chat history (last 10 messages to stay within context)
        ...request.history.slice(-10).map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
        })),
        { role: 'user' as const, content: request.message },
    ];

    // TODO (Phase 2): Implement actual API calls
    // For now, return a placeholder response
    console.log('[AI Orchestrator] Would send to', config.provider, ':', {
        model: config.model,
        messages: messages.length,
        tools: AI_TOOLS.length,
    });

    // Placeholder response for Phase 1
    return {
        message: `I understand you want to: "${request.message}". The AI backend is not yet connected. This will be implemented in Phase 2.`,
        operations: [],
        warnings: [],
        suggestions: [
            'Try using the sliders in the Inspector panel to make direct changes.',
            'Click on any element in the 3D view to select and edit it.',
        ],
    };
}
