/**
 * =============================================================================
 * LIB/AI/VISION.TS — Image to 3D Generation Logic
 * =============================================================================
 *
 * This module handles the interpretation of uploaded house images.
 * It uses a Vision-Language Model to extract architectural features
 * (walls, roofs, windows) and scales them based on a user-provided
 * reference measurement.
 * =============================================================================
 */

import type { PSGOperation, ImageTo3DRequest, ImageTo3DResponse } from '@/types';
import { getProviderConfig } from './key-manager';

const VISION_SYSTEM_PROMPT = `You are an Expert AI Architect specialized in reverse-engineering 3D parametric models from 2D images.
The user has provided an image of a house and a "reference measurement" string (e.g., "The front door is 2.1m high" or "The front wall is 10m wide").

## YOUR ROLE
Analyze the image and construct a fully fleshed out, mathematically sound 3D house model using the 'add_node' tool.
Use the reference measurement to accurately scale your generated coordinates (x,y,z) into meters.

## HIERARCHY & STRUCTURE
The user already explicitly provides a root node with id 'house_root'.
You MUST build a strict hierarchy:
1. Floor (parent: 'house_root')
2. Rooms (parent: Floor)
3. Walls, Roofs, Stairs (parent: Room or Floor)
4. Windows, Doors (parent: Wall)

## COORDINATE SYSTEM & ROTATION
- X axis = East/West (Width)
- Y axis = Up/Down (Height, Y=0 is the floor level of the ground floor).
- Z axis = North/South (Depth). Negative Z means deeper into the screen.
Positions are the ABSOLUTE CENTER POINT of each element in world space.

### WALL MATHEMATICS (CRITICAL)
- Walls are rectangular prisms. 'dimension_w' is the length of the wall. 'dimension_h' is height. 'dimension_d' is the thickness (e.g., 0.2m).
- yaw=0: Wall runs infinitely along the X-axis. Its thickness is along the Z-axis.
- yaw=90: Wall runs infinitely along the Z-axis. Its thickness is along the X-axis.

EXAMPLE: A 10m x 10m room centered at x=0, z=0 requires 4 walls:
- North Wall (yaw=0): position_z = -5, dimension_w = 10
- South Wall (yaw=0): position_z = 5, dimension_w = 10
- East Wall (yaw=90): position_x = 5, dimension_w = 10
- West Wall (yaw=90): position_x = -5, dimension_w = 10
Ensure walls connect cleanly at the corners to form closed rooms.

## RULES
1. Provide a step-by-step breakdown of your spatial reasoning based on the reference measurement. Calculate the bounds of the house.
2. Form fully closed rooms. Do not just place a single facade. Extrapolate from the image to build a complete 3D structure.
3. Position elements precisely. Avoid Z-fighting (overlapping identical coordinates).
4. Infer materials (e.g., 'mat_brick_red', 'mat_wood_siding', 'mat_concrete', 'mat_glass') based on visual evidence.
5. If you see a roof in the image, determine its style (gable, hip, flat, mansard) and place it centrally over the corresponding room/floor.
6. Only return tool calls for 'add_node'. Group your node creations logically.

BE EXTREMELY METICULOUS WITH YOUR MATH AND POSITIONS.`;

export async function processImageTo3D(request: ImageTo3DRequest): Promise<ImageTo3DResponse> {
    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout | undefined;

    try {
        const config = getProviderConfig();

        // Format the image data
        let base64Data = request.image_data;
        let mimeType = 'image/jpeg';

        if (base64Data.startsWith('data:')) {
            const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mimeType = matches[1];
                base64Data = matches[2];
            }
        }

        const prompt = `USER REFERENCE MEASUREMENT: "${request.reference_measurement}"\n\nPlease analyze this image and generate the 3D model nodes.`;

        let data;
        let msg;

        const controller = new AbortController();
        timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout

        if (config.provider === 'gemini') {
            console.log(`[Image-to-3D] Sending payload to Gemini (${config.model}).`);
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

            const geminiTools = [
                {
                    function_declarations: [{
                        name: "add_node",
                        description: "Add a new architectural node to the scene",
                        parameters: {
                            type: "object",
                            properties: {
                                parent_id: { type: "string", description: "The ID of the parent node" },
                                type: { type: "string", description: "The type of node" },
                                id: { type: "string", description: "A unique identifier" },
                                name: { type: "string", description: "Human readable name" },
                                position_x: { type: "number" },
                                position_y: { type: "number" },
                                position_z: { type: "number" },
                                dimension_w: { type: "number" },
                                dimension_h: { type: "number" },
                                dimension_d: { type: "number" },
                                yaw: { type: "number" },
                                material_id: { type: "string" },
                                roof_style: { type: "string" }
                            },
                            required: ["parent_id", "type", "id", "name", "position_x", "position_y", "position_z", "dimension_w", "dimension_h", "dimension_d"]
                        }
                    }]
                }
            ];

            const body = {
                contents: [{
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: mimeType, data: base64Data } }
                    ]
                }],
                tools: geminiTools,
                tool_config: { function_calling_config: { mode: 'ANY', allowed_function_names: ["add_node"] } },
                system_instruction: { parts: [{ text: VISION_SYSTEM_PROMPT }] },
                generation_config: { temperature: 0.2, max_output_tokens: 4000 }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Gemini Vision API error ${response.status}: ${errorText}`);
            }

            data = await response.json();
            const candidate = data.candidates?.[0];
            if (!candidate) throw new Error('Gemini returned no candidates');

            const contentParts = candidate.content?.parts || [];
            const toolCallParts = contentParts.filter((p: { functionCall?: unknown }) => p.functionCall);

            msg = {
                content: (contentParts.find((p: { text?: string }) => p.text) as { text?: string })?.text || "",
                tool_calls: toolCallParts.map((p: { functionCall: { name: string; args: object } }) => ({
                    function: {
                        name: p.functionCall.name,
                        arguments: JSON.stringify(p.functionCall.args)
                    }
                }))
            };
        } else {
            // Existing logic for non-gemini providers (like github)
            console.log(`[Image-to-3D] Sending payload to ${config.provider} (${config.model}).`);

            const dataUri = `data:${mimeType};base64,${base64Data}`;
            const body = {
                model: config.model,
                messages: [
                    { role: 'system', content: VISION_SYSTEM_PROMPT },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: prompt },
                            { type: 'image_url', image_url: { url: dataUri } }
                        ]
                    }
                ],
                tools: [{
                    type: 'function',
                    function: {
                        name: "add_node",
                        description: "Add a new architectural node to the scene",
                        parameters: {
                            type: "object",
                            properties: {
                                parent_id: { type: "string" },
                                type: { type: "string" },
                                id: { type: "string" },
                                name: { type: "string" },
                                position_x: { type: "number" },
                                position_y: { type: "number" },
                                position_z: { type: "number" },
                                dimension_w: { type: "number" },
                                dimension_h: { type: "number" },
                                dimension_d: { type: "number" },
                                yaw: { type: "number" },
                                material_id: { type: "string" },
                                roof_style: { type: "string" }
                            },
                            required: ["parent_id", "type", "id", "name", "position_x", "position_y", "position_z", "dimension_w", "dimension_h", "dimension_d"]
                        }
                    }
                }],
                tool_choice: 'required',
                temperature: 0.2,
                max_tokens: 4000
            };

            const endpoint = config.provider === 'openai'
                ? 'https://api.openai.com/v1/chat/completions'
                : 'https://models.inference.ai.azure.com/chat/completions';

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.apiKey}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Vision API error ${response.status}: ${errorText}`);
            }

            data = await response.json();
            msg = data.choices?.[0]?.message;
        }

        if (timeoutId) clearTimeout(timeoutId);

        console.log(`[Image-to-3D] Received response in ${Date.now() - startTime}ms`);

        if (!msg) {
            console.error('[Image-to-3D] Malformed API Data:', data);
            throw new Error('API returned no message');
        }

        const toolCalls = msg.tool_calls || [];
        const operations: PSGOperation[] = [];

        for (const tc of toolCalls) {
            if (tc.function.name === 'add_node') {
                try {
                    const args = JSON.parse(tc.function.arguments);
                    const opParams = {
                        new_id: args.id,
                        type: args.type,
                        name: args.name,
                        position_x: args.position_x,
                        position_y: args.position_y,
                        position_z: args.position_z,
                        width: args.dimension_w,
                        height: args.dimension_h,
                        depth: args.dimension_d,
                        yaw: args.yaw || 0,
                        material_id: args.material_id || 'mat_default',
                        roof_style: args.roof_style
                    };

                    operations.push({
                        type: 'add_node',
                        target_id: args.parent_id || 'unknown',
                        params: opParams,
                        timestamp: new Date().toISOString()
                    });
                } catch (e) {
                    console.error("Failed to parse tool call arguments:", tc.function.arguments, e);
                }
            }
        }

        if (operations.length === 0 && msg.content) {
            console.warn("[Image-to-3D] The model returned content but NO operations:", msg.content);
            throw new Error(`The AI responded but did not generate any 3D operations. Analysis: ${msg.content.substring(0, 100)}...`);
        }

        return {
            message: msg.content || "I have analyzed the image and generated the 3D footprint.",
            operations,
            warnings: []
        };

    } catch (error: unknown) {
        if (timeoutId) clearTimeout(timeoutId);

        console.error("[Image-to-3D] Vision processing error:", error);

        let errorMessage = error instanceof Error ? error.message : String(error);
        if (error instanceof Error && error.name === 'AbortError') {
            errorMessage = 'The vision analysis timed out. This can happen with large images or slow connections. Try a smaller/simpler photo.';
        }

        return {
            message: errorMessage,
            operations: [],
            warnings: [{ severity: 'critical', message: errorMessage }]
        };
    }
}
