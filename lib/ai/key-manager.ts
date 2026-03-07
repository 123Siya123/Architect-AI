/**
 * =============================================================================
 * LIB/AI/KEY-MANAGER.TS — API Key Carousel
 * =============================================================================
 *
 * Manages pools of API keys per provider and rotates through them to avoid
 * hitting rate limits. If a key returns a 429, it is put on cooldown and the
 * next key in the pool is used automatically.
 *
 * HOW IT WORKS:
 * 1. Keys are loaded from env vars:
 *    - AI_API_KEYS (default pool for current provider)
 *    - GROQ_API_KEYS (fallback pool for Groq)
 *    - GEMINI_API_KEYS (specific pool for Gemini)
 * 2. Separate cursors track which key to use next for each provider
 * 3. Each key tracks when it last got a 429, and is skipped during cooldown
 *
 * CONFIGURATION (in .env.local):
 *   AI_API_KEYS=key1,key2
 *   GROQ_API_KEYS=gsk_1,gsk_2
 *   AI_API_KEY_COOLDOWN_MS=61000
 *
 * =============================================================================
 */

// =============================================================================
// KEY POOL STATE
// =============================================================================

interface KeyEntry {
    key: string;
    rateLimitedUntil: number; // Unix ms timestamp; 0 = available
    uses: number;             // Total successful uses
}

/** Pools keyed by provider name (or 'default') */
const keyPools: Record<string, KeyEntry[]> = {};

/** Cursors keyed by provider name (or 'default') */
const cursors: Record<string, number> = {};

// =============================================================================
// INITIALIZATION
// =============================================================================

function parseKeys(envVarName: string): string[] {
    const raw = process.env[envVarName] || '';
    return raw
        .split(',')
        .map(k => k.trim().replace(/^["']|["']$/g, '').trim())
        .filter(Boolean);
}

function initPool(provider: string, keys: string[]) {
    if (keys.length === 0) return;

    // Deduplicate
    const uniqueKeys = [...new Set(keys)];

    keyPools[provider] = uniqueKeys.map(key => ({
        key,
        rateLimitedUntil: 0,
        uses: 0,
    }));
    cursors[provider] = 0;

    console.log(`[KeyManager] Initialized pool '${provider}' with ${uniqueKeys.length} key(s)`);
}

function ensureInitialized() {
    if (Object.keys(keyPools).length > 0) return;

    // 1. Default Pool (from AI_API_KEYS / AI_API_KEY)
    const defaultKeys = parseKeys('AI_API_KEYS');
    const singleKey = process.env.AI_API_KEY;
    if (singleKey && !defaultKeys.includes(singleKey)) defaultKeys.push(singleKey);

    // Legacy support: Include GEMINI_API_KEY in default if using gemini
    const oldGeminiKeys = parseKeys('GEMINI_API_KEY');
    for (const key of oldGeminiKeys) {
        if (!defaultKeys.includes(key)) defaultKeys.push(key);
    }

    initPool('default', defaultKeys);

    // 2. Groq Pool
    const groqKeys = parseKeys('GROQ_API_KEYS');
    initPool('groq', groqKeys);

    // 3. Explicit Gemini Pool (if defined separate from default, or from GEMINI_API_KEY)
    const explicitGemini = [...parseKeys('GEMINI_API_KEYS'), ...oldGeminiKeys];
    if (explicitGemini.length > 0) {
        initPool('gemini', explicitGemini);
    }

    if (Object.keys(keyPools).length === 0) {
        console.warn('[KeyManager] No API keys found in environment variables.');
    }
}

/** Returns true if keys are configured for the requested provider (or default) */
export function hasKeys(provider: string = 'default'): boolean {
    ensureInitialized();
    // Fallback to default pool if specific provider pool missing
    const pool = keyPools[provider] || keyPools['default'];
    return pool && pool.length > 0;
}

/** Returns the number of keys configured for the requested provider */
export function getPoolSize(provider: string = 'default'): number {
    ensureInitialized();
    const targetPool = keyPools[provider] ? provider : 'default';
    const pool = keyPools[targetPool];
    return pool ? pool.length : 0;
}

// =============================================================================
// KEY SELECTION
// =============================================================================

const COOLDOWN_MS = parseInt(process.env.AI_API_KEY_COOLDOWN_MS || '61000', 10);

/**
 * Returns the next available API key for the specified provider.
 * Falls back to 'default' pool if provider-specific pool doesn't exist.
 */
export function getNextKey(provider: string = 'default'): string {
    ensureInitialized();

    // Use specific pool if exists, otherwise default
    const targetPool = keyPools[provider] ? provider : 'default';
    const pool = keyPools[targetPool];

    if (!pool || pool.length === 0) {
        // If requesting groq but no groq keys, try default pool as fallback
        if (provider !== 'default' && keyPools['default']) {
            return getNextKey('default');
        }
        return '';
    }

    const now = Date.now();
    let attempts = 0;

    while (attempts < pool.length) {
        const idx = cursors[targetPool] % pool.length;
        cursors[targetPool] = (cursors[targetPool] + 1) % pool.length;
        const entry = pool[idx];

        if (entry.rateLimitedUntil <= now) {
            entry.uses++;
            // console.log(`[KeyManager] Using ${targetPool} key #${idx + 1} (used ${entry.uses} times)`);
            return entry.key;
        }

        attempts++;
    }

    // All keys on cooldown - find soonest
    const soonest = pool.reduce((best, entry) =>
        entry.rateLimitedUntil < best.rateLimitedUntil ? entry : best
    );
    const waitSec = Math.ceil((soonest.rateLimitedUntil - now) / 1000);
    console.warn(`[KeyManager] All ${targetPool} keys on cooldown. Wait: ${waitSec}s. Using best available.`);
    return soonest.key;
}

export function markKeyRateLimited(key: string, retryAfterMs?: number): void {
    ensureInitialized();
    const cooldown = retryAfterMs ?? COOLDOWN_MS;
    const now = Date.now();

    // Find key in ANY pool
    for (const poolName of Object.keys(keyPools)) {
        const pool = keyPools[poolName];
        const entry = pool.find(e => e.key === key);
        if (entry) {
            entry.rateLimitedUntil = now + cooldown;
            console.warn(`[KeyManager] Rate-limited key in pool '${poolName}' for ${Math.ceil(cooldown / 1000)}s`);
            return;
        }
    }
}

export function rotateKey(provider: string = 'default'): void {
    ensureInitialized();
    const targetPool = keyPools[provider] ? provider : 'default';
    const pool = keyPools[targetPool];

    if (pool && pool.length > 1) {
        cursors[targetPool] = (cursors[targetPool] + 1) % pool.length;
        console.log(`[KeyManager] Rotated ${targetPool} key cursor`);
    }
}

// =============================================================================
// PROVIDER CONFIG
// =============================================================================

export interface AIProviderConfig {
    provider: 'gemini' | 'groq' | 'openai' | 'github';
    model: string;
    apiKey: string;
}

export function getProviderConfig(forceProvider?: string): AIProviderConfig {
    const defaultProvider = (process.env.AI_PROVIDER || process.env.NEXT_PUBLIC_AI_PROVIDER || 'gemini');
    const provider = (forceProvider || defaultProvider) as AIProviderConfig['provider'];

    const defaultModels: Record<string, string> = {
        gemini: 'gemini-3-flash-preview',
        groq: 'llama-3.3-70b-versatile', // Best Groq model
        openai: 'gpt-4o',
        github: 'gpt-4o',
    };

    // If forcing provider, use default model for that provider unless env var matches
    let model = process.env.AI_MODEL || defaultModels[provider];

    // If we switched providers, the env var model might be wrong (e.g. gemini model for groq)
    if (provider === 'groq' && model.includes('gemini')) model = defaultModels.groq;
    if (provider === 'gemini' && !model.includes('gemini')) model = defaultModels.gemini;

    const apiKey = getNextKey(provider);

    return { provider, model, apiKey };
}

/**
 * Returns a summary of the current key pools status.
 * Keys are redacted for security.
 */
export function getKeyPoolStatus() {
    ensureInitialized();
    const status = [];

    for (const [provider, pool] of Object.entries(keyPools)) {
        for (let i = 0; i < pool.length; i++) {
            const entry = pool[i];
            status.push({
                provider,
                index: i,
                key: entry.key.slice(0, 8) + '...',
                uses: entry.uses,
                rateLimitedUntil: entry.rateLimitedUntil,
                isActive: i === cursors[provider]
            });
        }
    }
    return status;
}
