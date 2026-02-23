/**
 * GET /api/ai/status
 * Debug endpoint — shows the key pool status (keys are partially redacted).
 * Useful for diagnosing carousel configuration issues.
 */
import { NextResponse } from 'next/server';
import { getKeyPoolStatus } from '@/lib/ai/key-manager';

export async function GET() {
    const pool = getKeyPoolStatus();

    return NextResponse.json({
        provider: process.env.NEXT_PUBLIC_AI_PROVIDER || '(not set)',
        model: process.env.AI_MODEL || '(not set)',
        totalKeys: pool.length,
        keys: pool,
        // Show raw env for debugging (only lengths, never the actual values)
        envDebug: {
            AI_API_KEYS_length: (process.env.AI_API_KEYS || '').length,
            AI_API_KEY_set: !!(process.env.AI_API_KEY),
        },
    });
}
