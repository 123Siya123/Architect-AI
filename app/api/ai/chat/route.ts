import { NextRequest, NextResponse } from 'next/server';
import { sendChatToAI_V3 } from '@/lib/ai/v3-orchestrator';
import { sendChatToAI_OneShot } from '@/lib/ai/oneshot-orchestrator';
import type { AIChatRequest, Material, ArchitectureMode, ThinkingEffort } from '@/types';
import materialsJson from '@/data/materials.json';

export const maxDuration = 300; // Allow long running requests

// Architecture mode type


function getOrchestrator(mode: ArchitectureMode) {
    switch (mode) {
        case 'v3':
            return sendChatToAI_V3;
        case 'oneshot':
            return sendChatToAI_OneShot;
        default:
            return sendChatToAI_V3;
    }
}

export async function POST(request: NextRequest) {
    try {
        const body: AIChatRequest & { architecture?: ArchitectureMode, thinkingEffort?: ThinkingEffort } = await request.json();
        const { message, project, history, attachments, professionalContext, architecture, thinkingEffort } = body;

        if (!message?.trim() && (!attachments || attachments.length === 0)) {
            return NextResponse.json(
                { message: 'Please provide a message or attachment.', operations: [] },
                { status: 400 }
            );
        }

        // Load materials library (JSON is keyed by material ID)
        const materials: Record<string, Material> = {};
        for (const [id, mat] of Object.entries(materialsJson)) {
            materials[id] = mat as unknown as Material;
        }

        // Select orchestrator based on architecture mode
        const mode: ArchitectureMode = architecture || 'v3';
        const sendChatToAI = getOrchestrator(mode);

        console.log(`[API /ai/chat] Using architecture: ${mode.toUpperCase()}`);

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    // Send to AI orchestrator with progress callback
                    const aiResponse = await sendChatToAI(
                        { message, project, history: history || [], attachments, professionalContext, thinkingEffort },
                        materials,
                        (event) => {
                            try {
                                const chunk = JSON.stringify(event) + '\n';
                                controller.enqueue(encoder.encode(chunk));
                            } catch (e) {
                                // Ignore enqueue errors (stream closed)
                            }
                        },
                        request.signal,
                        undefined
                    );

                    // Stream final result
                    const resultChunk = JSON.stringify({
                        type: 'result',
                        data: {
                            message: aiResponse.message,
                            operations: aiResponse.operations,
                            warnings: aiResponse.warnings || [],
                            suggestions: aiResponse.suggestions || [],
                            progress_log: aiResponse.progress_log || [],
                        }
                    }) + '\n';
                    try {
                        controller.enqueue(encoder.encode(resultChunk));
                        controller.close();
                    } catch (e) {
                        // Ignore
                    }
                } catch (error) {
                    console.error('[API /ai/chat] Error in stream:', error);
                    const errMsg = error instanceof Error ? error.message : 'Unknown error';

                    // Don't try to send error if user cancelled
                    if (errMsg.includes('User cancelled') || errMsg.includes('aborted')) {
                        try { controller.close(); } catch { }
                        return;
                    }

                    const errorChunk = JSON.stringify({
                        type: 'error',
                        message: errMsg
                    }) + '\n';
                    try {
                        controller.enqueue(encoder.encode(errorChunk));
                        controller.close();
                    } catch (e) {
                        // Ignore
                    }
                }
            }
        });

        return new NextResponse(stream, {
            headers: {
                'Content-Type': 'application/x-ndjson',
                'Transfer-Encoding': 'chunked',
            },
        });

    } catch (error) {
        console.error('[API /ai/chat] Error:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            {
                message: `An error occurred: ${errMsg}`,
                operations: [],
                warnings: [{ severity: 'warning', message: errMsg }],
            },
            { status: 500 }
        );
    }
}
