import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 300; 

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { imageBase64, userPrompt } = body;

        if (!imageBase64) {
            return NextResponse.json({ message: 'Missing imageBase64' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || process.env.AI_API_KEYS?.split(',')[0];
        if (!apiKey) {
            return NextResponse.json({ message: 'API Key not configured' }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' }); // or whichever model has vision

        const prompt = `You are a Visual Critique AI for a 3D architecture generation app.
Here is a high-angle screenshot of the 3D house model that was just built, on a white background.
The user originally requested: "${userPrompt || 'A well-designed house'}".

Analyze the image and tell the user if the house looks perfect, fulfilling their instructions, and what structural or aesthetic issues need to be changed or improved.
Keep your response concise, friendly, and helpful. Format as simple markdown.`;

        const imagePart = {
            inlineData: {
                data: imageBase64,
                mimeType: 'image/png'
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const response = await result.response;
        const text = response.text();

        return NextResponse.json({ message: text });
    } catch (error) {
        console.error('[API /ai/qc] Error:', error);
        return NextResponse.json(
            { message: `QC validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
            { status: 500 }
        );
    }
}
