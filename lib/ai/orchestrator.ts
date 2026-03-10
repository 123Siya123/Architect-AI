/**
 * =============================================================================
 * LIB/AI/ORCHESTRATOR.TS — Parallel Cognitive Architecture
 * =============================================================================
 *
 * ARCHITECTURE:
 * ┌─────────────────────────────────────────────────────┐
 * │           ORCHESTRATOR (Every Turn)                  │
 * │  "What needs to happen next to achieve the goal?"   │
 * └─────────────────────────────────────────────────────┘
 *                          ↓
 *         ┌────────────────┼────────────────┐
 *         ↓                ↓                ↓
 * ┌──────────────┐  ┌─────────────┐  ┌──────────────┐
 * │   STRUCTURAL │  │   SPATIAL   │  │  AESTHETIC   │
 * │   ENGINEER   │  │  PHYSICIST  │  │  DESIGNER    │
 * └──────────────┘  └─────────────┘  └──────────────┘
 *         │                │                │
 *         └────────────────┼────────────────┘
 *                          ↓
 *               ┌──────────────────┐
 *               │  SHARED 3D GRAPH │
 *               │  (Single Source   │
 *               │   of Truth)       │
 *               └──────────────────┘
 *
 * FLOW:
 *   1. Orchestrator analyzes state → delegates to ONE specialist
 *   2. Structural Engineer builds (with pre-flight checks)
 *   3. Spatial Physicist validates every structural change
 *   4. If violations → Orchestrator routes to Engineer for fixes
 *   5. Aesthetic Designer reviews periodically (every 5 turns)
 *   6. Repeat until DESIGN_COMPLETE
 *
 * KEY IMPROVEMENTS OVER v3 (Sequential Phased):
 *   - Constraint checking is FRONT-LOADED in the Engineer
 *   - Physicist has VETO POWER (must fix before proceeding)
 *   - Single Source of Truth (shared 3D graph)
 *   - Orchestrator is LIGHTWEIGHT (no tool calls)
 *   - Typically finishes in 12-15 turns instead of 25
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
import { getProviderConfig, rotateKey, markKeyRateLimited, getPoolSize, getNextKey, type AIProviderConfig } from './key-manager';
import { validateOperation } from '@/lib/psg/validator';
import { applyOperation } from '@/lib/psg/operations';
import {
    prepareProjectContext,
    prepareMaterialContext,
    prepareBudgetContext,
    generateASCIIFloorPlan,
    prepare3DNodeTree,
    prepareProgressChecklist,
    DecisionHistory,
} from './context';
import {
    ORCHESTRATOR_PROMPT,
    STRUCTURAL_ENGINEER_PROMPT,
    SPATIAL_PHYSICIST_PROMPT,
    AESTHETIC_DESIGNER_PROMPT,
    INTERIOR_ARCHITECT_PROMPT,
} from './prompts';
import { logAgentStep, clearLogs } from './logger';
import { IdempotencyRegistry, NodeRegistryEntry } from './idempotency-registry';
import { OperationOutcome, PhysicsViolation } from './types';
import { wallCenterY, floorTopY, STANDARDS } from './geometry-formulas';
import { checkCompletionGates, GateResult } from './completion-gates';


/**
 * Stores the history of decisions and results for loop detection
 */
interface TurnRecord {
    turn: number;
    agent: string;
    decision: string;
    operations: string[];
    violations: string[];
    result: 'SUCCESS' | 'FAILED' | 'SKIPPED_DUPLICATE' | 'NEEDS_PHYSICS_FIX';
    outcome?: OperationOutcome;
}

async function applyPhysicsAutoFix(
    violation: PhysicsViolation,
    project: PSGProject
): Promise<PSGOperation | null> {
    const nodeId = violation.nodeId;
    const existingNode = project.nodes[nodeId];
    if (!existingNode) {
        console.error(`[AutoFix] ABORT: node ${nodeId} not found. Will not create new node.`);
        return null;
    }

    return {
        type: "set_node_position",
        target_id: nodeId,
        params: {
            position_x: violation.suggestedFix.x ?? existingNode.position.x,
            position_y: violation.suggestedFix.y ?? existingNode.position.y,
            position_z: violation.suggestedFix.z ?? existingNode.position.z,
            source: "physics_autofix"
        },
        timestamp: new Date().toISOString()
    };
}

// =============================================================================
// TYPES
// =============================================================================

interface OrchestratorDecision {
    reasoning: string;
    delegate_to: 'structural_engineer' | 'interior_architect' | 'spatial_physicist' | 'aesthetic_designer' | 'DESIGN_COMPLETE';
    instruction: string;
    phase: OrchestratorPhase;
    priority?: 'critical' | 'high' | 'normal';
}

export type OrchestratorPhase =
    | 'PHASE_0_TEMPLATE_CHECK'
    | 'PHASE_1_SITE_ANALYSIS'
    | 'PHASE_2_MASSING'
    | 'PHASE_3_ROOM_LAYOUT'
    | 'PHASE_4_OPENINGS'
    | 'PHASE_5_VERTICAL'
    | 'PHASE_6_ROOF'
    | 'PHASE_7_DETAILS'
    | 'PHASE_8_MATERIALS'
    | 'PHASE_9_EXPORT_PREP'
    | 'PHASE_COMPLETE';

export interface BuildingBrief {
    buildingType: string;
    floorCount: number;
    style: string;
    rooms: string[];
    specialFeatures: string[];
    budgetHint?: string;
}

interface PhysicsValidation {
    status: 'PHYSICS_VALID' | 'VIOLATIONS_FOUND';
    violations: PhysicsViolation[];
    summary: string;
}

interface AestheticReview {
    aesthetic_score: number;
    style_match?: string;
    recommendations: Array<{
        element_id?: string;
        suggestion: string;
        priority: string;
        action?: string;
    }>;
    summary: string;
}

interface ToolCall {
    name: string;
    args: Record<string, unknown>;
}

interface LLMCallResult {
    text: string;
    toolCalls?: ToolCall[];
}

type ProgressEvent =
    | { type: 'log'; content: string }
    | { type: 'operation'; operation: PSGOperation; turn: number; agent: TurnRecord['agent'] };


// =============================================================================
// MAIN EXPORT — Send Chat to AI (Parallel Cognitive Architecture)
// =============================================================================

export async function sendChatToAI(
    request: AIChatRequest,
    materials: Record<string, Material>,
    onProgress?: (event: ProgressEvent) => void,
    signal?: AbortSignal
): Promise<AIChatResponse> {
    const progressLog: string[] = [];
    const log = (message: string) => {
        progressLog.push(message);
        console.log(`[Orchestrator] ${message}`);
        onProgress?.({ type: 'log', content: message });
    };

    const emitOperation = (operation: PSGOperation, turn: number, agent: string) => {
        onProgress?.({ type: 'operation', operation, turn, agent: agent as any });
    };

    let currentProject = { ...request.project, nodes: { ...request.project.nodes } };
    const allValidatedOps: PSGOperation[] = [];
    const maxTurns = 20;
    let finalMessage = '';
    const turnHistory: TurnRecord[] = [];
    const registry = new IdempotencyRegistry();
    let currentPhase: OrchestratorPhase = 'PHASE_1_SITE_ANALYSIS';
    const config = getProviderConfig();

    const structuralTargets = inferStructuralTargets(request.message);
    let pendingViolations: PhysicsViolation[] = [];

    // Intervene if precision is low
    const precisionBootstrap = ensureConstructionPrecision(currentProject);
    if (precisionBootstrap) {
        log(`   🛠️ SYSTEM INTERVENTION: Bootstrapping construction precision (0.5mm)...`);
        const opResult = applyOperation(currentProject, precisionBootstrap);
        if (opResult.success && opResult.project) {
            currentProject = opResult.project;
            allValidatedOps.push(precisionBootstrap);
            log('🎯 Precision set to construction level (0.5mm)');
        }
    }

    for (let turn = 1; turn <= maxTurns; turn++) {
        log(`\n───── 🔄 TURN ${turn}/${maxTurns} ── Phase: ${currentPhase} ───`);

        const gateResults = checkCompletionGates(currentProject, pendingViolations);
        const gatesPrompt = gateResults.map(g => `${g.passed ? '✅' : '❌'} ${g.name}${g.failReason ? ': ' + g.failReason : ''}`).join('\n');

        const context = `
CURRENT PROJECT STATE (NODE TREE):
${prepare3DNodeTree(currentProject)}

IDEMPOTENCY GUARD:
${registry.getPromptBlock()}

GEOMETRY STANDARDS (CONSTANTS):
- Wall Height (STD): ${STANDARDS.WALL_HEIGHT_STD}m
- Floor Slab Thickness: ${STANDARDS.SLAB_THICKNESS}m
- Exterior Wall Thickness: ${STANDARDS.WALL_THICKNESS}m
- Interior Wall Thickness: ${STANDARDS.INTERIOR_WALL_THICK}m

COMPLETION STATUS:
${gatesPrompt}

PENDING PHYSICS VIOLATIONS:
${pendingViolations.length > 0 ? pendingViolations.map(v => `- [${v.severity}] on ${v.nodeId}: ${v.description}`).join('\n') : 'None.'}

TURN HISTORY:
${formatTurnHistory(turnHistory)}
`;

        const orchestratorMessages = [
            { role: 'system', content: ORCHESTRATOR_PROMPT },
            { role: 'user', content: `USER COMMAND: ${request.message}\n\nCURRENT DESIGN STATE:\n${context}` }
        ];

        const orchestratorResult = await callProviderNoTools(config, orchestratorMessages as any, undefined, signal);
        const decision = extractOrchestratorDecision(orchestratorResult.text);

        log(`   🎯 DECISION: Delegate to ${decision.delegate_to}`);
        log(`   📖 RATIONALE: ${decision.reasoning}`);
        log(`   📜 INSTRUCTION: ${decision.instruction}`);

        // Specialist delegation
        const agentPrompt = decision.delegate_to === 'structural_engineer' ? STRUCTURAL_ENGINEER_PROMPT :
            decision.delegate_to === 'interior_architect' ? INTERIOR_ARCHITECT_PROMPT :
                decision.delegate_to === 'spatial_physicist' ? SPATIAL_PHYSICIST_PROMPT :
                    AESTHETIC_DESIGNER_PROMPT;

        const specialistMessages = [
            { role: 'system', content: agentPrompt },
            { role: 'user', content: `ORCHESTRATOR INSTRUCTION:\n${decision.instruction}\n\nCURRENT DESIGN STATE:\n${context}` }
        ];

        const useTools = decision.delegate_to === 'structural_engineer' || decision.delegate_to === 'interior_architect';
        const specialistResult = useTools
            ? await callProviderWithTools(config, specialistMessages as any, undefined, signal)
            : await callProviderNoTools(config, specialistMessages as any, undefined, signal);

        const turnOps: PSGOperation[] = [];
        let successCount = 0;
        let turnResult: 'SUCCESS' | 'FAILED' | 'SKIPPED_DUPLICATE' | 'NEEDS_PHYSICS_FIX' = 'FAILED';

        if (specialistResult.toolCalls && specialistResult.toolCalls.length > 0) {
            for (const tc of specialistResult.toolCalls) {
                const op = toolCallToOperation(tc.name, tc.args);

                // Idempotency check for add_node
                if (op.type === 'add_node') {
                    const semanticRole = (op.params.name as string) || (op.params.type as string);
                    if (registry.checkExists(semanticRole)) {
                        log(`   ⏭️ SKIPPED DUPLICATE: ${op.type} (${semanticRole})`);
                        turnResult = 'SKIPPED_DUPLICATE';
                        continue;
                    }
                    registry.register(semanticRole, 'pending');
                }

                const validation = validateOperation(op, currentProject);
                if (validation.valid) {
                    const opResult = applyOperation(currentProject, op);
                    if (opResult.success && opResult.project) {
                        currentProject = opResult.project;
                        allValidatedOps.push(op);
                        turnOps.push(op);
                        successCount++;

                        // Update registry with correct ID
                        if (op.type === 'add_node') {
                            const semanticRole = (op.params.name as string) || (op.params.type as string);
                            // We need to find the new node ID. Usually applyOperation returns it.
                            // In our PSG implementation, we can look at the parent's last child or something.
                            // But for now, let's just use the ID we generated in toolCallToOperation if it's there.
                            registry.updateId(semanticRole, opResult.nodeId || 'unknown');
                        }
                        emitOperation(op, turn, decision.delegate_to);
                    }
                } else {
                    log(`   ❌ REJECTED ${op.type}: ${validation.errors[0]}`);
                }
            }

            if (successCount > 0) turnResult = 'SUCCESS';

            // Physics validation if we made changes
            if (successCount > 0) {
                const physicsState = `LATEST CHANGES:\n${turnOps.map(o => `${o.type} on ${o.target_id}`).join('\n')}\n\nFULL STATE:\n${prepare3DNodeTree(currentProject)}`;
                const physicsResultLLM = await callProviderNoTools(config, [
                    { role: 'system', content: SPATIAL_PHYSICIST_PROMPT },
                    { role: 'user', content: physicsState }
                ], undefined, signal);
                const physParsed = extractPhysicsViolations(physicsResultLLM.text);

                pendingViolations = physParsed.violations;
                if (physParsed.status !== 'PHYSICS_VALID') {
                    log(`   ⚠️ PHYSICS VIOLATIONS: Found ${pendingViolations.length} issues`);
                    turnResult = 'NEEDS_PHYSICS_FIX';
                }
            }
        } else {
            // Non-tool response (analysis or designer feedback)
            log(`   ℹ️ specialist provided text response only`);
            if (decision.delegate_to === 'spatial_physicist') {
                const physParsed = extractPhysicsViolations(specialistResult.text);
                pendingViolations = physParsed.violations;
                turnResult = physParsed.status === 'PHYSICS_VALID' ? 'SUCCESS' : 'NEEDS_PHYSICS_FIX';
            } else if (decision.delegate_to === 'aesthetic_designer') {
                turnResult = 'SUCCESS';
            }
        }

        // Auto-fix critical violations
        const criticalsToFix = pendingViolations.filter(v => v.severity === 'CRITICAL' && v.autoFixable);
        if (criticalsToFix.length > 0) {
            log(`🔧 AUTO-FIXING ${criticalsToFix.length} critical violations...`);
            for (const v of criticalsToFix) {
                const fixOp = await applyPhysicsAutoFix(v, currentProject);
                if (fixOp) {
                    const opResult = applyOperation(currentProject, fixOp);
                    if (opResult.success && opResult.project) {
                        currentProject = opResult.project;
                        allValidatedOps.push(fixOp);
                        emitOperation(fixOp, turn, 'system');
                    }
                }
            }
            // Rapid re-validation after auto-fix
            const reval = await callProviderNoTools(config, [
                { role: 'system', content: SPATIAL_PHYSICIST_PROMPT },
                { role: 'user', content: `STATE AFTER AUTO-FIX:\n${prepare3DNodeTree(currentProject)}` }
            ], undefined, signal);
            pendingViolations = extractPhysicsViolations(reval.text).violations;
        }

        turnHistory.push({
            turn,
            agent: decision.delegate_to,
            decision: decision.instruction,
            operations: turnOps.map(o => o.type),
            violations: pendingViolations.map(v => v.description),
            result: turnOps.length > 0 ? 'SUCCESS' : 'FAILED'
        });

        if (turnOps.length > 0) {
            currentProject = await reloadProjectState(currentProject.id, currentProject);
        }
    }

    return {
        project: currentProject,
        message: finalMessage || "Design session ended.",
        operations: allValidatedOps,
        warnings: [],
        history: turnHistory as any
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

        case 'set_node_position':
            return {
                type: 'set_node_position',
                target_id: (args.target_id as string) || 'unknown',
                params: {
                    ...(args.position_x !== undefined && { position_x: args.position_x }),
                    ...(args.position_y !== undefined && { position_y: args.position_y }),
                    ...(args.position_z !== undefined && { position_z: args.position_z }),
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

/**
 * Calls the LLM WITHOUT tools (for Orchestrator, Physicist, Aesthetic agents).
 * Automatically detects rate limits, timeouts, marks the key for cooldown, rotates, and retries.
 */
async function callProviderNoTools(
    initialConfig: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    attachments?: { name: string; type: string; data: string }[],
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const MAX_TOTAL_ATTEMPTS = 7;
    let config = initialConfig;
    let timeoutMultiplier = 1; // Escalate timeout on retry
    let keysTriedForCurrentModel = 1;
    let maxKeysForProvider = getPoolSize(config.provider);

    for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
        if (signal?.aborted) throw new Error('User cancelled');
        try {
            // Pass timeout multiplier context via a patched config
            const callConfig = { ...config, _timeoutMultiplier: timeoutMultiplier } as any;
            switch (config.provider) {
                case 'gemini': return await callGeminiNoTools(callConfig, messages, attachments, signal);
                case 'groq': return await callGroqNoTools(config, messages, signal);
                case 'openai': return await callOpenAINoTools(config, messages, signal);
                case 'github': return await callGithubNoTools(config, messages, signal);
                default: throw new Error(`Unknown provider: ${config.provider}`);
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);

            // User cancellation — propagate immediately, no retry
            if (errMsg.includes('User cancelled') || signal?.aborted) {
                throw new Error('User cancelled');
            }

            console.warn(`[callProviderNoTools] Attempt ${attempt}/${MAX_TOTAL_ATTEMPTS} failed:`, errMsg);

            const isTimeout = errMsg.includes('timed out') || errMsg.includes('Timeout');
            const isUnavailable = errMsg.includes('503') || errMsg.includes('404') || errMsg.includes('500');
            const isRateLimit = errMsg.includes('429');

            if (isTimeout) {
                // On timeout, increase timeout for next attempt instead of rotating
                timeoutMultiplier = Math.min(timeoutMultiplier + 0.5, 3);
                console.warn(`[callProviderNoTools] Timeout detected. Increasing timeout multiplier to ${timeoutMultiplier}x`);
            } else if ((isUnavailable || isRateLimit) && config.provider === 'gemini') {
                if (isRateLimit) markKeyRateLimited(config.apiKey);

                if (keysTriedForCurrentModel < maxKeysForProvider) {
                    rotateKey(config.provider);
                    config = { ...config, apiKey: getNextKey(config.provider) };
                    keysTriedForCurrentModel++;
                    console.warn(`[Orchestrator] Switching to next key for same model ${config.model}...`);
                } else {
                    keysTriedForCurrentModel = 1;
                    if (config.model.includes('gemini-3.1-pro')) {
                        console.warn('[Orchestrator] Gemini 3.1 Pro unavailable on all keys. Falling back to Gemini 3 Pro...');
                        config = { ...config, model: 'gemini-3-pro-preview' };
                        rotateKey(config.provider);
                        config.apiKey = getNextKey(config.provider);
                    } else if (config.model === 'gemini-3-pro-preview') {
                        console.warn('[Orchestrator] Gemini 3 Pro unavailable on all keys. Switching to Groq...');
                        config = getProviderConfig('groq');
                        maxKeysForProvider = getPoolSize(config.provider);
                    } else if (config.model === 'gemini-3-flash-preview') {
                        console.warn('[Orchestrator] Gemini 3 Flash unavailable on all keys. Switching to Groq...');
                        config = getProviderConfig('groq');
                        maxKeysForProvider = getPoolSize(config.provider);
                    } else {
                        rotateKey();
                        config = getProviderConfig();
                        maxKeysForProvider = getPoolSize(config.provider);
                    }
                }
            } else {
                if (errMsg.includes('429')) markKeyRateLimited(config.apiKey);
                rotateKey();
                config = getProviderConfig();
                maxKeysForProvider = getPoolSize(config.provider);
                keysTriedForCurrentModel = 1;
            }

            if (attempt === MAX_TOTAL_ATTEMPTS) throw error;
            // Escalating backoff: 500ms, 1s, 2s, 3s, ...
            const backoff = Math.min(500 * attempt, 5000);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw new Error('Retries exhausted');
}

/**
 * Calls the LLM WITH tools (for Structural Engineer).
 * Automatically detects rate limits, timeouts, marks the key for cooldown, rotates, and retries.
 */
async function callProviderWithTools(
    initialConfig: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    attachments?: { name: string; type: string; data: string }[],
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const MAX_TOTAL_ATTEMPTS = 7;
    let config = initialConfig;
    let timeoutMultiplier = 1;
    let keysTriedForCurrentModel = 1;
    let maxKeysForProvider = getPoolSize(config.provider);

    for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
        if (signal?.aborted) throw new Error('User cancelled');
        try {
            const callConfig = { ...config, _timeoutMultiplier: timeoutMultiplier } as any;
            switch (config.provider) {
                case 'gemini': return await callGemini(callConfig, messages, attachments, signal);
                case 'groq': return await callGroq(config, messages, signal);
                case 'openai': return await callOpenAI(config, messages, signal);
                case 'github': return await callGithub(config, messages, signal);
                default: throw new Error(`Unknown provider: ${config.provider}`);
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);

            // User cancellation — propagate immediately
            if (errMsg.includes('User cancelled') || signal?.aborted) {
                throw new Error('User cancelled');
            }

            console.warn(`[callProviderWithTools] Attempt ${attempt}/${MAX_TOTAL_ATTEMPTS} failed:`, errMsg);

            const isTimeout = errMsg.includes('timed out') || errMsg.includes('Timeout');
            const isUnavailable = errMsg.includes('503') || errMsg.includes('404') || errMsg.includes('500');
            const isRateLimit = errMsg.includes('429');

            if (isTimeout) {
                timeoutMultiplier = Math.min(timeoutMultiplier + 0.5, 3);
                console.warn(`[callProviderWithTools] Timeout detected. Increasing timeout multiplier to ${timeoutMultiplier}x`);
            } else if ((isUnavailable || isRateLimit) && config.provider === 'gemini') {
                if (isRateLimit) markKeyRateLimited(config.apiKey);

                if (keysTriedForCurrentModel < maxKeysForProvider) {
                    rotateKey(config.provider);
                    config = { ...config, apiKey: getNextKey(config.provider) };
                    keysTriedForCurrentModel++;
                    console.warn(`[Orchestrator] Switching to next key for same model ${config.model}...`);
                } else {
                    keysTriedForCurrentModel = 1;
                    if (config.model.includes('gemini-3.1-pro')) {
                        console.warn('[Orchestrator] Gemini 3.1 Pro unavailable on all keys. Falling back to Gemini 3 Pro...');
                        config = { ...config, model: 'gemini-3-pro-preview' };
                        rotateKey(config.provider);
                        config.apiKey = getNextKey(config.provider);
                    } else if (config.model === 'gemini-3-pro-preview') {
                        console.warn('[Orchestrator] Gemini 3 Pro unavailable on all keys. Switching to Groq...');
                        config = getProviderConfig('groq');
                        maxKeysForProvider = getPoolSize(config.provider);
                    } else if (config.model === 'gemini-3-flash-preview') {
                        console.warn('[Orchestrator] Gemini 3 Flash unavailable on all keys. Switching to Groq...');
                        config = getProviderConfig('groq');
                        maxKeysForProvider = getPoolSize(config.provider);
                    } else {
                        rotateKey();
                        config = getProviderConfig();
                        maxKeysForProvider = getPoolSize(config.provider);
                    }
                }
            } else {
                if (errMsg.includes('429')) markKeyRateLimited(config.apiKey);
                rotateKey();
                config = getProviderConfig();
                maxKeysForProvider = getPoolSize(config.provider);
                keysTriedForCurrentModel = 1;
            }

            if (attempt === MAX_TOTAL_ATTEMPTS) throw error;
            const backoff = Math.min(500 * attempt, 5000);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw new Error('Retries exhausted');
}

// =============================================================================
// GEMINI
// =============================================================================

async function callGemini(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    attachments?: { name: string; type: string; data: string }[],
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
            const parts: any[] = [{ text: m.content }];

            // Attach files to the last user message
            if (m === lastUserMessage && attachments && attachments.length > 0) {
                for (const att of attachments) {
                    parts.push({
                        inlineData: {
                            mimeType: att.type,
                            data: att.data
                        }
                    });
                }
            }

            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts,
            };
        });

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

    // Base timeout: 180s for thinking models, 90s for non-thinking
    const baseTimeout = isGemini3 ? 180000 : 90000;
    const timeoutMultiplier = (config as any)._timeoutMultiplier || 1;
    const timeoutMs = Math.round(baseTimeout * timeoutMultiplier);

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }, timeoutMs, signal); // Dynamic timeout for reasoning models

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
    messages: Array<{ role: string; content: string }>,
    attachments?: { name: string; type: string; data: string }[],
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
            const parts: any[] = [{ text: m.content }];

            // Attach files to the last user message
            if (m === lastUserMessage && attachments && attachments.length > 0) {
                for (const att of attachments) {
                    parts.push({
                        inlineData: {
                            mimeType: att.type,
                            data: att.data
                        }
                    });
                }
            }

            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts,
            };
        });

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

    // Base timeout: 180s for thinking models, 60s for non-thinking
    const baseTimeout = isGemini3 ? 180000 : 60000;
    const timeoutMultiplier = (config as any)._timeoutMultiplier || 1;
    const timeoutMs = Math.round(baseTimeout * timeoutMultiplier);

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }, timeoutMs, signal); // Dynamic timeout for reasoning models

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
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
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

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 45000, signal); // 45s for Groq (very fast)

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
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 1024,
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 45000);

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
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
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

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 60000, signal);

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
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 4000,
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 60000, signal);

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
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
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

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 60000, signal);

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
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = 'https://models.inference.ai.azure.com/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 4000,
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 60000, signal);

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
 * Merges consecutive messages of the same role. Useful for agent loops with observations.
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

function summarizeWallSurface(project: PSGProject, targetId: string): string {
    const node = project.nodes[targetId];
    if (!node) {
        return `Surface query failed: node "${targetId}" not found`;
    }
    if (node.type !== 'Wall' && node.type !== 'Partition') {
        return `Surface query failed: "${targetId}" is ${node.type}, must be Wall or Partition`;
    }
    if (!node.surface_matrix) {
        return `Surface ${targetId}: none`;
    }

    const sm = node.surface_matrix;
    const minValue = sm.min_value ?? 0;
    const maxValue = sm.max_value ?? 10;
    const holeThreshold = sm.hole_threshold ?? 0.01;
    const interp = sm.interpolation ?? 'bilinear';

    if (sm.code) {
        const code = sm.code.replace(/\s+/g, ' ').trim();
        const preview = code.length > 220 ? `${code.slice(0, 220)}...` : code;
        return `Surface ${targetId}: procedural res=${sm.resolution ?? 48} range=[${minValue},${maxValue}] hole<=${holeThreshold} interp=${interp} code="${preview}"`;
    }

    const rows = sm.rows;
    const cols = sm.cols;
    let observedMin = Number.POSITIVE_INFINITY;
    let observedMax = Number.NEGATIVE_INFINITY;
    let total = 0;
    let count = 0;
    let holeCount = 0;
    for (const row of sm.data) {
        for (const value of row) {
            const n = typeof value === 'number' && Number.isFinite(value) ? value : 1;
            observedMin = Math.min(observedMin, n);
            observedMax = Math.max(observedMax, n);
            total += n;
            count++;
            if (n <= holeThreshold) holeCount++;
        }
    }
    const avg = count > 0 ? round(total / count, 4) : 1;
    const holeRatio = count > 0 ? round((holeCount / count) * 100, 2) : 0;
    return `Surface ${targetId}: matrix ${rows}x${cols} range=[${minValue},${maxValue}] hole<=${holeThreshold} interp=${interp} data(min=${round(observedMin, 4)},max=${round(observedMax, 4)},avg=${avg},holes=${holeRatio}%)`;
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

/**
 * Reloads the project from the source of truth (database/file/memory store)
 * This ensures we're not working with stale cached coordinates
 */
async function reloadProjectState(projectId: string, project: PSGProject): Promise<PSGProject> {
    // Using deep clone to force re-serialization of coordinates
    return JSON.parse(JSON.stringify(project)) as PSGProject;
}

interface LoopDetection {
    isLoop: boolean;
    loopType?: 'SAME_VIOLATION' | 'SAME_TOOL_FAILING' | 'OSCILLATING';
    repeatedCount?: number;
    suggestedAction?: string;
    evidence?: string[];
}

function detectLoop(history: TurnRecord[]): LoopDetection {
    if (history.length < 3) {
        return { isLoop: false };
    }

    const last3Turns = history.slice(-3);
    const last5Turns = history.slice(-5);

    // PATTERN 1: Same violation reported 3+ times in a row
    const allFailed = last3Turns.every(t => t.result === 'FAILED');

    if (allFailed && last3Turns.length === 3) {
        const violation1 = normalizeViolation(last3Turns[0].violations[0] || '');
        const violation2 = normalizeViolation(last3Turns[1].violations[0] || '');
        const violation3 = normalizeViolation(last3Turns[2].violations[0] || '');

        const isSameViolation =
            (violation1.includes('floating') && violation2.includes('floating') && violation3.includes('floating')) ||
            (violation1.includes('misaligned') && violation2.includes('misaligned') && violation3.includes('misaligned')) ||
            (violation1.includes('overhang') && violation2.includes('overhang') && violation3.includes('overhang')) ||
            (violation1.includes('overlap') && violation2.includes('overlap') && violation3.includes('overlap')) ||
            (violation1.length > 10 && violation1 === violation2 && violation2 === violation3);

        if (isSameViolation) {
            return {
                isLoop: true,
                loopType: 'SAME_VIOLATION',
                repeatedCount: 3,
                suggestedAction: 'Use set_node_position instead of move_node, OR delete and rebuild',
                evidence: [
                    `Turn ${last3Turns[0].turn}: "${violation1}"`,
                    `Turn ${last3Turns[1].turn}: "${violation2}"`,
                    `Turn ${last3Turns[2].turn}: "${violation3}"`
                ]
            };
        }
    }

    // PATTERN 2: Same tool used 3+ times without success
    const toolCounts: Record<string, number> = {};
    for (const turn of last5Turns) {
        if (turn.result === 'FAILED') {
            for (const op of turn.operations) {
                toolCounts[op] = (toolCounts[op] || 0) + 1;
            }
        }
    }

    for (const [tool, count] of Object.entries(toolCounts)) {
        if (count >= 3) {
            return {
                isLoop: true,
                loopType: 'SAME_TOOL_FAILING',
                repeatedCount: count,
                suggestedAction: tool === 'move_node'
                    ? 'Switch to set_node_position for absolute positioning'
                    : 'Delete the element and rebuild from scratch',
                evidence: [`Tool "${tool}" failed ${count} times in last 5 turns`]
            };
        }
    }

    // PATTERN 3: Oscillating (fix A, then fix B, then fix A again)
    if (last5Turns.length === 5) {
        const v1 = last5Turns[0].violations[0] || '';
        const v3 = last5Turns[2].violations[0] || '';
        const v5 = last5Turns[4].violations[0] || '';

        if (v1 && v1.substring(0, 30) === v3.substring(0, 30) && v3.substring(0, 30) === v5.substring(0, 30)) {
            return {
                isLoop: true,
                loopType: 'OSCILLATING',
                repeatedCount: 3,
                suggestedAction: 'Fix is overcorrecting. Use smaller adjustments or set exact position.',
                evidence: [
                    `Turns ${last5Turns[0].turn}, ${last5Turns[2].turn}, ${last5Turns[4].turn} show same issue`
                ]
            };
        }
    }

    return { isLoop: false };
}

interface StructuralTargets {
    requiredFloors: number;
    farmStyle: boolean;
    complexity: 'standard' | 'high' | 'extreme';
    minTurns: number;
    customSurfaceRequested: boolean;
    preferredShapeMode: 'smooth' | 'linear';
}

interface CompletionStatus {
    structureReady: boolean;
    complete: boolean;
    missing: string[];
    nextInstruction: string;
}

function inferStructuralTargets(message: string): StructuralTargets {
    const normalized = message.toLowerCase();
    const floorMatch = normalized.match(/(\d+)\s*[- ]?floor/);
    const requiredFloors = floorMatch ? Math.max(1, Number(floorMatch[1])) : 1;
    const customSurfaceRequested = /matrix|surface|bulb|carv|relief|sculpt|custom design|thickness/.test(normalized);
    const preferredShapeMode: 'smooth' | 'linear' = /linear|sharp|cornery|cornery|blocky/.test(normalized) ? 'linear' : 'smooth';

    // Check for complexity/ambition keywords
    const highComplexity = /bond|villain|spectacular|huge|massive|complex|dynamic|matrix|curve|sculpt|futuristic|mansion|palace|grand/i.test(normalized);
    const extremeComplexity = (/detail|perfect|impressive|best|masterpiece|ultimate/i.test(normalized) && highComplexity) || /very dynamic|lot bigger/i.test(normalized);

    let complexity: 'standard' | 'high' | 'extreme' = 'standard';
    let minTurns = 4; // Default minimum

    if (extremeComplexity) {
        complexity = 'extreme';
        minTurns = 12;
    } else if (highComplexity) {
        complexity = 'high';
        minTurns = 8;
    }

    return {
        requiredFloors,
        farmStyle: /farm|estate/.test(normalized),
        complexity,
        minTurns,
        customSurfaceRequested,
        preferredShapeMode,
    };
}

function evaluateCompletion(
    project: PSGProject,
    targets: StructuralTargets,
    pendingViolations: PhysicsValidation['violations'],
    currentTurn: number
): CompletionStatus {
    const nodes = Object.values(project.nodes);
    const count = (type: PSGNode['type']) => nodes.filter(n => n.type === type).length;

    const floors = count('Floor');
    const rooms = count('Room');
    const walls = count('Wall');
    const roofs = count('Roof');
    const doors = count('Door');
    const windows = count('Window');
    const stairs = count('Stairs');
    const criticals = pendingViolations.filter(v => v.severity === 'CRITICAL').length;
    const hasSurfaceSculpt = nodes.some(n => (n.type === 'Wall' || n.type === 'Partition') && !!n.surface_matrix);

    const missing: string[] = [];

    // Check turn count first
    if (currentTurn < targets.minTurns) {
        missing.push(`continue refining (minimum ${targets.minTurns} turns for ${targets.complexity} complexity)`);
    }

    if (floors < targets.requiredFloors) missing.push(`add ${targets.requiredFloors - floors} floor(s)`);
    if (rooms < targets.requiredFloors) missing.push(`add ${targets.requiredFloors - rooms} room(s)`);
    if (walls < targets.requiredFloors * 4) missing.push('add full perimeter walls for all floors');
    if (roofs < 1) missing.push('add a roof');
    if (doors < 1) missing.push('add at least one entrance door');
    if (windows < Math.max(4, targets.requiredFloors * 2)) missing.push('add more windows');
    if (targets.requiredFloors > 1 && stairs < 1) missing.push('add stairs connecting floors');
    if (criticals > 0) missing.push('resolve critical physics violations');
    if (targets.customSurfaceRequested && !hasSurfaceSculpt) missing.push('apply custom matrix surface sculpting');

    // Add complexity specific checks
    if (targets.complexity !== 'standard') {
        if (rooms < targets.requiredFloors * 3) missing.push('add more rooms for complexity');
        if (windows < 8) missing.push('add more windows for impressiveness');
    }

    const structureReady = floors >= targets.requiredFloors && walls >= targets.requiredFloors * 4 && roofs >= 1;
    const complete = missing.length === 0;

    let styleHint = targets.farmStyle
        ? 'Use a farm estate style: pitched roof, porch, and practical family layout.'
        : 'Maintain requested style coherence.';

    if (targets.complexity === 'high' || targets.complexity === 'extreme') {
        styleHint += ' Make it impressive and detailed.';
    }

    const nextInstruction = missing.length > 0
        ? `Continue construction and resolve: ${missing.slice(0, 4).join(', ')}. ${styleHint}`
        : `Finalize any remaining details. ${styleHint}`;

    return { structureReady, complete, missing, nextInstruction };
}

function buildCriticalFixInstruction(criticals: PhysicsViolation[]): string {
    const fixes = criticals
        .filter(v => v.suggestedFix?.operation)
        .slice(0, 6)
        .map(v => {
            const fix = v.suggestedFix!;
            const coordText = fix.x !== undefined || fix.y !== undefined || fix.z !== undefined
                ? ` to [${fix.x ?? 'keep'}, ${fix.y ?? 'keep'}, ${fix.z ?? 'keep'}]`
                : '';
            return `${fix.operation} ${v.nodeId}${coordText}`;
        });

    if (fixes.length === 0) {
        return 'Resolve all CRITICAL physics violations first. Use absolute positioning and exact coordinates.';
    }

    return `Resolve CRITICAL physics violations only in this turn: ${fixes.join('; ')}. Use set_node_position over move_node whenever coordinates are provided.`;
}

function shouldApplySurfaceSculpt(project: PSGProject, targets: StructuralTargets): boolean {
    if (!targets.customSurfaceRequested) return false;
    const nodes = Object.values(project.nodes);
    const wallCandidates = nodes.filter(n => n.type === 'Wall' || n.type === 'Partition');

    // CRITICAL FIX: Do not sculpt if there are no walls to sculpt
    if (wallCandidates.length === 0) return false;

    const hasSurfaceSculpt = wallCandidates.some(n => !!n.surface_matrix);
    return !hasSurfaceSculpt;
}

function buildSurfaceMatrixInstruction(project: PSGProject, targets: StructuralTargets): string {
    const candidates = Object.values(project.nodes)
        .filter(n => n.type === 'Wall' || n.type === 'Partition')
        .sort((a, b) => (b.dimensions.x * b.dimensions.y) - (a.dimensions.x * a.dimensions.y));
    const target = candidates[0];
    const targetHint = target ? `Target wall: ${target.id}.` : 'Pick the most relevant visible exterior wall.';
    const shapeMode = targets.preferredShapeMode;
    return `${targetHint} Perform custom surface sculpting with full matrix control. First call get_wall_surface on the target. Then call edit_wall_surface with command="set_matrix", shape_mode="${shapeMode}", rows and cols between 20 and 40, and provide the FULL data matrix in one call. Matrix orientation must be top-first: data[0][0]=upper-left, data[0][last]=upper-right, data[last][0]=lower-left, data[last][last]=lower-right. Use lower values for carve-ins and higher values for bulbs, and set a clear description.`;
}

function ensureConstructionPrecision(project: PSGProject): PSGOperation | null {
    if (project.settings.precision_level === 2 && project.settings.grid_size <= 0.0005) {
        return null;
    }

    return {
        type: 'set_precision_level',
        target_id: 'project',
        params: { level: '2' },
        timestamp: new Date().toISOString(),
    };
}

function normalizeViolation(violation: string): string {
    return violation
        .toLowerCase()
        .replace(/\b\d+(\.\d+)?m\b/g, 'n')
        .replace(/\b\d+(\.\d+)?mm\b/g, 'n')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function formatTurnHistory(turns: TurnRecord[]): string {
    return turns.map(t => {
        const status = t.result === 'SUCCESS' ? '✅' : '❌';
        const tools = t.operations.join(', ');
        const violation = t.violations[0] ? ` | Issue: ${t.violations[0].substring(0, 50)}...` : '';
        return `  Turn ${t.turn}: ${status} ${t.agent} used [${tools}]${violation}`;
    }).join('\n');
}

/**
 * Wrapper for fetch with timeout (60s default)
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 60000, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => {
        controller.abort(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    // Handle external signal — only abort for genuine user cancellation
    const onExternalAbort = () => controller.abort(new Error('User cancelled'));
    if (signal) {
        if (signal.aborted) {
            clearTimeout(id);
            throw new Error('User cancelled');
        }
        signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        // Distinguish timeout from user cancellation
        if (error instanceof Error) {
            if (error.message?.includes('User cancelled') || signal?.aborted) {
                throw new Error('User cancelled');
            }
            if (error.message?.includes('Timeout') || error.name === 'AbortError') {
                throw new Error(`Request timed out after ${timeoutMs}ms`);
            }
        }
        throw error;
    }
}

function extractOrchestratorDecision(text: string): OrchestratorDecision {
    const json = extractJSON<any>(text);
    if (!json) {
        return {
            delegate_to: 'structural_engineer',
            instruction: "Proceed with design construction.",
            reasoning: "Failed to parse JSON, falling back to default.",
            phase: 'PHASE_1_SITE_ANALYSIS'
        };
    }
    return {
        delegate_to: json.delegate_to || 'structural_engineer',
        instruction: json.instruction || json.instruction_for_agent || "Proceed with design.",
        reasoning: json.reasoning || json.rationale || "Standard delegation.",
        phase: (json.phase || 'PHASE_1_SITE_ANALYSIS') as OrchestratorPhase
    };
}

function extractPhysicsViolations(text: string): PhysicsValidation {
    const json = extractJSON<any>(text);
    if (!json) {
        return {
            status: 'PHYSICS_VALID',
            summary: "Physicist provided non-structured response.",
            violations: []
        };
    }
    // Handle both { status, violations } and raw violations array
    const violationsRaw = Array.isArray(json) ? json : (json.violations || []);
    const status = json.status || (violationsRaw.length > 0 ? 'VIOLATIONS_FOUND' : 'PHYSICS_VALID');

    const violations: PhysicsViolation[] = violationsRaw.map((v: any) => ({
        severity: v.severity || 'INFO',
        code: v.code || 'UNKNOWN',
        nodeId: v.nodeId || v.element_id || 'unknown',
        nodeSemanticRole: v.nodeSemanticRole || '',
        description: v.description || v.issue || 'No description provided.',
        currentValue: v.currentValue ?? 0,
        expectedValue: v.expectedValue ?? 0,
        suggestedFix: v.suggestedFix || v.suggested_fix || {
            operation: (v.suggested_fix?.action === 'move' || v.suggested_fix?.action === 'set_node_position') ? 'set_node_position' : 'resize_node',
            x: v.suggested_fix?.exact_coordinates?.x,
            y: v.suggested_fix?.exact_coordinates?.y,
            z: v.suggested_fix?.exact_coordinates?.z
        },
        autoFixable: v.autoFixable ?? (v.severity === 'CRITICAL')
    }));

    return {
        status,
        summary: json.summary || `Found ${violations.length} violations.`,
        violations
    };
}
