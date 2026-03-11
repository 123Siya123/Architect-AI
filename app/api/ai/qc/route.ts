import { NextRequest, NextResponse } from 'next/server';
import { callProviderNoTools } from '@/lib/ai/orchestrator';
import { getProviderConfig } from '@/lib/ai/key-manager';

export const maxDuration = 300; 

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { imageBase64, userPrompt } = body;

        if (!imageBase64) {
            return NextResponse.json({ message: 'Missing imageBase64' }, { status: 400 });
        }

        const config = getProviderConfig();
        
        const prompt = `You are a Visual Critique AI for a 3D architecture generation app.
Here is a high-angle screenshot of the 3D house model that was just built, on a white background.
The user originally requested: "${userPrompt || 'A well-designed house'}".

Analyze the image and tell the user if the house looks perfect, fulfilling their instructions, and what structural or aesthetic issues need to be changed or improved.
Keep your response concise, friendly, and helpful. Format as simple markdown.`;

        const attachments = [{
            name: 'screenshot.png', // name of attachment
            type: 'image/png',      // mimetype
            data: imageBase64       // base64 data without prefix
        }];

        const messages = [
            { role: 'user', content: prompt }
        ];

        const result = await callProviderNoTools(config, messages, attachments);

        return NextResponse.json({ message: result.text });
    } catch (error) {
        console.error('[API /ai/qc] Error:', error);
        return NextResponse.json(
            { message: `QC validation failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
            { status: 500 }
        );
    }
}
