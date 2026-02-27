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

import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { PSGOperation, ImageTo3DRequest, ImageTo3DResponse } from '@/types';
import { getProviderConfig } from './key-manager';
import { toolCallToOperation } from './orchestrator';
import { toolCallToOperation } from './orchestrator';

const VISION_SYSTEM_PROMPT = `You are an Expert AI Architect specialized in reverse-engineering 3D models from 2D images.
The user has provided an image of a house and a "reference measurement" string (e.g., "The front door is 2.1m high" or "The front wall is 10m wide").

## YOUR ROLE
Analyze the image and construct a 3D house model using the provided tools.
You must use the reference measurement to accurately scale your generated coordinates (x,y,z) into meters.

## COORDINATE SYSTEM
- X axis = East/West (Width)
- Y axis = Up/Down (Height, Y=0 is ground level)
- Z axis = North/South (Depth)
Positions are the CENTER POINT of the element.

## RULES
1. Provide a step-by-step breakdown of your spatial reasoning based on the reference measurement.
2. Break down the house into primary structural components: Floor container, Rooms, Walls, Roof.
3. Use the 'add_node' tool to construct these elements.
4. For walls, pay strict attention to rotation (yaw=0 for X-axis along width, yaw=90 for Z-axis along width).
5. Infer standard materials (e.g., brick, wood, shingles) based on the image visually.
6. The user already provided the House root node. You must create the Floor node first, attached to House.

Be highly accurate in your topological layout.`;

export async function processImageTo3D(request: ImageTo3DRequest): Promise<ImageTo3DResponse> {
    try {
        const config = getProviderConfig();

        // Ensure we are using a model capable of vision.
        // Assuming Gemini 1.5 Pro for vision tasks if specifically needed, but we rely on the provider config.
        const genAI = new GoogleGenerativeAI(config.apiKey);
        const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-pro', // Hardcoding pro for optimal vision capabilities, falling back to flash if needed
        });

        // The image data is expected to be a base64 string
        // We need to pass it to the Gemini API correctly.
        // Assuming the image_data string format might include the data URI prefix: data:image/jpeg;base64,...
        let base64Data = request.image_data;
        let mimeType = 'image/jpeg'; // default

        if (base64Data.startsWith('data:')) {
            const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mimeType = matches[1];
                base64Data = matches[2];
            }
        }

        const prompt = `
USER REFERENCE MEASUREMENT: "${request.reference_measurement}"

Please analyze this image and generate the 3D model nodes.
`;

        const chatSession = model.startChat({
            generationConfig: {
                temperature: 0.2, // Low temperature for more deterministic structural parsing
            },
            systemInstruction: VISION_SYSTEM_PROMPT,
            tools: [{
                functionDeclarations: [
                    {
                        name: "add_node",
                        description: "Add a new architectural node to the scene",
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {
                                parent_id: { type: SchemaType.STRING, description: "The ID of the parent node (e.g., 'house_root', or a floor/room ID you create)" },
                                type: { type: SchemaType.STRING, description: "The type of node (Floor, Room, Wall, Roof, Window, Door)" },
                                id: { type: SchemaType.STRING, description: "A unique identifier you choose for this new node" },
                                name: { type: SchemaType.STRING, description: "Human readable name" },
                                position_x: { type: SchemaType.NUMBER, description: "Center X position in meters" },
                                position_y: { type: SchemaType.NUMBER, description: "Center Y position in meters" },
                                position_z: { type: SchemaType.NUMBER, description: "Center Z position in meters" },
                                dimension_w: { type: SchemaType.NUMBER, description: "Width in meters" },
                                dimension_h: { type: SchemaType.NUMBER, description: "Height in meters" },
                                dimension_d: { type: SchemaType.NUMBER, description: "Depth/Thickness in meters" },
                                yaw: { type: SchemaType.NUMBER, description: "Rotation around Y axis in degrees (0 or 90 for walls)" },
                                material_id: { type: SchemaType.STRING, description: "Material ID to map to (e.g. 'mat_brick_red', 'mat_wood_siding')" },
                                roof_style: { type: SchemaType.STRING, description: "If type is Roof, specify style (gable, hip, flat, etc.)" }
                            },
                            required: ["parent_id", "type", "id", "name", "position_x", "position_y", "position_z", "dimension_w", "dimension_h", "dimension_d"]
                        }
                    }
                ]
            }]
        });

        const result = await chatSession.sendMessage([
            {
                inlineData: {
                    data: base64Data,
                    mimeType: mimeType
                }
            },
            {
                text: prompt
            }
        ]);

        const responseText = result.response.text();
        const functionCalls = result.response.functionCalls() || [];

        const operations: PSGOperation[] = [];

        for (const call of functionCalls) {
            if (call.name === 'add_node') {
                try {
                    // Map the simplified tool args back to our PSG operation format
                    const args = call.args as Record<string, any>;
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
                        target_id: args.parent_id,
                        params: opParams,
                        timestamp: new Date().toISOString()
                    });
                } catch (e) {
                    console.error("Failed to parse tool call:", e);
                }
            }
        }

        return {
            message: responseText || "I have analyzed the image and generated the 3D footprint.",
            operations,
            warnings: []
        };

    } catch (error) {
        console.error("[Image-to-3D] Vision processing error:", error);
        return {
            message: "Sorry, I encountered an error while processing the image: " + (error instanceof Error ? error.message : String(error)),
            operations: [],
            warnings: [{ severity: 'critical', message: String(error) }]
        };
    }
}
