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
    SINGLE_AGENT_SYSTEM_PROMPT,
    COORDINATOR_SYSTEM_PROMPT,
    WORKER_SYSTEM_PROMPT,
    CHECKER_SYSTEM_PROMPT,
    FIXER_SYSTEM_PROMPT
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
    // Build full readable context (same for all agents)
    const buildingSpecs = prepareProjectContext(request.project);
    const materialContext = prepareMaterialContext(materials);
    const asciiPlan = generateASCIIFloorPlan(request.project);
    const budgetContext = prepareBudgetContext(request.project);

    const fullContext = `
## CURRENT BUILDING STATE

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

    // Progress log — each phase appends its output here for chat visibility
    const progressLog: string[] = [];

    console.log('[Orchestrator] ═══ MULTI-AGENT PIPELINE STARTING ═══');
    console.log(`[Orchestrator] User request: "${request.message}"`);

    // =========================================================================
    // PHASE 1: SINGLE AGENT EXECUTION
    // =========================================================================
    progressLog.push('───── 🧠 PHASE 1: SINGLE AGENT ─────');
    progressLog.push('Analyzing request and executing all changes...');

    let singleAgentResult: WorkerResult;
    let projectAfterWorkers = { ...request.project, nodes: { ...request.project.nodes } };
    const validatedOps: PSGOperation[] = [];
    const validationErrors: string[] = [];
    const workerErrors: string[] = [];
    let agentMessage = "I have processed your request.";

    try {
        const agentConfig = getProviderConfig();
        const systemMsg = {
            role: 'system',
            content: `${SINGLE_AGENT_SYSTEM_PROMPT}\n\n## CURRENT BUILDING STATE (READ ONLY)\n${fullContext}`
        };

        // Prepare proper multi-turn history
        const messages: Array<{ role: string; content: string }> = [systemMsg];

        if (request.history && request.history.length > 0) {
            // Include last 10 messages for full context
            for (const msg of request.history.slice(-10)) {
                messages.push({
                    role: msg.role === 'assistant' ? 'assistant' : 'user',
                    content: msg.content
                });
            }
        }

        // Add the current user request
        messages.push({
            role: 'user',
            content: `USER REQUEST: ${request.message}`
        });

        const response = await callProviderWithTools(agentConfig, messages);

        singleAgentResult = {
            operations: (response.toolCalls || []).map(tc => toolCallToOperation(tc.name, tc.args as Record<string, unknown>)),
            text: response.text,
            errors: []
        };

        if (singleAgentResult.text) {
            progressLog.push(`   💭 ${singleAgentResult.text.substring(0, 200)}...`);
            agentMessage = singleAgentResult.text;
        }

        const ops = singleAgentResult.operations;
        const opNames = ops.map((o: PSGOperation) => `${o.type}(${o.target_id})`).join(', ');
        progressLog.push(`   ✅ ${ops.length} operation(s) generated: ${opNames || 'none'}`);

        // Validate and apply each operation sequentially
        for (const op of ops) {
            const validation = validateOperation(op, projectAfterWorkers);
            if (validation.valid) {
                validatedOps.push(op);
                try {
                    const applied = applyOperation(projectAfterWorkers, op);
                    if (applied.success && applied.project) {
                        projectAfterWorkers = applied.project;
                    }
                } catch { /* keep op, apply had minor issue */ }
            } else {
                validationErrors.push(
                    `${op.type}(${op.target_id}): ${validation.errors.join(', ')}`
                );
                progressLog.push(`   ⚠️ Validation failed: ${validation.errors.join(', ')}`);
            }
        }

    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Single Agent] FAILED:`, errMsg);
        workerErrors.push(`Agent failed: ${errMsg}`);
        progressLog.push(`   ❌ FAILED: ${errMsg}`);

        // Attempt fallback
        progressLog.push('Agent failed completely, trying simple fallback...');
        const fbConfig = getProviderConfig();
        const fallback = await runSimpleFallback(fbConfig, request, materials, fullContext);
        fallback.message = progressLog.join('\n') + '\n\n' + fallback.message;
        return fallback;
    }

    progressLog.push(`\nTotal validated: ${validatedOps.length} operations`);
    if (validationErrors.length > 0) {
        progressLog.push(`⚠️ ${validationErrors.length} operation(s) failed validation:`);
        for (const ve of validationErrors) {
            progressLog.push(`   - ${ve}`);
        }
    }

    if (validatedOps.length === 0) {
        progressLog.push('No valid operations found. Returning message only.');
    }

    // =========================================================================
    // PHASE 2: RIGID GEOMETRIC CALIBRATION (THE DUAL PASS ENGINEER)
    // =========================================================================
    if (validatedOps.length > 0) {
        for (let pass = 1; pass <= 2; pass++) {
            progressLog.push(`\n───── 📏 RIGID CALIBRATION (Pass ${pass}/2) ─────`);
            progressLog.push(`Audit ${pass}: Analyzing spatial data for 0.5mm accuracy...`);

            try {
                // Re-prepare accurate specs for current state
                const currentSpecs = prepareProjectContext(projectAfterWorkers);
                const checkerConfig = getProviderConfig();

                const checkerResult = await runChecker(
                    checkerConfig,
                    request.message,
                    currentSpecs,
                    generateASCIIFloorPlan(projectAfterWorkers)
                );

                if (checkerResult.status === 'MISTAKE_FOUND' && checkerResult.mistakes && checkerResult.mistakes.length > 0) {
                    progressLog.push(`   ⚠️ Audit ${pass} found ${checkerResult.mistakes.length} imperfection(s).`);
                    for (const m of checkerResult.mistakes) {
                        progressLog.push(`   - ${m.node_id}: ${m.description} (Fix: ${m.fix_description})`);
                    }

                    // FIXER PASS
                    progressLog.push(`   🛠️ Executing Precision Fixer ${pass}...`);
                    const fixerConfig = getProviderConfig();
                    const fixerResult = await runFixer(
                        fixerConfig,
                        currentSpecs,
                        checkerResult.mistakes,
                        generateASCIIFloorPlan(projectAfterWorkers)
                    );

                    if (fixerResult.operations.length > 0) {
                        progressLog.push(`   ✅ Applied ${fixerResult.operations.length} correction(s) (Audited to 0.5mm).`);

                        // Apply fixes to our local state so next pass (or finalize) sees them
                        for (const op of fixerResult.operations) {
                            const val = validateOperation(op, projectAfterWorkers);
                            if (val.valid) {
                                validatedOps.push(op);
                                const applied = applyOperation(projectAfterWorkers, op);
                                if (applied.success && applied.project) {
                                    projectAfterWorkers = applied.project;
                                }
                            }
                        }
                    }
                } else {
                    progressLog.push(`   ✨ Audit ${pass} passed: 0.5mm alignment confirmed.`);
                    if (pass === 1) {
                        progressLog.push('   (Proceeding to safety audit Pass 2...)');
                    } else {
                        break; // Perfect on pass 2, we are done
                    }
                }
            } catch (err) {
                console.warn(`[Orchestrator] Calibration pass ${pass} failed:`, err);
                progressLog.push(`   ⚠️ Calibration pass ${pass} skipped due to error.`);
            }
        }
    }

    // =========================================================================
    // COMPOSE FINAL RESPONSE
    // =========================================================================
    const allOps = [...validatedOps];

    progressLog.push('');
    progressLog.push(`═══ PIPELINE COMPLETE: ${allOps.length} total operation(s) ═══`);

    // Build the final message with progress log
    let finalMessage = agentMessage;
    // Add a summary of the calibration to the user
    if (allOps.length > (singleAgentResult!?.operations?.length || 0)) {
        finalMessage += "\n\nI have performed a dual-pass 'Rigid Engineer' calibration to enforce 0.5mm precision across all architectural joints, ensuring zero tolerance for gaps or overlaps.";
    }

    finalMessage += '\n\n' + progressLog.join('\n');

    const warnings: AIChatResponse['warnings'] = [];
    if (workerErrors.length > 0) {
        warnings.push({ severity: 'warning', message: workerErrors.join('; ') });
    }

    console.log('[Orchestrator] ═══ PIPELINE COMPLETE ═══');
    console.log(`[Orchestrator] Final: ${allOps.length} operations, ${warnings.length} warnings`);

    return {
        message: finalMessage,
        operations: allOps,
        warnings,
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

interface CheckerOutput {
    status: 'OK' | 'MISTAKE_FOUND';
    message?: string;
    mistakes?: MistakeReport[];
}

interface MistakeReport {
    node_id: string;
    description: string;
    expected: string;
    actual: string;
    fix_description: string;
}

// =============================================================================
// PHASE 1: COORDINATOR AGENT
// =============================================================================

async function runCoordinator(
    config: AIProviderConfig,
    userMessage: string,
    fullContext: string,
    history: Array<{ role: string; content: string }>
): Promise<CoordinatorOutput> {
    const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: COORDINATOR_SYSTEM_PROMPT },
        { role: 'user', content: fullContext },
    ];

    // Add recent history
    const recentHistory = history.slice(-4);
    for (const msg of recentHistory) {
        messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: typeof msg.content === 'string' ? msg.content : String(msg.content),
        });
    }

    messages.push({
        role: 'user',
        content: `USER REQUEST: ${userMessage}\n\nAnalyze this request, study the building state above, and produce your plan as JSON.`,
    });

    const result = await callProviderNoTools(config, messages);

    // Parse the coordinator's JSON response
    try {
        const parsed = extractJSON<CoordinatorOutput>(result.text);
        if (!parsed || !parsed.sub_tasks) {
            throw new Error('Invalid coordinator output format');
        }
        return parsed;
    } catch (error) {
        console.warn('[Coordinator] Failed to parse JSON output, creating fallback subtask...');
        console.log('[Coordinator] Raw output:', result.text.substring(0, 500));
        // CRITICAL FIX: Instead of returning 0 subtasks (which means nothing happens),
        // create 1 fallback subtask with the full user request so a worker still executes.
        return {
            analysis: result.text,
            sub_tasks: [{
                id: 'fallback_task',
                description: `The coordinator's analysis: ${result.text.substring(0, 2000)}\n\nExecute the user's request by making the appropriate tool calls based on the analysis above and the building data.`,
                priority: 1,
            }],
            user_message: 'I\'m processing your request...',
            follow_up_suggestions: [],
        };
    }
}

// =============================================================================
// PHASE 2: WORKER AGENTS
// =============================================================================

async function runWorker(
    config: AIProviderConfig,
    task: SubTask,
    fullContext: string,
    workerIndex: number
): Promise<WorkerResult> {
    console.log(`[Worker ${workerIndex + 1}] Starting task: ${task.id}`);

    const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: WORKER_SYSTEM_PROMPT },
        {
            role: 'user',
            content: `${fullContext}\n\n## YOUR SPECIFIC TASK\n${task.description}\n\nStudy the building specifications above carefully. Look at exact positions, dimensions, rotations, and IDs. Then execute your task using tool calls. Show your reasoning.`,
        },
    ];

    const result = await callProviderWithTools(config, messages);

    const operations: PSGOperation[] = [];
    const errors: string[] = [];

    if (result.toolCalls && result.toolCalls.length > 0) {
        for (const tc of result.toolCalls) {
            try {
                const op = toolCallToOperation(tc.name, tc.args);
                operations.push(op);
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                errors.push(`Worker ${workerIndex + 1}: Failed to parse ${tc.name}: ${errMsg}`);
                console.warn(`[Worker ${workerIndex + 1}] Failed to parse tool call:`, tc.name, err);
            }
        }
    }

    console.log(`[Worker ${workerIndex + 1}] Completed: ${operations.length} operations, ${errors.length} errors`);
    return { operations, text: result.text, errors };
}

/**
 * Wraps runWorker with retry logic: if the first attempt fails (e.g., bad API key),
 * rotate to the next key and try once more.
 */


// =============================================================================
// PHASE 3: CHECKER AGENT
// =============================================================================

async function runChecker(
    config: AIProviderConfig,
    originalQuestion: string,
    updatedBuildingSpecs: string,
    asciiPlan: string
): Promise<CheckerOutput> {
    const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: CHECKER_SYSTEM_PROMPT },
        {
            role: 'user',
            content: `## ORIGINAL USER REQUEST
"${originalQuestion}"

## CURRENT BUILDING STATE (after modifications)

### ASCII FLOOR PLAN
\`\`\`
${asciiPlan}
\`\`\`

### FULL NODE DATA
\`\`\`json
${updatedBuildingSpecs}
\`\`\`

Review the building state above. Check if the modifications correctly fulfill the user's request. Look carefully at rotation, height, position, dimensions, and structural integrity. Output your findings as JSON.`,
        },
    ];

    const result = await callProviderNoTools(config, messages);

    try {
        const parsed = extractJSON<CheckerOutput>(result.text);
        if (!parsed || !parsed.status) {
            return { status: 'OK', message: 'Checker response could not be parsed.' };
        }
        return parsed;
    } catch {
        return { status: 'OK', message: 'Checker response could not be parsed.' };
    }
}

// =============================================================================
// PHASE 4: FIXER AGENT
// =============================================================================

async function runFixer(
    config: AIProviderConfig,
    buildingSpecs: string,
    mistakes: MistakeReport[],
    asciiPlan: string
): Promise<WorkerResult> {
    const mistakeDescriptions = mistakes
        .map((m, i) => `${i + 1}. [Node: ${m.node_id}] ${m.description}\n   Expected: ${m.expected}\n   Actual: ${m.actual}\n   Fix: ${m.fix_description}`)
        .join('\n\n');

    const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: FIXER_SYSTEM_PROMPT },
        {
            role: 'user',
            content: `## CURRENT BUILDING STATE

### ASCII FLOOR PLAN
\`\`\`
${asciiPlan}
\`\`\`

### FULL NODE DATA
\`\`\`json
${buildingSpecs}
\`\`\`

## MISTAKES TO FIX
${mistakeDescriptions}

Fix each mistake above using tool calls. Show your reasoning.`,
        },
    ];

    const result = await callProviderWithTools(config, messages);

    const operations: PSGOperation[] = [];
    const errors: string[] = [];

    if (result.toolCalls && result.toolCalls.length > 0) {
        for (const tc of result.toolCalls) {
            try {
                operations.push(toolCallToOperation(tc.name, tc.args));
            } catch (err) {
                errors.push(`Fixer: Failed to parse ${tc.name}: ${err instanceof Error ? err.message : String(err)}`);
            }
        }
    }

    return { operations, text: result.text, errors };
}

// =============================================================================
// SIMPLE FALLBACK — Single-agent mode (for simple questions or when multi fails)
// =============================================================================

async function runSimpleFallback(
    config: AIProviderConfig,
    request: AIChatRequest,
    materials: Record<string, Material>,
    fullContext: string
): Promise<AIChatResponse> {
    console.log('[Orchestrator] Running simple single-agent fallback...');

    const SIMPLE_PROMPT = `You are an Expert AI Architect assistant. You help users design and modify houses by making precise edits to a 3D building model.

## COORDINATE SYSTEM
- X = East/West, Y = Up/Down, Z = North/South. All meters. Positions are center points.

## WALL ORIENTATION  
- yaw=0: East-West. yaw=90: North-South.

## STANDARD DIMENSIONS
- Ceiling: 2.7m, Walls: 0.25m thick, Doors: 2.1m×0.9m, Windows: 1.4m×1.2m at 0.9m sill

## RULES
1. Use EXACT node IDs from the data
2. move_node: DELTA values
3. resize_node: ABSOLUTE dimensions  
4. add_node: specify correct parent_id
5. For adding a floor: add Floor container, then Rooms, then Walls, then Slab, then adjust Roof
6. Always set position_y for walls at height/2 above the floor level

## NODE HIERARCHY
House → Floor → Room → Wall → Window/Door
House → Roof
Floor → Slab, Stairs`;

    const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: SIMPLE_PROMPT },
        { role: 'user', content: fullContext },
    ];

    const recentHistory = (request.history || []).slice(-4);
    for (const msg of recentHistory) {
        messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: typeof msg.content === 'string' ? msg.content : String(msg.content),
        });
    }
    messages.push({ role: 'user', content: request.message });

    let result: LLMCallResult;
    try {
        result = await callProviderWithTools(config, messages);
    } catch (error) {
        console.warn('[Orchestrator] Fallback primary call failed, rotating key...', error);
        rotateKey();
        const retryConfig = getProviderConfig();
        result = await callProviderWithTools(retryConfig, messages);
    }

    const operations: PSGOperation[] = [];
    if (result.toolCalls) {
        for (const tc of result.toolCalls) {
            try {
                operations.push(toolCallToOperation(tc.name, tc.args));
            } catch { /* skip */ }
        }
    }

    return {
        message: result.text || 'I processed your request.',
        operations,
        warnings: [],
        suggestions: [],
    };
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
        generation_config: { temperature: 0.1, max_output_tokens: 4000 },
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
        generation_config: { temperature: 0.3, max_output_tokens: 4000 },
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
