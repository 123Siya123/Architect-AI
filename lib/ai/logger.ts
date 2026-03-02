import fs from 'fs';
import path from 'path';

/**
 * =============================================================================
 * LIB/AI/LOGGER.TS — Agent Step Persistence
 * =============================================================================
 *
 * Records every decision, response, and tool call the AI agents make.
 * These are stored in storage/agent_logs.json so users can audit the process.
 * =============================================================================
 */

export interface AgentStep {
    timestamp: string;
    phase: string;
    iteration?: number;
    model: string;
    prompt?: string;
    response?: string;
    reasoning?: string;
    toolCalls?: any[];
    results?: any[];
    error?: string;
    status: 'pending' | 'success' | 'failed';
}

const LOG_FILE = path.join(process.cwd(), 'storage', 'agent_logs.json');
const AUDIT_FILE = path.join(process.cwd(), 'storage', 'AGENT_AUDIT.md');

/** Ensures logging directory exists */
function ensureDir() {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

/** Generates a human-friendly Markdown audit */
function updateMarkdownAudit(logs: AgentStep[]) {
    let md = `# 🏗️ Agentic Architectural Audit\n\nGenerated on: ${new Date().toLocaleString()}\n\n`;
    md += `This log contains every response and tool call made by the AI agents.\n\n---\n\n`;

    logs.forEach((step, idx) => {
        md += `## Step ${idx + 1}: ${step.phase}\n`;
        md += `- **Timestamp**: ${step.timestamp}\n`;
        md += `- **Model**: \`${step.model}\`\n`;
        md += `- **Status**: ${step.status === 'success' ? '✅ SUCCESS' : step.status === 'failed' ? '❌ FAILED' : '⏳ PENDING'}\n\n`;

        if (step.reasoning) {
            md += `### 💭 Reasoning\n>${step.reasoning}\n\n`;
        } else if (step.response) {
            md += `### 💭 Response\n${step.response}\n\n`;
        }

        if (step.toolCalls && step.toolCalls.length > 0) {
            md += `### 🛠️ Tool Calls\n\`\`\`json\n${JSON.stringify(step.toolCalls, null, 2)}\n\`\`\`\n\n`;
        }

        if (step.error) {
            md += `### ⚠️ Error\n> ${step.error}\n\n`;
        }

        md += `---\n\n`;
    });

    try {
        fs.writeFileSync(AUDIT_FILE, md);
    } catch (e) {
        console.error('[Logger] Failed to write audit markdown:', e);
    }
}

/** Reads existing logs */
export function readLogs(): AgentStep[] {
    try {
        if (!fs.existsSync(LOG_FILE)) return [];
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.error('[Logger] Failed to read logs:', e);
        return [];
    }
}

/** Appends a step to the persistent history */
export function logAgentStep(step: Omit<AgentStep, 'timestamp'>) {
    ensureDir();
    const logs = readLogs();
    const fullStep: AgentStep = {
        timestamp: new Date().toISOString(),
        ...step
    };

    // Limits the log to the last 1000 steps to prevent massive files
    const updated = [...logs, fullStep].slice(-1000);

    try {
        fs.writeFileSync(LOG_FILE, JSON.stringify(updated, null, 2));
        updateMarkdownAudit(updated);
    } catch (e) {
        console.error('[Logger] Failed to write logs:', e);
    }
}

/** Resets logs for a new turn */
export function clearLogs() {
    ensureDir();
    fs.writeFileSync(LOG_FILE, JSON.stringify([], null, 2));
}
