/**
 * =============================================================================
 * API/AI/PLAN/ROUTE.TS — Planning Mode Image Generation (Nano Banana)
 * =============================================================================
 *
 * Generates 4 house design preview images using Gemini's native image
 * generation model (gemini-3.1-flash-image-preview / Nano Banana 2).
 *
 * Takes the user's instruction and optionally a screenshot of the current
 * 3D state, then generates 4 variant images showing possible design directions.
 *
 * If the user provides sparse instructions → images have HIGH variety
 * If the user provides detailed instructions → images are closely aligned
 *
 * The selected image is then fed back as an attachment to the normal
 * v3 architecture chat endpoint.
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNextKey } from '@/lib/ai/key-manager';

export const maxDuration = 120;

// The correct model for Gemini native image generation (Nano Banana 2)
const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

// Helper to call Gemini image generation
async function generateDesignImage(
    prompt: string,
    variantIndex: number,
    apiKey: string,
    existingSceneBase64?: string,
    signal?: AbortSignal
): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`;

    const parts: any[] = [];

    // If we have an existing scene screenshot, include it as context
    if (existingSceneBase64) {
        parts.push({
            inlineData: {
                mimeType: 'image/png',
                data: existingSceneBase64
            }
        });
    }

    parts.push({ text: prompt });

    const body = {
        contents: [{
            role: 'user',
            parts
        }],
        generationConfig: {
            responseModalities: ['Image', 'Text'],
            temperature: 0.8 + (variantIndex * 0.15), // Increase temperature per variant for diversity
        }
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 90000);

        if (signal) {
            signal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Plan API] Image generation failed for variant ${variantIndex}: ${response.status}`, errorText);
            return null;
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];
        if (!candidate?.content?.parts) return null;

        // Find the image part in the response
        for (const part of candidate.content.parts) {
            if (part.inlineData?.data) {
                return part.inlineData.data; // base64 image data
            }
        }

        console.warn(`[Plan API] No image found in response for variant ${variantIndex}. Parts:`, 
            candidate.content.parts.map((p: any) => Object.keys(p)));
        return null;
    } catch (err) {
        console.error(`[Plan API] Error generating variant ${variantIndex}:`, err);
        return null;
    }
}

// Classify instruction detail level
function classifyDetailLevel(instruction: string): 'sparse' | 'moderate' | 'detailed' {
    const wordCount = instruction.split(/\s+/).length;
    const hasSpecificMaterials = /brick|stone|wood|glass|concrete|steel|metal|timber/i.test(instruction);
    const hasSpecificDimensions = /\d+\s*(m|meter|ft|foot|feet|cm|inch)/i.test(instruction);
    const hasSpecificRooms = /bedroom|bathroom|kitchen|living|dining|garage|study|office|hallway/i.test(instruction);
    const hasStyleKeywords = /modern|traditional|contemporary|minimalist|colonial|Victorian|Mediterranean|Scandinavian|industrial|rustic/i.test(instruction);
    const hasColorKeywords = /white|black|grey|gray|brown|beige|cream|red|blue|green|yellow|warm|cool|neutral/i.test(instruction);

    const specificity = [hasSpecificMaterials, hasSpecificDimensions, hasSpecificRooms, hasStyleKeywords, hasColorKeywords]
        .filter(Boolean).length;

    if (wordCount < 10 && specificity < 2) return 'sparse';
    if (wordCount > 30 || specificity >= 3) return 'detailed';
    return 'moderate';
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { instruction, existingSceneBase64 } = body;

        if (!instruction?.trim()) {
            return NextResponse.json(
                { error: 'Please provide a design instruction.' },
                { status: 400 }
            );
        }

        const detailLevel = classifyDetailLevel(instruction);
        console.log(`[Plan API] Detail level: ${detailLevel}, instruction: "${instruction.substring(0, 80)}..."`);
        console.log(`[Plan API] Using model: ${IMAGE_MODEL}`);

        // Build variant prompts based on detail level
        const variantPrompts = buildVariantPrompts(instruction, detailLevel, !!existingSceneBase64);

        // Generate all 4 images in parallel using different API keys from the pool
        const imagePromises = variantPrompts.map((prompt, index) => {
            const apiKey = getNextKey('gemini');
            return generateDesignImage(prompt, index, apiKey, existingSceneBase64, request.signal);
        });

        const results = await Promise.allSettled(imagePromises);

        const images: { index: number; base64: string; prompt: string }[] = [];
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.status === 'fulfilled' && result.value) {
                images.push({
                    index: i,
                    base64: result.value,
                    prompt: variantPrompts[i]
                });
            }
        }

        if (images.length === 0) {
            return NextResponse.json(
                { error: 'Failed to generate any preview images. Please try again.' },
                { status: 500 }
            );
        }

        console.log(`[Plan API] Successfully generated ${images.length}/4 preview images`);

        return NextResponse.json({
            images,
            detailLevel,
            instruction
        });

    } catch (error) {
        console.error('[Plan API] Error:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `Planning failed: ${errMsg}` },
            { status: 500 }
        );
    }
}

function buildVariantPrompts(
    instruction: string,
    detailLevel: 'sparse' | 'moderate' | 'detailed',
    hasExistingScene: boolean
): string[] {
    const baseContext = hasExistingScene
        ? `I have an existing house design (shown in the attached image). The user wants to modify it as follows: "${instruction}". Generate a realistic architectural visualization showing the result.`
        : `Generate a realistic architectural visualization of a house based on this description: "${instruction}".`;

    if (detailLevel === 'sparse') {
        // Max variety - the user gave vague instructions so explore the design space
        return [
            `${baseContext} Create a MODERN CONTEMPORARY interpretation. Use clean lines, large glass windows, flat or low-pitch roofs. Think Bauhaus-inspired with minimalist palette. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,

            `${baseContext} Create a WARM TRADITIONAL interpretation. Use natural materials like stone and wood, pitched roof with dormers, cozy and inviting facade. Think classic countryside home with character. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,

            `${baseContext} Create a SCANDINAVIAN MINIMALIST interpretation. Light colors, natural wood accents, large windows for natural light, simple elegant forms. Think Nordic design with sustainability focus. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,

            `${baseContext} Create a MEDITERRANEAN / WARM CLIMATE interpretation. Stucco walls, terracotta accents, arched openings, outdoor living spaces. Think villa-style with warm tones. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`
        ];
    } else if (detailLevel === 'moderate') {
        // Medium variety - respect the user's specs but vary the expression
        return [
            `${baseContext} Interpretation A: Focus on maximizing natural light and openness. Keep all specified elements but emphasize glass and transparency where possible. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,

            `${baseContext} Interpretation B: Focus on material warmth and textural richness. Keep all specified elements but use richer material palette and layered facade. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,

            `${baseContext} Interpretation C: Focus on geometric boldness and architectural drama. Keep all specified elements but with more dynamic rooflines and contrasting volumes. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,

            `${baseContext} Interpretation D: Focus on harmony with landscape and organic integration. Keep all specified elements but with softer transitions and natural material accents. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`
        ];
    } else {
        // Minimal variety - the user knows exactly what they want, just tweak details
        return [
            `${baseContext} Variant 1: Follow the description precisely. Use a slightly COOLER color temperature for materials and lighting. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,

            `${baseContext} Variant 2: Follow the description precisely. Use a slightly WARMER color temperature for materials and lighting. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,

            `${baseContext} Variant 3: Follow the description precisely. Emphasize VERTICAL proportions slightly more in the composition. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,

            `${baseContext} Variant 4: Follow the description precisely. Emphasize HORIZONTAL proportions slightly more in the composition. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`
        ];
    }
}
