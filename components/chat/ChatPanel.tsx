/**
 * =============================================================================
 * COMPONENTS/CHAT/CHAT-PANEL.TSX — AI Chat Sidebar
 * =============================================================================
 *
 * The chat panel where users interact with the AI architect through
 * natural language. Users can:
 * - Describe changes ("move the north wall back by 1m")
 * - Ask questions ("how much would stone cost for this wall?")
 * - Upload reference images for style guidance
 * - See the AI's reasoning and operation summaries
 *
 * ARCHITECTURE:
 * - Messages are stored in the Zustand store
 * - User sends message → API route → AI orchestrator → response
 * - AI response includes both text and PSGOperations
 * - Operations are applied to the project automatically
 * - The 3D viewport updates in real-time
 *
 * UI DESIGN:
 * - Dark panel on the left side
 * - Messages flow bottom-to-top (newest at bottom)
 * - AI messages may include operation badges showing what changed
 * - Input at the bottom with send button and image upload
 * =============================================================================
 */

'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useDesignStore } from '@/store/useDesignStore';
import { v4 as uuidv4 } from 'uuid';

export function ChatPanel() {
    const [input, setInput] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const chatMessages = useDesignStore((s) => s.chatMessages);
    const addChatMessage = useDesignStore((s) => s.addChatMessage);
    const isAIThinking = useDesignStore((s) => s.isAIThinking);
    const setAIThinking = useDesignStore((s) => s.setAIThinking);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages]);

    /**
     * Handles sending a message to the AI.
     *
     * FLOW:
     * 1. Add user message to chat
     * 2. Set AI thinking state (shows loading indicator)
     * 3. Call API route with message + project state
     * 4. Receive response with text + operations
     * 5. Apply operations to project
     * 6. Add AI response to chat
     */
    const handleSend = async () => {
        if (!input.trim() || isAIThinking) return;

        const userMessage = {
            id: uuidv4(),
            role: 'user' as const,
            content: input.trim(),
            timestamp: new Date().toISOString(),
        };

        addChatMessage(userMessage);
        setInput('');
        setAIThinking(true);

        try {
            // TODO (Phase 2): Call actual AI API route
            // For now, simulate a response
            await new Promise((resolve) => setTimeout(resolve, 1500));

            const aiMessage = {
                id: uuidv4(),
                role: 'assistant' as const,
                content: `I understand you'd like to: "${userMessage.content}". The AI backend will be connected in Phase 2. For now, use the Inspector panel sliders to make direct changes, or try loading a template from the home page.`,
                timestamp: new Date().toISOString(),
            };

            addChatMessage(aiMessage);
        } catch (error) {
            addChatMessage({
                id: uuidv4(),
                role: 'assistant' as const,
                content: 'Sorry, I encountered an error. Please try again.',
                timestamp: new Date().toISOString(),
            });
        } finally {
            setAIThinking(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="panel chat-panel">
            <h3 className="panel-title">AI Architect</h3>

            {/* ── Messages List ───────────────────────────────────────── */}
            <div className="chat-messages">
                {chatMessages.length === 0 && (
                    <div className="chat-welcome">
                        <p>👋 Hi! I&apos;m your AI architect.</p>
                        <p>Describe the house you want to build, or ask me to modify the current design.</p>
                        <p className="chat-examples-title">Try saying:</p>
                        <ul className="chat-examples">
                            <li>&ldquo;Move the north wall back by 1 meter&rdquo;</li>
                            <li>&ldquo;Make the living room windows larger&rdquo;</li>
                            <li>&ldquo;Replace the brick with stone&rdquo;</li>
                            <li>&ldquo;Add a bathroom next to the master bedroom&rdquo;</li>
                        </ul>
                    </div>
                )}

                {chatMessages.map((msg) => (
                    <div key={msg.id} className={`chat-message ${msg.role}`}>
                        <div className="chat-message-header">
                            <span className="chat-role">
                                {msg.role === 'user' ? '👤 You' : '🏠 Architect'}
                            </span>
                            <span className="chat-time">
                                {new Date(msg.timestamp).toLocaleTimeString()}
                            </span>
                        </div>
                        <div className="chat-message-content">{msg.content}</div>
                        {/* Show operation badges if the AI made changes */}
                        {msg.operations && msg.operations.length > 0 && (
                            <div className="chat-operations">
                                {msg.operations.map((op, i) => (
                                    <span key={i} className="operation-badge">
                                        {op.type}: {op.target_id}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                ))}

                {isAIThinking && (
                    <div className="chat-message assistant thinking">
                        <div className="chat-message-content">
                            <span className="thinking-dots">Thinking</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* ── Input Area ──────────────────────────────────────────── */}
            <div className="chat-input-container">
                <textarea
                    className="chat-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe what you want to change..."
                    rows={2}
                    disabled={isAIThinking}
                />
                <div className="chat-input-actions">
                    {/* TODO (Phase 3): Image upload button */}
                    <button
                        className="chat-send-btn"
                        onClick={handleSend}
                        disabled={!input.trim() || isAIThinking}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
