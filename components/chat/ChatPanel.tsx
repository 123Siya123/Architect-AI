/**
 * =============================================================================
 * COMPONENTS/CHAT/CHAT-PANEL.TSX — AI Chat Interface (Multi-Agent)
 * =============================================================================
 *
 * UPGRADE v3 — Shows multi-agent pipeline status
 *
 * The chat panel where users interact with the AI architect.
 * Now shows which phase of the multi-agent pipeline is running:
 * - 🧠 Coordinator analyzing...
 * - ⚡ Workers executing...
 * - 🔍 Checker reviewing...
 * - 🔧 Fixer correcting...
 * =============================================================================
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDesignStore } from '@/store/useDesignStore';
import type { ChatMessage } from '@/types';
import { prepareProjectContext, generateASCIIFloorPlan } from '@/lib/ai/context';

// =============================================================================
// SUGGESTION CHIPS
// =============================================================================

const SUGGESTIONS = [
    'Add a first floor',
    'Make the living room 2m wider',
    'Add a window to the north wall',
    'Change the roof to a flat roof',
    'Add a balcony to the master bedroom',
    'Replace all brick with stone',
];

// =============================================================================
// MESSAGE BUBBLE
// =============================================================================

function MessageBubble({ msg, onRevert, showRevert }: { msg: ChatMessage, onRevert?: (id: string) => void, showRevert?: boolean }) {
    const isUser = msg.role === 'user';

    return (
        <div className={`chat-message ${isUser ? 'chat-message-user' : 'chat-message-ai'}`}>
            <div className="chat-message-header">
                <span className="chat-message-role">
                    {isUser ? '👤 You' : '🏗️ Architect AI'}
                </span>
                <span className="chat-message-time">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                    })}
                </span>
            </div>
            <p className="chat-message-content" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
            {/* Operation badges — show when AI made edits */}
            {msg.operations && msg.operations.length > 0 && (
                <div className="chat-operations">
                    <span className="chat-op-count">
                        {msg.operations.length} change{msg.operations.length !== 1 ? 's' : ''} applied
                    </span>
                    {msg.operations.map((op, i) => (
                        <span key={i} className="chat-op-badge">
                            {op.type.replace(/_/g, ' ')}
                        </span>
                    ))}
                </div>
            )}
            {isUser && showRevert && onRevert && (
                <button
                    onClick={() => onRevert(msg.id)}
                    title="Revert the house back to how it was when you sent this message"
                    style={{ fontSize: '0.75em', padding: '4px 8px', marginTop: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', width: 'fit-content' }}
                >
                    ↩️ Go back
                </button>
            )}
        </div>
    );
}

// =============================================================================
// PIPELINE STATUS INDICATOR
// =============================================================================

function PipelineStatus() {
    const phases = [
        { emoji: '🧠', label: 'Coordinator analyzing' },
        { emoji: '⚡', label: 'Workers executing' },
        { emoji: '🔍', label: 'Checker reviewing' },
        { emoji: '🔧', label: 'Fixer correcting' },
    ];

    const [currentPhase, setCurrentPhase] = useState(0);

    useEffect(() => {
        // Cycle through phases to show activity
        const interval = setInterval(() => {
            setCurrentPhase((prev) => Math.min(prev + 1, phases.length - 1));
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="chat-message chat-message-ai">
            <div className="chat-pipeline-status">
                {phases.map((phase, i) => (
                    <div
                        key={i}
                        className={`pipeline-phase ${i < currentPhase ? 'pipeline-phase-done' :
                            i === currentPhase ? 'pipeline-phase-active' :
                                'pipeline-phase-pending'
                            }`}
                    >
                        <span className="pipeline-emoji">{phase.emoji}</span>
                        <span className="pipeline-label">{phase.label}</span>
                        {i === currentPhase && (
                            <span className="pipeline-dots">
                                <span className="chat-thinking-dot" />
                                <span className="chat-thinking-dot" />
                                <span className="chat-thinking-dot" />
                            </span>
                        )}
                        {i < currentPhase && <span className="pipeline-check">✓</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}

// =============================================================================
// MAIN CHAT PANEL
// =============================================================================

export default function ChatPanel() {
    const [input, setInput] = useState('');
    const chatMessages = useDesignStore((s) => s.chatMessages);
    const addChatMessage = useDesignStore((s) => s.addChatMessage);
    const isAIThinking = useDesignStore((s) => s.isAIThinking);
    const setAIThinking = useDesignStore((s) => s.setAIThinking);
    const project = useDesignStore((s) => s.project);
    const applyOp = useDesignStore((s) => s.applyOp);
    const revertToMessage = useDesignStore((s) => s.revertToMessage);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages.length, isAIThinking]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || isAIThinking) return;

        // Deep clone current project state as a snapshot before AI makes changes
        const projectSnapshot = JSON.parse(JSON.stringify(project));

        // Add user message
        const userMsg: ChatMessage = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: text.trim(),
            timestamp: new Date().toISOString(),
            snapshot: projectSnapshot,
        };
        addChatMessage(userMsg);
        setInput('');
        setAIThinking(true);

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text.trim(),
                    project,
                    history: chatMessages,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `API error ${response.status}`);
            }

            const data = await response.json();

            // ✅ Apply AI operations to the 3D scene one-by-one so a single
            // bad op (e.g. hallucinated node ID) doesn't crash the whole batch.
            const allOps: typeof data.operations = data.operations || [];
            let successCount = 0;
            let failCount = 0;

            for (const op of allOps) {
                try {
                    const result = applyOp(op);
                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                        console.warn('[ChatPanel] Op failed validation:', op.type, op.target_id, result.errors);
                    }
                } catch (opErr) {
                    failCount++;
                    console.warn('[ChatPanel] Op threw at runtime:', op.type, op.target_id, opErr);
                }
            }

            if (allOps.length > 0) {
                console.log(`[ChatPanel] Applied ${successCount}/${allOps.length} operations (${failCount} failed)`);
            }

            const aiMsg: ChatMessage = {
                id: `msg_${Date.now()}_ai`,
                role: 'assistant',
                content: data.message || 'I processed your request.',
                timestamp: new Date().toISOString(),
                operations: allOps,
            };
            addChatMessage(aiMsg);
        } catch (err: any) {
            const errMsg: ChatMessage = {
                id: `msg_${Date.now()}_err`,
                role: 'assistant',
                content: `Sorry, I encountered an error: ${err.message || 'The AI backend may not be connected yet.'}`,
                timestamp: new Date().toISOString(),
            };
            addChatMessage(errMsg);
        } finally {
            setAIThinking(false);
        }
    }, [input, isAIThinking, project, chatMessages, addChatMessage, setAIThinking, applyOp]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        sendMessage(input);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    const handleDownloadSpecs = () => {
        const fullSpecs = prepareProjectContext(project);
        const asciiPlan = generateASCIIFloorPlan(project);

        const content = `// ASCII FLOOR PLAN\n${asciiPlan}\n\n// EXACT JSON SPECS SENT TO AI\n${fullSpecs}`;
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `debug_ai_specs_${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="chat-panel">
            {/* Chat Header */}
            <div className="chat-header">
                <div>
                    <h3>🏗️ AI Architect <span style={{ fontSize: '0.65em', opacity: 0.6 }}>multi-agent</span></h3>
                    <button
                        onClick={handleDownloadSpecs}
                        style={{ fontSize: '0.7em', marginTop: '4px', background: 'var(--accent)', color: 'white', padding: '2px 6px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                    >
                        ↓ Download Debug Specs
                    </button>
                </div>
                <span className="chat-status">
                    {isAIThinking ? '⏳ Processing...' : '🟢 Ready'}
                </span>
            </div>

            {/* Messages Area */}
            <div className="chat-messages">
                {chatMessages.length === 0 && (
                    <div className="chat-welcome">
                        <p className="chat-welcome-title">Hello! 👋</p>
                        <p className="chat-welcome-text">
                            I&apos;m your AI architect team. Describe what you&apos;d like to change
                            about the house, and my multi-agent team will analyze, execute,
                            and verify the modifications.
                        </p>
                        <div className="chat-suggestions">
                            {SUGGESTIONS.map((s) => (
                                <button
                                    key={s}
                                    className="chat-suggestion-btn"
                                    onClick={() => sendMessage(s)}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {chatMessages.map((msg, index) => (
                    <MessageBubble
                        key={msg.id}
                        msg={msg}
                        onRevert={revertToMessage}
                        showRevert={!!msg.snapshot && index < chatMessages.length - 1}
                    />
                ))}

                {isAIThinking && <PipelineStatus />}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <form className="chat-input-form" onSubmit={handleSubmit}>
                <textarea
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe what you'd like to change..."
                    rows={2}
                    disabled={isAIThinking}
                />
                <button
                    type="submit"
                    className="chat-send-btn"
                    disabled={!input.trim() || isAIThinking}
                >
                    Send →
                </button>
            </form>
        </div>
    );
}
