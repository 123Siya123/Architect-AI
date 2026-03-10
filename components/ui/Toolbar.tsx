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

import Link from 'next/link';

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
    const setTotalBudget = useDesignStore((s) => s.setTotalBudget);

    const handleBudgetClick = () => {
        const currentTotal = project.budget.total_budget;
        const newBudgetStr = window.prompt(`Enter new total budget (${project.budget.currency || 'EUR'}):`, String(currentTotal));

        if (newBudgetStr !== null) {
            const parsed = parseFloat(newBudgetStr);
            if (!isNaN(parsed) && parsed > 0) {
                setTotalBudget(parsed);
            }
        }
    };

    const budgetPercent = project.budget.total_budget > 0
        ? Math.round((project.budget.spent / project.budget.total_budget) * 100)
        : 0;

    return (
        <div className="toolbar">
            {/* Logo/Home */}
            <div className="toolbar-logo-group">
                <Link href="/" className="toolbar-logo" title="Back to Dashboard">
                    🏠
                </Link>
                <div className="toolbar-separator" />
            </div>

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
                            aria-label={`Toggle ${label} layer`}
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
            <div
                className="toolbar-group budget-group"
                onClick={handleBudgetClick}
                style={{ cursor: 'pointer' }}
                title={`Total Budget: ${project.budget.total_budget}. Click to change.`}
            >
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
                    {' / '}
                    {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: project.budget.currency || 'EUR',
                        maximumFractionDigits: 0,
                    }).format(project.budget.total_budget)}
                </span>
            </div>

            {/* Separator */}
            <div className="toolbar-separator" />

            {/* Export Action */}
            <div className="toolbar-group">
                <SpecificationsButton />
                <SaveButton />
                <ImageTo3DButton />
                <ExportButton />
            </div>
        </div>
    );
}

function SaveButton() {
    const saveProject = useDesignStore((s) => s.saveProject);
    const isLoading = useDesignStore((s) => s.isLoading);
    const isDirty = useDesignStore((s) => s.isDirty);
    const lastSaved = useDesignStore((s) => s.lastSaved);
    const [justSaved, setJustSaved] = useState(false);

    const handleSave = async () => {
        await saveProject(); // Manual save = create revision
        setJustSaved(true);
        setTimeout(() => setJustSaved(false), 2000);
    };

    // Determine button state
    // - Loading: "Saving..."
    // - Just saved (manual): "✅ Saved"
    // - Dirty: "💾 Save*" (active)
    // - Clean: "☁️ Saved" (inactive/dimmed)

    return (
        <button
            className={`toolbar-btn save-btn ${isDirty ? 'dirty' : ''} ${justSaved ? 'saved' : ''}`}
            onClick={handleSave}
            disabled={isLoading}
            title={lastSaved ? `Last saved: ${new Date(lastSaved).toLocaleTimeString()}` : 'Save project'}
        >
            {isLoading
                ? '⌛ Saving...'
                : justSaved
                    ? '✅ Saved'
                    : isDirty
                        ? '💾 Save*'
                        : '☁️ Saved'}
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
import SpecificationsModal from './SpecificationsModal';
import { useState } from 'react';

function SpecificationsButton() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                className="toolbar-btn export-btn"
                onClick={() => setIsOpen(true)}
            >
                📋 Specifications
            </button>
            <SpecificationsModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
}

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
