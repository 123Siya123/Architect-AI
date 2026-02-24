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

// =============================================================================
// AGENT PROMPTS
// =============================================================================

const COORDINATOR_SYSTEM_PROMPT = `You are the COORDINATOR of an AI architecture team. Your job is to understand a user's request about modifying a 3D house model, analyze the current building state, and produce a DETAILED PLAN that will be executed by specialist worker agents.

## YOUR ROLE
You do NOT make tool calls yourself. You PLAN and DELEGATE.

## COORDINATE SYSTEM
- X axis = East/West (positive X = East)
- Y axis = Up/Down (positive Y = Up, Y=0 is ground)
- Z axis = North/South (positive Z = South)
- All units are METERS.
- All positions are CENTER POINTS.

## DATA FORMAT — PSG (Parametric Scene Graph)
The house data uses these readable keys:
- "type": Node type (Wall, Room, Floor, Window, Door, Roof, Stairs, Slab, etc.)
- "name": Human-readable name
- "position": { x, y, z } — center position in meters
- "dimensions": { width, height, depth } — size in meters
- "rotation": { yaw, pitch, roll } — rotation in degrees (yaw=0 means wall runs East-West along X, yaw=90 means North-South along Z)
- "material": Material ID
- "children": Array of child node IDs
- "parent": Parent node ID
- "function": Room function (living, bedroom, kitchen, bathroom, hallway)
- "tags": Structural tags (load_bearing, exterior, interior, wet_room)

## STANDARD DIMENSIONS
- Ceiling height: 2.7m
- Wall thickness: 0.25m (exterior), 0.12m (partition)
- Door height: 2.1m, width: 0.9m
- Window sill: 0.9m above floor, height: 1.4m
- Slab thickness: 0.2m

## NODE HIERARCHY
House
  └── Floor (level 0, 1, 2...)
       ├── Room
       │    ├── Wall (exterior/interior)
       │    │    ├── Window
       │    │    └── Door
       │    └── Partition
       ├── Slab (floor/ceiling)
       ├── Stairs
       └── Foundation
  └── Roof

## INSTRUCTIONS
1. Read the user's request carefully.
2. Study the CURRENT BUILDING STATE (all nodes, positions, dimensions, rotations).
3. Think spatially about what needs to change in the 3D world.
4. Break the work into PARALLEL SUB-TASKS for worker agents.

## EXAMPLE THINKING PROCESS
User: "Add a first floor"
Your analysis:
"The user wants a first floor above the ground floor. Let me examine the current state:
- Ground floor at Y=0 with 4 exterior walls at positions [x1,y1,z1], [x2,y2,z2]... each with dimensions [w,h,d]
- Rooms inside: Living Room, Kitchen, Bathroom separated by partition walls
- Roof currently sitting on top of ground floor walls at Y=2.7

To add a first floor:
1. RAISE the roof: It needs to move up by the height of one floor (2.7m). New roof Y position should account for the new walls.
2. ADD a slab: Place a floor slab at Y=2.7 (top of ground floor walls). Dimensions should match the house footprint.
3. ADD exterior walls: 4 new walls at Y=2.7 + wall_height/2 = 4.05, same X/Z positions and rotations as ground floor walls.
4. ADD a Floor container node for the first floor.

Sub-tasks:
- Worker 1: Add the Floor container node as child of the House
- Worker 2: Add the floor slab at Y=2.7 with dimensions 10x0.2x12
- Worker 3: Add the north wall at position (5, 4.05, 12) with yaw=0
- Worker 4: Add the south wall at position (5, 4.05, 0) with yaw=0
- Worker 5: Add the east wall at position (10, 4.05, 6) with yaw=90
- Worker 6: Add the west wall at position (0, 4.05, 6) with yaw=90
- Worker 7: Move the roof up by delta_y=2.7"

## OUTPUT FORMAT
You MUST respond with a JSON object (and NOTHING else, no markdown, no backticks) in this exact format:
{
  "analysis": "Your detailed spatial analysis of what needs to happen",
  "sub_tasks": [
    {
      "id": "task_1",
      "description": "Exact description of 1 single tool call: which tool, which IDs, exact coordinates",
      "priority": 1
    },
    {
      "id": "task_2", 
      "description": "...",
      "priority": 1
    }
  ],
  "user_message": "A friendly summary to show the user about what you're doing",
  "follow_up_suggestions": ["Optional suggestions for what the user might want next"]
}

CRITICAL RULES:
1. Each sub_task = EXACTLY ONE tool call. Workers can only execute ONE tool call per task.
   - Adding 4 walls = 4 separate sub_tasks (one per wall)
   - Adding a slab AND moving the roof = 2 separate sub_tasks
   - NEVER combine multiple tool calls into one sub_task
2. Each sub_task description MUST include ALL specific values: tool name, exact positions (x,y,z), exact dimensions (width,height,depth), rotation (yaw), parent_id, material_id.
3. Workers run SEQUENTIALLY — later workers can reference nodes created by earlier workers. Put foundation tasks first (e.g., Floor node before walls).
4. Use EXACT node IDs from the building data — never guess.
`;

const WORKER_SYSTEM_PROMPT = `You are a WORKER agent in an architecture AI team. You receive a specific task and the full building specifications. Your job is to execute EXACTLY the task described using tool calls.

## COORDINATE SYSTEM
- X axis = East/West (positive X = East)
- Y axis = Up/Down (positive Y = Up, Y=0 is ground)
- Z axis = North/South (positive Z = South)
- All units are METERS. Positions are CENTER POINTS.

## WALL ORIENTATION
- yaw=0: Wall runs East-West (width along X axis)
- yaw=90: Wall runs North-South (width along Z axis)

## STANDARD DIMENSIONS
- Ceiling height: 2.7m
- Wall thickness: 0.25m (exterior), 0.12m (partition)
- Door: 2.1m high, 0.9m wide
- Window sill: 0.9m, height: 1.4m
- Slab thickness: 0.2m

## RULES
1. Use EXACT node IDs from the building data — never guess or fabricate IDs
2. For add_node: position is CENTER POINT. A wall at ground level has position_y = height/2 (e.g. 1.35 for 2.7m wall)
3. For move_node: provide DELTA values (how much to move), NOT absolute positions
4. For resize_node: provide NEW absolute dimensions
5. ALWAYS set all position, dimension, and rotation values explicitly
6. Pay very careful attention to ROTATION (yaw) — a wall running North-South has yaw=90
7. A Floor node is a CONTAINER with no visible geometry. You MUST add Rooms, Walls, Slabs etc.

## YOUR TASK
Execute the task described below. Make ALL necessary tool calls. Show your reasoning before each tool call.
Think step by step about positions, verify your math, and ensure everything fits together correctly.
`;

const CHECKER_SYSTEM_PROMPT = `You are a QUALITY CHECKER agent for an architecture AI team. Your job is to review the building state AFTER modifications were made, and verify that everything is spatially correct.

## COORDINATE SYSTEM
- X axis = East/West (positive X = East)
- Y axis = Up/Down (positive Y = Up, Y=0 is ground)
- Z axis = North/South (positive Z = South)
- All units are METERS. Positions are CENTER POINTS.

## WHAT TO CHECK
1. **Rotation correctness**: Do walls have the right yaw? A north/south wall should have yaw=90.
2. **Height/Position alignment**: Are walls sitting at the right Y level? Ground floor walls at Y=1.35, first floor at Y=4.05, etc.
3. **Slab placement**: Are slabs at the correct height (top of lower walls)?
4. **Roof height**: Does the roof sit on top of the highest walls?
5. **Wall connectivity**: Do exterior walls form a closed perimeter? Are corners connected?
6. **Dimension consistency**: Are matching walls the same length? Are slabs the right size?
7. **Parent-child relationships**: Are walls inside the correct rooms? Are windows in walls?
8. **Overlap detection**: Are any elements overlapping incorrectly?

## OUTPUT FORMAT
You MUST respond with a JSON object (and NOTHING else, no markdown, no backticks):

If everything is correct:
{
  "status": "OK",
  "message": "All modifications look correct. The building is structurally sound."
}

If mistakes are found:
{
  "status": "MISTAKE_FOUND",
  "mistakes": [
    {
      "node_id": "the ID of the problematic node (or 'general' if not node-specific)",
      "description": "Detailed description of the mistake",
      "expected": "What the correct value/state should be",
      "actual": "What the current incorrect value/state is",
      "fix_description": "Exactly what needs to be done to fix this"
    }
  ]
}

Be extremely thorough. Check EVERY node that was recently modified. Compare positions, dimensions, and rotations with what makes sense spatially.
`;

const FIXER_SYSTEM_PROMPT = `You are a FIXER agent for an architecture AI team. A quality checker has identified mistakes in the building. Your job is to FIX those mistakes using tool calls.

## COORDINATE SYSTEM
- X axis = East/West (positive X = East)
- Y axis = Up/Down (positive Y = Up, Y=0 is ground)
- Z axis = North/South (positive Z = South)
- All units are METERS. Positions are CENTER POINTS.

## RULES
1. Use EXACT node IDs from the building data
2. For move_node: provide DELTA values
3. For resize_node: provide NEW absolute dimensions
4. Fix ONLY the problems described — don't make other changes
5. Show your reasoning for each fix

## YOUR TASK
Read the mistake descriptions below and make the corrective tool calls.
`;

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

### FULL NODE DATA (Readable Format)
\`\`\`json
${buildingSpecs}
\`\`\`

### AVAILABLE MATERIALS
\`\`\`json
${materialContext}
\`\`\`

### BUDGET STATUS
${budgetContext}
`;

    // Progress log — each phase appends its output here for chat visibility
    const progressLog: string[] = [];

    console.log('[Orchestrator] ═══ MULTI-AGENT PIPELINE STARTING ═══');
    console.log(`[Orchestrator] User request: "${request.message}"`);

    // =========================================================================
    // PHASE 1: COORDINATOR — Analyze and plan
    // =========================================================================
    progressLog.push('───── 🧠 PHASE 1: COORDINATOR ─────');

    let coordinatorPlan: CoordinatorOutput;
    try {
        // Each agent gets its OWN fresh API key
        const coordConfig = getProviderConfig();
        coordinatorPlan = await runCoordinator(coordConfig, request.message, fullContext, request.history || []);
        progressLog.push(`Analysis: ${coordinatorPlan.analysis.substring(0, 300)}`);
        progressLog.push(`Subtasks: ${coordinatorPlan.sub_tasks.length}`);
        for (const task of coordinatorPlan.sub_tasks) {
            progressLog.push(`  → [${task.id}] ${task.description.substring(0, 120)}...`);
        }
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error('[Orchestrator] Coordinator failed:', errMsg);
        progressLog.push(`❌ Coordinator failed: ${errMsg}`);
        // Retry with a different key
        try {
            rotateKey();
            const retryConfig = getProviderConfig();
            coordinatorPlan = await runCoordinator(retryConfig, request.message, fullContext, request.history || []);
            progressLog.push(`✅ Coordinator retry succeeded with ${coordinatorPlan.sub_tasks.length} subtasks`);
        } catch (retryErr) {
            const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
            progressLog.push(`❌ Coordinator retry also failed: ${retryMsg}`);
            progressLog.push('Falling back to simple mode...');
            const fallbackConfig = getProviderConfig();
            const fallback = await runSimpleFallback(fallbackConfig, request, materials, fullContext);
            fallback.message = progressLog.join('\n') + '\n\n' + fallback.message;
            return fallback;
        }
    }

    console.log(`[Orchestrator] Coordinator plan: ${coordinatorPlan.sub_tasks.length} sub-tasks`);

    // If coordinator produced no sub-tasks, it was a question — return the message
    if (coordinatorPlan.sub_tasks.length === 0) {
        progressLog.push('No changes needed — returning coordinator response.');
        return {
            message: progressLog.join('\n') + '\n\n' + (coordinatorPlan.user_message || coordinatorPlan.analysis),
            operations: [],
            warnings: [],
            suggestions: coordinatorPlan.follow_up_suggestions || [],
        };
    }

    // =========================================================================
    // PHASE 2: WORKERS — Execute sub-tasks SEQUENTIALLY
    // Each worker sees the UPDATED building state after previous workers.
    // This ensures Worker 2 can see nodes created by Worker 1.
    // =========================================================================
    progressLog.push('');
    progressLog.push('───── 👷 PHASE 2: WORKERS (Sequential) ─────');

    const validatedOps: PSGOperation[] = [];
    const validationErrors: string[] = [];
    const workerErrors: string[] = [];

    // Running copy of the project — updated after each worker
    let projectAfterWorkers = { ...request.project, nodes: { ...request.project.nodes } };
    // Running context — rebuilt after each worker so the next one sees updated state
    let currentWorkerContext = fullContext;

    for (let i = 0; i < coordinatorPlan.sub_tasks.length; i++) {
        const task = coordinatorPlan.sub_tasks[i];
        progressLog.push(`\n🔨 Worker ${i + 1}/${coordinatorPlan.sub_tasks.length} [${task.id}]...`);

        try {
            const workerConfig = getProviderConfig();
            const result = await runWorker(workerConfig, task, currentWorkerContext, i);

            const ops = result.operations;
            const opNames = ops.map((o: PSGOperation) => `${o.type}(${o.target_id})`).join(', ');
            progressLog.push(`   ✅ ${ops.length} operation(s): ${opNames || 'none'}`);

            if (result.text) {
                progressLog.push(`   💭 ${result.text.substring(0, 120)}`);
            }

            // Validate and apply each operation immediately
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

            if (result.errors.length > 0) {
                workerErrors.push(...result.errors);
                progressLog.push(`   ⚠️ Parse errors: ${result.errors.join('; ')}`);
            }

            // CRITICAL: Rebuild context for the NEXT worker with updated building state
            const updatedSpecs = prepareProjectContext(projectAfterWorkers);
            currentWorkerContext = `
## CURRENT BUILDING STATE (after ${i + 1} worker(s))

### FULL NODE DATA (Readable Format)
\`\`\`json
${updatedSpecs}
\`\`\`

### AVAILABLE MATERIALS
\`\`\`json
${materialContext}
\`\`\`
`;

        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.error(`[Worker ${i + 1}] FAILED:`, errMsg);
            workerErrors.push(`Worker "${task.id}" failed: ${errMsg}`);
            progressLog.push(`   ❌ FAILED: ${errMsg.substring(0, 200)}`);
            // Continue to the next worker — don't abort the whole pipeline
        }
    }

    progressLog.push(`\nTotal validated: ${validatedOps.length} operations`);
    if (validationErrors.length > 0) {
        progressLog.push(`⚠️ ${validationErrors.length} operation(s) failed validation:`);
        for (const ve of validationErrors) {
            progressLog.push(`   - ${ve}`);
        }
    }

    if (validatedOps.length === 0 && coordinatorPlan.sub_tasks.length > 0) {
        progressLog.push('All worker ops failed, trying simple fallback...');
        const fbConfig = getProviderConfig();
        const fallback = await runSimpleFallback(fbConfig, request, materials, fullContext);
        fallback.message = progressLog.join('\n') + '\n\n' + fallback.message;
        return fallback;
    }

    // =========================================================================
    // PHASE 3: CHECKER — Verify the result
    // =========================================================================
    progressLog.push('');
    progressLog.push('───── 🔍 PHASE 3: CHECKER ─────');

    const updatedSpecs = prepareProjectContext(projectAfterWorkers);
    let checkerResult: CheckerOutput;

    try {
        const checkerConfig = getProviderConfig();
        checkerResult = await runChecker(
            checkerConfig,
            request.message,
            updatedSpecs,
            generateASCIIFloorPlan(projectAfterWorkers)
        );
        progressLog.push(`Verdict: ${checkerResult.status}`);
        if (checkerResult.message) {
            progressLog.push(`Message: ${checkerResult.message}`);
        }
        if (checkerResult.mistakes && checkerResult.mistakes.length > 0) {
            for (const m of checkerResult.mistakes) {
                progressLog.push(`   ⚠️ ${m.node_id}: ${m.description}`);
            }
        }
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.warn('[Orchestrator] Checker failed:', errMsg);
        progressLog.push(`⚠️ Checker failed (skipping QA): ${errMsg.substring(0, 150)}`);
        checkerResult = { status: 'OK', message: 'Checker unavailable, skipping QA.' };
    }

    // =========================================================================
    // PHASE 4: FIXER — Correct mistakes (if any)
    // =========================================================================
    let fixerOps: PSGOperation[] = [];

    if (checkerResult.status === 'MISTAKE_FOUND' && checkerResult.mistakes && checkerResult.mistakes.length > 0) {
        progressLog.push('');
        progressLog.push('───── 🔧 PHASE 4: FIXER ─────');

        try {
            const fixerConfig = getProviderConfig();
            const fixResult = await runFixer(
                fixerConfig,
                updatedSpecs,
                checkerResult.mistakes,
                generateASCIIFloorPlan(projectAfterWorkers)
            );

            for (const op of fixResult.operations) {
                const validation = validateOperation(op, projectAfterWorkers);
                if (validation.valid) {
                    fixerOps.push(op);
                    try {
                        const applied = applyOperation(projectAfterWorkers, op);
                        if (applied.success && applied.project) {
                            projectAfterWorkers = applied.project;
                        }
                    } catch { /* continue */ }
                }
            }

            progressLog.push(`✅ Fixer applied ${fixerOps.length} correction(s)`);
            for (const op of fixerOps) {
                progressLog.push(`   → ${op.type}(${op.target_id})`);
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            console.warn('[Orchestrator] Fixer failed:', errMsg);
            progressLog.push(`❌ Fixer failed: ${errMsg.substring(0, 150)}`);
        }
    } else {
        progressLog.push('');
        progressLog.push('───── ✅ PHASE 4: FIXER — Skipped (no mistakes) ─────');
    }

    // =========================================================================
    // COMPOSE FINAL RESPONSE
    // =========================================================================
    const allOps = [...validatedOps, ...fixerOps];

    progressLog.push('');
    progressLog.push(`═══ PIPELINE COMPLETE: ${allOps.length} total operation(s) ═══`);

    // Build the final message with progress log
    let finalMessage = coordinatorPlan.user_message || 'I processed your request.';
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
        suggestions: coordinatorPlan.follow_up_suggestions || [],
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

    const geminiTools = [
        {
            function_declarations: AI_TOOLS.map((t) => ({
                name: t.function.name,
                description: t.function.description,
                parameters: t.function.parameters,
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
        generation_config: { temperature: 0.2, max_output_tokens: 4096 },
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
        generation_config: { temperature: 0.3, max_output_tokens: 4096 },
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
        max_tokens: 4096,
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
        max_tokens: 4096,
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
        max_tokens: 4096,
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
        max_tokens: 4096,
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
