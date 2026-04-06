import type { PSGOperation, PSGProject, Material, OperationType } from '@/types';
import { AI_TOOLS } from './tools';
import { getProviderConfig, rotateKey, markKeyRateLimited, getPoolSize, getNextKey, type AIProviderConfig } from './key-manager';
import { validateOperation } from '@/lib/psg/validator';
import { applyOperation } from '@/lib/psg/operations';

// =============================================================================
// TYPES
// =============================================================================

export interface ToolCall {
    name: string;
    args: Record<string, unknown>;
}

export interface LLMCallResult {
    text: string;
    toolCalls?: ToolCall[];
}

// =============================================================================
// LLM PROVIDER CALLS
// =============================================================================

/**
 * Calls the LLM WITHOUT tools (for Orchestrator, Physicist, Aesthetic agents).
 * Automatically detects rate limits, timeouts, marks the key for cooldown, rotates, and retries.
 */
export async function callProviderNoTools(
    initialConfig: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    attachments?: { name: string; type: string; data: string }[],
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const MAX_TOTAL_ATTEMPTS = 7;
    let config = initialConfig;
    let timeoutMultiplier = 1; // Escalate timeout on retry
    let keysTriedForCurrentModel = 1;
    let maxKeysForProvider = getPoolSize(config.provider);

    for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
        if (signal?.aborted) throw new Error('User cancelled');
        try {
            // Pass timeout multiplier context via a patched config
            const callConfig = { ...config, _timeoutMultiplier: timeoutMultiplier } as any;
            switch (config.provider) {
                case 'gemini': return await callGeminiNoTools(callConfig, messages, attachments, signal);
                case 'groq': return await callGroqNoTools(config, messages, signal);
                case 'openai': return await callOpenAINoTools(config, messages, signal);
                case 'github': return await callGithubNoTools(config, messages, signal);
                default: throw new Error(`Unknown provider: ${config.provider}`);
            }
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);

            // User cancellation — propagate immediately, no retry
            if (errMsg.includes('User cancelled') || signal?.aborted) {
                throw new Error('User cancelled');
            }

            console.warn(`[callProviderNoTools] Attempt ${attempt}/${MAX_TOTAL_ATTEMPTS} failed:`, errMsg);

            const isTimeout = errMsg.includes('timed out') || errMsg.includes('Timeout');
            const isUnavailable = errMsg.includes('503') || errMsg.includes('404') || errMsg.includes('500');
            const isRateLimit = errMsg.includes('429');

            if (isTimeout) {
                // On timeout, increase timeout for next attempt instead of rotating
                timeoutMultiplier = Math.min(timeoutMultiplier + 0.5, 3);
                console.warn(`[callProviderNoTools] Timeout detected. Increasing timeout multiplier to ${timeoutMultiplier}x`);
            } else if ((isUnavailable || isRateLimit) && config.provider === 'gemini') {
                if (isRateLimit) markKeyRateLimited(config.apiKey);

                if (keysTriedForCurrentModel < maxKeysForProvider) {
                    rotateKey(config.provider);
                    config = { ...config, apiKey: getNextKey(config.provider) };
                    keysTriedForCurrentModel++;
                    console.warn(`[Orchestrator] Switching to next key for same model ${config.model}...`);
                } else {
                    keysTriedForCurrentModel = 1;
                    if (config.model.includes('gemini-3.1-pro')) {
                        console.warn('[Orchestrator] Gemini 3.1 Pro unavailable on all keys. Falling back to Gemini 3 Pro...');
                        config = { ...config, model: 'gemini-3-pro-preview' };
                        rotateKey(config.provider);
                        config.apiKey = getNextKey(config.provider);
                    } else if (config.model === 'gemini-3-pro-preview') {
                        console.warn('[Orchestrator] Gemini 3 Pro unavailable on all keys. Switching to Groq...');
                        config = getProviderConfig('groq');
                        maxKeysForProvider = getPoolSize(config.provider);
                    } else if (config.model === 'gemini-3-flash-preview') {
                        console.warn('[Orchestrator] Gemini 3 Flash unavailable on all keys. Switching to Groq...');
                        config = getProviderConfig('groq');
                        maxKeysForProvider = getPoolSize(config.provider);
                    } else {
                        rotateKey();
                        config = getProviderConfig();
                        maxKeysForProvider = getPoolSize(config.provider);
                    }
                }
            } else {
                if (errMsg.includes('429')) markKeyRateLimited(config.apiKey);
                rotateKey();
                config = getProviderConfig();
                maxKeysForProvider = getPoolSize(config.provider);
                keysTriedForCurrentModel = 1;
            }

            if (attempt === MAX_TOTAL_ATTEMPTS) throw error;
            // Escalating backoff: 500ms, 1s, 2s, 3s, ...
            const backoff = Math.min(500 * attempt, 5000);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw new Error('Retries exhausted');
}

/**
 * Calls the LLM WITH tools (for Structural Engineer).
 * Automatically detects rate limits, timeouts, marks the key for cooldown, rotates, and retries.
 */
export async function callProviderWithTools(
    initialConfig: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    attachments?: { name: string; type: string; data: string }[],
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const MAX_TOTAL_ATTEMPTS = 7;
    let config = initialConfig;
    let timeoutMultiplier = 1;
    let keysTriedForCurrentModel = 1;
    let maxKeysForProvider = getPoolSize(config.provider);

    for (let attempt = 1; attempt <= MAX_TOTAL_ATTEMPTS; attempt++) {
        if (signal?.aborted) throw new Error('User cancelled');
        try {
            const callConfig = { ...config, _timeoutMultiplier: timeoutMultiplier } as any;
            let result: LLMCallResult;
            switch (config.provider) {
                case 'gemini': result = await callGemini(callConfig, messages, attachments, signal); break;
                case 'groq': result = await callGroq(config, messages, signal); break;
                case 'openai': result = await callOpenAI(config, messages, signal); break;
                case 'github': result = await callGithub(config, messages, signal); break;
                default: throw new Error(`Unknown provider: ${config.provider}`);
            }

            // Fallback: If native tool call detection found nothing, check for toolsCalled JSON in text
            if ((!result.toolCalls || result.toolCalls.length === 0) && result.text) {
                const parsed = extractJSON<{ toolsCalled?: Array<{ tool: string; args: Record<string, unknown> }> }>(result.text);
                if (parsed?.toolsCalled?.length) {
                    result.toolCalls = [];
                    for (const tc of parsed.toolsCalled) {
                        // Strip "default_api:" prefix if present
                        const name = tc.tool.includes(':') ? tc.tool.split(':').pop()! : tc.tool;
                        result.toolCalls.push({ name, args: tc.args || {} });
                    }
                }
            }

            return result;
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);

            // User cancellation — propagate immediately
            if (errMsg.includes('User cancelled') || signal?.aborted) {
                throw new Error('User cancelled');
            }

            console.warn(`[callProviderWithTools] Attempt ${attempt}/${MAX_TOTAL_ATTEMPTS} failed:`, errMsg);

            const isTimeout = errMsg.includes('timed out') || errMsg.includes('Timeout');
            const isUnavailable = errMsg.includes('503') || errMsg.includes('404') || errMsg.includes('500');
            const isRateLimit = errMsg.includes('429');

            if (isTimeout) {
                timeoutMultiplier = Math.min(timeoutMultiplier + 0.5, 3);
                console.warn(`[callProviderWithTools] Timeout detected. Increasing timeout multiplier to ${timeoutMultiplier}x`);
            } else if ((isUnavailable || isRateLimit) && config.provider === 'gemini') {
                if (isRateLimit) markKeyRateLimited(config.apiKey);

                if (keysTriedForCurrentModel < maxKeysForProvider) {
                    rotateKey(config.provider);
                    config = { ...config, apiKey: getNextKey(config.provider) };
                    keysTriedForCurrentModel++;
                    console.warn(`[Orchestrator] Switching to next key for same model ${config.model}...`);
                } else {
                    keysTriedForCurrentModel = 1;
                    if (config.model.includes('gemini-3.1-pro')) {
                        console.warn('[Orchestrator] Gemini 3.1 Pro unavailable on all keys. Falling back to Gemini 3 Pro...');
                        config = { ...config, model: 'gemini-3-pro-preview' };
                        rotateKey(config.provider);
                        config.apiKey = getNextKey(config.provider);
                    } else if (config.model === 'gemini-3-pro-preview') {
                        console.warn('[Orchestrator] Gemini 3 Pro unavailable on all keys. Switching to Groq...');
                        config = getProviderConfig('groq');
                        maxKeysForProvider = getPoolSize(config.provider);
                    } else if (config.model === 'gemini-3-flash-preview') {
                        console.warn('[Orchestrator] Gemini 3 Flash unavailable on all keys. Switching to Groq...');
                        config = getProviderConfig('groq');
                        maxKeysForProvider = getPoolSize(config.provider);
                    } else {
                        rotateKey();
                        config = getProviderConfig();
                        maxKeysForProvider = getPoolSize(config.provider);
                    }
                }
            } else {
                if (errMsg.includes('429')) markKeyRateLimited(config.apiKey);
                rotateKey();
                config = getProviderConfig();
                maxKeysForProvider = getPoolSize(config.provider);
                keysTriedForCurrentModel = 1;
            }

            if (attempt === MAX_TOTAL_ATTEMPTS) throw error;
            const backoff = Math.min(500 * attempt, 5000);
            await new Promise(r => setTimeout(r, backoff));
        }
    }
    throw new Error('Retries exhausted');
}

// =============================================================================
// GEMINI
// =============================================================================

async function callGemini(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    attachments?: { name: string; type: string; data: string }[],
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
            const parts: any[] = [{ text: m.content }];

            // Attach files to the last user message
            if (m === lastUserMessage && attachments && attachments.length > 0) {
                for (const att of attachments) {
                    parts.push({
                        inlineData: {
                            mimeType: att.type,
                            data: att.data
                        }
                    });
                }
            }

            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts,
            };
        });

    const systemMsg = messages.find((m) => m.role === 'system');

    const JSON_SCHEMA_TYPES = new Set(['string', 'number', 'object', 'array', 'boolean', 'integer']);
    const formatForGemini = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(formatForGemini);
        if (obj !== null && typeof obj === 'object') {
            const result: any = {};
            for (const key in obj) {
                if (key === 'type' && typeof obj[key] === 'string' && JSON_SCHEMA_TYPES.has(obj[key])) {
                    result[key] = obj[key].toUpperCase();
                } else {
                    result[key] = formatForGemini(obj[key]);
                }
            }
            return result;
        }
        return obj;
    };

    const geminiTools = [
        {
            function_declarations: AI_TOOLS.map((t) => ({
                name: t.function.name,
                description: t.function.description,
                parameters: formatForGemini(t.function.parameters),
            })),
        },
    ];

    const isGemini3 = config.model.includes('gemini-3');

    const body = {
        contents,
        tools: geminiTools,
        tool_config: { function_calling_config: { mode: 'AUTO' } },
        ...(systemMsg && {
            system_instruction: { parts: [{ text: systemMsg.content }] },
        }),
        generation_config: {
            temperature: 0.1,
            max_output_tokens: isGemini3 ? 64000 : 8192,
            ...(isGemini3 && {
                thinkingConfig: {
                    thinkingLevel: 'HIGH'
                }
            })
        },
    };

    const baseTimeout = isGemini3 ? 180000 : 90000;
    const timeoutMultiplier = (config as any)._timeoutMultiplier || 1;
    const timeoutMs = Math.round(baseTimeout * timeoutMultiplier);

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }, timeoutMs, signal);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates');

    let text = '';
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content?.parts || []) {
        if (part.text) text += part.text;
        if (part.functionCall) {
            toolCalls.push({
                name: part.functionCall.name,
                args: part.functionCall.args || {},
            });
        }
    }

    return { text, toolCalls };
}

async function callGeminiNoTools(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    attachments?: { name: string; type: string; data: string }[],
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`;

    const userMessages = messages.filter((m) => m.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];

    const contents = messages
        .filter((m) => m.role !== 'system')
        .map((m) => {
            const parts: any[] = [{ text: m.content }];

            if (m === lastUserMessage && attachments && attachments.length > 0) {
                for (const att of attachments) {
                    parts.push({
                        inlineData: {
                            mimeType: att.type,
                            data: att.data
                        }
                    });
                }
            }

            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts,
            };
        });

    const systemMsg = messages.find((m) => m.role === 'system');

    const isGemini3 = config.model.includes('gemini-3');

    const body = {
        contents,
        ...(systemMsg && {
            system_instruction: { parts: [{ text: systemMsg.content }] },
        }),
        generation_config: {
            temperature: 0.3,
            max_output_tokens: isGemini3 ? 64000 : 8192,
            ...(isGemini3 && {
                thinkingConfig: {
                    thinkingLevel: 'HIGH'
                }
            })
        },
    };

    const baseTimeout = isGemini3 ? 180000 : 60000;
    const timeoutMultiplier = (config as any)._timeoutMultiplier || 1;
    const timeoutMs = Math.round(baseTimeout * timeoutMultiplier);

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }, timeoutMs, signal);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    if (!candidate) throw new Error('Gemini returned no candidates');

    let text = '';
    for (const part of candidate.content?.parts || []) {
        if (part.text) text += part.text;
    }

    return { text };
}

// =============================================================================
// GROQ
// =============================================================================

async function callGroq(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 1024,
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 45000, signal);

    if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 400) {
            try {
                const errorData = JSON.parse(errorText);
                if (errorData.error?.code === 'tool_use_failed' && errorData.error?.failed_generation) {
                    const failedGen = errorData.error.failed_generation;
                    const parsed = parseFailedGeneration(failedGen);
                    if (parsed.length > 0) {
                        const textContent = extractTextFromFailedGeneration(failedGen);
                        return { text: textContent, toolCalls: parsed };
                    }
                }
            } catch (parseErr) { /* ignore */ }
        }
        throw new Error(`Groq API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Groq returned no message');

    const toolCalls: ToolCall[] = (msg.tool_calls || []).map(
        (tc: { function: { name: string; arguments: string } }) => ({
            name: tc.function.name,
            args: safeParse(tc.function.arguments),
        })
    );

    return { text: msg.content || '', toolCalls };
}

async function callGroqNoTools(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 1024,
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 45000);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('Groq returned no message');

    return { text: msg.content || '' };
}

// =============================================================================
// OPENAI
// =============================================================================

async function callOpenAI(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 4000,
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 60000, signal);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('OpenAI returned no message');

    const toolCalls: ToolCall[] = (msg.tool_calls || []).map(
        (tc: { function: { name: string; arguments: string } }) => ({
            name: tc.function.name,
            args: safeParse(tc.function.arguments),
        })
    );

    return { text: msg.content || '', toolCalls };
}

async function callOpenAINoTools(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 4000,
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 60000, signal);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('OpenAI returned no message');

    return { text: msg.content || '' };
}

// =============================================================================
// GITHUB MODELS
// =============================================================================

async function callGithub(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = 'https://models.inference.ai.azure.com/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: AI_TOOLS,
        tool_choice: 'auto',
        temperature: 0.2,
        max_tokens: 4000,
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 60000, signal);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub Models API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('GitHub Models returned no message');

    const toolCalls: ToolCall[] = (msg.tool_calls || []).map(
        (tc: { function: { name: string; arguments: string } }) => ({
            name: tc.function.name,
            args: safeParse(tc.function.arguments),
        })
    );

    return { text: msg.content || '', toolCalls };
}

async function callGithubNoTools(
    config: AIProviderConfig,
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal
): Promise<LLMCallResult> {
    const url = 'https://models.inference.ai.azure.com/chat/completions';

    const body = {
        model: config.model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.3,
        max_tokens: 4000,
    };

    const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
    }, 60000, signal);

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`GitHub Models API error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const msg = data.choices?.[0]?.message;
    if (!msg) throw new Error('GitHub Models returned no message');

    return { text: msg.content || '' };
}

// =============================================================================
// GROQ FAILED GENERATION PARSER
// =============================================================================

function parseFailedGeneration(failedGen: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];
    const regex = /<function=(\w+)((?:\{[\s\S]*?\}))<\/function>/g;
    let match;

    while ((match = regex.exec(failedGen)) !== null) {
        const name = match[1];
        const jsonStr = match[2];
        try {
            const args = JSON.parse(jsonStr);
            toolCalls.push({ name, args });
        } catch { /* skip */ }
    }

    if (toolCalls.length === 0) {
        const simpleRegex = /<function=(\w+)\s*(\{[\s\S]*?\})\s*<\/function>/g;
        while ((match = simpleRegex.exec(failedGen)) !== null) {
            const name = match[1];
            const jsonStr = match[2];
            try {
                const args = JSON.parse(jsonStr);
                toolCalls.push({ name, args });
            } catch { /* skip */ }
        }
    }

    return toolCalls;
}

function extractTextFromFailedGeneration(failedGen: string): string {
    return failedGen
        .replace(/<function=\w+\{[\s\S]*?\}<\/function>/g, '')
        .replace(/<function=\w+\{[\s\S]*?\}>/g, '')
        .replace(/###\s*/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// =============================================================================
// UTILITIES
// =============================================================================

export function normalizeMessages(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
    const normalized: Array<{ role: string; content: string }> = [];

    const systemMessages = messages.filter(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    if (conversationMessages.length === 0) return systemMessages;

    for (const msg of conversationMessages) {
        const last = normalized[normalized.length - 1];
        if (last && last.role === msg.role) {
            last.content += `\n\n${msg.content}`;
        } else {
            normalized.push({ ...msg });
        }
    }

    if (systemMessages.length > 1) {
        const combinedSystem = {
            role: 'system',
            content: systemMessages.map(m => m.content).join('\n\n')
        };
        return [combinedSystem, ...normalized];
    }

    return [...systemMessages, ...normalized];
}

function safeParse(json: string): Record<string, unknown> {
    try {
        return JSON.parse(json);
    } catch {
        return {};
    }
}

export function extractJSON<T>(text: string): T | null {
    try {
        return JSON.parse(text.trim());
    } catch { /* continue */ }

    const planMatch = text.match(/\[PLAN\]([\s\S]*?)\[\/PLAN\]/i);
    if (planMatch) {
        try {
            return JSON.parse(planMatch[1].trim());
        } catch { /* continue */ }
    }

    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
        try {
            return JSON.parse(fenceMatch[1].trim());
        } catch { /* continue */ }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch { /* continue */ }
    }

    return null;
}

export async function reloadProjectState(projectId: string, project: PSGProject): Promise<PSGProject> {
    return JSON.parse(JSON.stringify(project)) as PSGProject;
}

export function toolCallToOperation(name: string, args: Record<string, unknown>): PSGOperation {
    const timestamp = new Date().toISOString();

    switch (name) {
        case 'add_node':
            return {
                type: 'add_node',
                target_id: (args.parent_id as string) || 'unknown',
                params: { ...args },
                timestamp,
            };

        case 'move_node':
            return {
                type: 'move_node',
                target_id: (args.target_id as string) || 'unknown',
                params: {
                    delta_x: args.delta_x ?? 0,
                    delta_y: args.delta_y ?? 0,
                    delta_z: args.delta_z ?? 0,
                },
                timestamp,
            };

        case 'set_node_position':
            return {
                type: 'set_node_position',
                target_id: (args.target_id as string) || 'unknown',
                params: {
                    ...(args.position_x !== undefined && { position_x: args.position_x }),
                    ...(args.position_y !== undefined && { position_y: args.position_y }),
                    ...(args.position_z !== undefined && { position_z: args.position_z }),
                },
                timestamp,
            };

        case 'resize_node':
            return {
                type: 'resize_node',
                target_id: (args.target_id as string) || 'unknown',
                params: {
                    ...(args.width !== undefined && { width: args.width }),
                    ...(args.height !== undefined && { height: args.height }),
                    ...(args.depth !== undefined && { depth: args.depth }),
                },
                timestamp,
            };

        case 'rotate_node':
            return {
                type: 'rotate_node',
                target_id: (args.target_id as string) || 'unknown',
                params: {
                    ...(args.yaw !== undefined && { yaw: args.yaw }),
                    ...(args.pitch !== undefined && { pitch: args.pitch }),
                    ...(args.roll !== undefined && { roll: args.roll }),
                },
                timestamp,
            };

        case 'replace_material':
            return {
                type: 'replace_material',
                target_id: (args.target_id as string) || 'unknown',
                params: { material_id: args.material_id },
                timestamp,
            };

        case 'replace_node':
            return {
                type: 'replace_node',
                target_id: (args.target_id as string) || 'unknown',
                params: { ...args },
                timestamp,
            };

        case 'delete_node':
            return {
                type: 'delete_node',
                target_id: (args.target_id as string) || 'unknown',
                params: {},
                timestamp,
            };

        case 'create_custom_element':
            return {
                type: 'create_custom_element' as OperationType,
                target_id: (args.parent_id as string) || 'unknown',
                params: { ...args },
                timestamp,
            };

        case 'solve_precision':
            return {
                type: 'solve_precision' as OperationType,
                target_id: 'project',
                params: { ...args },
                timestamp,
            };

        case 'set_precision_level':
            return {
                type: 'set_precision_level' as OperationType,
                target_id: 'project',
                params: { ...args },
                timestamp,
            };

        case 'edit_wall_surface':
            return {
                type: 'edit_wall_surface',
                target_id: (args.target_id as string) || 'unknown',
                params: { ...args },
                timestamp,
            };
        default:
            throw new Error(`Unknown tool name: ${name}`);
    }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 60000, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => {
        controller.abort(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const onExternalAbort = () => controller.abort(new Error('User cancelled'));
    if (signal) {
        if (signal.aborted) {
            clearTimeout(id);
            throw new Error('User cancelled');
        }
        signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        return response;
    } catch (error) {
        clearTimeout(id);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
        if (error instanceof Error) {
            if (error.message?.includes('User cancelled') || signal?.aborted) {
                throw new Error('User cancelled');
            }
            if (error.message?.includes('Timeout') || error.name === 'AbortError') {
                throw new Error(`Request timed out after ${timeoutMs}ms`);
            }
        }
        throw error;
    }
}
