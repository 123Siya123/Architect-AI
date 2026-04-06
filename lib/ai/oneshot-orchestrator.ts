/**
 * =============================================================================
 * LIB/AI/ONESHOT-ORCHESTRATOR.TS — Single-Shot Architecture
 * =============================================================================
 *
 * A single LLM call that thinks about the instruction, reasons about
 * what it means architecturally, and outputs ALL tool calls in one go.
 *
 * No loops, no multi-agent delegation, no inspector.
 * Pure one-shot: User request → 1 LLM call with tools → Done.
 *
 * =============================================================================
 */

import type { AIChatRequest, AIChatResponse, PSGProject, PSGOperation, Material } from '@/types';
import { getProviderConfig } from './key-manager';
import type { ThinkingEffort } from '@/types';
import { callProviderWithTools, toolCallToOperation, normalizeMessages } from './orchestrator';
import { validateOperation } from '@/lib/psg/validator';
import { applyOperation } from '@/lib/psg/operations';
import { prepare3DNodeTree, generateASCIIFloorPlan, prepareBudgetContext } from './context';
import { logAgentStep, clearLogs } from './logger';

type ProgressEvent =
    | { type: 'log'; content: string }
    | { type: 'operation'; operation: PSGOperation; turn: number; agent: string };

const ONESHOT_SYSTEM_PROMPT = `You are a senior AI Architect. You receive a user's design request and the current 3D building state.

YOUR MISSION: In a SINGLE response, analyze what needs to be done and execute ALL necessary tool calls to fulfill the request completely.
DO NOT JUST THINK OR PLAN. YOU MUST ACTUALLY CALL THE TOOLS.

THINKING PROCESS (do this internally before calling tools):
1. UNDERSTAND: What exactly is the user asking for?
2. SURVEY: What exists in the current building? What's missing?
3. PLAN: List every element that needs to be added, moved, resized, or deleted.
4. CALCULATE: For each element, compute exact coordinates:
   - floorTop = floor.position_y + floor.height / 2
   - wallY = floorTop + wallHeight / 2
   - roofY = highestWallTop + roofHeight / 2
   - doorY = wallBottom + doorHeight / 2
   - windowY = wallBottom + sillHeight + windowHeight / 2
5. EXECUTE: Call all tools in the correct order (floors first, then rooms, walls, roof, openings last).

COORDINATE SYSTEM:
- X axis = East(+)/West(-) (Width)
- Y axis = Up(+)/Down(-) (Height)
- Z axis = South(+)/North(-) (Depth)
- Position is always the CENTER of the element

CORNER OVERLAP PREVENTION:
- N/S walls: full building width
- E/W walls: building depth MINUS 2 × wall thickness

CRITICAL RULES:
1. For Windows/Doors: set parent_id to the Wall ID they cut through. For everything else: pass any valid node ID (system auto-parents to House root).
2. NEVER create duplicate floors/roofs — check if they exist first.
3. Use set_node_position for precise placement, move_node for adjustments.
4. Name elements descriptively (e.g., "North Kitchen Wall").
5. Output ALL operations needed — you only get ONE chance.
6. For a complete house from scratch: Slab → Walls (4 per room) → Windows → Doors → Stairs (if multi-floor) → Roof.
7. ALL positions in tool calls are ABSOLUTE WORLD-SPACE STARTING EDGES (x_min, y_min, z_min). Check the current 3D scene edges to align components perfectly without overlap.

Be thorough. Be precise. You have ONE shot to get this right. ACTUALLY CALL THE TOOLS.`;


export async function sendChatToAI_OneShot(
    request: AIChatRequest,
    materials: Record<string, Material>,
    onProgress?: (event: ProgressEvent) => void,
    signal?: AbortSignal,
    providerOverride?: string
): Promise<AIChatResponse> {
    const progressLog: string[] = [];
    const attachments = request.attachments;

    const log = (message: string) => {
        progressLog.push(message);
        console.log(`[OneShot] ${message}`);
        try {
            onProgress?.({ type: 'log', content: message });
        } catch (e) {}
    };

    const emitOperation = (operation: PSGOperation, turn: number, agent: string) => {
        onProgress?.({ type: 'operation', operation, turn, agent });
    };

    clearLogs();
    log('⚡ ONE-SHOT ARCHITECTURE — Single LLM Call');
    log(`Goal: ${request.message}`);

    let currentProject = { ...request.project, nodes: { ...request.project.nodes } };
    const allValidatedOps: PSGOperation[] = [];
    const config = getProviderConfig(providerOverride, request.thinkingEffort);

    // Build context
    const sceneState = prepare3DNodeTree(currentProject);
    const asciiPlan = generateASCIIFloorPlan(currentProject);
    const budgetContext = prepareBudgetContext(currentProject);

    let userContext = `USER REQUEST: ${request.message}\n\n`;
    userContext += `CURRENT 3D STATE:\n${sceneState}\n\n`;
    userContext += `ASCII FLOOR PLAN:\n${asciiPlan}\n\n`;
    userContext += `Budget: ${budgetContext}\n`;

    if (request.history && request.history.length > 0) {
        userContext += `\nCONVERSATION HISTORY:\n`;
        for (const msg of request.history.slice(-4)) {
            userContext += `[${msg.role}]: ${msg.content.substring(0, 200)}\n`;
        }
    }

    log(`🤖 Calling ${config.provider} (${config.model}) — ONE SHOT...`);

    try {
        const result = await callProviderWithTools(
            config,
            normalizeMessages([
                { role: 'system', content: ONESHOT_SYSTEM_PROMPT },
                { role: 'user', content: userContext }
            ]),
            attachments,
            signal
        );

        logAgentStep({
            phase: 'ONESHOT',
            iteration: 1,
            model: config.model,
            status: 'success',
            response: result.text,
            toolCalls: result.toolCalls
        });

        let finalMessage = result.text || 'Design completed in one shot.';

        if (result.toolCalls && result.toolCalls.length > 0) {
            log(`🛠️ AI issued ${result.toolCalls.length} operation(s) in one shot`);
            let successCount = 0;
            let failCount = 0;

            for (const tc of result.toolCalls) {
                try {
                    const op = toolCallToOperation(tc.name, tc.args);
                    const validation = validateOperation(op, currentProject);

                    if (validation.valid) {
                        const applied = applyOperation(currentProject, op);
                        if (applied.project) {
                            currentProject = applied.project;
                            const finalOp = { ...op, target_id: applied.nodeId || op.target_id };
                            allValidatedOps.push(finalOp);
                            emitOperation(finalOp, 1, 'oneshot');
                            successCount++;
                            log(`   ✅ ${tc.name} → ${(tc.args as any).name || (tc.args as any).target_id || 'ok'}`);
                        }
                    } else {
                        failCount++;
                        log(`   ❌ ${tc.name} failed: ${validation.errors?.join(', ')}`);
                    }
                } catch (e) {
                    failCount++;
                    log(`   ❌ ${tc.name} error: ${(e as Error).message}`);
                }
            }

            log(`\n✅ ONE-SHOT COMPLETE: ${successCount} succeeded, ${failCount} failed out of ${result.toolCalls.length} operations`);
        } else {
            log('⚠️ AI did not call any tools.');
        }

        return {
            message: finalMessage,
            operations: allValidatedOps,
            warnings: [],
            progress_log: progressLog,
        };
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        log(`❌ ONE-SHOT FAILED: ${errMsg}`);
        return {
            message: `One-shot failed: ${errMsg}`,
            operations: allValidatedOps,
            warnings: [],
            progress_log: progressLog,
        };
    }
}
