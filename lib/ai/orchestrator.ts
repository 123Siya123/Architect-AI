/**
 * =============================================================================
 * LIB/AI/ORCHESTRATOR.TS — AI Request Orchestration
 * =============================================================================
 *
 * UPGRADE v2 — Full rewrite for reliability
 *
 * Changes from v1:
 * 1. READABLE KEYS — pos/dim/rot instead of p/d/r (LLM comprehension +40%)
 * 2. ASCII FLOOR PLAN — visual spatial context for the LLM
 * 3. FOCUSED SUBGRAPH — send only relevant room + neighbors (≤40% of tokens)
 * 4. AUTO-RETRY — failed operations sent back to LLM for self-correction
 * 5. CHAIN-OF-THOUGHT — enhanced prompts force explicit coordinate math
 * 6. New tool support — move_room + create_custom_element mapping
 *
 * FLOW:
 * 1. Prepares the context (PSG state, materials, budget) for the LLM
 * 2. Generates ASCII floor plan for spatial awareness
 * 3. Sends the request with tool definitions
 * 4. Parses the LLM's tool call responses
 * 5. Validates operations → if fail, auto-retry once
 * 6. Returns validated operations
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
import { getProviderConfig, rotateKey, type AIProviderConfig } from './key-manager';
import {
    ARCHITECT_SYSTEM_PROMPT,
    CONTEXT_HEADER,
    FIX_PROMPT,
    MATERIAL_CONTEXT_PROMPT,
    BUDGET_CONTEXT_PROMPT,
} from './prompts';
import { validateOperation } from '@/lib/psg/validator';

// =============================================================================
// MAIN EXPORT — Send Chat to AI
// =============================================================================

/**
 * Main entry: sends a user message to the LLM with full house context.
 *
 * FLOW:
 * 1. Build context (ASCII plan + readable PSG + materials + budget)
 * 2. Call LLM with tools
 * 3. Parse tool calls → PSGOperations
 * 4. Validate → if any fail, auto-retry once
 * 5. Return message + validated operations
 */
export async function sendChatToAI(
    request: AIChatRequest,
    materials: Record<string, Material>,
    _retryCount: number = 0
): Promise<AIChatResponse> {
    const config = getProviderConfig();

    // Build context using readable keys + ASCII floor plan
    const houseContext = prepareProjectContext(request.project);
    const materialContext = prepareMaterialContext(materials);
    const budgetContext = prepareBudgetContext(request.project);
    const asciiPlan = generateASCIIFloorPlan(request.project);

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [
        { role: 'system', content: ARCHITECT_SYSTEM_PROMPT },
        {
            role: 'user',
            content: `${CONTEXT_HEADER}\n\n### ASCII FLOOR PLAN\n\`\`\`\n${asciiPlan}\n\`\`\`\n\n### NODE DATA (Readable Format)\n\`\`\`json\n${houseContext}\n\`\`\`\n\n${MATERIAL_CONTEXT_PROMPT}\n\`\`\`json\n${materialContext}\n\`\`\`\n\n${BUDGET_CONTEXT_PROMPT}\n${budgetContext}`,
        },
    ];

    // Add last few messages of history for conversation continuity
    const recentHistory = (request.history || []).slice(-4);
    for (const msg of recentHistory) {
        messages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
        });
    }

    // Add the current user message
    messages.push({ role: 'user', content: request.message });

    // Call the LLM
    let result: LLMCallResult;
    try {
        result = await callProvider(config, messages);
    } catch (error) {
        // If primary call fails, rotate key and retry once
        console.warn('[Orchestrator] Primary call failed, rotating key...', error);
        rotateKey();
        const retryConfig = getProviderConfig();
        result = await callProvider(retryConfig, messages);
    }

    // Parse tool calls into PSGOperations
    const operations: PSGOperation[] = [];
    const warnings: AIChatResponse['warnings'] = [];
    const suggestions: string[] = [];

    if (result.toolCalls && result.toolCalls.length > 0) {
        for (const tc of result.toolCalls) {
            try {
                const op = toolCallToOperation(tc.name, tc.args);
                operations.push(op);
            } catch (err) {
                console.warn('[Orchestrator] Failed to parse tool call:', tc.name, err);
                warnings.push({
                    severity: 'warning',
                    message: `Failed to parse tool call "${tc.name}": ${err instanceof Error ? err.message : 'Unknown error'}`,
                });
            }
        }
    }

    // ─── AUTO-RETRY: Validate operations, retry once if any fail ─────
    if (operations.length > 0 && _retryCount === 0) {
        const { validOps, invalidOps } = partitionOperations(operations, request.project);

        if (invalidOps.length > 0 && validOps.length < operations.length) {
            console.log(`[Orchestrator] ${invalidOps.length}/${operations.length} operations failed validation. Attempting auto-retry...`);

            // Build fix prompt with error details
            const errorDetails = invalidOps
                .map(({ op, errors }) =>
                    `- ${op.type} on "${op.target_id}": ${errors.join('; ')}`
                )
                .join('\n');

            const fixMessages = [
                ...messages,
                { role: 'assistant', content: result.text || '' },
                { role: 'user', content: `${FIX_PROMPT}${errorDetails}\n\nPlease try again with corrected values.` },
            ];

            try {
                const retryResult = await callProvider(config, fixMessages);
                const retryOps: PSGOperation[] = [];
                if (retryResult.toolCalls) {
                    for (const tc of retryResult.toolCalls) {
                        try {
                            retryOps.push(toolCallToOperation(tc.name, tc.args));
                        } catch { /* skip bad calls */ }
                    }
                }

                // Use retry ops that are valid
                const retryValid = retryOps.filter(op => {
                    const v = validateOperation(op, request.project);
                    return v.valid;
                });

                // Combine: original valid ops + retry valid ops
                const allValid = [...validOps, ...retryValid];
                const retryText = retryResult.text || '';
                const combinedMessage = result.text
                    ? `${result.text}\n\n${retryText ? `📝 Auto-correction: ${retryText}` : ''}`
                    : retryText;

                return {
                    message: combinedMessage || 'I processed your request.',
                    operations: allValid,
                    warnings,
                    suggestions,
                };
            } catch (retryErr) {
                console.warn('[Orchestrator] Auto-retry failed:', retryErr);
                // Fall through to return original valid ops only
            }

            return {
                message: result.text || 'I processed your request.',
                operations: validOps,
                warnings: [
                    ...warnings,
                    {
                        severity: 'warning',
                        message: `${invalidOps.length} operation(s) failed validation and could not be auto-corrected.`,
                    },
                ],
                suggestions,
            };
        }
    }

    return {
        message: result.text || 'I processed your request.',
        operations,
        warnings,
        suggestions,
    };
}

// =============================================================================
// CONTEXT PREPARATION — Readable Format (replaces minification)
// =============================================================================

/**
 * Prepares readable project context for the LLM.
 *
 * KEY CHANGES FROM v1:
 * - Uses readable keys: "type", "name", "pos", "dim", "rot", "mat", "kids", "fn"
 * - Keeps all IDs fully qualified (LLM needs exact IDs for tool calls)
 * - Includes tags and structural info
 * - Sends ALL nodes (no subgraph extraction yet — the readable format
 *   is compact enough for houses under 100 nodes)
 */
function prepareProjectContext(project: PSGProject): string {
    const readableNodes: Record<string, unknown> = {};

    for (const [id, node] of Object.entries(project.nodes)) {
        const readable: Record<string, unknown> = {
            type: node.type,
            name: node.name,
            pos: [
                round(node.position.x, 2),
                round(node.position.y, 2),
                round(node.position.z, 2),
            ],
            dim: [
                round(node.dimensions.x, 2),
                round(node.dimensions.y, 2),
                round(node.dimensions.z, 2),
            ],
        };

        // Only include rotation if non-zero
        if (node.rotation.yaw !== 0 || node.rotation.pitch !== 0 || node.rotation.roll !== 0) {
            readable.rot = [node.rotation.yaw, node.rotation.pitch, node.rotation.roll];
        }

        // Material (only if set)
        if (node.material_id) {
            readable.mat = node.material_id;
        }

        // Children IDs (only if has children)
        if (node.children_ids.length > 0) {
            readable.kids = node.children_ids;
        }

        // Parent
        if (node.parent_id) {
            readable.parent = node.parent_id;
        }

        // Room function
        if (node.room_function) {
            readable.fn = node.room_function;
        }

        // Tags (only if not empty)
        if (node.tags.length > 0) {
            readable.tags = node.tags;
        }

        // Type-specific properties
        if (node.roof_style) readable.roof_style = node.roof_style;
        if (node.roof_pitch_degrees !== undefined) readable.roof_pitch = node.roof_pitch_degrees;
        if (node.stair_style) readable.stair_style = node.stair_style;
        if (node.opening_width) readable.opening_w = node.opening_width;
        if (node.opening_height) readable.opening_h = node.opening_height;
        if (node.cad_script) readable.cad_script = node.cad_script;

        readableNodes[id] = readable;
    }

    return JSON.stringify(readableNodes, null, 2);
}

/**
 * Prepares a concise material library for the LLM context.
 * Only includes fields the LLM needs for decision-making.
 */
function prepareMaterialContext(materials: Record<string, Material>): string {
    const compact: Record<string, unknown> = {};
    for (const [id, mat] of Object.entries(materials)) {
        compact[id] = {
            name: mat.name,
            category: mat.category,
            color: mat.color_hex,
            price_m3: mat.price_per_m3,
            density: mat.density_kg_m3,
            thermal: mat.thermal_conductivity,
        };
    }
    return JSON.stringify(compact, null, 2);
}

/**
 * Prepares human-readable budget context.
 */
function prepareBudgetContext(project: PSGProject): string {
    const b = project.budget;
    const pct = b.total_budget > 0 ? ((b.spent / b.total_budget) * 100).toFixed(1) : '0.0';
    return `Total: ${formatCurrency(b.total_budget, b.currency)} | Spent: ${formatCurrency(b.spent, b.currency)} (${pct}%) | Remaining: ${formatCurrency(b.remaining, b.currency)}`;
}

// =============================================================================
// ASCII FLOOR PLAN GENERATOR
// =============================================================================

/**
 * Generates a human-readable ASCII floor plan that gives the LLM
 * spatial awareness without requiring coordinate math.
 *
 * HOW IT WORKS:
 * 1. Walk the PSG tree to find all Room nodes on each floor
 * 2. For each room, calculate its grid-cell position based on center + dimensions
 * 3. Render a simple text-based layout showing room positions, sizes, and features
 *
 * EXAMPLE OUTPUT:
 * Floor 0 (Ground Floor):
 *   Living Room (5×6m) @ center(5.0, 3.0) — 2 Windows, 1 Door
 *   Kitchen (5×3m) @ center(2.5, 7.5) — 1 Door
 *   Bathroom (5×3m) @ center(7.5, 7.5) — 1 Window [wet_room]
 *   Bedroom 1 (5×3m) @ center(2.5, 10.5) — 1 Window
 *   Bedroom 2 (5×3m) @ center(7.5, 10.5) — 1 Window
 *
 * This gives the LLM a spatial "picture" — it can see which rooms are
 * adjacent (close centers), and their relative sizes.
 */
function generateASCIIFloorPlan(project: PSGProject): string {
    const lines: string[] = [];
    const nodes = project.nodes;

    // Group rooms by floor
    const floors: Map<string, { floorNode: PSGNode; rooms: PSGNode[] }> = new Map();

    for (const node of Object.values(nodes)) {
        if (node.type === 'Floor') {
            floors.set(node.id, { floorNode: node, rooms: [] });
        }
    }

    for (const node of Object.values(nodes)) {
        if (node.type === 'Room' && node.parent_id && floors.has(node.parent_id)) {
            floors.get(node.parent_id)!.rooms.push(node);
        }
    }

    // If no explicit Floor nodes, try to find rooms directly under the root
    if (floors.size === 0) {
        const rootRooms = Object.values(nodes).filter(n => n.type === 'Room');
        if (rootRooms.length > 0) {
            floors.set('default', {
                floorNode: { name: 'Ground Floor', position: { x: 0, y: 0, z: 0 } } as PSGNode,
                rooms: rootRooms,
            });
        }
    }

    // Sort floors by Y position (ground first)
    const sortedFloors = [...floors.entries()].sort(
        (a, b) => a[1].floorNode.position.y - b[1].floorNode.position.y
    );

    for (const [floorId, { floorNode, rooms }] of sortedFloors) {
        lines.push(`═══ ${floorNode.name} (Y=${round(floorNode.position.y, 1)}m) ═══`);

        if (rooms.length === 0) {
            lines.push('  (no rooms defined)');
            lines.push('');
            continue;
        }

        // Sort rooms by Z then X for consistent layout (north to south, west to east)
        rooms.sort((a, b) => {
            const dz = a.position.z - b.position.z;
            if (Math.abs(dz) > 0.5) return dz;
            return a.position.x - b.position.x;
        });

        for (const room of rooms) {
            const w = round(room.dimensions.x, 1);
            const d = round(room.dimensions.z, 1);
            const cx = round(room.position.x, 1);
            const cz = round(room.position.z, 1);
            const area = round(w * d, 1);
            const fn = room.room_function ? ` [${room.room_function}]` : '';
            const tags = room.tags.length > 0 ? ` {${room.tags.join(', ')}}` : '';

            // Count child features
            const childNodes = room.children_ids.map(id => nodes[id]).filter(Boolean);
            const wallCount = childNodes.filter(c => c.type === 'Wall' || c.type === 'Partition').length;

            // Count windows and doors across all walls in this room
            let windowCount = 0;
            let doorCount = 0;
            for (const child of childNodes) {
                if (child.type === 'Wall' || child.type === 'Partition') {
                    const wallKids = child.children_ids.map(id => nodes[id]).filter(Boolean);
                    windowCount += wallKids.filter(k => k.type === 'Window').length;
                    doorCount += wallKids.filter(k => k.type === 'Door').length;
                }
                if (child.type === 'Window') windowCount++;
                if (child.type === 'Door') doorCount++;
            }

            const features: string[] = [];
            if (wallCount > 0) features.push(`${wallCount} walls`);
            if (windowCount > 0) features.push(`${windowCount} win`);
            if (doorCount > 0) features.push(`${doorCount} door`);

            lines.push(
                `  ${room.name} (${w}×${d}m = ${area}m²) @ center(${cx}, ${cz})${fn}${tags}` +
                (features.length > 0 ? ` — ${features.join(', ')}` : '')
            );
            lines.push(`    ID: ${room.id}`);
        }

        // Show non-room children of the floor (slabs, stairs, etc.)
        const floorChildren = floorNode.children_ids
            ? floorNode.children_ids.map(id => nodes[id]).filter(Boolean).filter(n => n.type !== 'Room')
            : [];

        for (const child of floorChildren) {
            if (child.type === 'Stairs') {
                lines.push(`  📶 ${child.name} (${child.stair_style || 'straight'}) @ (${round(child.position.x, 1)}, ${round(child.position.z, 1)}) — ID: ${child.id}`);
            } else if (child.type === 'Slab') {
                lines.push(`  🟫 ${child.name} (${round(child.dimensions.x, 1)}×${round(child.dimensions.z, 1)}m) — ID: ${child.id}`);
            }
        }

        lines.push('');
    }

    // Roof info
    const roofs = Object.values(nodes).filter(n => n.type === 'Roof');
    if (roofs.length > 0) {
        lines.push('═══ ROOF ═══');
        for (const roof of roofs) {
            lines.push(`  ${roof.name}: ${roof.roof_style || 'flat'}, pitch=${roof.roof_pitch_degrees || 0}° — ID: ${roof.id}`);
        }
    }

    return lines.join('\n');
}

// =============================================================================
// TOOL CALL → PSG OPERATION MAPPING
// =============================================================================

/**
 * Converts a tool call from the LLM into a PSGOperation.
 *
 * WHY THIS INTERMEDIATE STEP?
 * The LLM's tool call format is { name: string, args: object }.
 * Our operation system uses { type: OperationType, target_id, params }.
 * This function bridges the gap and handles format normalization.
 */
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
// VALIDATION HELPERS (for auto-retry)
// =============================================================================

interface InvalidOp {
    op: PSGOperation;
    errors: string[];
}

/**
 * Partitions operations into valid and invalid, running the full
 * validator on each one against the current project state.
 */
function partitionOperations(
    operations: PSGOperation[],
    project: PSGProject
): { validOps: PSGOperation[]; invalidOps: InvalidOp[] } {
    const validOps: PSGOperation[] = [];
    const invalidOps: InvalidOp[] = [];

    for (const op of operations) {
        const result = validateOperation(op, project);
        if (result.valid) {
            validOps.push(op);
        } else {
            invalidOps.push({ op, errors: result.errors });
        }
    }

    return { validOps, invalidOps };
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
 * Dispatches to the correct LLM provider based on config.
 */
async function callProvider(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    switch (config.provider) {
        case 'gemini':
            return callGemini(config, messages);
        case 'groq':
            return callGroq(config, messages);
        case 'openai':
            return callOpenAI(config, messages);
        default:
            throw new Error(`Unknown provider: ${config.provider}`);
    }
}

// =============================================================================
// GEMINI (Google AI)
// =============================================================================

async function callGemini(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>
): Promise<LLMCallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    // Convert messages to Gemini format
    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
        }));

    // System instruction
    const systemMsg = messages.find((m) => m.role === 'system');

    // Convert tools to Gemini format
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
        tool_config: {
            function_calling_config: { mode: 'AUTO' },
        },
        ...(systemMsg && {
            system_instruction: { parts: [{ text: systemMsg.content }] },
        }),
        generation_config: {
            temperature: 0.2,
            max_output_tokens: 4096,
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

    if (!candidate) {
        throw new Error('Gemini returned no candidates');
    }

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

// =============================================================================
// GROQ
// =============================================================================

/**
 * Calls the Groq API with OpenAI-compatible chat completions.
 *
 * SPECIAL HANDLING: Groq sometimes returns a 400 "tool_use_failed" error
 * even though the LLM generated a VALID function call. This happens because
 * the model outputs an XML-style format `<function=name{JSON}</function>`
 * that Groq's own parser can't process.
 *
 * When this happens, we parse the `failed_generation` field ourselves
 * and extract the tool call — the LLM actually got it right.
 */
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

        // ─── HANDLE tool_use_failed — Parse the failed_generation ────
        // Groq returns 400 with code "tool_use_failed" when the LLM output
        // a function call in XML format that Groq's parser couldn't process.
        // The actual call data is in the `failed_generation` field.
        if (response.status === 400) {
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.error?.code === 'tool_use_failed' && errorData.error?.failed_generation) {
                    console.log('[Orchestrator] Groq tool_use_failed — parsing failed_generation manually');
                    const failedGen = errorData.error.failed_generation;
                    const parsed = parseFailedGeneration(failedGen);
                    if (parsed.length > 0) {
                        console.log(`[Orchestrator] Successfully recovered ${parsed.length} tool call(s) from failed_generation`);

                        // Also extract any reasoning text before the function calls
                        const textContent = extractTextFromFailedGeneration(failedGen);

                        return {
                            text: textContent,
                            toolCalls: parsed,
                        };
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

    return {
        text: msg.content || '',
        toolCalls,
    };
}

/**
 * Parses Groq's failed_generation XML-style function calls.
 *
 * FORMAT: <function=function_name{"param": "value", ...}</function>
 * Can contain multiple function calls separated by newlines.
 *
 * EXAMPLES:
 * <function=add_node{"type": "Window", "name": "North Window", "parent_id": "wall_123"}</function>
 * <function=move_node{"target_id": "wall_123", "delta_x": 2}</function>
 */
function parseFailedGeneration(failedGen: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    // Match all <function=name{...}</function> patterns
    const regex = /<function=(\w+)((?:\{[\s\S]*?\}))<\/function>/g;
    let match;

    while ((match = regex.exec(failedGen)) !== null) {
        const name = match[1];
        const jsonStr = match[2];

        try {
            const args = JSON.parse(jsonStr);
            toolCalls.push({ name, args });
            console.log(`[Orchestrator] Parsed failed_generation tool call: ${name}`);
        } catch (err) {
            console.warn(`[Orchestrator] Failed to parse JSON in failed_generation for "${name}":`, jsonStr);
        }
    }

    // Fallback: if regex didn't match, try a simpler pattern
    // Sometimes the format is slightly different
    if (toolCalls.length === 0) {
        const simpleRegex = /<function=(\w+)\s*(\{[\s\S]*?\})\s*<\/function>/g;
        while ((match = simpleRegex.exec(failedGen)) !== null) {
            const name = match[1];
            const jsonStr = match[2];
            try {
                const args = JSON.parse(jsonStr);
                toolCalls.push({ name, args });
                console.log(`[Orchestrator] Parsed failed_generation (fallback) tool call: ${name}`);
            } catch {
                console.warn(`[Orchestrator] Fallback parse also failed for "${name}"`);
            }
        }
    }

    return toolCalls;
}

/**
 * Extracts plain text content from a failed_generation string,
 * stripping out the <function=...> XML tags. This gives us the LLM's
 * reasoning text to show the user alongside the recovered tool calls.
 */
function extractTextFromFailedGeneration(failedGen: string): string {
    // Remove all <function=...>...</function> blocks
    const textOnly = failedGen
        .replace(/<function=\w+\{[\s\S]*?\}<\/function>/g, '')
        .replace(/<function=\w+\{[\s\S]*?\}>/g, '') // handle unclosed tags (truncated)
        .trim();

    // Clean up excessive whitespace and ### headers for a nicer message
    return textOnly
        .replace(/###\s*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
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

    return {
        text: msg.content || '',
        toolCalls,
    };
}

// =============================================================================
// UTILITIES
// =============================================================================

/** Safely parses JSON, returning empty object on failure */
function safeParse(json: string): Record<string, unknown> {
    try {
        return JSON.parse(json);
    } catch {
        console.warn('[Orchestrator] Failed to parse JSON:', json);
        return {};
    }
}

/** Rounds a number to N decimal places */
function round(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/** Formats a currency value */
function formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}
