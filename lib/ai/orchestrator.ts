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
 * SUPPORTED PROVIDERS:
 * - Google Gemini (default) — via @google/generative-ai SDK
 * - OpenAI GPT-4 — via REST API
 *
 * The provider is selected via the NEXT_PUBLIC_AI_PROVIDER env var.
 * API keys are NEVER sent to the client — this runs server-side only.
 * =============================================================================
 */

import type {
    PSGProject,
    PSGOperation,
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
    provider: 'gemini' | 'openai' | 'groq';
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
        provider: (process.env.NEXT_PUBLIC_AI_PROVIDER as 'gemini' | 'openai' | 'groq') || 'gemini',
        apiKey: process.env.AI_API_KEY || '',
        model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
        maxTokens: 4096,
        temperature: 0.7,
    };
}

// =============================================================================
// CONTEXT PREPARATION
// =============================================================================

/**
 * Prepares the PSG project for inclusion in the AI prompt.
 * Strips metadata to save tokens, keeps the structural essentials.
 */
export function prepareProjectContext(project: PSGProject): string {
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
// GEMINI API CALL
// =============================================================================

/**
 * Converts our tool definitions to Gemini's function declaration format.
 */
function toolsToGeminiFunctions() {
    return AI_TOOLS.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
    }));
}

/**
 * Calls the Google Gemini API with function calling support.
 *
 * WHY THE REST API INSTEAD OF THE SDK?
 * The @google/generative-ai SDK adds a dependency. The REST API is
 * straightforward and keeps the bundle smaller for a Next.js server route.
 */
async function callGemini(
    config: AIConfig,
    messages: Array<{ role: string; content: string }>,
): Promise<{ text: string; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    // Build Gemini's expected format
    const systemInstruction = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n\n');

    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

    const body = {
        system_instruction: {
            parts: [{ text: systemInstruction }],
        },
        contents,
        tools: [
            {
                function_declarations: toolsToGeminiFunctions(),
            },
        ],
        tool_config: {
            function_calling_config: {
                mode: 'AUTO', // Let model decide when to call tools
            },
        },
        generation_config: {
            temperature: config.temperature,
            max_output_tokens: config.maxTokens,
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) {
        throw new Error('Gemini returned no candidates');
    }

    // Extract text and tool calls from the response parts
    let text = '';
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    for (const part of candidate.content?.parts || []) {
        if (part.text) {
            text += part.text;
        }
        if (part.functionCall) {
            toolCalls.push({
                name: part.functionCall.name,
                args: part.functionCall.args || {},
            });
        }
    }

    return { text, toolCalls };
}

// =============================================================================
// GROQ API CALL (OpenAI-compatible)
// =============================================================================

/**
 * Calls the Groq API with function calling support.
 * Groq uses an OpenAI-compatible API — same request format, different base URL.
 * Supports models like llama-3.3-70b-versatile, mixtral-8x7b-32768.
 */
async function callGroq(
    config: AIConfig,
    messages: Array<{ role: string; content: string }>,
): Promise<{ text: string; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }> {
    // Groq's OpenAI-compatible endpoint
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
        model: config.model,
        messages,
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: config.temperature,
        max_tokens: config.maxTokens,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Groq API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
        throw new Error('Groq returned no choices');
    }

    const text = choice.message?.content || '';
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    for (const tc of choice.message?.tool_calls || []) {
        if (tc.type === 'function') {
            try {
                toolCalls.push({
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments),
                });
            } catch {
                console.warn('[AI Orchestrator] Failed to parse Groq tool call args:', tc.function.arguments);
            }
        }
    }

    return { text, toolCalls };
}

// =============================================================================
// OPENAI API CALL
// =============================================================================

/**
 * Calls the OpenAI API with function calling support (GPT-4/GPT-4o).
 */
async function callOpenAI(
    config: AIConfig,
    messages: Array<{ role: string; content: string }>,
): Promise<{ text: string; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
        model: config.model,
        messages,
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: config.temperature,
        max_tokens: config.maxTokens,
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) {
        throw new Error('OpenAI returned no choices');
    }

    const text = choice.message?.content || '';
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    for (const tc of choice.message?.tool_calls || []) {
        if (tc.type === 'function') {
            try {
                toolCalls.push({
                    name: tc.function.name,
                    args: JSON.parse(tc.function.arguments),
                });
            } catch {
                console.warn('[AI Orchestrator] Failed to parse tool call args:', tc.function.arguments);
            }
        }
    }

    return { text, toolCalls };
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
 */
export async function sendChatToAI(
    request: AIChatRequest,
    materials: Record<string, Material>
): Promise<AIChatResponse> {
    const config = getAIConfig();

    // If no API key is configured, return a helpful message
    if (!config.apiKey) {
        return {
            message: `I understand you want to: "${request.message}". However, the AI backend is not yet configured. To enable AI features, add your API key to \`.env.local\`:\n\n\`\`\`\nAI_API_KEY=your_key_here\nNEXT_PUBLIC_AI_PROVIDER=gemini\nAI_MODEL=gemini-2.0-flash\n\`\`\`\n\nFor now, you can use the Inspector panel to directly edit elements.`,
            operations: [],
            warnings: [],
            suggestions: [
                'Use the sliders in the Inspector panel to make direct changes.',
                'Click on any element in the 3D view to select and edit it.',
            ],
        };
    }

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
        { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
        { role: 'system', content: houseContext },
        // Include recent chat history (last 10 messages to stay within context)
        ...request.history.slice(-10).map((msg) => ({
            role: msg.role as string,
            content: msg.content,
        })),
        { role: 'user', content: request.message },
    ];

    try {
        // Call the appropriate LLM provider
        let result;
        if (config.provider === 'openai') {
            result = await callOpenAI(config, messages);
        } else if (config.provider === 'groq') {
            result = await callGroq(config, messages);
        } else {
            result = await callGemini(config, messages);
        }

        // Convert tool calls to PSG operations
        const operations: PSGOperation[] = result.toolCalls.map((tc) =>
            toolCallToOperation(tc.name, tc.args)
        );

        console.log('[AI Orchestrator]', config.provider, '→', {
            textLength: result.text.length,
            toolCalls: result.toolCalls.length,
            operations: operations.length,
        });

        return {
            message: result.text || 'I\'ve made the requested changes to the design.',
            operations,
            warnings: [],
            suggestions: operations.length > 0
                ? ['Click on modified elements to inspect the changes.']
                : undefined,
        };
    } catch (error) {
        console.error('[AI Orchestrator] Error:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown error';

        return {
            message: `Sorry, I encountered an error while processing your request: ${errMsg}`,
            operations: [],
            warnings: [{ severity: 'warning' as const, message: errMsg }],
            suggestions: [
                'Check your API key in .env.local',
                'Try again in a moment.',
            ],
        };
    }
}
