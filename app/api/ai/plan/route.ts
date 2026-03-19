import { NextRequest, NextResponse } from 'next/server';
import { generateASCIIFloorPlan, prepareProjectContext } from '@/lib/ai/context';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { MODEL_CONFIG } from '@/lib/ai/models';
import { getNextKey } from '@/lib/ai/key-manager';

interface ImagenPrediction {
    bytesBase64Encoded: string;
    mimeType: string;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { input, project } = body;

        if (!input) {
            return NextResponse.json({ error: 'Input is required' }, { status: 400 });
        }

        const apiKey = getNextKey('gemini');
        if (!apiKey) {
            throw new Error("API_KEY is missing or invalid");
        }
        
        const genAI = new GoogleGenerativeAI(apiKey);

        // 1. Generate 4 strong prompts using Gemini Text Model
        const orchestratorModel = genAI.getGenerativeModel({ model: MODEL_CONFIG.orchestrator });

        let systemInstruction = `You are an expert architectural prompt engineer.
Your task is to generate exactly 4 HIGHLY DETAILED, distinct, and high-quality image generation prompts for an architectural visualization model.
Each prompt must be optimized for generating a photorealistic architectural render.
The 4 prompts must be variations of the user's core request.
- If the user provides a vague request, provide 4 highly varied architectural styles/interpretations (e.g., one modern, one rustic, one brutalist, one classical).
- If the user provides a strict, detailed request, provide 4 subtle variations within those tight constraints (e.g., varying lighting, composition, or slight material shifts).`;

        if (project && Object.keys(project.nodes).length > 1) {
            const asciiPlan = generateASCIIFloorPlan(project);
            systemInstruction += `

CRITICAL INSTRUCTION: The user ALREADY HAS a 3D structure built. You MUST incorporate the existing structure into your prompts so the generated images look like modifications or refinements of their current house, rather than entirely new buildings.
Here is the ASCII top-down plan of the existing structure:
${asciiPlan}`;
        }

        systemInstruction += `

Output ONLY a JSON array of 4 strings. Example:
[
  "A high-quality architectural render of...",
  "A photorealistic visualization of...",
  "An exterior render of...",
  "A cozy interior shot of..."
]`;

        const imagePromptsResult = await orchestratorModel.generateContent({
            contents: [{ role: 'user', parts: [{ text: `User request: "${input}"\nGenerate the 4 prompts now.` }] }],
            systemInstruction: { parts: [{ text: systemInstruction }], role: 'system' }
        });

        let textOutput = imagePromptsResult.response.text();
        const jsonMatch = textOutput.match(/\[[\s\S]*\]/);
        let prompts: string[] = [];
        
        if (jsonMatch) {
            try {
                prompts = JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.error('Failed to parse prompts JSON', e);
            }
        }

        if (prompts.length !== 4) {
            prompts = [
                input + ", modern architectural render, photorealistic, cinematic lighting, 8k",
                input + ", rustic architectural render, warm lighting, natural materials",
                input + ", brutalist architectural render, concrete, dramatic shadows",
                input + ", minimalist architectural render, clean lines, bright daylight"
            ];
        }

        // 2. Generate the 4 images using Google Imagen API
        const images: string[] = [];

        for (const prompt of prompts) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${apiKey}`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        instances: [{
                            prompt: prompt
                        }],
                        parameters: {
                            sampleCount: 1,
                            outputOptions: {
                                mimeType: "image/png"
                            }
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.predictions && data.predictions.length > 0) {
                        images.push(data.predictions[0].bytesBase64Encoded);
                    } else {
                        throw new Error("No predictions in imagen response");
                    }
                } else {
                    const errText = await response.text();
                    console.error('Imagen API Error:', response.status, errText);
                    // Fallback to empty if a specific prompt fails
                    images.push(""); 
                }
            } catch (err) {
                console.error("Error calling Imagen:", err);
                images.push("");
            }
        }

        // Filter out any failed generations
        const validImages = images.filter(b64 => b64.length > 100);

        if (validImages.length === 0) {
            // Provide a mock base64 if it completely fails, or return error
            return NextResponse.json({ error: "Image generation failed. Ensure your Gemini API key has Imagen access enabled.", images: [] }, { status: 500 });
        }

        return NextResponse.json({ images: validImages });

    } catch (error: any) {
        console.error('Plan generation error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
