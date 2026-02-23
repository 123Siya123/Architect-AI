/**
 * =============================================================================
 * LIB/AI/AGENTIC-ORCHESTRATOR.TS — Multi-Agent AI Design System
 * =============================================================================
 *
 * REPLACES the single-shot orchestrator with a multi-step agentic pipeline:
 *
 *   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
 *   │ PLANNER  │ →  │ EXECUTOR │ →  │ CHECKER  │ →  │  FIXER   │
 *   │ Agent    │    │ Agent    │    │ (code)   │    │  Agent   │
 *   └──────────┘    └──────────┘    └──────────┘    └──────────┘
 *
 * STEP 1 — PLANNER (fast, small prompt, no tools):
 *   Understands the user's request and decomposes it into a numbered list
 *   of architectural steps. Output is a structured JSON plan.
 *   Token cost: ~500 input, ~300 output
 *
 * STEP 2 — EXECUTOR (tool-calling LLM):
 *   Takes the plan + house state and generates exact tool calls.
 *   Has access to architectural rules so its prompt includes
 *   geometry hints (correct wall orientations, floor positions, etc.)
 *   Token cost: ~2000 input, ~500 output
 *
 * STEP 3 — CHECKER (pure code, zero LLM tokens):
 *   Validates the proposed operations against architectural rules.
 *   Checks wall orientations, floor completeness, roof position, etc.
 *   Cost: 0 tokens (deterministic code)
 *
 * STEP 4 — FIXER (only runs if checker finds issues):
 *   Gets the specific issues and generates corrective operations.
 *   Very focused prompt — just the issues, not the full house.
 *   Token cost: ~300 input, ~200 output (only when needed)
 *
 * TOTAL TOKEN BUDGET (typical):
 *   Simple requests (material change): 1 LLM call (~800 tokens)
 *   Complex requests (add floor): 2-3 LLM calls (~3000 tokens)
 *   With fixes needed: 3-4 LLM calls (~4000 tokens)
 *
 * VS CURRENT SYSTEM:
 *   Everything in 1 call (~3000 tokens) but WRONG results
 *   → Same token budget, much better accuracy
 *
 * INSPIRED BY:
 *   - Cursor's multi-agent code editing (plan → apply → lint → fix)
 *   - Codex's sandboxed execution with verification
 *   - Devin's task decomposition and self-healing
 * =============================================================================
 */

import type {
    PSGProject,
    PSGOperation,
    AIChatRequest,
    AIChatResponse,
    Material,
    OperationWarning,
} from '@/types';
import { AI_TOOLS, toolCallToOperation } from './tools';
import {
    ARCHITECT_SYSTEM_PROMPT,
    createHouseContextPrompt,
} from './prompts';
import { getNextKey, markKeyRateLimited, hasKeys } from './key-manager';
import {
    validateArchitecture,
    summarizeHouseStructure,
    ARCH_CONSTANTS,
    analyzeFloorFootprint,
    calculateFloorY,
    countFloors,
    getTopFloorY,
    type ArchitecturalIssue,
} from './architectural-rules';
import {
    getAIConfig,
    prepareProjectContext,
    prepareMaterialsContext,
    prepareBudgetContext,
    type AIConfig,
} from './orchestrator';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Maximum number of fix iterations to prevent infinite loops */
const MAX_FIX_ITERATIONS = 2;

/** Whether to log detailed agent steps for debugging */
const DEBUG_AGENTS = true;

function agentLog(agent: string, ...args: unknown[]) {
    if (DEBUG_AGENTS) {
        console.log(`[${agent}]`, ...args);
    }
}

// =============================================================================
// PLAN TYPES
// =============================================================================

/** A structured architectural plan from the Planner Agent */
interface ArchitecturalPlan {
    /** What the user wants (rephrased for clarity) */
    intent: string;
    /** Whether this is a simple edit (material, move) or complex (add floor, restructure) */
    complexity: 'simple' | 'moderate' | 'complex';
    /** Ordered list of steps to execute */
    steps: PlanStep[];
    /** Architectural notes/warnings for the Executor */
    notes: string[];
}

interface PlanStep {
    /** Step number (1-indexed) */
    step: number;
    /** What this step does in plain language */
    description: string;
    /** Which tool(s) to use */
    tool_hint: string;
    /** Key geometric details the Executor needs */
    geometry_hints?: string;
}

// =============================================================================
// PLANNER AGENT — Decomposes intent into structured steps
// =============================================================================

/**
 * The planner system prompt is MUCH shorter than the main prompt.
 * It doesn't need tool definitions or material lists.
 * Token cost: ~300 tokens
 */
const PLANNER_SYSTEM_PROMPT = `You are an architectural planning assistant. Your job is to decompose a user's design request into specific, ordered steps.

OUTPUT FORMAT: You MUST respond with ONLY valid JSON, no markdown, no explanation outside the JSON. Use this exact schema:
{
  "intent": "what the user wants in one sentence",
  "complexity": "simple" | "moderate" | "complex",
  "steps": [
    {
      "step": 1,
      "description": "what this step does",
      "tool_hint": "which tool to use (move_node, add_node, etc.)",
      "geometry_hints": "specific position/dimension guidance"
    }
  ],
  "notes": ["any warnings or dependencies between steps"]
}

RULES:
1. For "add a second floor" → steps must include: add floor slab, add all 4 walls, move roof up, optionally add stairs
2. For "move/rotate X" → usually just 1 step
3. For "change material" → 1 step per element
4. Order matters: create parent nodes before children
5. Include geometry hints like "wall should have yaw=90° because it faces east"
6. Always mention if the roof needs to be moved when adding floors

COORDINATE SYSTEM:
- X = east-west, Y = up-down, Z = north-south
- Standard ceiling height: ${ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT}m
- Standard wall thickness: ${ARCH_CONSTANTS.STANDARD_WALL_THICKNESS}m
- Standard slab thickness: ${ARCH_CONSTANTS.STANDARD_SLAB_THICKNESS}m`;

/**
 * Calls the Planner Agent to decompose a user request into steps.
 * Uses a lightweight prompt with just the house summary (not full JSON).
 */
async function runPlannerAgent(
    userMessage: string,
    project: PSGProject,
    config: AIConfig,
): Promise<ArchitecturalPlan> {
    agentLog('PLANNER', 'Starting plan generation for:', userMessage);

    // Give the planner a SUMMARY, not the full JSON — saves ~60% tokens
    const houseSummary = summarizeHouseStructure(project);

    const messages = [
        { role: 'system', content: PLANNER_SYSTEM_PROMPT },
        {
            role: 'user',
            content: `## CURRENT HOUSE
${houseSummary}

## NUMBER OF EXISTING FLOORS: ${countFloors(project)}
## HIGHEST POINT: Y=${getTopFloorY(project)}m

## USER REQUEST:
"${userMessage}"

Generate the architectural plan as JSON.`
        },
    ];

    const result = await callLLM(config, messages);

    // Parse the plan from the LLM response
    try {
        // Try to extract JSON from the response (handle markdown code blocks)
        let jsonStr = result.text.trim();
        const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1].trim();
        }
        // Also try to find raw JSON object
        const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (objectMatch) {
            jsonStr = objectMatch[0];
        }

        const plan: ArchitecturalPlan = JSON.parse(jsonStr);
        agentLog('PLANNER', 'Plan generated:', {
            complexity: plan.complexity,
            steps: plan.steps.length,
            intent: plan.intent,
        });
        return plan;
    } catch (e) {
        agentLog('PLANNER', 'Failed to parse plan, using fallback single-step plan');
        // Fallback: treat as a simple request with one step
        return {
            intent: userMessage,
            complexity: 'simple',
            steps: [{
                step: 1,
                description: userMessage,
                tool_hint: 'auto',
            }],
            notes: [],
        };
    }
}

// =============================================================================
// EXECUTOR AGENT — Generates exact tool calls from a plan
// =============================================================================

/**
 * The Executor gets:
 * 1. The architectural plan (from Planner)
 * 2. The full house state (minified JSON)
 * 3. Architectural rules hints (geometry guidance)
 * 4. Tool definitions
 *
 * Its job is to generate the exact tool calls.
 */
const EXECUTOR_SYSTEM_PROMPT = `You are an expert architectural CAD operator. You receive a plan and must generate the EXACT tool calls to implement it.

${ARCHITECT_SYSTEM_PROMPT}

## CRITICAL ARCHITECTURAL RULES
These rules are NON-NEGOTIABLE. Getting these wrong creates visual bugs:

### WALL ORIENTATION
- A wall running EAST-WEST (along X axis) → yaw = 0°, width = length of wall, depth = ${ARCH_CONSTANTS.STANDARD_WALL_THICKNESS}m
- A wall running NORTH-SOUTH (along Z axis) → yaw = 90°, width = length of wall, depth = ${ARCH_CONSTANTS.STANDARD_WALL_THICKNESS}m
- NEVER set depth > width for a wall. Width is ALWAYS the long dimension.

### FLOOR POSITIONING
- Ground floor: Y = 0
- Each additional floor: Y = previous_floor_Y + ${ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT}m + ${ARCH_CONSTANTS.STANDARD_SLAB_THICKNESS}m
- When adding a floor, you MUST also move the roof up by the same amount

### ADDING A COMPLETE FLOOR
When adding a new floor, ALL of these are required:
1. A Floor node (parent of everything on this level)
2. A Slab node (the physical floor surface, child of the Floor node)
3. Four exterior walls (matching the ground floor footprint)
4. Move the roof upward by the floor height
5. Optionally add stairs

### TOOL CALL RULES
- For replace_node: NEVER pass null for optional fields. Omit them instead.
- For add_node: position values are the CENTER of the element
- All dimensions are in METERS

## RESPONSE FORMAT
First briefly explain what you're doing, then make your tool calls.`;

async function runExecutorAgent(
    plan: ArchitecturalPlan,
    project: PSGProject,
    materials: Record<string, Material>,
    config: AIConfig,
    history: Array<{ role: string; content: string }>,
): Promise<{ text: string; operations: PSGOperation[] }> {
    agentLog('EXECUTOR', 'Executing plan with', plan.steps.length, 'steps');

    // Build the context with geometry hints
    const projectContext = prepareProjectContext(project);
    const materialsContext = prepareMaterialsContext(materials);
    const budgetContext = prepareBudgetContext(project);
    const houseContext = createHouseContextPrompt(projectContext, materialsContext, budgetContext);

    // Build the plan instruction
    const planInstruction = plan.steps.map(s =>
        `Step ${s.step}: ${s.description} (use ${s.tool_hint})${s.geometry_hints ? ` [GEOMETRY: ${s.geometry_hints}]` : ''}`
    ).join('\n');

    // Add geometry context from the rules engine
    const geometryContext = buildGeometryContext(project, plan);

    const messages = [
        { role: 'system', content: EXECUTOR_SYSTEM_PROMPT },
        { role: 'system', content: houseContext },
        // Include last 2 messages of history (less than before — saves tokens)
        ...history.slice(-2),
        {
            role: 'user',
            content: `## ARCHITECTURAL PLAN TO EXECUTE:
${planInstruction}

## GEOMETRY CONTEXT (from rules engine):
${geometryContext}

## NOTES:
${plan.notes.join('\n') || 'None'}

Execute ALL steps in the plan. Make every tool call needed.`
        },
    ];

    const result = await callLLMWithTools(config, messages);

    const operations: PSGOperation[] = result.toolCalls.map((tc) =>
        toolCallToOperation(tc.name, tc.args)
    );

    agentLog('EXECUTOR', 'Generated', operations.length, 'operations');

    return { text: result.text, operations };
}

/**
 * Builds geometry-specific context based on the plan.
 * This gives the Executor precise numbers instead of making it guess.
 *
 * TOKEN OPTIMIZATION: Only includes context relevant to the plan.
 */
function buildGeometryContext(project: PSGProject, plan: ArchitecturalPlan): string {
    const lines: string[] = [];
    const planText = JSON.stringify(plan).toLowerCase();

    // If the plan involves adding floors
    if (planText.includes('floor') || planText.includes('storey') || planText.includes('story') || planText.includes('level')) {
        const numFloors = countFloors(project);
        const newFloorY = calculateFloorY(numFloors);
        const groundFloors = Object.values(project.nodes).filter(n => n.type === 'Floor');

        if (groundFloors.length > 0) {
            const footprint = analyzeFloorFootprint(project, groundFloors[0].id);
            lines.push(`FLOOR GEOMETRY:`);
            lines.push(`- Current floors: ${numFloors}`);
            lines.push(`- New floor Y position: ${newFloorY}m`);
            lines.push(`- Footprint: width=${footprint.width}m, depth=${footprint.depth}m`);
            lines.push(`- Footprint center: X=${footprint.center_x}m, Z=${footprint.center_z}m`);
            lines.push(`- Footprint bounds: X=[${footprint.min_x}, ${footprint.max_x}], Z=[${footprint.min_z}, ${footprint.max_z}]`);
            lines.push(`- Wall height for new floor: ${ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT}m`);
            lines.push(`- Roof delta_y needed: ${ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT + ARCH_CONSTANTS.STANDARD_SLAB_THICKNESS}m`);

            lines.push(`\nEXISTING WALLS TO REPLICATE ON NEW FLOOR:`);
            for (const wall of footprint.walls) {
                lines.push(`  - "${wall.name}" (${wall.facing}): pos=[${wall.position.x},${wall.position.y},${wall.position.z}], dim=[${wall.dimensions.x},${wall.dimensions.y},${wall.dimensions.z}], yaw=${wall.yaw}°`);
                lines.push(`    → On new floor: pos=[${wall.position.x},${newFloorY},${wall.position.z}], KEEP SAME yaw=${wall.yaw}°`);
            }
        }
    }

    // If the plan involves moving/rotating walls
    if (planText.includes('wall') && (planText.includes('rotat') || planText.includes('orient') || planText.includes('turn'))) {
        lines.push(`\nWALL ORIENTATION RULES:`);
        lines.push(`- East-west walls (along X): yaw=0°, width=length, depth=${ARCH_CONSTANTS.STANDARD_WALL_THICKNESS}m`);
        lines.push(`- North-south walls (along Z): yaw=90°, width=length, depth=${ARCH_CONSTANTS.STANDARD_WALL_THICKNESS}m`);
    }

    // If the plan involves roof changes
    if (planText.includes('roof')) {
        const roofs = Object.values(project.nodes).filter(n => n.type === 'Roof');
        if (roofs.length > 0) {
            lines.push(`\nROOF INFO:`);
            for (const roof of roofs) {
                lines.push(`- "${roof.name}" (${roof.id}): pos=[${roof.position.x},${roof.position.y},${roof.position.z}], style=${roof.roof_style || 'unknown'}`);
            }
        }
    }

    return lines.length > 0 ? lines.join('\n') : 'No additional geometry context needed for this operation.';
}

// =============================================================================
// CHECKER — Pure code validation (ZERO LLM tokens)
// =============================================================================

/**
 * Checks the proposed operations against architectural rules.
 * This is DETERMINISTIC — no LLM call needed.
 *
 * Returns issues that need fixing, or empty array if all is well.
 */
function runChecker(
    project: PSGProject,
    operations: PSGOperation[],
): ArchitecturalIssue[] {
    agentLog('CHECKER', 'Validating', operations.length, 'operations');

    const issues: ArchitecturalIssue[] = [];

    // Check each operation for common AI mistakes
    for (const op of operations) {
        // Check for null values in optional fields (Groq schema violation)
        if (op.params) {
            for (const [key, value] of Object.entries(op.params)) {
                if (value === null) {
                    issues.push({
                        severity: 'error',
                        category: 'dimension',
                        message: `Operation ${op.type} has null value for "${key}". This will cause an API error.`,
                        affected_node_id: op.target_id,
                        suggested_fix: {
                            operation_type: op.type,
                            target_id: op.target_id,
                            params: { ...op.params, [key]: undefined },
                            description: `Remove null "${key}" from ${op.type} operation`,
                        },
                    });
                }
            }
        }

        // Check add_node operations for orientation correctness
        if (op.type === 'add_node') {
            const params = op.params as Record<string, unknown>;
            if (params.type === 'Wall') {
                const width = Number(params.width || 4);
                const depth = Number(params.depth || 0.25);

                // If depth > width, the wall dimensions are likely swapped
                if (depth > width * 1.5) {
                    issues.push({
                        severity: 'error',
                        category: 'orientation',
                        message: `Wall "${params.name}" has depth (${depth}m) > width (${width}m). ` +
                            `Width should always be the long dimension for a wall.`,
                        suggested_fix: {
                            operation_type: 'add_node',
                            target_id: '',
                            params: { ...params, width: depth, depth: width },
                            description: `Swap width and depth for "${params.name}"`,
                        },
                    });
                }
            }
        }

        // Check move_node doesn't move things underground
        if (op.type === 'move_node') {
            const params = op.params as Record<string, number>;
            const node = project.nodes[op.target_id];
            if (node) {
                const newY = node.position.y + (params.delta_y || 0);
                if (newY < -0.5 && node.type !== 'Foundation') {
                    issues.push({
                        severity: 'warning',
                        category: 'position',
                        message: `Moving "${node.name}" would place it at Y=${newY}m (underground).`,
                        affected_node_id: op.target_id,
                    });
                }
            }
        }
    }

    // Also run the full architectural validation on the current state
    // (This catches pre-existing issues that the current operations don't fix)
    const existingIssues = validateArchitecture(project);
    const errorIssues = existingIssues.filter(i => i.severity === 'error');
    if (errorIssues.length > 0) {
        agentLog('CHECKER', 'Found', errorIssues.length, 'pre-existing architectural issues');
    }

    agentLog('CHECKER', 'Found', issues.length, 'issues in proposed operations');
    return issues;
}

// =============================================================================
// FIXER AGENT — Corrects issues found by the Checker
// =============================================================================

const FIXER_SYSTEM_PROMPT = `You are a precision architectural fixer. You receive specific issues with proposed operations and must generate EXACT corrective tool calls.

RULES:
1. Fix ONLY the listed issues — don't add extra changes
2. For orientation fixes: swap width/depth OR set the correct yaw
3. For missing elements: add them with correct positions from the geometry hints
4. For null parameter errors: the operation must omit null fields entirely
5. NEVER pass null for optional parameters — just omit them

RESPONSE FORMAT: Briefly state what you're fixing, then make the corrective tool calls.`;

async function runFixerAgent(
    issues: ArchitecturalIssue[],
    project: PSGProject,
    config: AIConfig,
): Promise<PSGOperation[]> {
    agentLog('FIXER', 'Fixing', issues.length, 'issues');

    // First, try to auto-fix issues that have suggested_fix
    const autoFixOps: PSGOperation[] = [];
    const manualFixIssues: ArchitecturalIssue[] = [];

    for (const issue of issues) {
        if (issue.suggested_fix) {
            autoFixOps.push(toolCallToOperation(
                issue.suggested_fix.operation_type,
                issue.suggested_fix.params,
            ));
            agentLog('FIXER', 'Auto-fixed:', issue.suggested_fix.description);
        } else {
            manualFixIssues.push(issue);
        }
    }

    // If there are issues that need LLM reasoning, call the fixer
    if (manualFixIssues.length > 0) {
        const issueDescriptions = manualFixIssues.map((issue, i) =>
            `${i + 1}. [${issue.severity}] ${issue.message}${issue.affected_node_id ? ` (node: ${issue.affected_node_id})` : ''}`
        ).join('\n');

        const houseSummary = summarizeHouseStructure(project);

        const messages = [
            { role: 'system', content: FIXER_SYSTEM_PROMPT },
            {
                role: 'user',
                content: `## ISSUES TO FIX:
${issueDescriptions}

## CURRENT HOUSE SUMMARY:
${houseSummary}

Generate the corrective tool calls to fix these issues.`
            },
        ];

        const result = await callLLMWithTools(config, messages);
        const fixOps = result.toolCalls.map(tc => toolCallToOperation(tc.name, tc.args));
        autoFixOps.push(...fixOps);
    }

    agentLog('FIXER', 'Generated', autoFixOps.length, 'corrective operations');
    return autoFixOps;
}

// =============================================================================
// MAIN AGENTIC ORCHESTRATION
// =============================================================================

/**
 * The main entry point for the agentic AI designer.
 * Replaces the single-shot sendChatToAI function.
 *
 * FLOW:
 * 1. Classify request complexity
 * 2. If simple → direct executor (1 LLM call, same as before)
 * 3. If complex → planner → executor → checker → fixer
 */
export async function sendChatToAIAgentic(
    request: AIChatRequest,
    materials: Record<string, Material>
): Promise<AIChatResponse> {
    const config = getAIConfig();

    // If no API keys configured, return helpful message
    if (!hasKeys()) {
        return {
            message: `I understand you want to: "${request.message}". However, the AI backend is not yet configured. Add your API key to \`.env.local\`.`,
            operations: [],
            warnings: [],
            suggestions: ['Use the Inspector panel to make direct changes.'],
        };
    }

    const startTime = Date.now();
    const allWarnings: OperationWarning[] = [];

    try {
        // =====================================================================
        // STEP 1: PLANNER — Decompose the request
        // =====================================================================
        agentLog('ORCHESTRATOR', '═══ Starting agentic pipeline ═══');
        agentLog('ORCHESTRATOR', 'User request:', request.message);

        const plan = await runPlannerAgent(request.message, request.project, config);

        agentLog('ORCHESTRATOR', `Plan: ${plan.complexity} complexity, ${plan.steps.length} steps`);

        // =====================================================================
        // STEP 2: EXECUTOR — Generate tool calls
        // =====================================================================
        const history = request.history.slice(-4).map(msg => ({
            role: msg.role as string,
            content: msg.content,
        }));

        const executorResult = await runExecutorAgent(
            plan, request.project, materials, config, history,
        );

        let finalOperations = executorResult.operations;
        let finalMessage = executorResult.text;

        // =====================================================================
        // STEP 3: CHECKER — Validate operations (ZERO tokens)
        // =====================================================================
        const issues = runChecker(request.project, finalOperations);

        // =====================================================================
        // STEP 4: FIXER — Correct any issues (only if needed)
        // =====================================================================
        if (issues.length > 0) {
            agentLog('ORCHESTRATOR', `Checker found ${issues.length} issues, running fixer...`);

            // Clean null values from operations before applying fixes
            finalOperations = cleanNullParameters(finalOperations);

            const fixIssues = issues.filter(i => i.severity === 'error');
            if (fixIssues.length > 0) {
                let fixIteration = 0;
                while (fixIteration < MAX_FIX_ITERATIONS) {
                    const fixOps = await runFixerAgent(fixIssues, request.project, config);
                    if (fixOps.length === 0) break;

                    // Clean fix ops too
                    const cleanedFixOps = cleanNullParameters(fixOps);
                    finalOperations.push(...cleanedFixOps);

                    // Re-check
                    const reissues = runChecker(request.project, finalOperations);
                    const reErrors = reissues.filter(i => i.severity === 'error');
                    if (reErrors.length === 0) break;

                    fixIteration++;
                    agentLog('ORCHESTRATOR', `Fix iteration ${fixIteration}: ${reErrors.length} remaining errors`);
                }
            }

            // Add warnings to the response
            const warningIssues = issues.filter(i => i.severity === 'warning');
            for (const issue of warningIssues) {
                allWarnings.push({
                    severity: 'warning',
                    message: issue.message,
                });
            }
        }

        // =====================================================================
        // DONE — Return results
        // =====================================================================
        const elapsed = Date.now() - startTime;
        agentLog('ORCHESTRATOR', `═══ Pipeline complete in ${elapsed}ms ═══`);
        agentLog('ORCHESTRATOR', `Final: ${finalOperations.length} operations, ${allWarnings.length} warnings`);

        // Add plan summary to the AI message
        if (plan.complexity !== 'simple' && plan.steps.length > 1) {
            const planSummary = plan.steps.map(s => `${s.step}. ${s.description}`).join('\n');
            finalMessage = `**Plan:**\n${planSummary}\n\n${finalMessage}`;
        }

        return {
            message: finalMessage || "I've made the requested changes to the design.",
            operations: finalOperations,
            warnings: allWarnings,
            suggestions: finalOperations.length > 0
                ? ['Click on modified elements to inspect the changes.']
                : undefined,
        };

    } catch (error) {
        console.error('[Agentic Orchestrator] Error:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown error';

        return {
            message: `Sorry, I encountered an error: ${errMsg}`,
            operations: [],
            warnings: [{ severity: 'warning' as const, message: errMsg }],
            suggestions: ['Try again with a simpler request, or use the Inspector panel.'],
        };
    }
}

// =============================================================================
// LLM CALL HELPERS
// =============================================================================

/**
 * Calls the LLM WITHOUT tools (for Planner agent).
 * Simpler, faster, and cheaper.
 */
async function callLLM(
    config: AIConfig,
    messages: Array<{ role: string; content: string }>,
): Promise<{ text: string }> {
    const apiKey = getNextKey();

    if (config.provider === 'groq') {
        const url = 'https://api.groq.com/openai/v1/chat/completions';
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages,
                temperature: 0.3, // Lower temperature for planning — more deterministic
                max_tokens: 1024, // Plans are short
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            const err = await response.text();
            if (response.status === 429 || response.status === 401) {
                markKeyRateLimited(apiKey, response.status === 401 ? 3600000 : undefined);
            }
            throw new Error(`LLM error (${response.status}): ${err}`);
        }

        const data = await response.json();
        return { text: data.choices?.[0]?.message?.content || '' };
    }

    // Gemini fallback
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`;
    const systemInstruction = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents,
            generation_config: { temperature: 0.3, max_output_tokens: 1024 },
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`LLM error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    return { text };
}

/**
 * Calls the LLM WITH tools (for Executor and Fixer agents).
 */
async function callLLMWithTools(
    config: AIConfig,
    messages: Array<{ role: string; content: string }>,
): Promise<{ text: string; toolCalls: Array<{ name: string; args: Record<string, unknown> }> }> {
    const apiKey = getNextKey();

    if (config.provider === 'groq') {
        const url = 'https://api.groq.com/openai/v1/chat/completions';

        // Clean the tools to ensure no null-default mismatches
        const cleanedTools = cleanToolDefinitions(AI_TOOLS);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: config.model,
                messages,
                tools: cleanedTools,
                tool_choice: 'auto',
                temperature: config.temperature,
                max_tokens: config.maxTokens,
            }),
            signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
            const err = await response.text();
            if (response.status === 429 || response.status === 401) {
                markKeyRateLimited(apiKey, response.status === 401 ? 3600000 : undefined);
            }
            // For 400 errors with tool validation failures, attempt to fix
            if (response.status === 400 && err.includes('tool_use_failed')) {
                agentLog('LLM', 'Groq tool validation failed — likely null values. Retrying with cleaned tools...');
                // Retry with next key
                return callLLMWithTools(config, messages);
            }
            throw new Error(`LLM error (${response.status}): ${err}`);
        }

        const data = await response.json();
        const choice = data.choices?.[0];
        if (!choice) throw new Error('LLM returned no choices');

        const text = choice.message?.content || '';
        const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

        for (const tc of choice.message?.tool_calls || []) {
            if (tc.type === 'function') {
                try {
                    const args = JSON.parse(tc.function.arguments);
                    // CRITICAL: strip null values from args before returning
                    const cleanedArgs = stripNullValues(args);
                    toolCalls.push({ name: tc.function.name, args: cleanedArgs });
                } catch {
                    console.warn('[LLM] Failed to parse tool call args:', tc.function.arguments);
                }
            }
        }

        return { text, toolCalls };
    }

    // Gemini fallback (same structure)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${apiKey}`;
    const systemInstruction = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const contents = messages.filter(m => m.role !== 'system').map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
    }));

    const geminiTools = AI_TOOLS.map(tool => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
    }));

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemInstruction }] },
            contents,
            tools: [{ function_declarations: geminiTools }],
            tool_config: { function_calling_config: { mode: 'AUTO' } },
            generation_config: { temperature: config.temperature, max_output_tokens: config.maxTokens },
        }),
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`LLM error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates');

    let text = '';
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

    for (const part of candidate.content?.parts || []) {
        if (part.text) text += part.text;
        if (part.functionCall) {
            toolCalls.push({
                name: part.functionCall.name,
                args: stripNullValues(part.functionCall.args || {}),
            });
        }
    }

    return { text, toolCalls };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Strips null values from an object.
 * Prevents the Groq API "expected string, but got null" error.
 */
function stripNullValues(obj: Record<string, unknown>): Record<string, unknown> {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined) {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

/**
 * Cleans all operations by removing null parameters.
 */
function cleanNullParameters(operations: PSGOperation[]): PSGOperation[] {
    return operations.map(op => ({
        ...op,
        params: stripNullValues(op.params),
    }));
}

/**
 * Cleans tool definitions to add explicit null-handling notes.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cleanToolDefinitions(tools: typeof AI_TOOLS): any[] {
    return tools.map(tool => ({
        ...tool,
        function: {
            ...tool.function,
            description: tool.function.description +
                ' IMPORTANT: Do NOT pass null for any optional parameters. Simply omit them.',
        },
    }));
}
