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
import * as THREE from 'three';
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
    const [showPipeline, setShowPipeline] = useState(false);

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

            {/* Pipeline Log Toggle */}
            {!isUser && msg.pipeline_log && msg.pipeline_log.length > 0 && (
                <div className="chat-pipeline-log-container" style={{ marginTop: '8px' }}>
                    <button
                        onClick={() => setShowPipeline(!showPipeline)}
                        style={{ fontSize: '0.7em', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                    >
                        {showPipeline ? 'Hide' : 'Show'} technical pipeline log
                    </button>
                    {showPipeline && (
                        <div className="chat-pipeline-log" style={{ marginTop: '8px', padding: '10px', background: 'rgba(0,0,0,0.1)', borderRadius: '6px', fontSize: '0.85em', border: '1px solid var(--border)' }}>
                            {msg.pipeline_log.map((line, i) => (
                                <div key={i} style={{ marginBottom: '4px', fontFamily: 'monospace', opacity: line.startsWith('   ') ? 0.7 : 1 }}>
                                    {line}
                                </div>
                            ))}
                        </div>
                    )}
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

// =============================================================================
// REACT LOOP STATUS INDICATOR
// =============================================================================

function ReactLoopStatus() {
    return (
        <div className="chat-message chat-message-ai">
            <div className="chat-pipeline-status" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--accent)', borderRadius: '12px', padding: '16px' }}>
                <div className="pipeline-phase pipeline-phase-active">
                    <span className="pipeline-emoji">🌀</span>
                    <span className="pipeline-label">Antigravity ReAct Loop Engaged</span>
                    <span className="pipeline-dots">
                        <span className="chat-thinking-dot" />
                        <span className="chat-thinking-dot" />
                        <span className="chat-thinking-dot" />
                    </span>
                </div>
                <div style={{ fontSize: '0.8em', opacity: 0.7, marginTop: '8px', paddingLeft: '32px' }}>
                    Reasoning through geometry, executing batch operations, and auditing precision (0.5mm tolerance)...
                </div>
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
    const isAIThinking = useDesignStore((s) => s.isAIThinking);
    const project = useDesignStore((s) => s.project);
    const revertToMessage = useDesignStore((s) => s.revertToMessage);
    const sendMessageToAI = useDesignStore((s) => s.sendMessageToAI);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages.length, isAIThinking]);

    const sendMessage = useCallback((text: string) => {
        if (!text.trim() || isAIThinking) return;
        setInput('');
        sendMessageToAI(text);
    }, [isAIThinking, sendMessageToAI]);

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
                    <h3>🏗️ AI Architect <span style={{ fontSize: '0.65em', opacity: 0.6 }}>ReAct Loop</span></h3>
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
                            I&apos;m your AI architect. I use a continuous ReAct loop to reason through
                            your requests, perform precise geometric operations, and audit the results
                            against a 0.5mm construction tolerance.
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

                {isAIThinking && <ReactLoopStatus />}

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
