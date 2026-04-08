/**
 * =============================================================================
 * COMPONENTS/CHAT/DESIGN-MODE-PANEL.TSX — Plan & Design Wizard
 * =============================================================================
 *
 * Multi-phase overlay panel for the Plan & Design pre-build wizard.
 * Phase 1: Style & Form — exterior previews (2 styles × 2 layouts = 4 images)
 * Phase 2: Interior Layout — 4 colored floor plan variants
 *
 * All state is local to this component. The only output is the onBuild callback
 * which fires when the user clicks "Build This House".
 * =============================================================================
 */

'use client';

import React, { useState, useCallback } from 'react';
import type { MasterBuildDocument, PlanningContext } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

interface PlanningImage {
    index: number;
    base64: string;
    prompt: string;
}

interface StyleVariations {
    styleA: string;
    styleB: string;
    layoutA: string;
    layoutB: string;
}

type DesignPhase = 'style' | 'layout';

interface DesignModePanelProps {
    isOpen: boolean;
    onClose: () => void;
    onBuild: (
        message: string,
        attachments: { name: string; type: string; data: string }[],
        planningContext: PlanningContext
    ) => void;
    isAIThinking: boolean;
}

// =============================================================================
// IMAGE LABEL HELPERS
// =============================================================================

function getImageLabel(index: number, variations: StyleVariations | null): string {
    if (!variations) {
        const labels = ['Style A + Layout 1', 'Style B + Layout 1', 'Style A + Layout 2', 'Style B + Layout 2'];
        return labels[index] || `Option ${index + 1}`;
    }
    const style = index % 2 === 0 ? variations.styleA : variations.styleB;
    const layout = index < 2 ? variations.layoutA : variations.layoutB;
    // Truncate for display
    const shortStyle = style.length > 40 ? style.substring(0, 37) + '...' : style;
    const shortLayout = layout.length > 40 ? layout.substring(0, 37) + '...' : layout;
    return `${shortStyle} | ${shortLayout}`;
}

const LAYOUT_LABELS = [
    'Open plan — living at front, bedrooms at rear',
    'Traditional — separate rooms, central hallway',
    'Master front-left with ensuite, bedrooms rear-right',
    'Master rear for privacy, social spaces at front',
];

// =============================================================================
// LOADING SKELETON
// =============================================================================

function ImageSkeleton() {
    return (
        <div style={{
            aspectRatio: '16/10',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, rgba(40,40,60,0.8), rgba(30,30,50,0.8))',
            position: 'relative',
            overflow: 'hidden',
        }}>
            <div style={{
                position: 'absolute',
                inset: 0,
                background: 'linear-gradient(90deg, transparent, rgba(100,130,255,0.08), transparent)',
                animation: 'shimmer 1.5s ease-in-out infinite',
            }} />
        </div>
    );
}

// =============================================================================
// PHASE INDICATOR
// =============================================================================

function PhaseIndicator({ phase }: { phase: DesignPhase }) {
    return (
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: phase === 'style' ? '#6488ff' : 'transparent',
                border: `2px solid ${phase === 'style' ? '#6488ff' : '#555'}`,
                boxShadow: phase === 'style' ? '0 0 8px #6488ff' : 'none',
                transition: 'all 0.3s',
            }} />
            <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: phase === 'layout' ? '#6488ff' : 'transparent',
                border: `2px solid ${phase === 'layout' ? '#6488ff' : '#555'}`,
                boxShadow: phase === 'layout' ? '0 0 8px #6488ff' : 'none',
                transition: 'all 0.3s',
            }} />
        </div>
    );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function DesignModePanel({ isOpen, onClose, onBuild, isAIThinking }: DesignModePanelProps) {
    // Phase
    const [phase, setPhase] = useState<DesignPhase>('style');

    // Phase 1: Style state
    const [styleInput, setStyleInput] = useState('');
    const [refinementInput, setRefinementInput] = useState('');
    const [styleImages, setStyleImages] = useState<PlanningImage[]>([]);
    const [selectedStyleIndex, setSelectedStyleIndex] = useState<number | null>(null);
    const [masterplan, setMasterplan] = useState<MasterBuildDocument | null>(null);
    const [buildBrief, setBuildBrief] = useState<string | null>(null);
    const [styleVariations, setStyleVariations] = useState<StyleVariations | null>(null);
    const [isGeneratingStyles, setIsGeneratingStyles] = useState(false);
    const [styleError, setStyleError] = useState<string | null>(null);

    // Phase 2: Layout state
    const [layoutNotes, setLayoutNotes] = useState('');
    const [layoutImages, setLayoutImages] = useState<PlanningImage[]>([]);
    const [selectedLayoutIndex, setSelectedLayoutIndex] = useState<number | null>(null);
    const [isGeneratingLayouts, setIsGeneratingLayouts] = useState(false);
    const [layoutError, setLayoutError] = useState<string | null>(null);

    // ─── HANDLERS ────────────────────────────────────────────────────

    const handleGenerateStyles = useCallback(async (isRefinement: boolean = false) => {
        const text = isRefinement ? styleInput : styleInput.trim();
        if (!text || isGeneratingStyles) return;

        setIsGeneratingStyles(true);
        setStyleError(null);
        setStyleImages([]);
        setSelectedStyleIndex(null);

        try {
            const response = await fetch('/api/ai/design-mode/style', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userInstruction: text,
                    existingMasterplan: isRefinement ? masterplan : undefined,
                    refinementNote: isRefinement ? refinementInput : undefined,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate styles');
            }

            const data = await response.json();
            setMasterplan(data.masterplan);
            setBuildBrief(data.buildBrief);
            setStyleVariations(data.styleVariations);
            setStyleImages(data.images || []);
            setRefinementInput('');

            if (!data.images || data.images.length === 0) {
                throw new Error('No images were generated');
            }
        } catch (err) {
            setStyleError((err as Error).message);
        } finally {
            setIsGeneratingStyles(false);
        }
    }, [styleInput, refinementInput, masterplan, isGeneratingStyles]);

    const handleGenerateLayouts = useCallback(async () => {
        if (!masterplan || selectedStyleIndex === null || isGeneratingLayouts) return;

        const selectedImage = styleImages.find(img => img.index === selectedStyleIndex);
        if (!selectedImage) return;

        setIsGeneratingLayouts(true);
        setLayoutError(null);
        setLayoutImages([]);
        setSelectedLayoutIndex(null);

        try {
            const response = await fetch('/api/ai/design-mode/layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    masterplan,
                    selectedStyleImageBase64: selectedImage.base64,
                    userLayoutNotes: layoutNotes || undefined,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate layouts');
            }

            const data = await response.json();
            setLayoutImages(data.images || []);

            if (!data.images || data.images.length === 0) {
                throw new Error('No floor plans were generated');
            }
        } catch (err) {
            setLayoutError((err as Error).message);
        } finally {
            setIsGeneratingLayouts(false);
        }
    }, [masterplan, selectedStyleIndex, styleImages, layoutNotes, isGeneratingLayouts]);

    const handleMoveToLayout = useCallback(() => {
        if (selectedStyleIndex === null || !masterplan) return;
        setPhase('layout');
        handleGenerateLayouts();
    }, [selectedStyleIndex, masterplan, handleGenerateLayouts]);

    const handleBackToStyle = useCallback(() => {
        setPhase('style');
        setLayoutImages([]);
        setSelectedLayoutIndex(null);
        setLayoutError(null);
    }, []);

    const handleBuild = useCallback(() => {
        if (!masterplan || selectedStyleIndex === null || selectedLayoutIndex === null) return;

        const styleImage = styleImages.find(img => img.index === selectedStyleIndex);
        const layoutImage = layoutImages.find(img => img.index === selectedLayoutIndex);
        if (!styleImage || !layoutImage) return;

        const attachments = [
            { name: 'style_preview.png', type: 'image/png', data: styleImage.base64 },
            { name: 'floor_plan.png', type: 'image/png', data: layoutImage.base64 },
        ];

        const message = `[PLAN & DESIGN MODE] Build this house according to the pre-built masterplan. Style preview and floor plan attached as references. Description: ${styleInput}`;

        onBuild(message, attachments, {
            masterBuildDocument: masterplan,
            buildBrief: buildBrief ?? undefined,
        });
    }, [masterplan, selectedStyleIndex, selectedLayoutIndex, styleImages, layoutImages, styleInput, buildBrief, onBuild]);

    const handleClose = useCallback(() => {
        if (masterplan && !window.confirm('You\'ll lose your current design selections. Continue?')) {
            return;
        }
        // Reset all state
        setPhase('style');
        setStyleInput('');
        setRefinementInput('');
        setStyleImages([]);
        setSelectedStyleIndex(null);
        setMasterplan(null);
        setBuildBrief(null);
        setStyleVariations(null);
        setIsGeneratingStyles(false);
        setStyleError(null);
        setLayoutNotes('');
        setLayoutImages([]);
        setSelectedLayoutIndex(null);
        setIsGeneratingLayouts(false);
        setLayoutError(null);
        onClose();
    }, [masterplan, onClose]);

    // ─── RENDER ──────────────────────────────────────────────────────

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
        }}>
            <div style={{
                width: '90vw',
                maxWidth: '800px',
                maxHeight: '90vh',
                overflowY: 'auto',
                background: 'linear-gradient(135deg, rgba(20,20,35,0.98), rgba(15,15,30,0.98))',
                border: '1px solid rgba(100,130,255,0.3)',
                borderRadius: '20px',
                padding: '28px',
                boxShadow: '0 16px 64px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    paddingBottom: '16px',
                    borderBottom: '1px solid rgba(100,130,255,0.15)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '1.4em' }}>🏠</span>
                        <div>
                            <div style={{ fontWeight: 'bold', fontSize: '1.05em', color: '#e0e0ff', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {phase === 'style' ? 'Step 1 — Style & Form' : 'Step 2 — Interior Layout'}
                                <PhaseIndicator phase={phase} />
                            </div>
                            <div style={{ fontSize: '0.72em', color: '#8888aa', marginTop: '3px' }}>
                                {phase === 'style'
                                    ? 'Describe your dream home and explore style directions'
                                    : 'Choose how the rooms are arranged inside'}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'rgba(255,80,80,0.15)',
                            border: '1px solid rgba(255,80,80,0.3)',
                            color: '#ff8888',
                            borderRadius: '8px',
                            padding: '6px 14px',
                            cursor: 'pointer',
                            fontSize: '0.75em',
                            fontWeight: 'bold',
                            transition: 'all 0.2s',
                        }}
                    >
                        Close
                    </button>
                </div>

                {/* ═══ PHASE 1: STYLE & FORM ═══ */}
                {phase === 'style' && (
                    <>
                        {/* Input area */}
                        {styleImages.length === 0 && !isGeneratingStyles && (
                            <div style={{ marginBottom: '16px' }}>
                                <textarea
                                    value={styleInput}
                                    onChange={(e) => setStyleInput(e.target.value)}
                                    placeholder="Describe the house you want to design... e.g. 'A 3-bedroom modern house with an open-plan living area, flat roof, and a double garage. Around 180 sqm.'"
                                    rows={4}
                                    disabled={isGeneratingStyles}
                                    style={{
                                        width: '100%',
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(100,130,255,0.2)',
                                        borderRadius: '12px',
                                        color: '#e0e0ff',
                                        padding: '14px 16px',
                                        fontSize: '0.9em',
                                        resize: 'vertical',
                                        outline: 'none',
                                        fontFamily: 'inherit',
                                        boxSizing: 'border-box',
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleGenerateStyles(false);
                                        }
                                    }}
                                />
                                <button
                                    onClick={() => handleGenerateStyles(false)}
                                    disabled={!styleInput.trim() || isGeneratingStyles}
                                    style={{
                                        marginTop: '10px',
                                        width: '100%',
                                        padding: '12px',
                                        background: styleInput.trim()
                                            ? 'linear-gradient(135deg, #4466ff, #6488ff)'
                                            : 'rgba(100,100,120,0.3)',
                                        color: styleInput.trim() ? 'white' : '#666',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: styleInput.trim() ? 'pointer' : 'not-allowed',
                                        fontWeight: 'bold',
                                        fontSize: '0.9em',
                                        transition: 'all 0.2s',
                                        boxShadow: styleInput.trim() ? '0 4px 16px rgba(68,102,255,0.3)' : 'none',
                                    }}
                                >
                                    Generate Styles
                                </button>
                            </div>
                        )}

                        {/* Loading skeletons */}
                        {isGeneratingStyles && styleImages.length === 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ textAlign: 'center', marginBottom: '12px', color: '#a0b4ff', fontWeight: 'bold', fontSize: '0.85em' }}>
                                    Creating masterplan and generating style previews...
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                    <ImageSkeleton /><ImageSkeleton /><ImageSkeleton /><ImageSkeleton />
                                </div>
                            </div>
                        )}

                        {/* Style error */}
                        {styleError && (
                            <div style={{
                                background: 'rgba(255,80,80,0.1)',
                                border: '1px solid rgba(255,80,80,0.3)',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                marginBottom: '16px',
                                color: '#ff8888',
                                fontSize: '0.8em',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}>
                                <span>{styleError}</span>
                                <button
                                    onClick={() => { setStyleError(null); handleGenerateStyles(false); }}
                                    style={{ background: 'rgba(255,80,80,0.2)', border: '1px solid rgba(255,80,80,0.4)', color: '#ff8888', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.9em', fontWeight: 'bold' }}
                                >
                                    Try Again
                                </button>
                            </div>
                        )}

                        {/* Image grid */}
                        {styleImages.length > 0 && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
                                    {styleImages.map((img) => (
                                        <div
                                            key={img.index}
                                            onClick={() => setSelectedStyleIndex(img.index)}
                                            style={{
                                                position: 'relative',
                                                borderRadius: '12px',
                                                overflow: 'hidden',
                                                cursor: 'pointer',
                                                border: selectedStyleIndex === img.index
                                                    ? '3px solid #6488ff'
                                                    : '3px solid transparent',
                                                boxShadow: selectedStyleIndex === img.index
                                                    ? '0 0 20px rgba(100,136,255,0.3)'
                                                    : '0 2px 8px rgba(0,0,0,0.3)',
                                                transition: 'all 0.3s ease',
                                                transform: selectedStyleIndex === img.index ? 'scale(1.02)' : 'scale(1)',
                                                aspectRatio: '16/10',
                                            }}
                                        >
                                            <img
                                                src={`data:image/png;base64,${img.base64}`}
                                                alt={`Style Variant ${img.index + 1}`}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                            />
                                            <div style={{
                                                position: 'absolute',
                                                top: '8px',
                                                left: '8px',
                                                right: '8px',
                                                background: selectedStyleIndex === img.index
                                                    ? 'rgba(100,136,255,0.9)'
                                                    : 'rgba(0,0,0,0.7)',
                                                color: 'white',
                                                borderRadius: '6px',
                                                padding: '4px 8px',
                                                fontSize: '0.6em',
                                                fontWeight: 'bold',
                                                backdropFilter: 'blur(4px)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {selectedStyleIndex === img.index ? '✓ ' : ''}{getImageLabel(img.index, styleVariations)}
                                            </div>
                                            {selectedStyleIndex === img.index && (
                                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(100,136,255,0.08)', pointerEvents: 'none' }} />
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Refinement area */}
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                    <textarea
                                        value={refinementInput}
                                        onChange={(e) => setRefinementInput(e.target.value)}
                                        placeholder="Refine your design... e.g. 'add a flat roof' or 'make it more rustic'"
                                        rows={2}
                                        disabled={isGeneratingStyles}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(100,130,255,0.2)',
                                            borderRadius: '10px',
                                            color: '#e0e0ff',
                                            padding: '10px 14px',
                                            fontSize: '0.82em',
                                            resize: 'none',
                                            outline: 'none',
                                            fontFamily: 'inherit',
                                        }}
                                    />
                                    <button
                                        onClick={() => handleGenerateStyles(true)}
                                        disabled={!refinementInput.trim() || isGeneratingStyles}
                                        style={{
                                            padding: '10px 16px',
                                            background: refinementInput.trim() ? 'rgba(100,136,255,0.2)' : 'rgba(100,100,120,0.2)',
                                            border: '1px solid rgba(100,136,255,0.3)',
                                            borderRadius: '10px',
                                            color: refinementInput.trim() ? '#a0b4ff' : '#666',
                                            cursor: refinementInput.trim() ? 'pointer' : 'not-allowed',
                                            fontWeight: 'bold',
                                            fontSize: '0.8em',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {isGeneratingStyles ? 'Refining...' : 'Refine'}
                                    </button>
                                </div>

                                {/* Next button */}
                                <button
                                    onClick={handleMoveToLayout}
                                    disabled={selectedStyleIndex === null || isGeneratingStyles}
                                    style={{
                                        width: '100%',
                                        padding: '14px',
                                        background: selectedStyleIndex !== null
                                            ? 'linear-gradient(135deg, #4466ff, #6488ff)'
                                            : 'rgba(100,100,120,0.3)',
                                        color: selectedStyleIndex !== null ? 'white' : '#666',
                                        border: 'none',
                                        borderRadius: '10px',
                                        cursor: selectedStyleIndex !== null ? 'pointer' : 'not-allowed',
                                        fontWeight: 'bold',
                                        fontSize: '0.9em',
                                        transition: 'all 0.2s',
                                        boxShadow: selectedStyleIndex !== null ? '0 4px 16px rgba(68,102,255,0.3)' : 'none',
                                    }}
                                >
                                    Next: Interior Layout
                                </button>
                            </>
                        )}
                    </>
                )}

                {/* ═══ PHASE 2: INTERIOR LAYOUT ═══ */}
                {phase === 'layout' && (
                    <>
                        {/* Selected style thumbnail */}
                        {selectedStyleIndex !== null && styleImages.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                <img
                                    src={`data:image/png;base64,${styleImages.find(i => i.index === selectedStyleIndex)?.base64}`}
                                    alt="Selected style"
                                    style={{ width: '80px', height: '52px', objectFit: 'cover', borderRadius: '8px', border: '2px solid rgba(100,136,255,0.4)' }}
                                />
                                <div style={{ fontSize: '0.75em', color: '#8888aa' }}>
                                    Selected exterior style
                                </div>
                            </div>
                        )}

                        {/* Loading skeletons */}
                        {isGeneratingLayouts && layoutImages.length === 0 && (
                            <div style={{ marginBottom: '16px' }}>
                                <div style={{ textAlign: 'center', marginBottom: '12px', color: '#a0b4ff', fontWeight: 'bold', fontSize: '0.85em' }}>
                                    Generating floor plan variants...
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                                    <ImageSkeleton /><ImageSkeleton /><ImageSkeleton /><ImageSkeleton />
                                </div>
                            </div>
                        )}

                        {/* Layout error */}
                        {layoutError && (
                            <div style={{
                                background: 'rgba(255,80,80,0.1)',
                                border: '1px solid rgba(255,80,80,0.3)',
                                borderRadius: '10px',
                                padding: '12px 16px',
                                marginBottom: '16px',
                                color: '#ff8888',
                                fontSize: '0.8em',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                            }}>
                                <span>{layoutError}</span>
                                <button
                                    onClick={() => { setLayoutError(null); handleGenerateLayouts(); }}
                                    style={{ background: 'rgba(255,80,80,0.2)', border: '1px solid rgba(255,80,80,0.4)', color: '#ff8888', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '0.9em', fontWeight: 'bold' }}
                                >
                                    Try Again
                                </button>
                            </div>
                        )}

                        {/* Floor plan grid */}
                        {layoutImages.length > 0 && (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
                                    {layoutImages.map((img) => (
                                        <div
                                            key={img.index}
                                            onClick={() => setSelectedLayoutIndex(img.index)}
                                            style={{
                                                position: 'relative',
                                                borderRadius: '12px',
                                                overflow: 'hidden',
                                                cursor: 'pointer',
                                                border: selectedLayoutIndex === img.index
                                                    ? '3px solid #6488ff'
                                                    : '3px solid transparent',
                                                boxShadow: selectedLayoutIndex === img.index
                                                    ? '0 0 20px rgba(100,136,255,0.3)'
                                                    : '0 2px 8px rgba(0,0,0,0.3)',
                                                transition: 'all 0.3s ease',
                                                transform: selectedLayoutIndex === img.index ? 'scale(1.02)' : 'scale(1)',
                                                aspectRatio: '16/10',
                                            }}
                                        >
                                            <img
                                                src={`data:image/png;base64,${img.base64}`}
                                                alt={`Floor Plan ${img.index + 1}`}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                            />
                                            <div style={{
                                                position: 'absolute',
                                                top: '8px',
                                                left: '8px',
                                                right: '8px',
                                                background: selectedLayoutIndex === img.index
                                                    ? 'rgba(100,136,255,0.9)'
                                                    : 'rgba(0,0,0,0.7)',
                                                color: 'white',
                                                borderRadius: '6px',
                                                padding: '4px 8px',
                                                fontSize: '0.6em',
                                                fontWeight: 'bold',
                                                backdropFilter: 'blur(4px)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}>
                                                {selectedLayoutIndex === img.index ? '✓ ' : ''}{LAYOUT_LABELS[img.index] || `Layout ${img.index + 1}`}
                                            </div>
                                            {selectedLayoutIndex === img.index && (
                                                <div style={{ position: 'absolute', inset: 0, background: 'rgba(100,136,255,0.08)', pointerEvents: 'none' }} />
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Layout notes + refine */}
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                    <textarea
                                        value={layoutNotes}
                                        onChange={(e) => setLayoutNotes(e.target.value)}
                                        placeholder="Add layout preferences... e.g. 'put the kitchen next to the garden' or 'I need a home office'"
                                        rows={2}
                                        disabled={isGeneratingLayouts}
                                        style={{
                                            flex: 1,
                                            background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(100,130,255,0.2)',
                                            borderRadius: '10px',
                                            color: '#e0e0ff',
                                            padding: '10px 14px',
                                            fontSize: '0.82em',
                                            resize: 'none',
                                            outline: 'none',
                                            fontFamily: 'inherit',
                                        }}
                                    />
                                    <button
                                        onClick={() => handleGenerateLayouts()}
                                        disabled={isGeneratingLayouts}
                                        style={{
                                            padding: '10px 16px',
                                            background: 'rgba(100,136,255,0.2)',
                                            border: '1px solid rgba(100,136,255,0.3)',
                                            borderRadius: '10px',
                                            color: '#a0b4ff',
                                            cursor: isGeneratingLayouts ? 'not-allowed' : 'pointer',
                                            fontWeight: 'bold',
                                            fontSize: '0.8em',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {isGeneratingLayouts ? 'Generating...' : 'Regenerate'}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* Bottom buttons */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                onClick={handleBackToStyle}
                                disabled={isGeneratingLayouts}
                                style={{
                                    padding: '12px 20px',
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid rgba(100,130,255,0.2)',
                                    borderRadius: '10px',
                                    color: '#a0b4ff',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                    fontSize: '0.85em',
                                }}
                            >
                                Back
                            </button>
                            <button
                                onClick={handleBuild}
                                disabled={selectedLayoutIndex === null || isGeneratingLayouts || isAIThinking}
                                style={{
                                    flex: 1,
                                    padding: '14px',
                                    background: selectedLayoutIndex !== null
                                        ? 'linear-gradient(135deg, #22aa44, #33cc55)'
                                        : 'rgba(100,100,120,0.3)',
                                    color: selectedLayoutIndex !== null ? 'white' : '#666',
                                    border: 'none',
                                    borderRadius: '10px',
                                    cursor: selectedLayoutIndex !== null ? 'pointer' : 'not-allowed',
                                    fontWeight: 'bold',
                                    fontSize: '0.95em',
                                    transition: 'all 0.2s',
                                    boxShadow: selectedLayoutIndex !== null ? '0 4px 16px rgba(34,170,68,0.3)' : 'none',
                                }}
                            >
                                Build This House
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Global animations */}
            <style>{`
                @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(350%); }
                }
            `}</style>
        </div>
    );
}
