/**
 * =============================================================================
 * LIB/AI/KEY-MANAGER.TS — API Key Carousel
 * =============================================================================
 *
 * Manages a pool of API keys per provider and rotates through them to avoid
 * hitting rate limits. If a key returns a 429, it is put on cooldown and the
 * next key in the pool is used automatically.
 *
 * HOW IT WORKS:
 * 1. Keys are loaded from env vars: AI_API_KEYS (comma-separated list)
 * 2. A global cursor tracks which key to use next (round-robin)
 * 3. Each key tracks when it last got a 429, and is skipped during cooldown
 * 4. If ALL keys are on cooldown, we wait for the one with the shortest cooldown
 *
 * CONFIGURATION (in .env.local):
 *   AI_API_KEYS=key1,key2,key3,key4
 *   AI_API_KEY_COOLDOWN_MS=61000   (default: 61s — Groq resets every minute)
 *
 * =============================================================================
 */

// =============================================================================
// KEY POOL STATE (module-level singleton — persists across requests in the same
// Node.js process, which is fine for Next.js server-side API routes)
// =============================================================================

interface KeyEntry {
    key: string;
    rateLimitedUntil: number; // Unix ms timestamp; 0 = available
    uses: number;             // Total successful uses
}

/** Global key pool, initialized once on first use */
let keyPool: KeyEntry[] | null = null;

/** Points to the next key to try (round-robin cursor) */
let cursor = 0;

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Parses the API keys from environment variables.
 *
 * Reads from:
 * - AI_API_KEYS — comma-separated list of keys (primary, supports multiple)
 * - AI_API_KEY  — single key fallback
 */
function initKeyPool(): KeyEntry[] {
    const multiKeys = process.env.AI_API_KEYS || '';
    const singleKey = process.env.AI_API_KEY || '';

    // Combine both sources, split by comma, filter empty strings
    const allKeys = [
        ...multiKeys.split(',').map(k => k.trim()).filter(Boolean),
        // Add the single key only if it's not already in the list
    ];

    if (singleKey && !allKeys.includes(singleKey)) {
        allKeys.push(singleKey);
    }

    if (allKeys.length === 0) {
        console.warn('[KeyManager] No API keys found. Set AI_API_KEYS or AI_API_KEY in .env.local');
    }

    console.log(`[KeyManager] Initialized with ${allKeys.length} key(s)`);

    return allKeys.map(key => ({
        key,
        rateLimitedUntil: 0,
        uses: 0,
    }));
}

function getKeyPool(): KeyEntry[] {
    if (!keyPool) {
        keyPool = initKeyPool();
    }
    return keyPool;
}

// =============================================================================
// KEY SELECTION
// =============================================================================

/** How long to put a key on cooldown after a 429 (default 61s) */
const COOLDOWN_MS = parseInt(process.env.AI_API_KEY_COOLDOWN_MS || '61000', 10);

/**
 * Returns the next available API key using round-robin rotation.
 * Skips keys that are currently on rate-limit cooldown.
 *
 * @throws Error if all keys are on cooldown
 */
export function getNextKey(): string {
    const pool = getKeyPool();
    if (pool.length === 0) return '';

    const now = Date.now();
    let attempts = 0;

    // Round-robin through the pool, skipping rate-limited keys
    while (attempts < pool.length) {
        const idx = cursor % pool.length;
        cursor = (cursor + 1) % pool.length;
        const entry = pool[idx];

        if (entry.rateLimitedUntil <= now) {
            entry.uses++;
            console.log(`[KeyManager] Using key #${idx + 1} (used ${entry.uses} times)`);
            return entry.key;
        }

        const waitMs = entry.rateLimitedUntil - now;
        console.log(`[KeyManager] Key #${idx + 1} on cooldown for ${Math.ceil(waitMs / 1000)}s, skipping`);
        attempts++;
    }

    // All keys are rate-limited — return the one that expires soonest
    const soonest = pool.reduce((best, entry) =>
        entry.rateLimitedUntil < best.rateLimitedUntil ? entry : best
    );
    const waitSec = Math.ceil((soonest.rateLimitedUntil - now) / 1000);
    console.warn(`[KeyManager] All ${pool.length} key(s) on cooldown. Shortest wait: ${waitSec}s. Using it anyway.`);
    return soonest.key;
}

/**
 * Marks a specific key as rate-limited.
 * Called when the API returns a 429 status.
 *
 * @param key - The key to throttle
 * @param retryAfterMs - Optional: retry-after value from the API response header (ms)
 */
export function markKeyRateLimited(key: string, retryAfterMs?: number): void {
    const pool = getKeyPool();
    const entry = pool.find(e => e.key === key);
    if (!entry) return;

    const cooldown = retryAfterMs ?? COOLDOWN_MS;
    entry.rateLimitedUntil = Date.now() + cooldown;
    console.warn(`[KeyManager] Key ending in ...${key.slice(-6)} rate-limited for ${Math.ceil(cooldown / 1000)}s`);
}

/**
 * Returns a status summary of all keys (for debugging/monitoring).
 * Keys are partially redacted for security.
 */
export function getKeyPoolStatus(): Array<{
    index: number;
    keyHint: string;
    available: boolean;
    cooldownRemainingSec: number;
    uses: number;
}> {
    const pool = getKeyPool();
    const now = Date.now();
    return pool.map((entry, idx) => ({
        index: idx + 1,
        keyHint: `...${entry.key.slice(-6)}`,
        available: entry.rateLimitedUntil <= now,
        cooldownRemainingSec: Math.max(0, Math.ceil((entry.rateLimitedUntil - now) / 1000)),
        uses: entry.uses,
    }));
}
