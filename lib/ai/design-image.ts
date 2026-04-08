/**
 * =============================================================================
 * LIB/AI/DESIGN-IMAGE.TS — Shared Image Generation Helper
 * =============================================================================
 *
 * Extracted from app/api/ai/plan/route.ts so both the legacy planning route
 * and the new Plan & Design mode routes can reuse the same Gemini native
 * image generation logic.
 *
 * Uses gemini-3.1-flash-image-preview (Nano Banana 2) for native image output.
 * =============================================================================
 */

export const IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

/**
 * Generate a single design image using Gemini's native image generation.
 *
 * @param prompt        Text prompt describing the image to generate
 * @param variantIndex  Controls temperature: 0.8 + (index * 0.1)
 * @param apiKey        Gemini API key
 * @param visionInputBase64  Optional base64 image sent as inlineData before text (for multimodal)
 * @param signal        Optional AbortSignal for cancellation
 * @returns base64 image data or null on failure
 */
export async function generateDesignImage(
    prompt: string,
    variantIndex: number,
    apiKey: string,
    visionInputBase64?: string,
    signal?: AbortSignal
): Promise<string | null> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent?key=${apiKey}`;

    const parts: any[] = [];

    // If we have a vision input image, include it as context
    if (visionInputBase64) {
        parts.push({
            inlineData: {
                mimeType: 'image/png',
                data: visionInputBase64
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
            temperature: 0.8 + (variantIndex * 0.1),
        }
    };

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 150000);

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
            console.error(`[DesignImage] Image generation failed for variant ${variantIndex}: ${response.status}`, errorText);
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

        console.warn(`[DesignImage] No image found in response for variant ${variantIndex}. Parts:`,
            candidate.content.parts.map((p: any) => Object.keys(p)));
        return null;
    } catch (err) {
        console.error(`[DesignImage] Error generating variant ${variantIndex}:`, err);
        return null;
    }
}
