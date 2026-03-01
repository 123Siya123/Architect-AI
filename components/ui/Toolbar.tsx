/**
 * =============================================================================
 * COMPONENTS/UI/TOOLBAR.TSX — Design Studio Top Toolbar
 * =============================================================================
 *
 * Controls: View mode, layer toggles, undo/redo, budget, export.
 * Sits at the top of the design studio page.
 * =============================================================================
 */

'use client';

import React from 'react';
import { useDesignStore } from '@/store/useDesignStore';
import type { ViewMode, ViewLayer } from '@/types';

// =============================================================================
// VIEW MODE BUTTONS
// =============================================================================

const VIEW_MODES: { mode: ViewMode; label: string; icon: string }[] = [
    { mode: 'orbit', label: 'Orbit', icon: '🌐' },
    { mode: 'walkthrough', label: 'Walk', icon: '🚶' },
    { mode: 'top_down', label: 'Plan', icon: '📐' },
    { mode: 'front', label: 'Front', icon: '🏠' },
];

const LAYERS: { layer: ViewLayer; label: string; icon: string; color: string }[] = [
    { layer: 'structure', label: 'Structure', icon: '🧱', color: '#aaa' },
    { layer: 'electrical', label: 'Electrical', icon: '⚡', color: '#ffaa00' },
    { layer: 'plumbing', label: 'Plumbing', icon: '🚿', color: '#00cc44' },
    { layer: 'hvac', label: 'HVAC', icon: '❄️', color: '#44aaff' },
    { layer: 'thermal', label: 'Thermal', icon: '🌡️', color: '#ff4444' },
    { layer: 'dimensions', label: 'Dims', icon: '📏', color: '#ffffff' },
    { layer: 'grid', label: 'Grid', icon: '📊', color: '#6666aa' },
];

export default function Toolbar() {
    const viewMode = useDesignStore((s) => s.viewMode);
    const setViewMode = useDesignStore((s) => s.setViewMode);
    const visibleLayers = useDesignStore((s) => s.visibleLayers);
    const toggleLayer = useDesignStore((s) => s.toggleLayer);
    const undo = useDesignStore((s) => s.undo);
    const redo = useDesignStore((s) => s.redo);
    const undoStack = useDesignStore((s) => s.undoStack);
    const redoStack = useDesignStore((s) => s.redoStack);
    const project = useDesignStore((s) => s.project);

    const budgetPercent = project.budget.total_budget > 0
        ? Math.round((project.budget.spent / project.budget.total_budget) * 100)
        : 0;

    return (
        <div className="toolbar">
            {/* View Mode Selector */}
            <div className="toolbar-group">
                <span className="toolbar-label">View</span>
                <div className="toolbar-buttons">
                    {VIEW_MODES.map(({ mode, label, icon }) => (
                        <button
                            key={mode}
                            className={`toolbar-btn ${viewMode === mode ? 'active' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setViewMode(mode);
                            }}
                            title={label}
                        >
                            <span className="toolbar-btn-icon">{icon}</span>
                            <span className="toolbar-btn-label">{label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Separator */}
            <div className="toolbar-separator" />

            {/* Layer Toggles */}
            <div className="toolbar-group">
                <span className="toolbar-label">Layers</span>
                <div className="toolbar-buttons">
                    {LAYERS.map(({ layer, label, icon, color }) => (
                        <button
                            key={layer}
                            className={`toolbar-btn layer-btn ${visibleLayers.has(layer) ? 'active' : ''}`}
                            onClick={() => toggleLayer(layer)}
                            title={label}
                            style={{
                                borderBottomColor: visibleLayers.has(layer) ? color : 'transparent',
                            }}
                        >
                            <span className="toolbar-btn-icon">{icon}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Separator */}
            <div className="toolbar-separator" />

            {/* Undo/Redo */}
            <div className="toolbar-group">
                <button
                    className="toolbar-btn"
                    onClick={undo}
                    disabled={undoStack.length === 0}
                    title="Undo (Ctrl+Z)"
                >
                    ↩ Undo
                </button>
                <button
                    className="toolbar-btn"
                    onClick={redo}
                    disabled={redoStack.length === 0}
                    title="Redo (Ctrl+Y)"
                >
                    ↪ Redo
                </button>
            </div>

            {/* Separator */}
            <div className="toolbar-separator" />

            {/* Separator */}
            <div className="toolbar-separator" />

            {/* Floor Selector — only in Plan (top_down) mode */}
            {viewMode === 'top_down' && (
                <>
                    <div className="toolbar-group">
                        <span className="toolbar-label">Floor Plan</span>
                        <FloorSelector />
                    </div>
                    <div className="toolbar-separator" />
                </>
            )}

            {/* Budget Display */}
            <div className="toolbar-group budget-group">
                <span className="toolbar-label">Budget</span>
                <div className="budget-bar-container">
                    <div
                        className="budget-bar-fill"
                        style={{
                            width: `${Math.min(budgetPercent, 100)}%`,
                            backgroundColor: budgetPercent > 90 ? '#ff4444' : budgetPercent > 70 ? '#ffaa00' : '#00cc88',
                        }}
                    />
                </div>
                <span className="budget-text">
                    {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: project.budget.currency || 'EUR',
                        maximumFractionDigits: 0,
                    }).format(project.budget.spent)}
                </span>
            </div>

            {/* Separator */}
            <div className="toolbar-separator" />

            {/* Export Action */}
            <div className="toolbar-group">
                <SaveButton />
                <ImageTo3DButton />
                <ExportButton />
            </div>
        </div>
    );
}

function SaveButton() {
    const saveToServer = useDesignStore((s) => s.saveToServer);
    const isLoading = useDesignStore((s) => s.isLoading);
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        await saveToServer();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <button
            className={`toolbar-btn save-btn ${saved ? 'saved' : ''}`}
            onClick={handleSave}
            disabled={isLoading}
        >
            {isLoading ? '⌛ Saving...' : saved ? '✅ Saved' : '💾 Save to Cloud'}
        </button>
    );
}

function FloorSelector() {
    const project = useDesignStore((s) => s.project);
    const activeFloorId = useDesignStore((s) => s.activeFloorId);
    const setActiveFloorId = useDesignStore((s) => s.setActiveFloorId);

    const floors = Object.values(project.nodes)
        .filter((n) => n.type === 'Floor')
        .sort((a, b) => a.position.y - b.position.y);

    return (
        <div className="toolbar-buttons">
            <button
                className={`toolbar-btn ${activeFloorId === null ? 'active' : ''}`}
                onClick={() => setActiveFloorId(null)}
                title="All Floors"
            >
                🏠 All
            </button>
            {floors.map((floor) => (
                <button
                    key={floor.id}
                    className={`toolbar-btn ${activeFloorId === floor.id ? 'active' : ''}`}
                    onClick={() => setActiveFloorId(floor.id)}
                    title={floor.name}
                >
                    {floor.name}
                </button>
            ))}
        </div>
    );
}

import ExportModal from './ExportModal';
import ImageTo3DModal from './ImageTo3DModal';
import { useState } from 'react';

function ExportButton() {
    const [isExportOpen, setIsExportOpen] = useState(false);

    return (
        <>
            <button
                className="toolbar-btn export-btn"
                onClick={() => setIsExportOpen(true)}
            >
                📥 Export Plans
            </button>
            <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />
        </>
    );
}

function ImageTo3DButton() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                className="toolbar-btn export-btn"
                onClick={() => setIsOpen(true)}
                style={{ background: 'var(--accent-secondary)' }}
            >
                📸 Photo to 3D
            </button>
            <ImageTo3DModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
}
