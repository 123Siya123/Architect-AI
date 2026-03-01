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
            <div className="chat-message-content-scroll">
                <p className="chat-message-content" style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
            </div>

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
                <div className="chat-pipeline-log-container" style={{ marginTop: '12px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75em', fontWeight: 'bold', color: 'var(--accent)' }}>ENGINE REASONING LOGS</span>
                        <button
                            onClick={() => setShowPipeline(!showPipeline)}
                            style={{ fontSize: '0.7em', color: 'var(--accent)', background: 'rgba(var(--accent-rgb), 0.1)', border: '1px solid var(--accent)', borderRadius: '4px', cursor: 'pointer', padding: '2px 8px' }}
                        >
                            {showPipeline ? 'CLOSE LOGS ×' : 'VIEW LOGS 📋'}
                        </button>
                    </div>

                    {showPipeline && (
                        <div className="chat-pipeline-log" style={{
                            marginTop: '8px',
                            padding: '12px',
                            background: '#0a0a0a',
                            color: '#00ff41', // Terminal green
                            borderRadius: '6px',
                            fontSize: '0.8em',
                            border: '1px solid #333',
                            maxHeight: '300px',
                            overflowY: 'auto',
                            boxShadow: 'inset 0 0 10px #000',
                            lineHeight: '1.4'
                        }}>
                            <div style={{ color: '#888', marginBottom: '8px', fontSize: '0.9em', borderBottom: '1px solid #222', paddingBottom: '4px' }}>
                                [SYSTEM] Antigravity ReAct v3.1 Logic Stream
                            </div>
                            {msg.pipeline_log.map((line, i) => (
                                <div key={i} style={{
                                    marginBottom: '4px',
                                    fontFamily: '"Fira Code", "Courier New", monospace',
                                    opacity: line.startsWith('   ') ? 0.8 : 1,
                                    color: line.includes('❌') ? '#ff4d4d' : line.includes('✅') ? '#4dff4d' : '#00ff41'
                                }}>
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
                <div className="chat-message-content-scroll" style={{ maxHeight: '120px' }}>
                    <div style={{ fontSize: '0.8em', opacity: 0.7, marginTop: '8px', paddingLeft: '32px' }}>
                        Reasoning through geometry, executing batch operations, and auditing precision (0.5mm tolerance)...
                    </div>
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
            <div className="chat-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '12px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        🏗️ AI Architect
                        <span style={{ fontSize: '0.6em', background: 'var(--accent)', color: 'white', padding: '2px 6px', borderRadius: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                            ReAct v3.1
                        </span>
                    </h3>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                        <button
                            onClick={handleDownloadSpecs}
                            className="debug-btn"
                            title="Download raw geometry and ASCII logic maps"
                            style={{ fontSize: '0.65em', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            📥 EXPORT LOGS
                        </button>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div className="chat-status" style={{ fontSize: '0.7em', fontWeight: 'bold', color: isAIThinking ? 'var(--accent)' : '#4dff4d' }}>
                        {isAIThinking ? '🌀 COMPUTING...' : '● AGENT READY'}
                    </div>
                    <div style={{ fontSize: '0.6em', opacity: 0.5, marginTop: '2px' }}>
                        Gemini 3.1 Pro High-Thinking
                    </div>
                </div>
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
