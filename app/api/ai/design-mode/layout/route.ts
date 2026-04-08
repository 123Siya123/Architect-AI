/**
 * =============================================================================
 * API/AI/DESIGN-MODE/LAYOUT/ROUTE.TS — Plan & Design Phase 2: Interior Layout
 * =============================================================================
 *
 * Generates 4 colored floor plan images showing different room arrangements
 * that match the selected exterior style. Uses the style image as vision input
 * so Gemini can match the exterior footprint shape.
 *
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNextKey } from '@/lib/ai/key-manager';
import { generateDesignImage } from '@/lib/ai/design-image';
import type { MasterBuildDocument } from '@/types';

export const maxDuration = 180;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { masterplan, selectedStyleImageBase64, userLayoutNotes } = body as {
            masterplan: MasterBuildDocument;
            selectedStyleImageBase64: string;
            userLayoutNotes?: string;
        };

        if (!masterplan || !selectedStyleImageBase64) {
            return NextResponse.json(
                { error: 'Masterplan and style image are required.' },
                { status: 400 }
            );
        }

        console.log(`[Design Layout] Generating 4 floor plan variants for ${masterplan.totalFootprint.x}m × ${masterplan.totalFootprint.z}m footprint`);

        const footprint = `${masterplan.totalFootprint.x}m × ${masterplan.totalFootprint.z}m`;
        const userNotes = userLayoutNotes ? `\n\nUser preferences: ${userLayoutNotes}` : '';

        const basePrompt = `Create a colored architectural floor plan that exactly matches the exterior shape and dimensions of the building shown in the reference image. The floor plan must be a top-down view at 1 meter height, showing rooms with soft warm colors, furniture placement, room labels, and a cozy residential interior feel. NOT a black-and-white technical drawing — use warm inviting colors to help visualize the space. Match the exact exterior footprint: ${footprint}.${userNotes}\n\nMasterplan features:\n${JSON.stringify(masterplan.materialPalette, null, 2)}\nComponents: ${masterplan.components.map(c => c.name).join(', ')}`;

        const layoutVariations = [
            `${basePrompt}\n\nRoom arrangement: Open-plan living, dining, and kitchen area at the front of the house. Bedrooms clustered at the rear for privacy. Central hallway connecting all spaces.`,
            `${basePrompt}\n\nRoom arrangement: Traditional layout with separate rooms connected by a central hallway spine. Formal living room separate from family room. Kitchen adjacent to dining.`,
            `${basePrompt}\n\nRoom arrangement: Master bedroom positioned front-left with large ensuite bathroom. Other bedrooms grouped at rear-right. Kitchen and living areas in an L-shaped open plan.`,
            `${basePrompt}\n\nRoom arrangement: Master bedroom at the rear for maximum privacy. Social spaces (living, dining, kitchen) facing the garden at the front. Utility areas grouped near the entrance.`,
        ];

        const imageResults = await Promise.allSettled(
            layoutVariations.map((prompt, index) => {
                const apiKey = getNextKey('gemini');
                return generateDesignImage(
                    prompt,
                    index,
                    apiKey,
                    selectedStyleImageBase64, // Vision input: the selected exterior image
                    request.signal
                );
            })
        );

        const images: { index: number; base64: string; prompt: string }[] = [];
        for (let i = 0; i < imageResults.length; i++) {
            const result = imageResults[i];
            if (result.status === 'fulfilled' && result.value) {
                images.push({ index: i, base64: result.value, prompt: layoutVariations[i] });
            }
        }

        if (images.length === 0) {
            return NextResponse.json(
                { error: 'Failed to generate any floor plan images. Please try again.' },
                { status: 500 }
            );
        }

        console.log(`[Design Layout] Generated ${images.length}/4 floor plan images`);

        return NextResponse.json({ images });

    } catch (error) {
        console.error('[Design Layout] Error:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `Layout generation failed: ${errMsg}` },
            { status: 500 }
        );
    }
}
