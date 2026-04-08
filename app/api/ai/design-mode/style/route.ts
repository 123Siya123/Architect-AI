/**
 * =============================================================================
 * API/AI/DESIGN-MODE/STYLE/ROUTE.TS — Plan & Design Phase 1: Style & Form
 * =============================================================================
 *
 * Generates a masterplan from the user's description, then creates 4 exterior
 * preview images combining 2 style interpretations × 2 layout interpretations.
 *
 * Execution order (optimized for latency):
 *   PARALLEL:  Research Specialist + Style Variations (Flash)
 *   SEQUENTIAL: Architect Phase 1 (needs research result)
 *   PARALLEL:  4 image generations
 *
 * =============================================================================
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProviderConfig, getNextKey } from '@/lib/ai/key-manager';
import { callProviderNoTools, extractJSON } from '@/lib/ai/base-orchestrator';
import { getModelForRole } from '@/lib/ai/models';
import {
    RESEARCH_SPECIALIST_V3_PROMPT,
    ARCHITECT_PHASE1_PROMPT,
    STYLE_VARIATIONS_PROMPT,
} from '@/lib/ai/prompts-v3';
import { generateDesignImage } from '@/lib/ai/design-image';
import type { MasterBuildDocument } from '@/types';

export const maxDuration = 300;

interface StyleVariations {
    styleA: string;
    styleB: string;
    layoutA: string;
    layoutB: string;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { userInstruction, existingMasterplan, refinementNote } = body;

        if (!userInstruction?.trim()) {
            return NextResponse.json(
                { error: 'Please provide a design description.' },
                { status: 400 }
            );
        }

        const effectiveInstruction = refinementNote
            ? `${userInstruction}\n\nRefinement: ${refinementNote}`
            : userInstruction;

        console.log(`[Design Style] Starting Phase 1 for: "${effectiveInstruction.substring(0, 80)}..."`);

        // ─── PARALLEL: Research Specialist + Style Variations ───────────
        const researchConfig = getProviderConfig();
        // Override model for research to use the research_specialist model
        const researchConfigOverride = { ...researchConfig, model: getModelForRole('research_specialist') };

        const styleConfig = {
            ...getProviderConfig(),
            model: getModelForRole('aesthetic_designer'), // gemini-2.0-flash
        };

        const researchPrompt = RESEARCH_SPECIALIST_V3_PROMPT.replace('{USER_REQUEST}', effectiveInstruction);
        const stylePrompt = STYLE_VARIATIONS_PROMPT.replace('{USER_DESCRIPTION}', effectiveInstruction);

        const [researchResult, styleResult] = await Promise.all([
            callProviderNoTools(
                researchConfigOverride,
                [{ role: 'user', content: researchPrompt }],
                undefined,
                request.signal
            ),
            callProviderNoTools(
                styleConfig,
                [{ role: 'user', content: stylePrompt }],
                undefined,
                request.signal
            ),
        ]);

        // Extract research brief
        const briefObj = extractJSON(researchResult.text);
        const buildBriefText = briefObj ? JSON.stringify(briefObj, null, 2) : researchResult.text;
        console.log(`[Design Style] Research brief generated`);

        // Extract style variations (with fallback)
        let styleVariations: StyleVariations = {
            styleA: 'Modern minimalist with clean lines, flat roof, floor-to-ceiling glass, muted concrete palette',
            styleB: 'Warm contemporary with natural timber accents, pitched roof, stone feature wall',
            layoutA: 'Compact two-storey with central staircase, efficient footprint',
            layoutB: 'Sprawling single-storey open plan with indoor-outdoor flow',
        };

        const parsedStyle = extractJSON<StyleVariations>(styleResult.text);
        if (parsedStyle?.styleA && parsedStyle?.styleB && parsedStyle?.layoutA && parsedStyle?.layoutB) {
            styleVariations = parsedStyle;
        }
        console.log(`[Design Style] Style variations: ${JSON.stringify(styleVariations)}`);

        // ─── SEQUENTIAL: Architect Phase 1 ──────────────────────────────
        const architectConfig = { ...getProviderConfig(), model: getModelForRole('research_specialist') };

        let phase1Context: string;
        if (existingMasterplan) {
            phase1Context = `EXISTING MASTERPLAN (update this based on the refinement):\n${JSON.stringify(existingMasterplan, null, 2)}\n\nBUILD BRIEF:\n${buildBriefText}\n\nCURRENT SCENE GRAPH:\n{}`;
        } else {
            phase1Context = `BUILD BRIEF:\n${buildBriefText}\n\nCURRENT SCENE GRAPH:\n{}`;
        }

        const architectPrompt = ARCHITECT_PHASE1_PROMPT
            .replace('{USER_REQUEST}', effectiveInstruction)
            .replace('{CONTEXT}', phase1Context);

        const architectResult = await callProviderNoTools(
            architectConfig,
            [{ role: 'user', content: architectPrompt }],
            undefined,
            request.signal
        );

        const masterplan = extractJSON<MasterBuildDocument>(architectResult.text);
        if (!masterplan) {
            console.error(`[Design Style] Architect failed to produce masterplan. Raw:`, architectResult.text.substring(0, 500));
            return NextResponse.json(
                { error: 'Failed to create master build plan. Please try again.' },
                { status: 500 }
            );
        }
        console.log(`[Design Style] Masterplan created with ${masterplan.buildOrder.length} steps`);

        // ─── PARALLEL: 4 image generations ──────────────────────────────
        const masterplanText = JSON.stringify(masterplan, null, 2);
        const basePrompt = `Create an image trying to most accurately create and show the house described in the plan below with exact measurements and all objects present. Show it in a realistic but not distracting surrounding and as a newly built house.\n\n[MASTERPLAN]\n${masterplanText}\n\n`;

        const imagePrompts = [
            // Top row: same layout (A), different styles
            `${basePrompt}Create this in ${styleVariations.styleA} style and ${styleVariations.layoutA} arrangement. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,
            `${basePrompt}Create this in ${styleVariations.styleB} style and ${styleVariations.layoutA} arrangement. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,
            // Bottom row: different layouts
            `${basePrompt}Create this in ${styleVariations.styleA} style and ${styleVariations.layoutB} arrangement. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,
            `${basePrompt}Create this in ${styleVariations.styleB} style and ${styleVariations.layoutB} arrangement. Professional architectural render, exterior view, realistic lighting, high quality photograph style.`,
        ];

        const imageResults = await Promise.allSettled(
            imagePrompts.map((prompt, index) => {
                const apiKey = getNextKey('gemini');
                return generateDesignImage(prompt, index, apiKey, undefined, request.signal);
            })
        );

        const images: { index: number; base64: string; prompt: string }[] = [];
        for (let i = 0; i < imageResults.length; i++) {
            const result = imageResults[i];
            if (result.status === 'fulfilled' && result.value) {
                images.push({ index: i, base64: result.value, prompt: imagePrompts[i] });
            }
        }

        if (images.length === 0) {
            return NextResponse.json(
                { error: 'Failed to generate any preview images. Please try again.' },
                { status: 500 }
            );
        }

        console.log(`[Design Style] Generated ${images.length}/4 style preview images`);

        return NextResponse.json({
            masterplan,
            buildBrief: buildBriefText,
            styleVariations,
            images,
        });

    } catch (error) {
        console.error('[Design Style] Error:', error);
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: `Style generation failed: ${errMsg}` },
            { status: 500 }
        );
    }
}
