/**
 * =============================================================================
 * APP/API/AI/CHAT/ROUTE.TS — AI Chat API Endpoint
 * =============================================================================
 *
 * Handles POST requests from the ChatPanel.
 * Currently returns a stub response. When the AI backend (Python/FastAPI)
 * is connected, this will proxy to the orchestrator.
 *
 * REQUEST: { message: string, project: PSGProject, history: ChatMessage[] }
 * RESPONSE: { message: string, operations?: PSGOperation[] }
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { message } = body;

        // Stub response until AI backend is connected
        const response = {
            message: `I received your request: "${message}". The AI backend is not yet connected. Once configured, I'll be able to modify the 3D model based on your instructions.`,
            operations: [],
        };

        return NextResponse.json(response);
    } catch {
        return NextResponse.json(
            { message: 'Failed to process request.', operations: [] },
            { status: 500 }
        );
    }
}
