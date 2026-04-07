/**
 * =============================================================================
 * COMPONENTS/CHAT/CHAT-PANEL.TSX — AI Chat Interface
 * =============================================================================
 *
 * The chat panel where users interact with the AI architect.
 * Supports switching between AI architectures:
 * - V3: Sequential Phased (Architect → Contractor → Inspector loop)
 * - One-Shot: Single Gemini AI call with all tools (1 call)
 * Also includes Planning Mode with AI-generated house previews.
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
// PLANNING MODE IMAGE SELECTOR
// =============================================================================

interface PlanningImage {
    index: number;
    base64: string;
    prompt: string;
}

function PlanningImageSelector({
    images,
    selectedIndex,
    onSelect,
    onConfirm,
    onCancel,
    additionalText,
    onTextChange,
    isLoading,
}: {
    images: PlanningImage[];
    selectedIndex: number | null;
    onSelect: (index: number) => void;
    onConfirm: () => void;
    onCancel: () => void;
    additionalText: string;
    onTextChange: (text: string) => void;
    isLoading: boolean;
}) {
    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(20,20,35,0.98), rgba(15,15,30,0.98))',
            border: '1px solid rgba(100,130,255,0.3)',
            borderRadius: '16px',
            padding: '20px',
            margin: '12px 0',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '16px',
                paddingBottom: '12px',
                borderBottom: '1px solid rgba(100,130,255,0.15)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '1.3em' }}>🎨</span>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: '0.95em', color: '#e0e0ff' }}>
                            Planning Preview
                        </div>
                        <div style={{ fontSize: '0.7em', color: '#8888aa', marginTop: '2px' }}>
                            Select a design direction to build from
                        </div>
                    </div>
                </div>
                <button
                    onClick={onCancel}
                    style={{
                        background: 'rgba(255,80,80,0.15)',
                        border: '1px solid rgba(255,80,80,0.3)',
                        color: '#ff8888',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '0.75em',
                        fontWeight: 'bold',
                        transition: 'all 0.2s'
                    }}
                >
                    ✕ Cancel
                </button>
            </div>

            {/* Images Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '12px',
                marginBottom: '16px',
            }}>
                {images.map((img) => (
                    <div
                        key={img.index}
                        onClick={() => onSelect(img.index)}
                        style={{
                            position: 'relative',
                            borderRadius: '12px',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            border: selectedIndex === img.index
                                ? '3px solid #6488ff'
                                : '3px solid transparent',
                            boxShadow: selectedIndex === img.index
                                ? '0 0 20px rgba(100,136,255,0.3), inset 0 0 20px rgba(100,136,255,0.05)'
                                : '0 2px 8px rgba(0,0,0,0.3)',
                            transition: 'all 0.3s ease',
                            transform: selectedIndex === img.index ? 'scale(1.02)' : 'scale(1)',
                            aspectRatio: '16/10',
                        }}
                    >
                        <img
                            src={`data:image/png;base64,${img.base64}`}
                            alt={`Design Variant ${img.index + 1}`}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                display: 'block',
                            }}
                        />
                        {/* Variant label */}
                        <div style={{
                            position: 'absolute',
                            top: '8px',
                            left: '8px',
                            background: selectedIndex === img.index
                                ? 'rgba(100,136,255,0.9)'
                                : 'rgba(0,0,0,0.7)',
                            color: 'white',
                            borderRadius: '6px',
                            padding: '3px 8px',
                            fontSize: '0.7em',
                            fontWeight: 'bold',
                            letterSpacing: '0.5px',
                            backdropFilter: 'blur(4px)',
                        }}>
                            {selectedIndex === img.index ? '✓' : ''} Option {img.index + 1}
                        </div>
                        {/* Selected overlay */}
                        {selectedIndex === img.index && (
                            <div style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(100,136,255,0.08)',
                                pointerEvents: 'none',
                            }} />
                        )}
                    </div>
                ))}
            </div>

            {/* Additional instruction input + Send */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                <textarea
                    value={additionalText}
                    onChange={(e) => onTextChange(e.target.value)}
                    placeholder="Add extra instructions (optional)..."
                    rows={2}
                    style={{
                        flex: 1,
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(100,130,255,0.2)',
                        borderRadius: '10px',
                        color: '#e0e0ff',
                        padding: '10px 14px',
                        fontSize: '0.85em',
                        resize: 'none',
                        outline: 'none',
                        fontFamily: 'inherit',
                        transition: 'border-color 0.2s',
                    }}
                    onFocus={(e) => e.target.style.borderColor = 'rgba(100,136,255,0.5)'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(100,130,255,0.2)'}
                />
                <button
                    onClick={onConfirm}
                    disabled={selectedIndex === null || isLoading}
                    style={{
                        background: selectedIndex !== null
                            ? 'linear-gradient(135deg, #4466ff, #6488ff)'
                            : 'rgba(100,100,120,0.3)',
                        color: selectedIndex !== null ? 'white' : '#666',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '12px 20px',
                        cursor: selectedIndex !== null ? 'pointer' : 'not-allowed',
                        fontWeight: 'bold',
                        fontSize: '0.85em',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap',
                        boxShadow: selectedIndex !== null ? '0 4px 12px rgba(68,102,255,0.3)' : 'none',
                    }}
                >
                    {isLoading ? '⏳ Building...' : 'Build This →'}
                </button>
            </div>
        </div>
    );
}

// =============================================================================
// PLANNING LOADING INDICATOR
// =============================================================================

function PlanningLoader() {
    return (
        <div style={{
            background: 'linear-gradient(135deg, rgba(20,20,35,0.95), rgba(15,15,30,0.95))',
            border: '1px solid rgba(100,130,255,0.2)',
            borderRadius: '16px',
            padding: '32px',
            margin: '12px 0',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        }}>
            <div style={{
                fontSize: '2em',
                marginBottom: '12px',
                animation: 'spin 2s linear infinite',
            }}>
                🎨
            </div>
            <div style={{ fontWeight: 'bold', color: '#e0e0ff', marginBottom: '6px' }}>
                Generating Design Previews...
            </div>
            <div style={{ fontSize: '0.75em', color: '#8888aa' }}>
                AI is creating 4 unique design options from your instruction
            </div>
            <div style={{
                marginTop: '16px',
                height: '3px',
                background: 'rgba(100,130,255,0.1)',
                borderRadius: '3px',
                overflow: 'hidden',
            }}>
                <div style={{
                    height: '100%',
                    background: 'linear-gradient(90deg, transparent, #6488ff, transparent)',
                    borderRadius: '3px',
                    animation: 'shimmer 1.5s ease-in-out infinite',
                    width: '40%',
                }} />
            </div>
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(350%); }
                }
            `}</style>
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
    const activeConfig = ARCH_MODES.find(m => m.id === architectureMode) || ARCH_MODES[0];
    const stopAIThinking = useDesignStore((s) => s.stopAIThinking);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Planning Mode State
    const [planningMode, setPlanningMode] = useState(false);
    const [isPlanningLoading, setIsPlanningLoading] = useState(false);
    const [planningImages, setPlanningImages] = useState<PlanningImage[]>([]);
    const [selectedPlanIndex, setSelectedPlanIndex] = useState<number | null>(null);
    const [planningAdditionalText, setPlanningAdditionalText] = useState('');
    const [originalInstruction, setOriginalInstruction] = useState('');
    const [isPlanSending, setIsPlanSending] = useState(false);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages.length, isAIThinking, planningImages.length, isPlanningLoading]);

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

    // Capture current 3D scene as base64 screenshot
    const captureSceneScreenshot = useCallback((): string | null => {
        try {
            const canvas = document.querySelector('canvas');
            if (!canvas) return null;
            const dataUrl = canvas.toDataURL('image/png', 0.8);
            return dataUrl.split(',')[1]; // Return just the base64 part
        } catch (err) {
            console.error('Failed to capture scene screenshot:', err);
            return null;
        }
    }, []);

    // Normal send for non-planning mode
    const sendMessage = useCallback((text: string) => {
        if ((!text.trim() && attachments.length === 0) || isAIThinking) return;
        setInput('');
        setAttachments([]);
        sendMessageToAI(text, attachments);
    }, [isAIThinking, sendMessageToAI, attachments]);

    // Planning Mode: Generate 4 preview images
    const handlePlanningSubmit = useCallback(async () => {
        const text = input.trim();
        if (!text || isPlanningLoading || isAIThinking) return;

        setOriginalInstruction(text);
        setIsPlanningLoading(true);
        setPlanningImages([]);
        setSelectedPlanIndex(null);
        setPlanningAdditionalText('');

        try {
            // Check if there's existing structure in the 3D scene
            const nodeCount = Object.keys(project.nodes).length;
            let existingSceneBase64: string | undefined;

            if (nodeCount > 1) { // more than just the root House node
                existingSceneBase64 = captureSceneScreenshot() || undefined;
            }

            const response = await fetch('/api/ai/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    instruction: text,
                    existingSceneBase64,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate previews');
            }

            const data = await response.json();
            if (data.images && data.images.length > 0) {
                setPlanningImages(data.images);
                setInput(''); // Clear input after successful generation
            } else {
                throw new Error('No images were generated');
            }
        } catch (err) {
            console.error('Planning mode error:', err);
            alert(`Planning failed: ${(err as Error).message}. Try again or switch to normal mode.`);
        } finally {
            setIsPlanningLoading(false);
        }
    }, [input, isPlanningLoading, isAIThinking, project.nodes, captureSceneScreenshot]);

    // Planning Mode: Send selected image + instruction to the normal AI pipeline
    const handlePlanningConfirm = useCallback(async () => {
        if (selectedPlanIndex === null || isPlanSending) return;

        const selectedImage = planningImages.find(img => img.index === selectedPlanIndex);
        if (!selectedImage) return;

        setIsPlanSending(true);

        // Build the message with the selected image as an attachment
        const combinedInstruction = planningAdditionalText.trim()
            ? `${originalInstruction}\n\nAdditional instructions: ${planningAdditionalText.trim()}`
            : originalInstruction;

        // The selected image becomes an attachment, just like a user-uploaded image
        const imageAttachment = {
            name: `planning_preview_${selectedPlanIndex + 1}.png`,
            type: 'image/png',
            data: selectedImage.base64,
        };

        // Combine with any existing attachments
        const allAttachments = [...attachments, imageAttachment];

        // Clear planning state
        setPlanningImages([]);
        setSelectedPlanIndex(null);
        setPlanningAdditionalText('');
        setOriginalInstruction('');
        setAttachments([]);
        setIsPlanSending(false);

        // Send through the EXACT same pipeline as normal chat with image upload
        // This is the v3 architecture flow: sendMessageToAI -> /api/ai/chat -> v3-orchestrator
        const prefixedInstruction = `[PLANNING MODE] The user selected a design preview image (attached) that represents their desired vision. Build the house to match this design as closely as possible. Instructions: ${combinedInstruction}`;
        sendMessageToAI(prefixedInstruction, allAttachments);
    }, [selectedPlanIndex, planningImages, planningAdditionalText, originalInstruction, attachments, sendMessageToAI, isPlanSending]);

    // Cancel planning and clear state
    const handlePlanningCancel = useCallback(() => {
        setPlanningImages([]);
        setSelectedPlanIndex(null);
        setPlanningAdditionalText('');
        setOriginalInstruction('');
        setIsPlanningLoading(false);
    }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (planningMode) {
            handlePlanningSubmit();
        } else {
            sendMessage(input);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (planningMode) {
                handlePlanningSubmit();
            } else {
                sendMessage(input);
            }
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
                        <p className="chat-welcome-text" style={{ marginTop: '8px', fontSize: '0.8em', color: '#8888aa' }}>
                            💡 <strong>Tip:</strong> Toggle <strong>Planning Mode</strong> (🎨 button below) to preview 4 AI-generated design options before building!
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
                {/* Planning Mode Loading */}
                {isPlanningLoading && <PlanningLoader />}

                {/* Planning Mode Image Selection */}
                {planningImages.length > 0 && (
                    <PlanningImageSelector
                        images={planningImages}
                        selectedIndex={selectedPlanIndex}
                        onSelect={setSelectedPlanIndex}
                        onConfirm={handlePlanningConfirm}
                        onCancel={handlePlanningCancel}
                        additionalText={planningAdditionalText}
                        onTextChange={setPlanningAdditionalText}
                        isLoading={isPlanSending}
                    />
                )}

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

                    {/* Planning Mode Toggle */}
                    <button
                        type="button"
                        onClick={() => {
                            setPlanningMode(!planningMode);
                            // Clear planning state if turning off
                            if (planningMode) {
                                handlePlanningCancel();
                            }
                        }}
                        disabled={isAIThinking}
                        title={planningMode ? 'Switch to normal mode' : 'Switch to Planning Mode — generates 4 AI previews before building'}
                        style={{
                            padding: '8px 12px',
                            fontSize: '1em',
                            background: planningMode
                                ? 'linear-gradient(135deg, rgba(100,136,255,0.25), rgba(140,100,255,0.25))'
                                : 'var(--bg-secondary)',
                            border: planningMode
                                ? '1px solid rgba(100,136,255,0.5)'
                                : '1px solid var(--border)',
                            borderRadius: '8px',
                            color: planningMode ? '#a0b4ff' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            position: 'relative',
                            overflow: 'hidden',
                            fontWeight: planningMode ? 'bold' : 'normal',
                        }}
                    >
                        🎨
                        {planningMode && (
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
                        placeholder={planningMode
                            ? "Describe the house you want to see previews of..."
                            : `Message (${activeConfig.shortLabel} mode)...`}
                        rows={2}
                        disabled={isAIThinking || isPlanningLoading}
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
                    ) : isPlanningLoading ? (
                        <button
                            type="button"
                            className="chat-send-btn"
                            disabled
                            style={{ background: 'rgba(100,136,255,0.3)', color: '#8888aa' }}
                        >
                            Generating...
                        </button>
                    ) : (
                        <button
                            type="submit"
                            className="chat-send-btn"
                            disabled={!input.trim() && attachments.length === 0}
                            style={planningMode && input.trim() ? {
                                background: 'linear-gradient(135deg, #4466ff, #6488ff)',
                                color: 'white',
                                boxShadow: '0 2px 12px rgba(68,102,255,0.3)',
                            } : {
                                background: `${activeConfig.color}22`,
                                borderColor: `${activeConfig.color}40`,
                            }}
                        >
                            {planningMode ? 'Preview 🎨' : 'Send →'}
                        </button>
                    )}
                </div>

                {/* Planning Mode Status Bar */}
                {planningMode && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginTop: '8px',
                        padding: '6px 12px',
                        background: 'linear-gradient(90deg, rgba(100,136,255,0.08), rgba(140,100,255,0.08))',
                        borderRadius: '8px',
                        border: '1px solid rgba(100,136,255,0.15)',
                        fontSize: '0.7em',
                        color: '#a0b4ff',
                    }}>
                        <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#6488ff',
                            boxShadow: '0 0 8px #6488ff',
                            animation: 'pulse-glow 2s ease-in-out infinite',
                        }} />
                        <span style={{ fontWeight: 'bold' }}>PLANNING MODE</span>
                        <span style={{ color: '#6666aa' }}>•</span>
                        <span style={{ color: '#8888aa' }}>
                            Your prompt will generate 4 design previews. Pick one to build.
                        </span>
                        <style>{`
                            @keyframes pulse-glow {
                                0%, 100% { opacity: 1; box-shadow: 0 0 8px #6488ff; }
                                50% { opacity: 0.5; box-shadow: 0 0 4px #6488ff; }
                            }
                        `}</style>
                    </div>
                )}
            </form>
        </div>
    );
}
