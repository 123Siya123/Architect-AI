/**
 * =============================================================================
 * LIB/AI/ORCHESTRATOR.TS — Multi-Agent Agentic Architecture
 * =============================================================================
 *
 * UPGRADE v3 — Full multi-agent rewrite
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  User Request                                                   │
 * │       │                                                         │
 * │       ▼                                                         │
 * │  ┌──────────────────────┐                                       │
 * │  │  COORDINATOR AGENT   │  Understands the request in 3D       │
 * │  │  (Planning Phase)    │  context. Reads current building     │
 * │  │                      │  state. Plans sub-tasks.             │
 * │  └──────────┬───────────┘                                       │
 * │       ┌─────┼─────┐                                             │
 * │       ▼     ▼     ▼                                             │
 * │  ┌────────┐┌────────┐┌────────┐                                │
 * │  │Worker 1││Worker 2││Worker 3│  Each gets full building specs │
 * │  │(e.g.   ││(e.g.   ││(e.g.   │  + specific task description  │
 * │  │ slab)  ││ walls) ││ roof)  │  Executes tool calls          │
 * │  └───┬────┘└───┬────┘└───┬────┘                                │
 * │      └────┬────┘         │                                      │
 * │           ▼              ▼                                      │
 * │  ┌──────────────────────────┐                                   │
 * │  │    CHECKER AGENT         │  Gets original question +        │
 * │  │    (QA Phase)            │  full building state after edits │
 * │  │                          │  Looks for spatial mistakes      │
 * │  └──────────┬───────────────┘                                   │
 * │             │ If mistakes found                                 │
 * │             ▼                                                   │
 * │  ┌──────────────────────────┐                                   │
 * │  │    FIXER AGENT           │  Gets building + mistake desc   │
 * │  │    (Correction Phase)    │  Applies corrections            │
 * │  └──────────────────────────┘                                   │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * READABLE KEYS:
 * - "position" instead of "pos"
 * - "dimensions" instead of "dim"
 * - "rotation" instead of "rot"
 * - "material" instead of "mat"
 * - "children" instead of "kids"
 * - "function" instead of "fn"
 *
 * =============================================================================
 */

import type {
    AIChatRequest,
    AIChatResponse,
    PSGProject,
    PSGNode,
    PSGOperation,
    Material,
    OperationType,
} from '@/types';
import { AI_TOOLS } from './tools';
import { getProviderConfig, rotateKey, markKeyRateLimited, type AIProviderConfig } from './key-manager';
import { validateOperation } from '@/lib/psg/validator';
import { applyOperation } from '@/lib/psg/operations';
import {
    prepareProjectContext,
    prepareMaterialContext,
    prepareBudgetContext,
    generateASCIIFloorPlan
} from './context';
import {
    STRATEGY_AGENT_PROMPT,
    BUILDER_AGENT_PROMPT,
    GEOMETRICIAN_AGENT_PROMPT,
    VISION_AUDIT_PROMPT,
    QA_SUPERVISOR_PROMPT
} from './prompts';
import { logAgentStep, clearLogs } from './logger';

// Phase agents logic remains below...

// =============================================================================
// MAIN EXPORT — Send Chat to AI (Multi-Agent)
// =============================================================================

export async function sendChatToAI(
    request: AIChatRequest,
    materials: Record<string, Material>,
    _retryCount: number = 0
): Promise<AIChatResponse> {
    const progressLog: string[] = [];
    console.log('[Orchestrator] ═══ ANTIGRAVITY REACT LOOP STARTING ═══');

    let currentProject = { ...request.project, nodes: { ...request.project.nodes } };
    const allValidatedOps: PSGOperation[] = [];
    const maxIterations = 25; // High Thinking capacity — lots of rope.
    let finalMessage = "";

    const loopMessages: Array<{ role: string; content: string }> = [];

    // Initial Blueprint Strategy
    loopMessages.push({ role: 'system', content: STRATEGY_AGENT_PROMPT });

    // Add history
    if (request.history) {
        loopMessages.push(...request.history.slice(-10).map(m => ({ role: m.role, content: m.content })));
    }

    loopMessages.push({ role: 'user', content: `USER REQUEST: ${request.message}` });
    clearLogs();

    for (let i = 1; i <= maxIterations; i++) {
        progressLog.push(`\n───── 🌀 LOOP ITERATION ${i}/${maxIterations} ─────`);

        let iterationSuccess = false;
        let iterationRetries = 0;
        const MAX_ITERATION_RETRIES = 5;

        while (!iterationSuccess && iterationRetries < MAX_ITERATION_RETRIES) {
            try {
                const config = getProviderConfig();

                const buildingSpecs = prepareProjectContext(currentProject);
                const asciiPlan = generateASCIIFloorPlan(currentProject);
                const materialContext = prepareMaterialContext(materials);
                const budgetContext = prepareBudgetContext(currentProject);

                // --- MULTI-PHASE AGENTIC SCHEDULE ---
                let currentSystemPrompt = BUILDER_AGENT_PROMPT;
                let phaseName = "BUILDING";

                if (i <= 3) {
                    currentSystemPrompt = STRATEGY_AGENT_PROMPT;
                    phaseName = "STRATEGY";
                } else if (i >= 11 && i <= 14) {
                    currentSystemPrompt = VISION_AUDIT_PROMPT;
                    phaseName = "SPATIAL_VISION_AUDIT";
                } else if (i >= 15 && i <= 21) {
                    currentSystemPrompt = GEOMETRICIAN_AGENT_PROMPT;
                    phaseName = "GEOMETRIC_PERFECTION";
                } else if (i >= 22) {
                    currentSystemPrompt = QA_SUPERVISOR_PROMPT;
                    phaseName = "FINAL_QA";
                }

                // --- CONTEXT OPTIMIZATION ---
                const optimizedMessages = loopMessages.filter(m => !m.content.startsWith('### SYSTEM OBSERVATION'));

                // Inject current phase prompt
                optimizedMessages[0] = { role: 'system', content: currentSystemPrompt };

                optimizedMessages.push({
                    role: 'user',
                    content: `### [PHASE: ${phaseName}] SYSTEM OBSERVATION ${i}\nAscii Plan:\n${asciiPlan}\n\nBudget: ${budgetContext}\nNode State:\n${buildingSpecs}\n\nPlease proceed with ${phaseName} operations.`
                });

                const normalized = normalizeMessages(optimizedMessages);

                logAgentStep({
                    phase: phaseName,
                    iteration: i,
                    model: config.model,
                    status: 'pending',
                    prompt: normalized[normalized.length - 1].content
                });

                const result = await callProviderWithTools(config, normalized);

                // If call succeeded, WE COMMIT the observation to the main history 
                // so the NEXT iteration's 'optimizedMessages' (which filters the history) 
                // sees the state as it was after iteration i-1.
                loopMessages.push(optimizedMessages[optimizedMessages.length - 1]);

                logAgentStep({
                    phase: `LOOP_ITERATION_${i}`,
                    iteration: i,
                    model: config.model,
                    status: 'success',
                    response: result.text,
                    toolCalls: result.toolCalls
                });

                if (result.text) {
                    finalMessage = result.text;
                    loopMessages.push({ role: 'assistant', content: result.text });
                    progressLog.push(`   💭 Reasoning: "${result.text.substring(0, 80)}..."`);
                }

                if (result.toolCalls && result.toolCalls.length > 0) {
                    progressLog.push(`   🛠️ EXECUTION: Processing ${result.toolCalls.length} structural operation(s)...`);
                    const resultsForObservation: string[] = [];
                    let turnSuccessCount = 0;

                    for (const tc of result.toolCalls) {
                        try {
                            if (tc.name === 'get_wall_surface') {
                                const wallId = tc.args.target_id as string;
                                const wall = currentProject.nodes[wallId];
                                if (wall?.surface_matrix) {
                                    const sm = wall.surface_matrix;
                                    if (sm.code) {
                                        resultsForObservation.push(`🔍 Surface for ${wallId}:\n  Mode: PROCEDURAL\n  Code: ${sm.code}\n  Resolution: ${sm.resolution || 32}\n  Description: ${sm.description}`);
                                    } else {
                                        resultsForObservation.push(`🔍 Surface for ${wallId}:\n  Mode: DATA MATRIX (${sm.rows}x${sm.cols})\n  Data: ${JSON.stringify(sm.data)}\n  Description: ${sm.description}`);
                                    }
                                } else {
                                    resultsForObservation.push(`ℹ️ ${wallId} has standard flat surface (no custom modifications).`);
                                }
                                continue;
                            }

                            const op = toolCallToOperation(tc.name, tc.args as Record<string, unknown>);
                            const validation = validateOperation(op, currentProject);

                            if (validation.valid) {
                                allValidatedOps.push(op);
                                const applied = applyOperation(currentProject, op);
                                if (applied.project) {
                                    currentProject = applied.project;
                                    turnSuccessCount++;
                                    resultsForObservation.push(`✅ ${tc.name} applied on ${op.target_id}`);
                                }
                            } else {
                                resultsForObservation.push(`❌ ${tc.name} validation failed: ${validation.errors.join(', ')}`);
                                progressLog.push(`   ⚠️ Rejected: ${tc.name} failed constraints.`);
                            }
                        } catch (e) {
                            resultsForObservation.push(`❌ ${tc.name} runtime error`);
                        }
                    }

                    progressLog.push(`   ✅ Added ${turnSuccessCount} valid operations to the architecture.`);
                    loopMessages.push({
                        role: 'user',
                        content: `### OBSERVATION ${i} RESULTS\n${resultsForObservation.join('\n')}\n\nReview the visual state. Continue building or finalize IF and ONLY IF the structure is complete and aesthetically precise.`
                    });

                    iterationSuccess = true;

                } else {
                    // FORCE COMMITMENT protocol
                    if (i < maxIterations) {
                        progressLog.push(`   🌀 FORCED REFINEMENT (${i}/${maxIterations}): Model tried to stop, but system is forcing perfection...`);
                        loopMessages.push({
                            role: 'user',
                            content: `### 🛡️ FORCED COMMITMENT PROTOCOL (Iteration ${i}/${maxIterations})\nYour design objectives are NOT considered finalized. The user has requested an OBSESSIVE level of detail.\n\nYOU MUST TAKE AT LEAST ONE NEW ACTION. DO NOT STOP.`
                        });
                        iterationSuccess = true;
                        // Logic will naturally move to next 'i'
                    } else {
                        progressLog.push(`   ✨ Max Commitment Reached (${i} turns). Design finalized.`);
                        iterationSuccess = true;
                        i = maxIterations + 1; // Break the outer for loop
                    }
                }

            } catch (error) {
                iterationRetries++;
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error(`[Orchestrator] Loop Iteration ${i} failed (Attempt ${iterationRetries}/${MAX_ITERATION_RETRIES}):`, errMsg);

                logAgentStep({
                    phase: `LOOP_ITERATION_${i}`,
                    iteration: i,
                    model: 'various',
                    status: 'failed',
                    error: errMsg
                });

                if (iterationRetries < MAX_ITERATION_RETRIES) {
                    progressLog.push(`   ❌ Iteration ${i} failed. Retrying in 500ms (${iterationRetries}/${MAX_ITERATION_RETRIES})...`);
                    await new Promise(r => setTimeout(r, 500));
                } else {
                    progressLog.push(`   ❌ CRITICAL LOOP ERROR: Iteration ${i} failed after ${MAX_ITERATION_RETRIES} attempts.`);
                    iterationSuccess = false;
                    i = maxIterations + 1; // Exit outer loop
                    break;
                }
            }
        }
    }

    progressLog.push(`\n═══ ANTIGRAVITY PIPELINE COMPLETE: ${allValidatedOps.length} total operation(s) ═══`);

    return {
        message: finalMessage + "\n\n" + progressLog.join('\n'),
        operations: allValidatedOps,
        warnings: [],
        suggestions: [],
    };
}


// =============================================================================
// AGENT TYPES
// =============================================================================

interface CoordinatorOutput {
    analysis: string;
    sub_tasks: SubTask[];
    user_message: string;
    follow_up_suggestions?: string[];
}

interface SubTask {
    id: string;
    description: string;
    priority: number;
}

interface WorkerResult {
    operations: PSGOperation[];
    text: string;
    errors: string[];
}


// =============================================================================
// TOOL CALL → PSG OPERATION MAPPING
// =============================================================================

export function toolCallToOperation(name: string, args: Record<string, unknown>): PSGOperation {
    const timestamp = new Date().toISOString();

    switch (name) {
        case 'add_node':
            return {
                type: 'add_node',
                target_id: (args.parent_id as string) || 'unknown',
                params: { ...args },
                timestamp,
            };

        case 'move_node':
            return {
                type: 'move_node',
                target_id: (args.target_id as string) || 'unknown',
                params: {
                    delta_x: args.delta_x ?? 0,
                    delta_y: args.delta_y ?? 0,
                    delta_z: args.delta_z ?? 0,
                },
                timestamp,
            };

        case 'resize_node':
            return {
                type: 'resize_node',
                target_id: (args.target_id as string) || 'unknown',
                params: {
                    ...(args.width !== undefined && { width: args.width }),
                    ...(args.height !== undefined && { height: args.height }),
                    ...(args.depth !== undefined && { depth: args.depth }),
                },
                timestamp,
            };

        case 'rotate_node':
            return {
                type: 'rotate_node',
                target_id: (args.target_id as string) || 'unknown',
                params: {
                    ...(args.yaw !== undefined && { yaw: args.yaw }),
                    ...(args.pitch !== undefined && { pitch: args.pitch }),
                    ...(args.roll !== undefined && { roll: args.roll }),
                },
                timestamp,
            };

        case 'replace_material':
            return {
                type: 'replace_material',
                target_id: (args.target_id as string) || 'unknown',
                params: { material_id: args.material_id },
                timestamp,
            };

        case 'replace_node':
            return {
                type: 'replace_node',
                target_id: (args.target_id as string) || 'unknown',
                params: { ...args },
                timestamp,
            };

        case 'delete_node':
            return {
                type: 'delete_node',
                target_id: (args.target_id as string) || 'unknown',
                params: {},
                timestamp,
            };

        case 'move_room':
            return {
                type: 'move_room' as OperationType,
                target_id: (args.target_id as string) || 'unknown',
                params: {
                    delta_x: args.delta_x ?? 0,
                    delta_y: args.delta_y ?? 0,
                    delta_z: args.delta_z ?? 0,
                },
                timestamp,
            };

        case 'create_custom_element':
            return {
                type: 'create_custom_element' as OperationType,
                target_id: (args.parent_id as string) || 'unknown',
                params: { ...args },
                timestamp,
            };

        case 'solve_precision':
            return {
                type: 'solve_precision' as OperationType,
                target_id: 'project',
                params: { ...args },
                timestamp,
            };

        case 'set_precision_level':
            return {
                type: 'set_precision_level' as OperationType,
                target_id: 'project',
                params: { ...args },
                timestamp,
            };

        case 'use_template':
            return {
                type: 'use_template' as OperationType,
                target_id: 'project',
                params: { ...args },
                timestamp,
            };

        case 'edit_wall_surface':
            return {
                type: 'edit_wall_surface',
                target_id: (args.target_id as string) || 'unknown',
                params: { ...args },
                timestamp,
            };
        default:
            throw new Error(`Unknown tool name: ${name}`);
    }
}

// =============================================================================
// LLM PROVIDER CALLS
// =============================================================================

interface ToolCall {
    name: string;
    args: Record<string, unknown>;
}

interface LLMCallResult {
    text: string;
    toolCalls?: ToolCall[];
}

/**
 * Calls the LLM WITHOUT tools (for Coordinator and Checker agents).
 * Automatically detects rate limits, marks the key for cooldown, rotates, and retries.
 */
async function callProviderNoTools(
    initialConfig: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const MAX_TOTAL_ATTEMPTS = 5;
    let config = initialConfig;

    for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
        try {
            switch (config.provider) {
                case 'gemini': return await callGeminiNoTools(config, messages);
                case 'groq': return await callGroqNoTools(config, messages);
                case 'openai': return await callOpenAINoTools(config, messages);
                case 'github': return await callGithubNoTools(config, messages);
                default: throw new Error(`Unknown provider: ${config.provider}`);
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[callProviderNoTools] Attempt ${attempt}/${MAX_TOTAL_ATTEMPTS} failed:`, errMsg);

            const isUnavailable = errMsg.includes('503') || errMsg.includes('404') || errMsg.includes('500');

            if (isUnavailable && config.provider === 'gemini') {
                // MODEL FALLBACK LOGIC (Sub-loop within the attempt)
                if (config.model === 'gemini-3.1-pro-preview') {
                    console.warn('[Orchestrator] Gemini 3.1 Pro unavailable. Falling back to Gemini 3 Pro...');
                    config = { ...config, model: 'gemini-3-pro-preview' };
                    // Reset attempt on fallback to give the new model a fair chance? 
                    // No, let's keep the global limit but skip the delay
                } else if (config.model === 'gemini-3-pro-preview') {
                    console.warn('[Orchestrator] Gemini 3 Pro unavailable. Falling back to Gemini 3 Flash...');
                    config = { ...config, model: 'gemini-3-flash-preview' };
                } else if (config.model === 'gemini-3-flash-preview') {
                    console.warn('[Orchestrator] Gemini 3 Flash unavailable. Switching to STABLE 1.5 Pro...');
                    config = { ...config, model: 'gemini-1.5-pro' };
                } else {
                    // No more fallbacks, just rotate key and retry the initial or current model
                    rotateKey();
                    config = getProviderConfig();
                }
            } else {
                if (errMsg.includes('429')) markKeyRateLimited(config.apiKey);
                rotateKey();
                config = getProviderConfig();
            }

            if (attempt === MAX_TOTAL_ATTEMPTS) throw error;
            await new Promise(r => setTimeout(r, 500));
        }
    }
    throw new Error('Retries exhausted');
}

/**
 * Calls the LLM WITH tools (for Worker and Fixer agents).
 * Automatically detects rate limits, marks the key for cooldown, rotates, and retries.
 */
async function callProviderWithTools(
    initialConfig: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const MAX_TOTAL_ATTEMPTS = 5;
    let config = initialConfig;

    for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
        try {
            switch (config.provider) {
                case 'gemini': return await callGemini(config, messages);
                case 'groq': return await callGroq(config, messages);
                case 'openai': return await callOpenAI(config, messages);
                case 'github': return await callGithub(config, messages);
                default: throw new Error(`Unknown provider: ${config.provider}`);
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn(`[callProviderWithTools] Attempt ${attempt}/${MAX_TOTAL_ATTEMPTS} failed:`, errMsg);

            const isUnavailable = errMsg.includes('503') || errMsg.includes('404') || errMsg.includes('500');

            if (isUnavailable && config.provider === 'gemini') {
                // MODEL FALLBACK LOGIC
                if (config.model === 'gemini-3.1-pro-preview') {
                    console.warn('[Orchestrator] Gemini 3.1 Pro unavailable. Falling back to Gemini 3 Pro...');
                    config = { ...config, model: 'gemini-3-pro-preview' };
                } else if (config.model === 'gemini-3-pro-preview') {
                    console.warn('[Orchestrator] Gemini 3 Pro unavailable. Falling back to Gemini 3 Flash...');
                    config = { ...config, model: 'gemini-3-flash-preview' };
                } else if (config.model === 'gemini-3-flash-preview') {
                    console.warn('[Orchestrator] Gemini 3 Flash unavailable. Switching to STABLE 1.5 Pro...');
                    config = { ...config, model: 'gemini-1.5-pro' };
                } else {
                    rotateKey();
                    config = getProviderConfig();
                }
            } else {
                if (errMsg.includes('429')) markKeyRateLimited(config.apiKey);
                rotateKey();
                config = getProviderConfig();
            }

            if (attempt === MAX_TOTAL_ATTEMPTS) throw error;
            await new Promise(r => setTimeout(r, 500));
        }
    }
    throw new Error('Retries exhausted');
}

// =============================================================================
// GEMINI
// =============================================================================

async function callGemini(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

    const systemMsg = messages.find((m) => m.role === 'system');

    // Helper to recursively uppercase property types for Gemini
    const formatForGemini = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(formatForGemini);
        if (obj !== null && typeof obj === 'object') {
            const result: any = {};
            for (const key in obj) {
                if (key === 'type' && typeof obj[key] === 'string') {
                    result[key] = obj[key].toUpperCase();
                } else {
                    result[key] = formatForGemini(obj[key]);
                }
            }
            return result;
        }
        return obj;
    };

    const geminiTools = [
        {
            function_declarations: AI_TOOLS.map((t) => ({
                name: t.function.name,
                description: t.function.description,
                parameters: formatForGemini(t.function.parameters),
            })),
        },
    ];

    const isGemini3 = config.model.includes('gemini-3');

    const body = {
        contents,
        tools: geminiTools,
        tool_config: { function_calling_config: { mode: 'AUTO' } },
        ...(systemMsg && {
            system_instruction: { parts: [{ text: systemMsg.content }] },
        }),
        generation_config: {
            temperature: 0.1,
            max_output_tokens: isGemini3 ? 64000 : 8192,
            ...(isGemini3 && {
                thinkingConfig: {
                    thinkingLevel: 'HIGH'
                }
            })
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates');

    let text = '';
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content?.parts || []) {
        if (part.text) text += part.text;
        if (part.functionCall) {
            toolCalls.push({
                name: part.functionCall.name,
                args: part.functionCall.args || {},
            });
        }
    }

    return { text, toolCalls };
}

async function callGeminiNoTools(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

    const systemMsg = messages.find((m) => m.role === 'system');

    const isGemini3 = config.model.includes('gemini-3');

    const body = {
        contents,
        ...(systemMsg && {
            system_instruction: { parts: [{ text: systemMsg.content }] },
        }),
        generation_config: {
            temperature: 0.3,
            max_output_tokens: isGemini3 ? 64000 : 8192,
            ...(isGemini3 && {
                thinkingConfig: {
                    thinkingLevel: 'HIGH'
                }
            })
        },
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates');

    let text = '';
    for (const part of candidate.content?.parts || []) {
        if (part.text) text += part.text;
    }

    return { text };
}

// =============================================================================
// GROQ
// =============================================================================

async function callGroq(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 1024,
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
        const errorText = await response.text();

        // Handle tool_use_failed — parse the failed_generation
        if (response.status === 400) {
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.error?.code === 'tool_use_failed' && errorData.error?.failed_generation) {
                    console.log('[Orchestrator] Groq tool_use_failed — parsing failed_generation manually');
                    const failedGen = errorData.error.failed_generation;
                    const parsed = parseFailedGeneration(failedGen);
                    if (parsed.length > 0) {
                        console.log(`[Orchestrator] Recovered ${parsed.length} tool call(s) from failed_generation`);
                        const textContent = extractTextFromFailedGeneration(failedGen);
                        return { text: textContent, toolCalls: parsed };
                    }
                }
            } catch (parseErr) {
                console.warn('[Orchestrator] Could not parse Groq error response:', parseErr);
            }
        }

        throw new Error(`Groq API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Groq returned no message');

    const toolCalls: ToolCall[] = (msg.tool_calls || []).map(
        (tc: { function: { name: string; arguments: string } }) => ({
            name: tc.function.name,
            args: safeParse(tc.function.arguments),
        })
    );

    return { text: msg.content || '', toolCalls };
}

async function callGroqNoTools(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 1024,
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
        const errorText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Groq returned no message');

    return { text: msg.content || '' };
}

// =============================================================================
// OPENAI
// =============================================================================

async function callOpenAI(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 4000,
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
        const errorText = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('OpenAI returned no message');

    const toolCalls: ToolCall[] = (msg.tool_calls || []).map(
        (tc: { function: { name: string; arguments: string } }) => ({
            name: tc.function.name,
            args: safeParse(tc.function.arguments),
        })
    );

    return { text: msg.content || '', toolCalls };
}

async function callOpenAINoTools(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 4000,
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
        const errorText = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('OpenAI returned no message');

    return { text: msg.content || '' };
}

// =============================================================================
// GITHUB MODELS
// =============================================================================

async function callGithub(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const url = 'https://models.inference.ai.azure.com/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 4000,
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
        const errorText = await response.text();
        throw new Error(`GitHub Models API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('GitHub Models returned no message');

    const toolCalls: ToolCall[] = (msg.tool_calls || []).map(
        (tc: { function: { name: string; arguments: string } }) => ({
            name: tc.function.name,
            args: safeParse(tc.function.arguments),
        })
    );

    return { text: msg.content || '', toolCalls };
}

async function callGithubNoTools(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const url = 'https://models.inference.ai.azure.com/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 4000,
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
        const errorText = await response.text();
        throw new Error(`GitHub Models API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('GitHub Models returned no message');

    return { text: msg.content || '' };
}

// =============================================================================
// GROQ FAILED GENERATION PARSER
// =============================================================================

function parseFailedGeneration(failedGen: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const regex = /<function=(\w+)((?:\{[\s\S]*?\}))<\/function>/g;
    let match;

    while ((match = regex.exec(failedGen)) !== null) {
        const name = match[1];
        const jsonStr = match[2];
        try {
            const args = JSON.parse(jsonStr);
            toolCalls.push({ name, args });
        } catch {
            console.warn(`[Orchestrator] Failed to parse failed_generation JSON for "${name}"`);
        }
    }

    if (toolCalls.length === 0) {
        const simpleRegex = /<function=(\w+)\s*(\{[\s\S]*?\})\s*<\/function>/g;
        while ((match = simpleRegex.exec(failedGen)) !== null) {
            const name = match[1];
            const jsonStr = match[2];
            try {
                const args = JSON.parse(jsonStr);
                toolCalls.push({ name, args });
            } catch { /* skip */ }
        }
    }

    return toolCalls;
}

function extractTextFromFailedGeneration(failedGen: string): string {
    return failedGen
        .replace(/<function=\w+\{[\s\S]*?\}<\/function>/g, '')
        .replace(/<function=\w+\{[\s\S]*?\}>/g, '')
        .replace(/###\s*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Normalizes message history to ensure strictly alternating roles (user <-> assistant).
 * Merges consecutive messages of the same role. Useful for ReAct loops with observations.
 */
function normalizeMessages(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
    const normalized: Array<{ role: string; content: string }> = [];

    // We keep system messages as they are (providers handle them separately)
    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    if (conversationMessages.length === 0) return systemMessages;

    for (const msg of conversationMessages) {
        const last = normalized[normalized.length - 1];
        if (last && last.role === msg.role) {
            last.content += `\n\n${msg.content}`;
        } else {
            normalized.push({ ...msg });
        }
    }

    // Combine system messages into one if there are multiple
    if (systemMessages.length > 1) {
        const combinedSystem = {
            role: 'system',
            content: systemMessages.map(m => m.content).join('\n\n')
        };
        return [combinedSystem, ...normalized];
    }

    return [...systemMessages, ...normalized];
}

function safeParse(json: string): Record<string, unknown> {
    try {
        return JSON.parse(json);
    } catch {
        console.warn('[Orchestrator] Failed to parse JSON:', json);
        return {};
    }
}

function round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

function formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

/**
 * Extracts a JSON object from a string that may contain markdown fences,
 * [PLAN] tags, or other text wrapping.
 */
function extractJSON<T>(text: string): T | null {
    // Try direct parse first
    try {
        return JSON.parse(text.trim());
    } catch { /* continue */ }

    // Try [PLAN]...[/PLAN] tags
    const planMatch = text.match(/\[PLAN\]([\s\S]*?)\[\/PLAN\]/i);
    if (planMatch) {
        try {
            return JSON.parse(planMatch[1].trim());
        } catch { /* continue */ }
    }

    // Try extracting from markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        try {
            return JSON.parse(fenceMatch[1].trim());
        } catch { /* continue */ }
    }

    // Try finding a JSON object in the text (greedy — find the largest match)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch { /* continue */ }
    }

    return null;
}
