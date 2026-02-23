/**
 * =============================================================================
 * APP/API/AI/CHAT/ROUTE.TS — AI Chat API Endpoint
 * =============================================================================
 *
 * Handles POST requests from the ChatPanel. This is the bridge between
 * the frontend and the AI orchestrator.
 *
 * FLOW:
 * 1. Parse the request body (message, project, history)
 * 2. Load the materials library
 * 3. Send to the AI orchestrator (Gemini/OpenAI)
 * 4. Validate any returned operations
 * 5. Return the AI's message + validated operations
 *
 * SECURITY:
 * - API keys are server-side only (never exposed to client)
 * - All operations are validated before being returned
 * - Rate limiting should be added in production
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendChatToAI } from '@/lib/ai/orchestrator';
import { validateOperation } from '@/lib/psg/validator';
import type { AIChatRequest, Material, PSGOperation } from '@/types';
import materialsJson from '@/data/materials.json';

export async function POST(request: NextRequest) {
    try {
        const body: AIChatRequest = await request.json();
        const { message, project, history } = body;

        if (!message?.trim()) {
            return NextResponse.json(
                { message: 'Please provide a message.', operations: [] },
                { status: 400 }
            );
        }

        // Load materials library (JSON is keyed by material ID)
        const materials: Record<string, Material> = {};
        for (const [id, mat] of Object.entries(materialsJson)) {
            materials[id] = mat as unknown as Material;
        }

        // Send to AI orchestrator
        const aiResponse = await sendChatToAI(
            { message, project, history: history || [] },
            materials
        );

        // Validate all returned operations against the current project
        const validatedOps: PSGOperation[] = [];
        const validationErrors: string[] = [];

        for (const op of aiResponse.operations) {
            const result = validateOperation(op, project);
            if (result.valid) {
                validatedOps.push(op);
            } else {
                validationErrors.push(
                    `Operation ${op.type} on ${op.target_id} rejected: ${result.errors.join(', ')}`
                );
            }
        }

        // If some operations were rejected, append a note to the message
        let finalMessage = aiResponse.message;
        if (validationErrors.length > 0) {
            finalMessage += `\n\n⚠️ Some changes couldn't be applied:\n${validationErrors.map((e) => `- ${e}`).join('\n')}`;
        }

        return NextResponse.json({
            message: finalMessage,
            operations: validatedOps,
            warnings: aiResponse.warnings || [],
            suggestions: aiResponse.suggestions || [],
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
