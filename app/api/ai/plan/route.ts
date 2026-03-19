import { NextRequest, NextResponse } from 'next/server';
import { generateASCIIFloorPlan, prepareProjectContext } from '@/lib/ai/context';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getProviderConfig } from '@/lib/ai/key-manager';

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

        const providerConfig = getProviderConfig('gemini');
        const apiKey = providerConfig.apiKey;
        const modelName = providerConfig.model; // This is gemini-3-flash-preview or whatever is configured

        if (!apiKey) {
            throw new Error("API_KEY is missing or invalid");
        }

        let systemInstruction = `You are a world-class architectural visualizer.
Your task is to generate EXACTLY 4 highly detailed pre-visualization prompts for an architectural project.
- Provide 4 distinct variations (e.g., modern, rustic, classical, minimalist) or 4 slightly varied angles/lighting setups if the user is very specific.
- You MUST output ONLY a pure JSON array of 4 string prompts that describe the house visually. Do not wrap in markdown or add explanations. Prefix each string with "Architectural render, ".`;

        if (project && Object.keys(project.nodes).length > 1) {
            const asciiPlan = generateASCIIFloorPlan(project);
            systemInstruction += `\n\nCRITICAL: The user already has a structure. You MUST generate prompts that visually incorporate or build upon this existing layout:
\`\`\`
${asciiPlan}
\`\`\`
Ensure the descriptions look like modifications or refinements of their current house.`;
        }

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        const reqBody = {
            contents: [
                {
                    role: 'user',
                    parts: [{ text: `User request: "${input}"\n\nPlease output the JSON array of 4 image generation prompts now.` }]
                }
            ],
            system_instruction: { parts: [{ text: systemInstruction }] },
            generation_config: {
                temperature: 0.7
            }
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const textOutput = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        let prompts: string[] = [];
        const jsonMatch = textOutput.match(/\[[\s\S]*\]/);
        
        if (jsonMatch) {
            try {
                prompts = JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.error("Failed to parse Gemini output", e);
            }
        }

        if (prompts.length !== 4) {
            prompts = [
                `Architectural render, ${input}, modern style, photorealistic view`,
                `Architectural render, ${input}, rustic natural style, warm lighting`,
                `Architectural render, ${input}, brutalist concrete style, dramatic shadows`,
                `Architectural render, ${input}, minimalist glass style, bright daylight`
            ];
        }

        // Fetch the 4 images from a free generation service using the dynamic prompts
        const images: string[] = [];
        
        // Run requests in parallel to speed up the 500 / timeouts
        const fetchPromises = prompts.slice(0, 4).map(async (p, idx) => {
            try {
                // Using Pollinations AI for instant, free prompt-based image generation (no API key needed)
                const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=512&height=512&nologo=true&seed=${Date.now() + idx}`;
                
                const imgRes = await fetch(imageUrl);
                if (!imgRes.ok) throw new Error(`Failed to fetch image ${idx}`);
                
                const buffer = await imgRes.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                return base64;
            } catch (err) {
                console.error(`Failed to generate image ${idx}:`, err);
                return ""; // fallback empty string
            }
        });
        
        const generatedBase64s = await Promise.all(fetchPromises);
        
        for (const b64 of generatedBase64s) {
            if (b64) images.push(b64);
        }

        if (images.length === 0) {
            return NextResponse.json({ error: "Failed to download image previews.", images: [] }, { status: 500 });
        }

        return NextResponse.json({ images: images });

    } catch (error: any) {
        console.error('Plan generation error:', error);
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        );
    }
}
