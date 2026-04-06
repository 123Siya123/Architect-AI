/**
 * =============================================================================
 * COMPONENTS/CHAT/CHAT-PANEL.TSX — AI Chat Interface
 * =============================================================================
 *
 * The chat panel where users interact with the AI architect.
 * Supports switching between AI architectures:
 * - V3: Sequential Phased (Architect → Contractor → Inspector loop)
 * - One-Shot: Single Gemini AI call with all tools (1 call)
 * =============================================================================
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { useDesignStore } from '@/store/useDesignStore';
import { prepareProjectContext, generateASCIIFloorPlan } from '@/lib/ai/context';
import type { ChatMessage, ArchitectureMode } from '@/types';

// =============================================================================
// ARCHITECTURE MODE CONFIG
// =============================================================================




interface ArchModeConfig {
    id: ArchitectureMode;
    label: string;
    shortLabel: string;
    emoji: string;
    color: string;
    bgColor: string;
    description: string;
}

const ARCH_MODES: ArchModeConfig[] = [
    {
        id: 'v3',
        label: 'V3 Sequential',
        shortLabel: 'V3',
        emoji: '🏗️',
        color: '#00d4ff',
        bgColor: 'rgba(0, 212, 255, 0.12)',
        description: 'Architect → Contractor → Inspector loop (slow, precise)',
    },
    {
        id: 'oneshot',
        label: 'One-Shot (Gemini)',
        shortLabel: '1×G',
        emoji: '💥',
        color: '#22c55e',
        bgColor: 'rgba(34, 197, 94, 0.12)',
        description: 'Single Gemini call, no repair (fastest, ~85% quality)',
    },
];

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
// ARCHITECTURE MODE SWITCHER
// =============================================================================

function ArchitectureSwitcher() {
    const architectureMode = useDesignStore((s) => s.architectureMode);
    const setArchitectureMode = useDesignStore((s) => s.setArchitectureMode);
    const isAIThinking = useDesignStore((s) => s.isAIThinking);
    const [showTooltip, setShowTooltip] = useState<string | null>(null);

    const activeConfig = ARCH_MODES.find(m => m.id === architectureMode) || ARCH_MODES[0];

    return (
        <div style={{
            display: 'flex',
            gap: '4px',
            padding: '3px',
            background: 'rgba(255,255,255,0.03)',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            position: 'relative',
        }}>
            {ARCH_MODES.map((mode) => {
                const isActive = architectureMode === mode.id;
                return (
                    <div key={mode.id} style={{ position: 'relative' }}>
                        <button
                            onClick={() => !isAIThinking && setArchitectureMode(mode.id)}
                            disabled={isAIThinking}
                            onMouseEnter={() => setShowTooltip(mode.id)}
                            onMouseLeave={() => setShowTooltip(null)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                fontSize: '0.65em',
                                fontWeight: isActive ? '700' : '500',
                                fontFamily: '"Inter", "Segoe UI", sans-serif',
                                letterSpacing: '0.5px',
                                color: isActive ? mode.color : 'var(--text-secondary)',
                                background: isActive ? mode.bgColor : 'transparent',
                                border: isActive ? `1px solid ${mode.color}40` : '1px solid transparent',
                                borderRadius: '6px',
                                cursor: isAIThinking ? 'not-allowed' : 'pointer',
                                opacity: isAIThinking ? 0.5 : 1,
                                transition: 'all 0.2s ease',
                                whiteSpace: 'nowrap',
                                textTransform: 'uppercase',
                            }}
                        >
                            <span style={{ fontSize: '1.1em' }}>{mode.emoji}</span>
                            <span>{mode.shortLabel}</span>
                        </button>

                        {/* Tooltip */}
                        {showTooltip === mode.id && (
                            <div style={{
                                position: 'absolute',
                                bottom: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                marginBottom: '6px',
                                padding: '6px 10px',
                                background: '#1a1a2e',
                                border: `1px solid ${mode.color}40`,
                                borderRadius: '6px',
                                fontSize: '0.65em',
                                color: '#e0e0e0',
                                whiteSpace: 'nowrap',
                                zIndex: 100,
                                pointerEvents: 'none',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                            }}>
                                <div style={{ fontWeight: '700', color: mode.color, marginBottom: '2px' }}>
                                    {mode.label}
                                </div>
                                <div style={{ opacity: 0.8 }}>{mode.description}</div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}



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
    const logs = useDesignStore((s) => s.aiThinkingLogs);
    const architectureMode = useDesignStore((s) => s.architectureMode);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const activeConfig = ARCH_MODES.find(m => m.id === architectureMode) || ARCH_MODES[0];

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs.length]);

    return (
        <div className="chat-message chat-message-ai">
            <div className="chat-pipeline-status" style={{ background: 'var(--bg-secondary)', border: `1px solid ${activeConfig.color}`, borderRadius: '12px', padding: '16px' }}>
                <div className="pipeline-phase pipeline-phase-active">
                    <span className="pipeline-emoji">🌀</span>
                    <span className="pipeline-label" style={{ color: activeConfig.color }}>
                        {activeConfig.emoji} {activeConfig.label} Engine Active
                    </span>
                    <span className="pipeline-dots">
                        <span className="chat-thinking-dot" />
                        <span className="chat-thinking-dot" />
                        <span className="chat-thinking-dot" />
                    </span>
                </div>
                
                <div className="chat-pipeline-log" style={{
                    marginTop: '12px',
                    padding: '12px',
                    background: '#0a0a0a',
                    color: '#00ff41', // Terminal green
                    borderRadius: '6px',
                    fontSize: '0.8em',
                    border: `1px solid ${activeConfig.color}33`,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    boxShadow: 'inset 0 0 10px #000',
                    lineHeight: '1.4'
                }}>
                    <div style={{ color: '#888', marginBottom: '8px', fontSize: '0.9em', borderBottom: '1px solid #222', paddingBottom: '4px' }}>
                        [LIVE STREAM] {activeConfig.label} — AI Reasoning & Execution Log
                    </div>
                    
                    {logs.length === 0 && (
                        <div style={{ fontSize: '0.8em', opacity: 0.7, paddingLeft: '8px', fontStyle: 'italic' }}>
                            Initializing {activeConfig.label.toLowerCase()} engine...
                        </div>
                    )}

                    {logs.map((line, i) => (
                        <div key={i} style={{
                            marginBottom: '4px',
                            fontFamily: '"Fira Code", "Courier New", monospace',
                            opacity: line.startsWith('   ') ? 0.8 : 1,
                            color: line.includes('❌') ? '#ff4d4d' : line.includes('✅') ? '#4dff4d' : '#00ff41',
                            whiteSpace: 'pre-wrap',
                            paddingLeft: line.startsWith('   ') ? '12px' : '0px'
                        }}>
                            {line}
                        </div>
                    ))}
                    <div ref={logsEndRef} />
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
    const [attachments, setAttachments] = useState<{ name: string; type: string; data: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const chatMessages = useDesignStore((s) => s.chatMessages);
    const isAIThinking = useDesignStore((s) => s.isAIThinking);
    const project = useDesignStore((s) => s.project);
    const revertToMessage = useDesignStore((s) => s.revertToMessage);
    const sendMessageToAI = useDesignStore((s) => s.sendMessageToAI);
    const architectureMode = useDesignStore((s) => s.architectureMode);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const activeConfig = ARCH_MODES.find(m => m.id === architectureMode) || ARCH_MODES[0];

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages.length, isAIThinking]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const newAttachments: { name: string; type: string; data: string }[] = [];
            
            for (let i = 0; i < e.target.files.length; i++) {
                const file = e.target.files[i];
                // Check if file is image or text
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
                    
                    // Extract base64 data (remove data:image/png;base64, prefix)
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
            // Reset input so same file can be selected again if needed
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
                        <span style={{
                            fontSize: '0.6em',
                            background: activeConfig.bgColor,
                            color: activeConfig.color,
                            padding: '2px 6px',
                            borderRadius: '10px',
                            textTransform: 'uppercase',
                            letterSpacing: '1px',
                            border: `1px solid ${activeConfig.color}40`,
                            fontWeight: '700',
                        }}>
                            {activeConfig.emoji} {activeConfig.label}
                        </span>
                    </h3>
                    {/* Architecture Mode Switcher */}
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <ArchitectureSwitcher />

                        <button
                            onClick={handleDownloadSpecs}
                            className="debug-btn"
                            title="Download raw geometry and ASCII logic maps"
                            style={{ fontSize: '0.65em', background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s' }}
                        >
                            📥 LOGS
                        </button>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div className="chat-status" style={{ fontSize: '0.7em', fontWeight: 'bold', color: isAIThinking ? activeConfig.color : '#4dff4d' }}>
                        {isAIThinking ? '🌀 COMPUTING...' : '● AGENT READY'}
                    </div>
                    <div style={{ fontSize: '0.6em', opacity: 0.5, marginTop: '2px' }}>
                        {activeConfig.description}
                    </div>
                </div>
            </div>

            {/* Messages Area */}
            <div className="chat-messages">
                {chatMessages.length === 0 && (
                    <div className="chat-welcome">
                        <p className="chat-welcome-title">Hello! 👋</p>
                        <p className="chat-welcome-text">
                            I&apos;m your AI architect. Switch between architectures above to benchmark different approaches.
                            Currently using <strong style={{ color: activeConfig.color }}>{activeConfig.label}</strong>.
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
                    <textarea
                        className="chat-input"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={`Message (${activeConfig.shortLabel} mode)...`}
                        rows={2}
                        disabled={isAIThinking}
                        style={{ flex: 1 }}
                    />
                    <button
                        type="submit"
                        className="chat-send-btn"
                        disabled={(!input.trim() && attachments.length === 0) || isAIThinking}
                        style={{
                            background: isAIThinking ? undefined : `${activeConfig.color}22`,
                            borderColor: isAIThinking ? undefined : `${activeConfig.color}40`,
                        }}
                    >
                        Send →
                    </button>
                </div>
            </form>
        </div>
    );
}
