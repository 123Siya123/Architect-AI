/**
 * =============================================================================
 * COMPONENTS/UI/TOOLBAR.TSX — Top Toolbar
 * =============================================================================
 *
 * The main toolbar at the top of the design studio. Contains:
 * - View mode buttons (Orbit, Walk-through, Top-down, Section)
 * - Layer toggles (Structure, Electrical, Plumbing, Thermal)
 * - Undo/Redo buttons
 * - Export button
 * - Budget indicator
 *
 * DESIGN: Horizontal bar, dark glassmorphism background, icon buttons
 * with tooltips. Groups are separated by subtle dividers.
 * =============================================================================
 */

'use client';

import React from 'react';
import { useDesignStore } from '@/store/useDesignStore';
import type { ViewMode, ViewLayer } from '@/types';

/** View mode configuration with labels and icons (emoji for now, SVG in Phase 2) */
const VIEW_MODES: { mode: ViewMode; label: string; icon: string }[] = [
    { mode: 'orbit', label: 'Orbit', icon: '🔄' },
    { mode: 'walkthrough', label: 'Walk-through', icon: '🚶' },
    { mode: 'top_down', label: 'Top Down', icon: '🔽' },
    { mode: 'section', label: 'Section', icon: '✂️' },
    { mode: 'front', label: 'Front View', icon: '🏠' },
    { mode: 'landscape', label: 'Landscape', icon: '🌿' },
];

/** Layer toggle configuration */
const LAYERS: { layer: ViewLayer; label: string; icon: string; color: string }[] = [
    { layer: 'structure', label: 'Structure', icon: '🧱', color: '#888' },
    { layer: 'electrical', label: 'Electrical', icon: '⚡', color: '#ffaa00' },
    { layer: 'plumbing', label: 'Plumbing', icon: '🚰', color: '#00cc44' },
    { layer: 'hvac', label: 'HVAC', icon: '❄️', color: '#44aaff' },
    { layer: 'thermal', label: 'Thermal', icon: '🌡️', color: '#ff4444' },
    { layer: 'dimensions', label: 'Dimensions', icon: '📏', color: '#ffffff' },
    { layer: 'grid', label: 'Grid', icon: '⊞', color: '#666' },
];

export function Toolbar() {
    const viewMode = useDesignStore((s) => s.viewMode);
    const visibleLayers = useDesignStore((s) => s.visibleLayers);
    const setViewMode = useDesignStore((s) => s.setViewMode);
    const toggleLayer = useDesignStore((s) => s.toggleLayer);
    const undo = useDesignStore((s) => s.undo);
    const redo = useDesignStore((s) => s.redo);
    const undoStack = useDesignStore((s) => s.undoStack);
    const redoStack = useDesignStore((s) => s.redoStack);
    const setActivePanel = useDesignStore((s) => s.setActivePanel);
    const budget = useDesignStore((s) => s.project.budget);

    const budgetPercent = budget.total_budget > 0
        ? Math.round((budget.spent / budget.total_budget) * 100)
        : 0;

    return (
        <div className="toolbar">
            {/* ── View Mode Group ─────────────────────────────────────── */}
            <div className="toolbar-group">
                <span className="toolbar-label">View</span>
                {VIEW_MODES.map(({ mode, label, icon }) => (
                    <button
                        key={mode}
                        className={`toolbar-btn ${viewMode === mode ? 'active' : ''}`}
                        onClick={() => setViewMode(mode)}
                        title={label}
                    >
                        <span className="toolbar-icon">{icon}</span>
                        <span className="toolbar-text">{label}</span>
                    </button>
                ))}
            </div>

            <div className="toolbar-divider" />

            {/* ── Layer Toggles ───────────────────────────────────────── */}
            <div className="toolbar-group">
                <span className="toolbar-label">Layers</span>
                {LAYERS.map(({ layer, label, icon, color }) => (
                    <button
                        key={layer}
                        className={`toolbar-btn ${visibleLayers.has(layer) ? 'active' : ''}`}
                        onClick={() => toggleLayer(layer)}
                        title={`Toggle ${label}`}
                        style={{
                            borderBottom: visibleLayers.has(layer) ? `2px solid ${color}` : 'none',
                        }}
                    >
                        <span className="toolbar-icon">{icon}</span>
                    </button>
                ))}
            </div>

            <div className="toolbar-divider" />

            {/* ── Undo / Redo ─────────────────────────────────────────── */}
            <div className="toolbar-group">
                <button
                    className="toolbar-btn"
                    onClick={undo}
                    disabled={undoStack.length === 0}
                    title="Undo (Ctrl+Z)"
                >
                    ↩️ Undo
                </button>
                <button
                    className="toolbar-btn"
                    onClick={redo}
                    disabled={redoStack.length === 0}
                    title="Redo (Ctrl+Y)"
                >
                    ↪️ Redo
                </button>
            </div>

            <div className="toolbar-spacer" />

            {/* ── Budget Indicator ────────────────────────────────────── */}
            <div className="toolbar-group budget-indicator">
                <div className="budget-bar-container">
                    <div
                        className="budget-bar-fill"
                        style={{
                            width: `${Math.min(budgetPercent, 100)}%`,
                            backgroundColor: budgetPercent > 90 ? '#ff4444' : budgetPercent > 70 ? '#ffaa00' : '#00cc44',
                        }}
                    />
                </div>
                <span className="budget-text">
                    {budget.currency} {budget.spent.toLocaleString()} / {budget.total_budget.toLocaleString()} ({budgetPercent}%)
                </span>
            </div>

            {/* ── Export Button ───────────────────────────────────────── */}
            <button
                className="toolbar-btn export-btn"
                onClick={() => setActivePanel('export')}
                title="Export Plans"
            >
                📄 Export
            </button>
        </div>
    );
}
