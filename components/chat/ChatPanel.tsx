/**
 * =============================================================================
 * COMPONENTS/CHAT/CHAT-PANEL.TSX — AI Chat Interface
 * =============================================================================
 *
 * The chat panel where users interact with the AI architect.
 * Sends messages to the /api/ai/chat endpoint, displays responses,
 * and shows operation badges when the AI makes edits.
 * =============================================================================
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useDesignStore } from '@/store/useDesignStore';
import type { ChatMessage } from '@/types';

// =============================================================================
// SUGGESTION CHIPS
// =============================================================================

const SUGGESTIONS = [
    'Make the living room 2m wider',
    'Add a window to the north wall',
    'Change the roof to a flat roof',
    'Show me the total material cost',
    'Replace all brick with stone',
    'Add a balcony to the master bedroom',
];

// =============================================================================
// MESSAGE BUBBLE
// =============================================================================

function MessageBubble({ msg }: { msg: ChatMessage }) {
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
            <p className="chat-message-content">{msg.content}</p>
            {/* Operation badges — show when AI made edits */}
            {msg.operations && msg.operations.length > 0 && (
                <div className="chat-operations">
                    {msg.operations.map((op, i) => (
                        <span key={i} className="chat-op-badge">
                            {op.type.replace(/_/g, ' ')}
                        </span>
                    ))}
                </div>
            )}
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
    const applyBatchOps = useDesignStore((s) => s.applyBatchOps);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages.length, isAIThinking]);

    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || isAIThinking) return;

        // Add user message
        const userMsg: ChatMessage = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: text.trim(),
            timestamp: new Date().toISOString(),
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

            const data = await response.json();

            // ✅ CRITICAL: Apply AI operations to the 3D scene via the store
            let appliedOps = data.operations || [];
            if (appliedOps.length > 0) {
                const result = applyBatchOps(appliedOps);
                if (!result.success) {
                    console.warn('[ChatPanel] Some operations failed:', result.errors);
                    // Only keep ops that were attempted — still show them in the chat
                }
            }

            const aiMsg: ChatMessage = {
                id: `msg_${Date.now()}_ai`,
                role: 'assistant',
                content: data.message || 'I processed your request.',
                timestamp: new Date().toISOString(),
                operations: appliedOps,
            };
            addChatMessage(aiMsg);
        } catch {
            const errMsg: ChatMessage = {
                id: `msg_${Date.now()}_err`,
                role: 'assistant',
                content: 'Sorry, I couldn\'t process that request. The AI backend may not be connected yet.',
                timestamp: new Date().toISOString(),
            };
            addChatMessage(errMsg);
        } finally {
            setAIThinking(false);
        }
    }, [input, isAIThinking, project, chatMessages, addChatMessage, setAIThinking, applyBatchOps]);

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

    return (
        <div className="chat-panel">
            {/* Chat Header */}
            <div className="chat-header">
                <h3>🏗️ AI Architect</h3>
                <span className="chat-status">
                    {isAIThinking ? '⏳ Thinking...' : '🟢 Ready'}
                </span>
            </div>

            {/* Messages Area */}
            <div className="chat-messages">
                {chatMessages.length === 0 && (
                    <div className="chat-welcome">
                        <p className="chat-welcome-title">Hello! 👋</p>
                        <p className="chat-welcome-text">
                            I&apos;m your AI architect. Describe what you&apos;d like to change
                            about the house, and I&apos;ll modify the 3D model for you.
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

                {chatMessages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} />
                ))}

                {isAIThinking && (
                    <div className="chat-message chat-message-ai">
                        <div className="chat-thinking">
                            <span className="chat-thinking-dot" />
                            <span className="chat-thinking-dot" />
                            <span className="chat-thinking-dot" />
                        </div>
                    </div>
                )}

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
