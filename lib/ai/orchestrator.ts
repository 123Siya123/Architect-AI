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
import { getProviderConfig, rotateKey, markKeyRateLimited, type AIProviderConfig } from './key-manager';
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


// =============================================================================
// TYPES
// =============================================================================

interface OrchestratorDecision {
    reasoning: string;
    delegate_to: 'structural_engineer' | 'interior_architect' | 'spatial_physicist' | 'aesthetic_designer' | 'DESIGN_COMPLETE';
    instruction: string;
    priority?: 'critical' | 'high' | 'normal';
}

interface PhysicsValidation {
    status: 'PHYSICS_VALID' | 'VIOLATIONS_FOUND';
    violations: Array<{
        element_id?: string;
        issue: string;
        severity: 'CRITICAL' | 'WARNING' | 'INFO';
        suggested_fix?: {
            action: string;
            target_id?: string;
            exact_coordinates?: { x?: number, y?: number, z?: number };
            params?: Record<string, unknown>;
        };
    }>;
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


// =============================================================================
// MAIN EXPORT — Send Chat to AI (Parallel Cognitive Architecture)
// =============================================================================

export async function sendChatToAI(
    request: AIChatRequest,
    materials: Record<string, Material>,
    _retryCount: number = 0
): Promise<AIChatResponse> {
    const progressLog: string[] = [];
    console.log('[Orchestrator] ═══ PARALLEL COGNITIVE ARCHITECTURE STARTING ═══');

    let currentProject = { ...request.project, nodes: { ...request.project.nodes } };
    const allValidatedOps: PSGOperation[] = [];
    const maxTurns = 20;
    let finalMessage = '';
    const decisionHistory = new DecisionHistory();

    // Track structural changes for physicist validation
    let lastEngineerActions: string[] = [];
    let structuralChangesSinceAestheticReview = 0;
    let pendingViolations: PhysicsValidation['violations'] = [];

    clearLogs();

    progressLog.push('═══ PARALLEL COGNITIVE ARCHITECTURE ═══');
    progressLog.push(`Goal: ${request.message}`);

    for (let turn = 1; turn <= maxTurns; turn++) {
        progressLog.push(`\n───── 🔄 TURN ${turn}/${maxTurns} ─────`);

        let turnSuccess = false;
        let turnRetries = 0;
        const MAX_TURN_RETRIES = 3;

        while (!turnSuccess && turnRetries < MAX_TURN_RETRIES) {
            try {
                // =============================================================
                // STEP 1: ORCHESTRATOR — Analyze and Delegate
                // =============================================================
                const config = getProviderConfig();

                const asciiPlan = generateASCIIFloorPlan(currentProject);
                const nodeTree = prepare3DNodeTree(currentProject);
                const checklist = prepareProgressChecklist(currentProject);
                const budgetContext = prepareBudgetContext(currentProject);
                const materialContext = prepareMaterialContext(materials);

                // Build orchestrator context
                let orchestratorContext = `USER REQUEST: ${request.message}\n\n`;
                orchestratorContext += `CURRENT STATE:\n${asciiPlan}\n\n`;
                orchestratorContext += `${nodeTree}\n\n`;
                orchestratorContext += `${checklist}\n\n`;
                orchestratorContext += `Budget: ${budgetContext}\n`;
                orchestratorContext += `Available Materials: ${materialContext}\n\n`;
                orchestratorContext += `DECISION HISTORY:\n${decisionHistory.formatRecent(15)}\n\n`;

                if (pendingViolations.length > 0) {
                    orchestratorContext += `⚠️ PENDING PHYSICS VIOLATIONS (MUST ADDRESS):\n`;
                    for (const v of pendingViolations) {
                        orchestratorContext += `  - [${v.severity}] ${v.issue}`;
                        if (v.suggested_fix) {
                            orchestratorContext += ` → Fix: ${v.suggested_fix.action}`;
                            if (v.suggested_fix.target_id) orchestratorContext += ` on ${v.suggested_fix.target_id}`;
                            if (v.suggested_fix.exact_coordinates) {
                                orchestratorContext += ` to [${v.suggested_fix.exact_coordinates.x}, ${v.suggested_fix.exact_coordinates.y}, ${v.suggested_fix.exact_coordinates.z}]`;
                            }
                        }
                        orchestratorContext += '\n';
                    }
                    orchestratorContext += '\n';
                }

                // Add conversation history
                if (request.history && request.history.length > 0) {
                    orchestratorContext += `CONVERSATION HISTORY:\n`;
                    for (const msg of request.history.slice(-6)) {
                        orchestratorContext += `[${msg.role}]: ${msg.content.substring(0, 200)}\n`;
                    }
                    orchestratorContext += '\n';
                }

                progressLog.push(`   🧠 ORCHESTRATOR: Analyzing state...`);

                logAgentStep({
                    phase: 'ORCHESTRATOR',
                    iteration: turn,
                    model: config.model,
                    status: 'pending',
                    prompt: orchestratorContext.substring(0, 500) + '...'
                });

                const orchestratorResult = await callProviderNoTools(config, [
                    { role: 'system', content: ORCHESTRATOR_PROMPT },
                    { role: 'user', content: orchestratorContext }
                ]);

                const decision = extractJSON<OrchestratorDecision>(orchestratorResult.text);

                if (!decision) {
                    progressLog.push(`   ⚠️ Orchestrator returned non-JSON. Using text as guidance.`);
                    finalMessage = orchestratorResult.text;
                    // Try to continue — treat as delegation to engineer
                    decisionHistory.add({
                        turn, agent: 'orchestrator',
                        decision: 'Non-structured response',
                        reasoning: orchestratorResult.text.substring(0, 200),
                        result: 'success'
                    });
                    turnSuccess = true;
                    continue;
                }

                progressLog.push(`   📋 Decision: delegate to ${decision.delegate_to}`);
                progressLog.push(`   💭 Reasoning: "${decision.reasoning.substring(0, 100)}..."`);

                logAgentStep({
                    phase: 'ORCHESTRATOR',
                    iteration: turn,
                    model: config.model,
                    status: 'success',
                    response: JSON.stringify(decision),
                    reasoning: decision.reasoning
                });

                // =============================================================
                // CHECK: Is design complete?
                // =============================================================
                if (decision.delegate_to === 'DESIGN_COMPLETE') {
                    progressLog.push(`   ✨ DESIGN COMPLETE — Orchestrator declared the design finished.`);
                    finalMessage = decision.reasoning;
                    decisionHistory.add({
                        turn, agent: 'orchestrator',
                        decision: 'Design declared complete',
                        reasoning: decision.reasoning,
                        result: 'success'
                    });
                    turn = maxTurns + 1; // Exit loop
                    turnSuccess = true;
                    break;
                }

                // =============================================================
                // STEP 2: DELEGATE TO SPECIALIST
                // =============================================================
                if (decision.delegate_to === 'structural_engineer') {
                    // --- STRUCTURAL ENGINEER ---
                    progressLog.push(`   🏗️ STRUCTURAL ENGINEER: Executing...`);

                    const engineerContext = `INSTRUCTION FROM LEAD ARCHITECT:\n${decision.instruction}\n\n`;
                    const engineerState = `CURRENT 3D STATE:\n${nodeTree}\n\n${asciiPlan}\n\nBudget: ${budgetContext}\nMaterials: ${materialContext}`;

                    const engineerMessages = [
                        { role: 'system', content: STRUCTURAL_ENGINEER_PROMPT },
                        { role: 'user', content: engineerContext + engineerState }
                    ];

                    const engineerResult = await callProviderWithTools(config, normalizeMessages(engineerMessages));

                    logAgentStep({
                        phase: 'STRUCTURAL_ENGINEER',
                        iteration: turn,
                        model: config.model,
                        status: 'success',
                        response: engineerResult.text,
                        toolCalls: engineerResult.toolCalls
                    });

                    if (engineerResult.text) {
                        finalMessage = engineerResult.text;
                    }

                    lastEngineerActions = [];

                    if (engineerResult.toolCalls && engineerResult.toolCalls.length > 0) {
                        progressLog.push(`   🛠️ Engineer issued ${engineerResult.toolCalls.length} operation(s)`);
                        let successCount = 0;

                        for (const tc of engineerResult.toolCalls) {
                            try {
                                if (tc.name === 'get_wall_surface') {
                                    const wallId = tc.args.target_id as string;
                                    const wall = currentProject.nodes[wallId];
                                    if (wall?.surface_matrix) {
                                        lastEngineerActions.push(`Queried surface of ${wallId}`);
                                    }
                                    continue;
                                }

                                const op = toolCallToOperation(tc.name, tc.args);
                                const validation = validateOperation(op, currentProject);

                                if (validation.valid) {
                                    allValidatedOps.push(op);
                                    const applied = applyOperation(currentProject, op);
                                    if (applied.project) {
                                        currentProject = applied.project;
                                        successCount++;
                                        lastEngineerActions.push(`✅ ${tc.name} on ${op.target_id}`);
                                    }
                                } else {
                                    lastEngineerActions.push(`❌ ${tc.name} rejected: ${validation.errors.join(', ')}`);
                                    progressLog.push(`   ⚠️ Rejected: ${tc.name} — ${validation.errors[0]}`);
                                }
                            } catch (e) {
                                lastEngineerActions.push(`❌ ${tc.name} runtime error`);
                            }
                        }

                        progressLog.push(`   ✅ ${successCount}/${engineerResult.toolCalls.length} operations applied`);
                        structuralChangesSinceAestheticReview += successCount;

                        decisionHistory.add({
                            turn, agent: 'structural_engineer',
                            decision: `Applied ${successCount} operations: ${decision.instruction.substring(0, 80)}`,
                            reasoning: engineerResult.text?.substring(0, 150) || '',
                            result: successCount > 0 ? 'success' : 'failed'
                        });

                        // =============================================================
                        // STEP 3: SPATIAL PHYSICIST — Validate after structural changes
                        // =============================================================
                        if (successCount > 0) {
                            progressLog.push(`   🔬 SPATIAL PHYSICIST: Validating...`);

                            const physicistContext = `LATEST CHANGES:\n${lastEngineerActions.join('\n')}\n\n`;
                            const physicistState = `UPDATED 3D STATE:\n${prepare3DNodeTree(currentProject)}\n\n${generateASCIIFloorPlan(currentProject)}`;

                            const physicistResult = await callProviderNoTools(config, [
                                { role: 'system', content: SPATIAL_PHYSICIST_PROMPT },
                                { role: 'user', content: physicistContext + physicistState }
                            ]);

                            logAgentStep({
                                phase: 'SPATIAL_PHYSICIST',
                                iteration: turn,
                                model: config.model,
                                status: 'success',
                                response: physicistResult.text
                            });

                            const physicsResult = extractJSON<PhysicsValidation>(physicistResult.text);

                            if (physicsResult) {
                                if (physicsResult.status === 'PHYSICS_VALID') {
                                    progressLog.push(`   ✅ PHYSICS VALID: ${physicsResult.summary}`);
                                    pendingViolations = [];
                                    decisionHistory.add({
                                        turn, agent: 'spatial_physicist',
                                        decision: 'All checks passed',
                                        reasoning: physicsResult.summary,
                                        result: 'success'
                                    });
                                } else {
                                    const criticals = physicsResult.violations.filter(v => v.severity === 'CRITICAL');
                                    const warnings = physicsResult.violations.filter(v => v.severity === 'WARNING');

                                    progressLog.push(`   ⚠️ VIOLATIONS: ${criticals.length} critical, ${warnings.length} warnings`);
                                    for (const v of physicsResult.violations) {
                                        progressLog.push(`      [${v.severity}] ${v.issue}`);
                                    }

                                    // Store violations for the orchestrator to address
                                    pendingViolations = physicsResult.violations;
                                    decisionHistory.add({
                                        turn, agent: 'spatial_physicist',
                                        decision: `Found ${physicsResult.violations.length} violation(s)`,
                                        reasoning: physicsResult.summary,
                                        result: 'violation'
                                    });
                                }
                            } else {
                                progressLog.push(`   ⚠️ Physicist returned non-structured response`);
                                pendingViolations = [];
                            }
                        }

                    } else {
                        // Engineer returned text but no tool calls
                        progressLog.push(`   ℹ️ Engineer provided analysis but no operations`);
                        decisionHistory.add({
                            turn, agent: 'structural_engineer',
                            decision: 'No operations (constraint violation or analysis)',
                            reasoning: engineerResult.text?.substring(0, 150) || 'No response',
                            result: 'failed'
                        });
                    }

                } else if (decision.delegate_to === 'interior_architect') {
                    // --- INTERIOR ARCHITECT ---
                    progressLog.push(`   🪑 INTERIOR ARCHITECT: Executing...`);

                    const architectContext = `ORCHESTRATOR INSTRUCTION:\n${decision.instruction}\n\n`;
                    const architectState = `LATEST 3D STATE:\n${nodeTree}\n\n${asciiPlan}\n\n`;

                    const architectMessages = [
                        { role: 'system', content: INTERIOR_ARCHITECT_PROMPT },
                        { role: 'user', content: architectContext + architectState }
                    ];

                    const architectResult = await callProviderWithTools(config, architectMessages);

                    logAgentStep({
                        phase: 'INTERIOR_ARCHITECT',
                        iteration: turn,
                        model: config.model,
                        status: 'success',
                        response: architectResult.text,
                        reasoning: `Called ${architectResult.toolCalls?.length || 0} tools`,
                    });

                    if (architectResult.toolCalls && architectResult.toolCalls.length > 0) {
                        progressLog.push(`   🪑 Proposed ${architectResult.toolCalls.length} operations`);
                        let successCount = 0;
                        const lastArchitectActions: string[] = [];

                        for (const tc of architectResult.toolCalls) {
                            try {
                                const op = toolCallToOperation(tc.name, tc.args);
                                const validation = validateOperation(op, currentProject);

                                if (validation.valid) {
                                    allValidatedOps.push(op);
                                    const applied = applyOperation(currentProject, op);
                                    if (applied.project) {
                                        currentProject = applied.project;
                                        successCount++;
                                        lastArchitectActions.push(`✅ ${tc.name} on ${op.target_id}`);
                                    }
                                } else {
                                    lastArchitectActions.push(`❌ ${tc.name} rejected: ${validation.errors.join(', ')}`);
                                    progressLog.push(`   ⚠️ Rejected: ${tc.name} — ${validation.errors[0]}`);
                                }
                            } catch (e) {
                                lastArchitectActions.push(`❌ ${tc.name} runtime error`);
                            }
                        }

                        progressLog.push(`   ✅ ${successCount}/${architectResult.toolCalls.length} operations applied`);

                        decisionHistory.add({
                            turn, agent: 'interior_architect',
                            decision: `Applied ${successCount} operations: ${decision.instruction.substring(0, 80)}`,
                            reasoning: architectResult.text?.substring(0, 150) || '',
                            result: successCount > 0 ? 'success' : 'failed'
                        });
                    } else {
                        progressLog.push(`   ℹ️ Interior architect provided analysis but no operations`);
                        decisionHistory.add({
                            turn, agent: 'interior_architect',
                            decision: 'No operations',
                            reasoning: architectResult.text?.substring(0, 150) || 'No response',
                            result: 'failed'
                        });
                    }

                } else if (decision.delegate_to === 'aesthetic_designer') {
                    // --- AESTHETIC DESIGNER ---
                    progressLog.push(`   🎨 AESTHETIC DESIGNER: Reviewing...`);

                    const aestheticContext = `DESIGN INTENT: ${request.message}\n\n`;
                    const aestheticState = `CURRENT STATE:\n${nodeTree}\n\n${asciiPlan}\n\nMaterials: ${materialContext}`;

                    const aestheticResult = await callProviderNoTools(config, [
                        { role: 'system', content: AESTHETIC_DESIGNER_PROMPT },
                        { role: 'user', content: aestheticContext + aestheticState }
                    ]);

                    logAgentStep({
                        phase: 'AESTHETIC_DESIGNER',
                        iteration: turn,
                        model: config.model,
                        status: 'success',
                        response: aestheticResult.text
                    });

                    const review = extractJSON<AestheticReview>(aestheticResult.text);

                    if (review) {
                        progressLog.push(`   🎨 Score: ${review.aesthetic_score}/10 — ${review.summary}`);
                        for (const rec of review.recommendations.slice(0, 5)) {
                            progressLog.push(`      💡 ${rec.suggestion}`);
                        }
                        structuralChangesSinceAestheticReview = 0;
                        decisionHistory.add({
                            turn, agent: 'aesthetic_designer',
                            decision: `Score: ${review.aesthetic_score}/10, ${review.recommendations.length} recommendations`,
                            reasoning: review.summary,
                            result: 'success'
                        });
                    } else {
                        progressLog.push(`   ℹ️ Aesthetic review returned non-structured response`);
                    }

                } else if (decision.delegate_to === 'spatial_physicist') {
                    // --- DIRECT PHYSICIST CALL (Orchestrator requested explicit validation) ---
                    progressLog.push(`   🔬 SPATIAL PHYSICIST: Full validation requested...`);

                    const physicistState = `FULL 3D STATE:\n${nodeTree}\n\n${asciiPlan}`;

                    const physicistResult = await callProviderNoTools(config, [
                        { role: 'system', content: SPATIAL_PHYSICIST_PROMPT },
                        { role: 'user', content: `ORCHESTRATOR REQUEST: ${decision.instruction}\n\n${physicistState}` }
                    ]);

                    logAgentStep({
                        phase: 'SPATIAL_PHYSICIST',
                        iteration: turn,
                        model: config.model,
                        status: 'success',
                        response: physicistResult.text
                    });

                    const physicsResult = extractJSON<PhysicsValidation>(physicistResult.text);
                    if (physicsResult) {
                        if (physicsResult.status === 'PHYSICS_VALID') {
                            progressLog.push(`   ✅ PHYSICS VALID: ${physicsResult.summary}`);
                            pendingViolations = [];
                        } else {
                            pendingViolations = physicsResult.violations;
                            for (const v of physicsResult.violations) {
                                progressLog.push(`      [${v.severity}] ${v.issue}`);
                            }
                        }
                    }

                    decisionHistory.add({
                        turn, agent: 'spatial_physicist',
                        decision: 'Full validation pass',
                        reasoning: physicsResult?.summary || physicistResult.text.substring(0, 150),
                        result: physicsResult?.status === 'PHYSICS_VALID' ? 'success' : 'violation'
                    });
                }

                turnSuccess = true;

            } catch (error) {
                turnRetries++;
                const errMsg = error instanceof Error ? error.message : String(error);
                console.error(`[Orchestrator] Turn ${turn} failed (Attempt ${turnRetries}/${MAX_TURN_RETRIES}):`, errMsg);

                logAgentStep({
                    phase: `TURN_${turn}`,
                    iteration: turn,
                    model: 'various',
                    status: 'failed',
                    error: errMsg
                });

                if (turnRetries < MAX_TURN_RETRIES) {
                    progressLog.push(`   ❌ Turn ${turn} failed. Retrying in 500ms (${turnRetries}/${MAX_TURN_RETRIES})...`);
                    await new Promise(r => setTimeout(r, 500));
                } else {
                    progressLog.push(`   ❌ CRITICAL: Turn ${turn} failed after ${MAX_TURN_RETRIES} attempts.`);
                    turn = maxTurns + 1; // Exit outer loop
                    break;
                }
            }
        }
    }

    progressLog.push(`\n═══ ARCHITECTURE COMPLETE: ${allValidatedOps.length} total operation(s) ═══`);
    progressLog.push(`Decision Trail: ${decisionHistory.getAll().length} decisions recorded`);

    return {
        message: finalMessage + '\n\n' + progressLog.join('\n'),
        operations: allValidatedOps,
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

/**
 * Calls the LLM WITH tools (for Structural Engineer).
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
