/**
 * =============================================================================
 * COMPONENTS/CHAT/CHAT-PANEL.TSX — AI Chat Interface (Multi-Agent)
 * =============================================================================
 *
 * UPGRADE v3 — Shows multi-agent pipeline status
 * UPGRADE v4.0 — Plan & Design Mode with 2-phase wizard (replaces old Planning Mode)
 *
 * The chat panel where users interact with the AI architect.
 * Now includes:
 * - 🧠 Coordinator analyzing...
 * - ⚡ Workers executing...
 * - 🔍 Checker reviewing...
 * - 🔧 Fixer correcting...
 * - 🏠 Plan & Design Mode: 2-phase wizard (Style → Layout → Build)
 * =============================================================================
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useDesignStore } from '@/store/useDesignStore';
import type { ChatMessage } from '@/types';
import { prepareProjectContext, generateASCIIFloorPlan } from '@/lib/ai/context';
import DesignModePanel from './DesignModePanel';

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
    const isThinking = !isUser && msg.content === 'Thinking...';
    const [showPipeline, setShowPipeline] = useState(isThinking);

    // Auto-expand logs if it starts thinking
    useEffect(() => {
        if (isThinking) setShowPipeline(true);
    }, [isThinking]);

    // Check for image attachments to display inline
    const imageAttachments = msg.attachments?.filter(a => a.type.startsWith('image/')) || [];

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

            {/* Show image attachments inline */}
            {imageAttachments.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                    {imageAttachments.map((att, i) => (
                        <img
                            key={i}
                            src={`data:${att.type};base64,${att.data}`}
                            alt={att.name}
                            style={{
                                maxWidth: '200px',
                                maxHeight: '150px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                objectFit: 'cover'
                            }}
                        />
                    ))}
                </div>
            )}

            <div className="chat-message-content-scroll">
                <p className="chat-message-content" style={{ whiteSpace: 'pre-wrap' }}>
                    {isThinking ? (
                        <span style={{ color: 'var(--accent)' }}>
                            Thinking...
                        </span>
                    ) : (
                        msg.content
                    )}
                </p>
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
                            fontSize: '0.85em',
                            border: '1px solid #333',
                            maxHeight: '400px',
                            overflowY: 'auto',
                            boxShadow: 'inset 0 0 10px #000',
                            lineHeight: '1.4',
                            fontFamily: '"Fira Code", "Courier New", monospace',
                        }}>
                            <div style={{ color: '#888', marginBottom: '8px', fontSize: '0.9em', borderBottom: '1px solid #222', paddingBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                <span>[LIVE STREAM] AI Reasoning & Execution Log</span>
                                {isThinking && <span className="pulse-text">ACTIVE</span>}
                            </div>
                            {msg.pipeline_log.map((line, i) => (
                                <div key={i} style={{
                                    marginBottom: '4px',
                                    opacity: line.startsWith('   ') ? 0.8 : 1,
                                    color: line.includes('❌') ? '#ff4d4d' : line.includes('✅') ? '#4dff4d' : '#00ff41',
                                    whiteSpace: 'pre-wrap'
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
// MAIN CHAT PANEL
// =============================================================================

export default function ChatPanel() {
    const [input, setInput] = useState('');
    const [attachments, setAttachments] = useState<{ name: string; type: string; data: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatMessages = useDesignStore((s) => s.chatMessages);
    const isAIThinking = useDesignStore((s) => s.isAIThinking);
    const project = useDesignStore((s) => s.project);
    const revertToMessage = useDesignStore((s) => s.revertToMessage);
    const sendMessageToAI = useDesignStore((s) => s.sendMessageToAI);
    const stopAIThinking = useDesignStore((s) => s.stopAIThinking);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Plan & Design Mode
    const [designModeOpen, setDesignModeOpen] = useState(false);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages.length, isAIThinking]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newAttachments: { name: string; type: string; data: string }[] = [];

            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                if (!file.type.startsWith('image/') && !file.type.startsWith('text/') && file.type !== 'application/pdf') {
                    alert(`File type ${file.type} not supported. Please upload images or text documents.`);
                    continue;
                }

                try {
                    const base64 = await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(file);
                    });

                    const data = base64.split(',')[1];

                    newAttachments.push({
                        name: file.name,
                        type: file.type,
                        data: data
                    });
                } catch (err) {
                    console.error('Error reading file:', err);
                }
            }

            setAttachments(prev => [...prev, ...newAttachments]);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleRemoveAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const sendMessage = useCallback((text: string) => {
        if ((!text.trim() && attachments.length === 0) || isAIThinking) return;
        setInput('');
        setAttachments([]);
        sendMessageToAI(text, attachments);
    }, [isAIThinking, sendMessageToAI, attachments]);

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
                        <p className="chat-welcome-text" style={{ marginTop: '8px', fontSize: '0.8em', color: '#8888aa' }}>
                            💡 <strong>Tip:</strong> Use <strong>Plan & Design</strong> (🏠 button below) to explore styles and floor plans before building!
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

                <div ref={messagesEndRef} />
            </div>

            {/* Plan & Design Mode Overlay */}
            <DesignModePanel
                isOpen={designModeOpen}
                onClose={() => setDesignModeOpen(false)}
                onBuild={(msg, attachments, planningContext) => {
                    setDesignModeOpen(false);
                    sendMessageToAI(msg, attachments, planningContext);
                }}
                isAIThinking={isAIThinking}
            />

            {/* Input Area */}
            <form className="chat-input-form" onSubmit={handleSubmit} style={{ flexDirection: 'column' }}>
                {/* Attachments Preview */}
                {attachments.length > 0 && (
                    <div className="chat-attachments-preview" style={{ width: '100%', display: 'flex', gap: '8px', padding: '8px', overflowX: 'auto', background: 'rgba(0,0,0,0.2)', marginBottom: '8px', borderRadius: '8px' }}>
                        {attachments.map((file, i) => (
                            <div key={i} style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '60px' }}>
                                {file.type.startsWith('image/') ? (
                                    <img src={`data:${file.type};base64,${file.data}`} alt={file.name} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '4px' }} />
                                ) : (
                                    <div style={{ width: '40px', height: '40px', background: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontSize: '20px' }}>📄</div>
                                )}
                                <span style={{ fontSize: '10px', maxWidth: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>{file.name}</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveAttachment(i)}
                                    style={{ position: 'absolute', top: '-4px', right: '-4px', background: 'red', color: 'white', borderRadius: '50%', width: '14px', height: '14px', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
                                >
                                    ×
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                <div style={{ display: 'flex', width: '100%', gap: '8px', alignItems: 'flex-end' }}>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        multiple
                        accept="image/*,text/*,.pdf"
                        style={{ display: 'none' }}
                    />
                    <button
                        type="button"
                        className="chat-attach-btn"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isAIThinking}
                        title="Upload images or text documents"
                        style={{ padding: '8px 12px', fontSize: '1.2em', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer' }}
                    >
                        +
                    </button>

                    {/* Plan & Design Mode Toggle */}
                    <button
                        type="button"
                        onClick={() => setDesignModeOpen(!designModeOpen)}
                        disabled={isAIThinking}
                        title="Plan & Design — explore styles and floor plans before building"
                        style={{
                            padding: '8px 12px',
                            fontSize: '1em',
                            background: designModeOpen
                                ? 'linear-gradient(135deg, rgba(100,136,255,0.25), rgba(140,100,255,0.25))'
                                : 'var(--bg-secondary)',
                            border: designModeOpen
                                ? '1px solid rgba(100,136,255,0.5)'
                                : '1px solid var(--border)',
                            borderRadius: '8px',
                            color: designModeOpen ? '#a0b4ff' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            position: 'relative',
                            overflow: 'hidden',
                            fontWeight: designModeOpen ? 'bold' : 'normal',
                        }}
                    >
                        🏠
                        {designModeOpen && (
                            <span style={{
                                position: 'absolute',
                                bottom: '2px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: '4px',
                                height: '4px',
                                borderRadius: '50%',
                                background: '#6488ff',
                                boxShadow: '0 0 6px #6488ff',
                            }} />
                        )}
                    </button>

                    <textarea
                        className="chat-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe what you'd like to change..."
                        rows={2}
                        disabled={isAIThinking}
                        style={{ flex: 1 }}
                    />
                    {isAIThinking ? (
                        <button
                            type="button"
                            onClick={() => stopAIThinking()}
                            className="chat-send-btn"
                            style={{ background: '#ff4d4d', color: 'white' }}
                        >
                            Stop ⏹
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="chat-send-btn"
                            disabled={!input.trim() && attachments.length === 0}
                        >
                            Send →
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
