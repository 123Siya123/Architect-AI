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
import { getProviderConfig, rotateKey, markKeyRateLimited, allKeysOnCooldown, type AIProviderConfig } from './key-manager';
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
// PERSISTENT FALLBACK STATE
// =============================================================================
// When Gemini is rate-limited, this stores the fallback config so ALL subsequent
// calls in the same (and future) turns also use the fallback provider until
// the cooldown expires.
let activeFallbackConfig: AIProviderConfig | null = null;
let fallbackExpiresAt: number = 0;

function getEffectiveConfig(): AIProviderConfig {
    const now = Date.now();
    if (activeFallbackConfig && now < fallbackExpiresAt) {
        console.log(`[Orchestrator] Using fallback provider: ${activeFallbackConfig.provider} (${activeFallbackConfig.model})`);
        // Refresh key from pool in case of rotation
        return getProviderConfig(activeFallbackConfig.provider);
    }
    // Fallback expired, clear it
    if (activeFallbackConfig) {
        console.log(`[Orchestrator] Fallback expired. Returning to default provider.`);
        activeFallbackConfig = null;
    }

    // Proactive check: if all default/gemini keys are on cooldown, switch to Groq immediately
    if (allKeysOnCooldown('default') && allKeysOnCooldown('gemini')) {
        console.warn('[Orchestrator] ⚠️ All Gemini keys on cooldown. Proactively switching to Groq.');
        const groqFallback = setFallbackToGroq();
        if (groqFallback) return groqFallback;
    }

    return getProviderConfig();
}

function setFallbackToGroq(cooldownMs: number = 600000) {
    const groqConfig = getProviderConfig('groq');
    if (groqConfig.apiKey) {
        activeFallbackConfig = groqConfig;
        fallbackExpiresAt = Date.now() + cooldownMs; // Default: 10 minutes
        console.log(`[Orchestrator] ⚡ FALLBACK ACTIVATED: Switching ALL calls to Groq for ${Math.ceil(cooldownMs / 60000)} minutes`);
        return groqConfig;
    }
    console.warn('[Orchestrator] No Groq keys available for fallback!');
    return null;
}


/**
 * Stores the history of decisions and results for loop detection
 */
interface TurnRecord {
    turn: number;
    agent: 'structural_engineer' | 'interior_architect' | 'spatial_physicist' | 'orchestrator' | 'aesthetic_designer';
    instruction: string;
    operations: string[];
    result: 'SUCCESS' | 'FAILED';
    violations: string[];
}

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
    const attachments = request.attachments; // Extract attachments

    const log = (message: string) => {
        progressLog.push(message);
        console.log(`[Orchestrator] ${message}`); // Add console logging for visibility
        try {
            onProgress?.({ type: 'log', content: message });
        } catch (e) {
            // Ignore errors when sending progress (e.g. if client disconnected)
        }
    };
    const emitOperation = (operation: PSGOperation, turn: number, agent: TurnRecord['agent']) => {
        onProgress?.({ type: 'operation', operation, turn, agent });
    };

    console.log('[Orchestrator] ═══ PARALLEL COGNITIVE ARCHITECTURE STARTING ═══');

    let currentProject = { ...request.project, nodes: { ...request.project.nodes } };
    const allValidatedOps: PSGOperation[] = [];
    const maxTurns = 20;
    let finalMessage = '';
    const decisionHistory = new DecisionHistory();
    const turnHistory: TurnRecord[] = [];
    const structuralTargets = inferStructuralTargets(request.message);

    let lastEngineerActions: string[] = [];
    let structuralChangesSinceAestheticReview = 0;
    let pendingViolations: PhysicsValidation['violations'] = [];
    let wallSurfaceInsights: string[] = [];

    const precisionBootstrap = ensureConstructionPrecision(currentProject);
    if (precisionBootstrap) {
        const bootstrapValidation = validateOperation(precisionBootstrap, currentProject);
        if (bootstrapValidation.valid) {
            const bootstrapApplied = applyOperation(currentProject, precisionBootstrap);
            if (bootstrapApplied.project) {
                currentProject = bootstrapApplied.project;
                allValidatedOps.push(precisionBootstrap);
                log('   🎯 Precision set to construction level (0.5mm)');
            }
        }
    }

    clearLogs();

    log('═══ PARALLEL COGNITIVE ARCHITECTURE ═══');
    log(`Goal: ${request.message}`);
    log(`Target Floors: ${structuralTargets.requiredFloors}`);
    log(`Complexity: ${structuralTargets.complexity} (Min Turns: ${structuralTargets.minTurns})`);

    for (let turn = 1; turn <= maxTurns; turn++) {
        log(`\n───── 🔄 TURN ${turn}/${maxTurns} ─────`);

        let turnSuccess = false;
        let turnRetries = 0;
        const MAX_TURN_RETRIES = 5;

        while (!turnSuccess && turnRetries < MAX_TURN_RETRIES) {
            try {
                // =============================================================
                // STEP 1: ORCHESTRATOR — Analyze and Delegate
                // =============================================================
                const config = getEffectiveConfig();

                if (attachments && attachments.length > 0 && config.provider !== 'gemini') {
                    log(`   ⚠️ WARNING: Attachments ignored. Provider ${config.provider} does not support images.`);
                }

                const asciiPlan = generateASCIIFloorPlan(currentProject);
                const nodeTree = prepare3DNodeTree(currentProject);
                const checklist = prepareProgressChecklist(currentProject);
                const budgetContext = prepareBudgetContext(currentProject);
                const materialContext = prepareMaterialContext(materials);
                const preTurnCompletion = evaluateCompletion(currentProject, structuralTargets, pendingViolations, turn);
                const hasBlockingViolations = pendingViolations.some(v => v.severity === 'CRITICAL' || v.severity === 'WARNING');

                if (preTurnCompletion.complete && !hasBlockingViolations) {
                    finalMessage = `Design completed in ${turn - 1} turns.`;
                    decisionHistory.add({
                        turn,
                        agent: 'orchestrator',
                        decision: 'Auto-stop on deterministic completion',
                        reasoning: `All completion gates satisfied with no blocking violations`,
                        result: 'success'
                    });
                    log(`   ✨ AUTO STOP: All completion gates satisfied. Ending early.`);
                    turn = maxTurns + 1;
                    turnSuccess = true;
                    break;
                }

                // =============================================================
                // STEP 0: SYSTEM INTERVENTION — Auto-fix Criticals
                // =============================================================
                const systemFixes = pendingViolations.filter(v =>
                    v.severity === 'CRITICAL' &&
                    v.suggested_fix &&
                    (v.suggested_fix.exact_coordinates || v.suggested_fix.params)
                );

                if (systemFixes.length > 0) {
                    log(`   🔧 SYSTEM INTERVENTION: Auto-applying ${systemFixes.length} critical fixes...`);
                    let fixCount = 0;
                    const systemActions: string[] = [];

                    for (const fix of systemFixes) {
                        try {
                            const sf = fix.suggested_fix!;
                            const args = {
                                target_id: sf.target_id,
                                ...(sf.params || {}),
                                ...(sf.exact_coordinates ? {
                                    position_x: sf.exact_coordinates.x,
                                    position_y: sf.exact_coordinates.y,
                                    position_z: sf.exact_coordinates.z
                                } : {})
                            };

                            const op = toolCallToOperation(sf.action, args);
                            const validation = validateOperation(op, currentProject);

                            if (validation.valid) {
                                allValidatedOps.push(op);
                                emitOperation(op, turn, 'orchestrator');
                                const applied = applyOperation(currentProject, op);
                                if (applied.project) {
                                    currentProject = applied.project;
                                    fixCount++;
                                    systemActions.push(`✅ ${sf.action} on ${sf.target_id}`);
                                }
                            } else {
                                log(`   ⚠️ System Fix Rejected: ${sf.action} — ${validation.errors[0]}`);
                            }
                        } catch (e) {
                            console.error('System fix failed', e);
                        }
                    }

                    if (fixCount > 0) {
                        // Reload state to be safe
                        currentProject = await reloadProjectState(currentProject.id, currentProject);

                        // Validate changes immediately
                        log(`   🔬 SPATIAL PHYSICIST: Validating system fixes...`);
                        const physicistState = `UPDATED 3D STATE:\n${prepare3DNodeTree(currentProject)}\n\n${generateASCIIFloorPlan(currentProject)}`;

                        const physicistResult = await callProviderNoTools(config, [
                            { role: 'system', content: SPATIAL_PHYSICIST_PROMPT },
                            { role: 'user', content: `SYSTEM INTERVENTION APPLIED:\n${systemActions.join('\n')}\n\n${physicistState}` }
                        ], undefined, signal);

                        const physicsResult = extractJSON<PhysicsValidation>(physicistResult.text);
                        if (physicsResult) {
                            if (physicsResult.status === 'PHYSICS_VALID') {
                                log(`   ✅ PHYSICS VALID: ${physicsResult.summary}`);
                                pendingViolations = [];
                            } else {
                                pendingViolations = physicsResult.violations;
                                log(`   ⚠️ VIOLATIONS REMAINING: ${pendingViolations.length}`);
                            }
                        }

                        decisionHistory.add({
                            turn, agent: 'orchestrator',
                            decision: `System applied ${fixCount} critical fixes`,
                            reasoning: 'Direct execution of physicist suggested fixes to break loop',
                            result: 'success'
                        });

                        turnHistory.push({
                            turn,
                            agent: 'orchestrator',
                            instruction: 'System Intervention',
                            operations: systemActions,
                            result: 'SUCCESS',
                            violations: pendingViolations.map(v => v.issue)
                        });

                        turnSuccess = true;
                        continue; // Skip to next turn
                    }
                }

                // 🔴 ADD THIS: Detect loops before asking orchestrator to decide
                const loopDetection = detectLoop(turnHistory);

                // Build orchestrator context
                let orchestratorContext = `USER REQUEST: ${request.message}\n\n`;
                orchestratorContext += `CURRENT STATE:\n${asciiPlan}\n\n`;
                orchestratorContext += `${nodeTree}\n\n`;
                orchestratorContext += `${checklist}\n\n`;
                orchestratorContext += `Budget: ${budgetContext}\n`;
                orchestratorContext += `Available Materials: ${materialContext}\n\n`;

                if (loopDetection.isLoop) {
                    orchestratorContext += `
🚨🚨🚨 CRITICAL: LOOP DETECTED 🚨🚨🚨

LOOP TYPE: ${loopDetection.loopType}
REPEATED: ${loopDetection.repeatedCount} times
EVIDENCE:
${loopDetection.evidence?.map(e => `  - ${e}`).join('\n')}

🔴 MANDATORY ACTION REQUIRED:
${loopDetection.suggestedAction}

YOU MUST NOT delegate the same action again. Try:
1. Different tool (set_node_position instead of move_node)
2. Delete and rebuild the failing elements
3. Escalate to human if geometrically impossible

RECENT TURN HISTORY (for context):
${formatTurnHistory(turnHistory.slice(-5))}

═══════════════════════════════════════════════════\n\n`;
                } else {
                    orchestratorContext += `RECENT TURN HISTORY:\n${formatTurnHistory(turnHistory.slice(-3))}\n\n`;
                }

                orchestratorContext += `DECISION HISTORY:\n${decisionHistory.formatRecent(15)}\n\n`;
                if (wallSurfaceInsights.length > 0) {
                    orchestratorContext += `WALL SURFACE INSIGHTS:\n${wallSurfaceInsights.join('\n')}\n\n`;
                }

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

                log(`   🧠 ORCHESTRATOR: Analyzing state...`);

                logAgentStep({
                    phase: 'ORCHESTRATOR',
                    iteration: turn,
                    model: config.model,
                    status: 'pending',
                    prompt: orchestratorContext.substring(0, 500) + '...'
                });

                log(`   🤖 Calling ${config.provider} (${config.model})...`); // Debug log

                const orchestratorResult = await callProviderNoTools(config, [
                    { role: 'system', content: ORCHESTRATOR_PROMPT },
                    { role: 'user', content: orchestratorContext }
                ], attachments, signal); // Pass attachments here

                let decision = extractJSON<OrchestratorDecision>(orchestratorResult.text);

                if (!decision) {
                    log(`   ⚠️ Orchestrator returned non-JSON. Using text as guidance.`);
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

                const completionStatus = evaluateCompletion(currentProject, structuralTargets, pendingViolations, turn);
                const criticalPending = pendingViolations.filter(v => v.severity === 'CRITICAL');
                const surfaceSculptPending = shouldApplySurfaceSculpt(currentProject, structuralTargets);

                if (criticalPending.length > 0 && decision.delegate_to !== 'structural_engineer') {
                    decision = {
                        ...decision,
                        delegate_to: 'structural_engineer',
                        instruction: buildCriticalFixInstruction(criticalPending),
                        reasoning: `${decision.reasoning} | Overridden: CRITICAL violations must be fixed before other work.`
                    };
                } else if (decision.delegate_to !== 'structural_engineer' && !completionStatus.structureReady) {
                    decision = {
                        ...decision,
                        delegate_to: 'structural_engineer',
                        instruction: completionStatus.nextInstruction,
                        reasoning: `${decision.reasoning} | Overridden: core structure incomplete.`
                    };
                } else if (surfaceSculptPending) {
                    decision = {
                        ...decision,
                        delegate_to: 'interior_architect',
                        instruction: buildSurfaceMatrixInstruction(currentProject, structuralTargets),
                        reasoning: `${decision.reasoning} | Overridden: custom matrix sculpting requested and not yet applied.`
                    };
                } else if (decision.delegate_to === 'DESIGN_COMPLETE' && !completionStatus.complete) {
                    decision = {
                        ...decision,
                        delegate_to: 'structural_engineer',
                        instruction: completionStatus.nextInstruction,
                        reasoning: `${decision.reasoning} | Overridden: design not complete (${completionStatus.missing.join('; ')}).`
                    };
                }

                log(`   📋 Decision: delegate to ${decision.delegate_to}`);
                log(`   💭 Reasoning: "${decision.reasoning.substring(0, 100)}..."`);

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
                    log(`   ✨ DESIGN COMPLETE — Orchestrator declared the design finished.`);
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
                    log(`   🏗️ STRUCTURAL ENGINEER: Executing...`);

                    const engineerContext = `INSTRUCTION FROM LEAD ARCHITECT:\n${decision.instruction}\n\n`;
                    const insightsBlock = wallSurfaceInsights.length > 0
                        ? `\n\nWALL SURFACE INSIGHTS:\n${wallSurfaceInsights.join('\n')}`
                        : '';
                    const engineerState = `CURRENT 3D STATE:\n${nodeTree}\n\n${asciiPlan}\n\nBudget: ${budgetContext}\nMaterials: ${materialContext}${insightsBlock}`;

                    const engineerMessages = [
                        { role: 'system', content: STRUCTURAL_ENGINEER_PROMPT },
                        { role: 'user', content: engineerContext + engineerState }
                    ];

                    const engineerResult = await callProviderWithTools(config, normalizeMessages(engineerMessages), attachments, signal);

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
                        log(`   🛠️ Engineer issued ${engineerResult.toolCalls.length} operation(s)`);
                        let successCount = 0;

                        for (const tc of engineerResult.toolCalls) {
                            try {
                                if (tc.name === 'get_wall_surface') {
                                    const wallId = tc.args.target_id as string;
                                    const surfaceInsight = summarizeWallSurface(currentProject, wallId);
                                    wallSurfaceInsights = [surfaceInsight, ...wallSurfaceInsights].slice(0, 8);
                                    lastEngineerActions.push(`Queried surface of ${wallId}`);
                                    log(`   🔎 ${surfaceInsight}`);
                                    continue;
                                }

                                const op = toolCallToOperation(tc.name, tc.args);
                                const validation = validateOperation(op, currentProject);

                                if (validation.valid) {
                                    allValidatedOps.push(op);
                                    emitOperation(op, turn, 'structural_engineer');
                                    const applied = applyOperation(currentProject, op);
                                    if (applied.project) {
                                        currentProject = applied.project;
                                        successCount++;
                                        lastEngineerActions.push(`✅ ${tc.name} on ${op.target_id}`);
                                    }
                                } else {
                                    lastEngineerActions.push(`❌ ${tc.name} rejected: ${validation.errors.join(', ')}`);
                                    log(`   ⚠️ Rejected: ${tc.name} — ${validation.errors[0]}`);
                                }
                            } catch (e) {
                                lastEngineerActions.push(`❌ ${tc.name} runtime error`);
                            }
                        }

                        log(`   ✅ ${successCount}/${engineerResult.toolCalls.length} operations applied`);
                        structuralChangesSinceAestheticReview += successCount;

                        decisionHistory.add({
                            turn, agent: 'structural_engineer',
                            decision: `Applied ${successCount} operations: ${decision.instruction.substring(0, 80)}`,
                            reasoning: engineerResult.text?.substring(0, 150) || '',
                            result: successCount > 0 ? 'success' : 'failed'
                        });

                        // 🔴 CRITICAL FIX: Re-read the ACTUAL state after operations
                        // This ensures we see the NEW coordinates, not cached values
                        currentProject = await reloadProjectState(currentProject.id, currentProject);

                        // =============================================================
                        // STEP 3: SPATIAL PHYSICIST — Validate after structural changes
                        // =============================================================
                        if (successCount > 0) {
                            log(`   🔬 SPATIAL PHYSICIST: Validating...`);

                            const physicistContext = `LATEST CHANGES:\n${lastEngineerActions.join('\n')}\n\n`;
                            const physicistState = `UPDATED 3D STATE:\n${prepare3DNodeTree(currentProject)}\n\n${generateASCIIFloorPlan(currentProject)}`;

                            const physicistResult = await callProviderNoTools(config, [
                                { role: 'system', content: SPATIAL_PHYSICIST_PROMPT },
                                { role: 'user', content: physicistContext + physicistState }
                            ], undefined, signal);

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
                                    log(`   ✅ PHYSICS VALID: ${physicsResult.summary}`);
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

                                    log(`   ⚠️ VIOLATIONS: ${criticals.length} critical, ${warnings.length} warnings`);
                                    for (const v of physicsResult.violations) {
                                        log(`      [${v.severity}] ${v.issue}`);
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

                                turnHistory.push({
                                    turn: turn,
                                    agent: 'structural_engineer',
                                    instruction: decision.instruction,
                                    operations: engineerResult.toolCalls?.map(tc => tc.name) || [],
                                    result: physicsResult.status === 'PHYSICS_VALID' ? 'SUCCESS' : 'FAILED',
                                    violations: physicsResult.violations.map(v => v.issue)
                                });
                            } else {
                                log(`   ⚠️ Physicist returned non-structured response`);
                                pendingViolations = [];
                            }
                        }

                    } else {
                        // Engineer returned text but no tool calls
                        log(`   ℹ️ Engineer provided analysis but no operations`);
                        decisionHistory.add({
                            turn, agent: 'structural_engineer',
                            decision: 'No operations (constraint violation or analysis)',
                            reasoning: engineerResult.text?.substring(0, 150) || 'No response',
                            result: 'failed'
                        });
                    }

                } else if (decision.delegate_to === 'interior_architect') {
                    // --- INTERIOR ARCHITECT ---
                    log(`   🪑 INTERIOR ARCHITECT: Executing...`);

                    const architectContext = `ORCHESTRATOR INSTRUCTION:\n${decision.instruction}\n\n`;
                    const insightsBlock = wallSurfaceInsights.length > 0
                        ? `WALL SURFACE INSIGHTS:\n${wallSurfaceInsights.join('\n')}\n\n`
                        : '';
                    const architectState = `LATEST 3D STATE:\n${nodeTree}\n\n${asciiPlan}\n\n${insightsBlock}`;

                    const architectMessages = [
                        { role: 'system', content: INTERIOR_ARCHITECT_PROMPT },
                        { role: 'user', content: architectContext + architectState }
                    ];

                    const architectResult = await callProviderWithTools(config, architectMessages, attachments, signal);

                    logAgentStep({
                        phase: 'INTERIOR_ARCHITECT',
                        iteration: turn,
                        model: config.model,
                        status: 'success',
                        response: architectResult.text,
                        reasoning: `Called ${architectResult.toolCalls?.length || 0} tools`,
                    });

                    if (architectResult.toolCalls && architectResult.toolCalls.length > 0) {
                        log(`   🪑 Proposed ${architectResult.toolCalls.length} operations`);
                        let successCount = 0;
                        const lastArchitectActions: string[] = [];

                        for (const tc of architectResult.toolCalls) {
                            try {
                                if (tc.name === 'get_wall_surface') {
                                    const wallId = tc.args.target_id as string;
                                    const surfaceInsight = summarizeWallSurface(currentProject, wallId);
                                    wallSurfaceInsights = [surfaceInsight, ...wallSurfaceInsights].slice(0, 8);
                                    lastArchitectActions.push(`Queried surface of ${wallId}`);
                                    log(`   🔎 ${surfaceInsight}`);
                                    continue;
                                }

                                const op = toolCallToOperation(tc.name, tc.args);
                                const validation = validateOperation(op, currentProject);

                                if (validation.valid) {
                                    allValidatedOps.push(op);
                                    emitOperation(op, turn, 'interior_architect');
                                    const applied = applyOperation(currentProject, op);
                                    if (applied.project) {
                                        currentProject = applied.project;
                                        successCount++;
                                        lastArchitectActions.push(`✅ ${tc.name} on ${op.target_id}`);
                                    }
                                } else {
                                    lastArchitectActions.push(`❌ ${tc.name} rejected: ${validation.errors.join(', ')}`);
                                    log(`   ⚠️ Rejected: ${tc.name} — ${validation.errors[0]}`);
                                }
                            } catch (e) {
                                lastArchitectActions.push(`❌ ${tc.name} runtime error`);
                            }
                        }

                        log(`   ✅ ${successCount}/${architectResult.toolCalls.length} operations applied`);

                        // 🔴 CRITICAL FIX: Fresh reload here too
                        currentProject = await reloadProjectState(currentProject.id, currentProject);
                        const architectPhysicistState = `UPDATED 3D STATE:\n${prepare3DNodeTree(currentProject)}\n\n${generateASCIIFloorPlan(currentProject)}`;

                        const architectPhysicistResult = await callProviderNoTools(config, [
                            { role: 'system', content: SPATIAL_PHYSICIST_PROMPT },
                            { role: 'user', content: `LATEST CHANGES:\n${lastArchitectActions.join('\n')}\n\n${architectPhysicistState}` }
                        ], undefined, signal);

                        const archPhysicsParsed = extractJSON<PhysicsValidation>(architectPhysicistResult.text);

                        if (archPhysicsParsed) {
                            if (archPhysicsParsed.status === 'PHYSICS_VALID') {
                                log(`   ✅ PHYSICS VALID: ${archPhysicsParsed.summary}`);
                                pendingViolations = [];
                            } else {
                                pendingViolations = archPhysicsParsed.violations;
                                log(`   ⚠️ VIOLATIONS: Found ${pendingViolations.length} issues`);
                                for (const v of pendingViolations) {
                                    log(`      [${v.severity}] ${v.issue}`);
                                }
                            }

                            // 🔴 ADD THIS: Record for interior architect too
                            turnHistory.push({
                                turn: turn,
                                agent: 'interior_architect',
                                instruction: decision.instruction,
                                operations: architectResult.toolCalls?.map(tc => tc.name) || [],
                                result: archPhysicsParsed.status === 'PHYSICS_VALID' ? 'SUCCESS' : 'FAILED',
                                violations: archPhysicsParsed.violations.map(v => v.issue)
                            });
                        }

                        decisionHistory.add({
                            turn, agent: 'interior_architect',
                            decision: `Applied ${successCount} operations: ${decision.instruction.substring(0, 80)}`,
                            reasoning: architectResult.text?.substring(0, 150) || '',
                            result: successCount > 0 ? 'success' : 'failed'
                        });
                    } else {
                        log(`   ℹ️ Interior architect provided analysis but no operations`);
                        decisionHistory.add({
                            turn, agent: 'interior_architect',
                            decision: 'No operations',
                            reasoning: architectResult.text?.substring(0, 150) || 'No response',
                            result: 'failed'
                        });
                    }

                } else if (decision.delegate_to === 'aesthetic_designer') {
                    // --- AESTHETIC DESIGNER ---
                    log(`   🎨 AESTHETIC DESIGNER: Reviewing...`);

                    const aestheticContext = `DESIGN INTENT: ${request.message}\n\n`;
                    const aestheticState = `CURRENT STATE:\n${nodeTree}\n\n${asciiPlan}\n\nMaterials: ${materialContext}`;

                    const aestheticResult = await callProviderNoTools(config, [
                        { role: 'system', content: AESTHETIC_DESIGNER_PROMPT },
                        { role: 'user', content: aestheticContext + aestheticState }
                    ], attachments, signal);

                    logAgentStep({
                        phase: 'AESTHETIC_DESIGNER',
                        iteration: turn,
                        model: config.model,
                        status: 'success',
                        response: aestheticResult.text
                    });

                    const review = extractJSON<AestheticReview>(aestheticResult.text);

                    if (review) {
                        log(`   🎨 Score: ${review.aesthetic_score}/10 — ${review.summary}`);
                        for (const rec of review.recommendations.slice(0, 5)) {
                            log(`      💡 ${rec.suggestion}`);
                        }
                        structuralChangesSinceAestheticReview = 0;
                        decisionHistory.add({
                            turn, agent: 'aesthetic_designer',
                            decision: `Score: ${review.aesthetic_score}/10, ${review.recommendations.length} recommendations`,
                            reasoning: review.summary,
                            result: 'success'
                        });
                    } else {
                        log(`   ℹ️ Aesthetic review returned non-structured response`);
                    }

                } else if (decision.delegate_to === 'spatial_physicist') {
                    // --- DIRECT PHYSICIST CALL (Orchestrator requested explicit validation) ---
                    log(`   🔬 SPATIAL PHYSICIST: Full validation requested...`);

                    const physicistState = `FULL 3D STATE:\n${nodeTree}\n\n${asciiPlan}`;

                    const physicistResult = await callProviderNoTools(config, [
                        { role: 'system', content: SPATIAL_PHYSICIST_PROMPT },
                        { role: 'user', content: `ORCHESTRATOR REQUEST: ${decision.instruction}\n\n${physicistState}` }
                    ], undefined, signal);

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
                            log(`   ✅ PHYSICS VALID: ${physicsResult.summary}`);
                            pendingViolations = [];
                        } else {
                            pendingViolations = physicsResult.violations;
                            for (const v of physicsResult.violations) {
                                log(`      [${v.severity}] ${v.issue}`);
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

                const postTurnCompletion = evaluateCompletion(currentProject, structuralTargets, pendingViolations, turn);
                const hasPostBlockingViolations = pendingViolations.some(v => v.severity === 'CRITICAL' || v.severity === 'WARNING');
                if (postTurnCompletion.complete && !hasPostBlockingViolations) {
                    finalMessage = finalMessage || `Design completed in ${turn} turns.`;
                    decisionHistory.add({
                        turn,
                        agent: 'orchestrator',
                        decision: 'Auto-stop on deterministic completion',
                        reasoning: `All completion gates satisfied with no blocking violations`,
                        result: 'success'
                    });
                    log(`   ✨ AUTO STOP: All completion gates satisfied. Ending early.`);
                    turn = maxTurns + 1;
                    turnSuccess = true;
                    break;
                }

                turnSuccess = true;

            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);

                // Only break on genuine user cancellation
                if (errMsg.includes('User cancelled') || signal?.aborted) {
                    console.log('[Orchestrator] Operation cancelled by user');
                    break; // Exit loop immediately
                }

                turnRetries++;
                console.error(`[Orchestrator] Turn ${turn} failed (Attempt ${turnRetries}/${MAX_TURN_RETRIES}):`, errMsg);

                logAgentStep({
                    phase: `TURN_${turn}`,
                    iteration: turn,
                    model: 'various',
                    status: 'failed',
                    error: errMsg
                });

                if (turnRetries < MAX_TURN_RETRIES) {
                    // Escalating backoff: 1s, 2s, 3s, 4s, etc.
                    const backoff = Math.min(1000 * turnRetries, 5000);
                    log(`   ❌ Turn ${turn} failed (${errMsg.substring(0, 60)}). Retrying in ${backoff / 1000}s (${turnRetries}/${MAX_TURN_RETRIES})...`);
                    await new Promise(r => setTimeout(r, backoff));
                } else {
                    log(`   ❌ CRITICAL: Turn ${turn} failed after ${MAX_TURN_RETRIES} attempts. Skipping to next turn...`);
                    // Instead of terminating everything, just skip this turn
                    break;
                }
            }
        }
    }

    log(`\n═══ ARCHITECTURE COMPLETE: ${allValidatedOps.length} total operation(s) ═══`);
    log(`Decision Trail: ${decisionHistory.getAll().length} decisions recorded`);

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
    let geminiFailCount = 0; // Track consecutive Gemini failures

    for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
        if (signal?.aborted) throw new Error('User cancelled');
        try {
            // Pass timeout multiplier context via a patched config
            const callConfig = { ...config, _timeoutMultiplier: timeoutMultiplier } as any;
            switch (config.provider) {
                case 'gemini': {
                    const result = await callGeminiNoTools(callConfig, messages, attachments, signal);
                    // Success! If we were using fallback, keep it but note success
                    return result;
                }
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
            const isRateLimit = errMsg.includes('429');
            const isQuotaExhausted = errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
            const isUnavailable = errMsg.includes('503') || errMsg.includes('404') || errMsg.includes('500');

            if (isTimeout) {
                // On timeout, increase timeout for next attempt instead of rotating
                timeoutMultiplier = Math.min(timeoutMultiplier + 0.5, 3);
                console.warn(`[callProviderNoTools] Timeout detected. Increasing timeout multiplier to ${timeoutMultiplier}x`);
            } else if (config.provider === 'gemini' && (isRateLimit || isQuotaExhausted || isUnavailable)) {
                if (isRateLimit) markKeyRateLimited(config.apiKey);
                geminiFailCount++;

                // If quota exhausted (daily limit) or 2+ consecutive Gemini failures,
                // skip intermediate models and go straight to Groq
                if (isQuotaExhausted || geminiFailCount >= 2) {
                    console.warn(`[Orchestrator] ⚡ Gemini quota exhausted or ${geminiFailCount} failures. Switching to Groq immediately.`);
                    const groqFallback = setFallbackToGroq();
                    if (groqFallback) {
                        config = groqFallback;
                    } else {
                        // No Groq keys available, try one more Gemini model
                        rotateKey();
                        config = getProviderConfig();
                    }
                } else if (config.model.includes('gemini-3.1-pro')) {
                    // First failure: try a different Gemini model
                    console.warn('[Orchestrator] Gemini 3.1 Pro unavailable. Trying Gemini Flash...');
                    config = { ...config, model: 'gemini-3-flash-preview', apiKey: getProviderConfig().apiKey };
                } else {
                    // Any other Gemini model failed — go to Groq
                    console.warn(`[Orchestrator] Gemini ${config.model} unavailable. Switching to Groq...`);
                    const groqFallback = setFallbackToGroq();
                    if (groqFallback) {
                        config = groqFallback;
                    } else {
                        rotateKey();
                        config = getProviderConfig();
                    }
                }
            } else if (config.provider === 'groq' && isRateLimit) {
                // Groq rate limited — rotate groq key
                markKeyRateLimited(config.apiKey);
                config = getProviderConfig('groq');
                console.warn(`[Orchestrator] Groq rate limited. Rotating Groq key...`);
            } else {
                if (errMsg.includes('429')) markKeyRateLimited(config.apiKey);
                rotateKey();
                config = getProviderConfig();
            }

            if (attempt === MAX_TOTAL_ATTEMPTS) throw error;
            // Shorter backoff when switching providers (already a different service)
            const backoff = config.provider !== initialConfig.provider ? 200 : Math.min(500 * attempt, 5000);
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
    let geminiFailCount = 0;

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
            const isRateLimit = errMsg.includes('429');
            const isQuotaExhausted = errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
            const isUnavailable = errMsg.includes('503') || errMsg.includes('404') || errMsg.includes('500');

            if (isTimeout) {
                timeoutMultiplier = Math.min(timeoutMultiplier + 0.5, 3);
                console.warn(`[callProviderWithTools] Timeout detected. Increasing timeout multiplier to ${timeoutMultiplier}x`);
            } else if (config.provider === 'gemini' && (isRateLimit || isQuotaExhausted || isUnavailable)) {
                if (isRateLimit) markKeyRateLimited(config.apiKey);
                geminiFailCount++;

                // If quota exhausted (daily limit) or 2+ consecutive Gemini failures,
                // skip intermediate models and go straight to Groq
                if (isQuotaExhausted || geminiFailCount >= 2) {
                    console.warn(`[Orchestrator] ⚡ Gemini quota exhausted or ${geminiFailCount} failures. Switching to Groq immediately.`);
                    const groqFallback = setFallbackToGroq();
                    if (groqFallback) {
                        config = groqFallback;
                    } else {
                        rotateKey();
                        config = getProviderConfig();
                    }
                } else if (config.model.includes('gemini-3.1-pro')) {
                    console.warn('[Orchestrator] Gemini 3.1 Pro unavailable. Trying Gemini Flash...');
                    config = { ...config, model: 'gemini-3-flash-preview', apiKey: getProviderConfig().apiKey };
                } else {
                    console.warn(`[Orchestrator] Gemini ${config.model} unavailable. Switching to Groq...`);
                    const groqFallback = setFallbackToGroq();
                    if (groqFallback) {
                        config = groqFallback;
                    } else {
                        rotateKey();
                        config = getProviderConfig();
                    }
                }
            } else if (config.provider === 'groq' && isRateLimit) {
                markKeyRateLimited(config.apiKey);
                config = getProviderConfig('groq');
                console.warn(`[Orchestrator] Groq rate limited. Rotating Groq key...`);
            } else {
                if (errMsg.includes('429')) markKeyRateLimited(config.apiKey);
                rotateKey();
                config = getProviderConfig();
            }

            if (attempt === MAX_TOTAL_ATTEMPTS) throw error;
            const backoff = config.provider !== initialConfig.provider ? 200 : Math.min(500 * attempt, 5000);
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

function buildCriticalFixInstruction(criticals: PhysicsValidation['violations']): string {
    const fixes = criticals
        .filter(v => v.suggested_fix?.target_id && v.suggested_fix?.action)
        .slice(0, 6)
        .map(v => {
            const fix = v.suggested_fix!;
            const coords = fix.exact_coordinates;
            const coordText = coords
                ? ` to [${coords.x ?? 'keep'}, ${coords.y ?? 'keep'}, ${coords.z ?? 'keep'}]`
                : '';
            return `${fix.action} ${fix.target_id}${coordText}`;
        });

    if (fixes.length === 0) {
        return 'Resolve all CRITICAL physics violations first. Use absolute positioning and exact coordinates.';
    }

    return `Resolve CRITICAL physics violations only in this turn: ${fixes.join('; ')}. Use set_node_position over move_node whenever coordinates are provided.`;
}

function shouldApplySurfaceSculpt(project: PSGProject, targets: StructuralTargets): boolean {
    if (!targets.customSurfaceRequested) return false;
    const nodes = Object.values(project.nodes);
    const hasSurfaceSculpt = nodes.some(n => (n.type === 'Wall' || n.type === 'Partition') && !!n.surface_matrix);
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
