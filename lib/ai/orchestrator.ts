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
    MASTER_ARCHITECT_SYSTEM_PROMPT,
    GEOMETRIC_AUDIT_PROMPT,
} from './prompts';

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
    const maxIterations = 15;
    let finalMessage = "";

    // The message history for this specific turn's ReAct loop
    const loopMessages: Array<{ role: string; content: string }> = [
        { role: 'system', content: MASTER_ARCHITECT_SYSTEM_PROMPT }
    ];

    // Add previous chat history for context
    if (request.history && request.history.length > 0) {
        // Include last 10 messages for full context
        for (const msg of request.history.slice(-10)) {
            loopMessages.push({
                role: msg.role === 'assistant' ? 'assistant' : 'user',
                content: msg.content
            });
        }
    }

    // Add the user request
    loopMessages.push({ role: 'user', content: `USER REQUEST: ${request.message}` });

    for (let i = 1; i <= maxIterations; i++) {
        progressLog.push(`\n───── 🌀 LOOP ITERATION ${i}/${maxIterations} ─────`);

        // Prepare context for this specific iteration
        const buildingSpecs = prepareProjectContext(currentProject);
        const materialContext = prepareMaterialContext(materials);
        const asciiPlan = generateASCIIFloorPlan(currentProject);
        const budgetContext = prepareBudgetContext(currentProject);

        const iterationContext = `
## CURRENT BUILDING STATE (READ ONLY)
### ASCII FLOOR PLAN
\`\`\`
${asciiPlan}
\`\`\`
### COMPRESSED NODE DATA
\`\`\`json
${buildingSpecs}
\`\`\`
### AVAILABLE MATERIALS
${materialContext}
### BUDGET STATUS
${budgetContext}
`;

        // We merge the building context into a unified observation message.
        // We use 'user' role for these observations to ensure visibility and prevent 
        // consecutive role overlap issues that crash Gemini/Groq.
        loopMessages.push({
            role: 'user',
            content: `### SYSTEM OBSERVATION (Iteration ${i})\n${iterationContext}\n\nReview the building state above and proceed with your task using tools if needed.`
        });

        try {
            const config = getProviderConfig();
            // Normalize messages to ensure alternating roles before calling the provider
            const normalizedHistory = normalizeMessages(loopMessages);
            const result = await callProviderWithTools(config, normalizedHistory);

            if (result.text) {
                progressLog.push(`   💭 ${result.text.substring(0, 150)}...`);
                finalMessage = result.text; // Store text for final response
                loopMessages.push({ role: 'assistant', content: result.text });
            }

            if (!result.toolCalls || result.toolCalls.length === 0) {
                // Planning check: if the AI just gave text but no tools on iteration 1, nudge it to ACT.
                if (i === 1) {
                    progressLog.push(`   💬 Analysis complete. Nudging for execution...`);
                    loopMessages.push({
                        role: 'user',
                        content: `### SYSTEM NUDGE\nThank you for your analysis. Now, please execute the necessary tool calls to proceed with the design. DO NOT just describe the changes—apply them.`
                    });
                    continue;
                }
                progressLog.push(`   ✨ No more operations needed. Finishing.`);
                break;
            }

            progressLog.push(`   🛠️ Executing ${result.toolCalls.length} operation(s)...`);

            const resultsForObservation: string[] = [];

            for (const tc of result.toolCalls) {
                try {
                    const op = toolCallToOperation(tc.name, tc.args as Record<string, unknown>);
                    const validation = validateOperation(op, currentProject);

                    if (validation.valid) {
                        allValidatedOps.push(op);
                        const applied = applyOperation(currentProject, op);
                        if (applied.success && applied.project) {
                            currentProject = applied.project;
                            resultsForObservation.push(`SUCCESS: ${op.type} on ${op.target_id}`);
                        } else {
                            resultsForObservation.push(`FAILED: Application error for ${op.type} on ${op.target_id}`);
                        }
                    } else {
                        resultsForObservation.push(`FAILED: Validation error for ${op.type}: ${validation.errors.join(', ')}`);
                        progressLog.push(`   ⚠️ Tool ${tc.name} failed: ${validation.errors[0]}`);
                    }
                } catch (err) {
                    resultsForObservation.push(`FAILED: Tool ${tc.name} error: ${err instanceof Error ? err.message : String(err)}`);
                }
            }

            // Feed results back to the agent as an observation
            loopMessages.push({
                role: 'user',
                content: `### OBSERVATION (Step ${i})\n${resultsForObservation.join('\n')}\n\nPlease review the updated state and continue if necessary.`
            });

        } catch (error) {
            console.error(`[Orchestrator] Loop Iteration ${i} FAILED:`, error);
            progressLog.push(`   ❌ FAILED: ${error instanceof Error ? error.message : String(error)}`);
            break;
        }
    }

    /*
    // =========================================================================
    // FINAL RIGID AUDIT (Advanced Correction Phase)
    // =========================================================================
    // This section is currently disabled. The main ReAct loop handles all design logic.
    progressLog.push(`\n───── 🛡️ FINAL GEOMETRIC AUDIT ─────`);
    try {
        const auditConfig = getProviderConfig();
        const auditResult = await callProviderNoTools(auditConfig, [
            { role: 'system', content: GEOMETRIC_AUDIT_PROMPT },
            { role: 'user', content: `FULL ARCHITECTURAL STATE:\n${prepareProjectContext(currentProject)}` }
        ]);

        const auditData = extractJSON<{ status: string, mistakes: any[] }>(auditResult.text);
        if (auditData?.status === 'MISTAKE_FOUND' && auditData.mistakes?.length > 0) {
            progressLog.push(`   ⚠️ Audit IDENTIFIED ${auditData.mistakes.length} imperfection(s). Deploying FIXER AGENT...`);
            for (let fixTurn = 1; fixTurn <= 3; fixTurn++) {
                progressLog.push(`   🔧 Fixer Turn ${fixTurn}/3...`);
                const fixerConfig = getProviderConfig();
                const currentMistakes = fixTurn === 1 ? auditData.mistakes : "Review state and finalize.";
                const fixMsgs = [
                    { role: 'system', content: 'You are the ELITE FIXER AGENT. Use Gemini 3.1 HIGH THINKING.' },
                    { role: 'user', content: `STATE:\n${prepareProjectContext(currentProject)}\n\nMISTAKES:\n${JSON.stringify(currentMistakes)}` }
                ];
                const fixResult = await callProviderWithTools(fixerConfig, fixMsgs);
                if (fixResult.toolCalls && fixResult.toolCalls.length > 0) {
                    let turnSuccesses = 0;
                    for (const tc of fixResult.toolCalls) {
                        try {
                            const op = toolCallToOperation(tc.name, tc.args as Record<string, unknown>);
                            if (validateOperation(op, currentProject).valid) {
                                allValidatedOps.push(op);
                                const applied = applyOperation(currentProject, op);
                                if (applied.project) { currentProject = applied.project; turnSuccesses++; }
                            }
                        } catch { }
                    }
                    if (turnSuccesses === 0) break;
                } else { break; }
            }
        }
    } catch (e) { }
    */


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
    const MAX_ATTEMPTS = 5;
    let config = initialConfig;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
            console.warn(`[callProviderNoTools] Attempt ${attempt}/${MAX_ATTEMPTS} failed:`, errMsg);

            if (errMsg.includes('429')) {
                markKeyRateLimited(config.apiKey);
            }

            if (attempt === MAX_ATTEMPTS) throw error;

            rotateKey();
            config = getProviderConfig();

            // Wait a moment before hammering the API again
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    throw new Error('Unreachable');
}

/**
 * Calls the LLM WITH tools (for Worker and Fixer agents).
 * Automatically detects rate limits, marks the key for cooldown, rotates, and retries.
 */
async function callProviderWithTools(
    initialConfig: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const MAX_ATTEMPTS = 5;
    let config = initialConfig;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
            console.warn(`[callProviderWithTools] Attempt ${attempt}/${MAX_ATTEMPTS} failed:`, errMsg);

            if (errMsg.includes('429')) {
                markKeyRateLimited(config.apiKey);
            }

            if (attempt === MAX_ATTEMPTS) throw error;

            rotateKey();
            config = getProviderConfig();

            // Wait a moment before hammering the API again
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    throw new Error('Unreachable');
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

    const body = {
        contents,
        tools: geminiTools,
        tool_config: { function_calling_config: { mode: 'AUTO' } },
        ...(systemMsg && {
            system_instruction: { parts: [{ text: systemMsg.content }] },
        }),
        generation_config: {
            temperature: 0.1,
            max_output_tokens: 64000,
            thinking_level: 'HIGH'
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

    const body = {
        contents,
        ...(systemMsg && {
            system_instruction: { parts: [{ text: systemMsg.content }] },
        }),
        generation_config: {
            temperature: 0.3,
            max_output_tokens: 64000,
            thinking_level: 'HIGH'
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
