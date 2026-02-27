import { NextRequest, NextResponse } from 'next/server';
import { processImageTo3D } from '@/lib/ai/vision';
import type { ImageTo3DRequest } from '@/types';

export async function POST(request: NextRequest) {
    try {
        const body: ImageTo3DRequest = await request.json();
        const { image_data, reference_measurement, project } = body;

        if (!image_data) {
            return NextResponse.json(
                { message: 'Please provide an image.', operations: [] },
                { status: 400 }
            );
        }

        if (!reference_measurement?.trim()) {
            return NextResponse.json(
                { message: 'Please provide a reference measurement to scale the 3D model properly.', operations: [] },
                { status: 400 }
            );
        }

        // Send to vision AI
        const aiResponse = await processImageTo3D(body);

        return NextResponse.json({
            message: aiResponse.message,
            operations: aiResponse.operations,
            warnings: aiResponse.warnings || [],
        });
    } catch (error) {
        console.error('[API /ai/image-to-3d] Error:', error);
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
