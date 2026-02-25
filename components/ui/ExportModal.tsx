/**
 * =============================================================================
 * COMPONENTS/UI/EXPORT-MODAL.TSX — Export Settings & Trigger
 * =============================================================================
 * 
 * Allows users to select export formats (PDF, SVG, HTML) and
 * triggers the plan generator logic.
 * =============================================================================
 */

'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useDesignStore } from '@/store/useDesignStore';
import { generateFloorPlanSVG, generateProjectExportHTML, generateMaterialScheduleHTML } from '@/lib/export/plan-generator';
import { calculateProjectCost } from '@/lib/psg/cost-calculator';
import materialsDatabase from '@/data/materials.json';
import type { ExportFormat, Material } from '@/types';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const EXPORT_OPTIONS: { id: ExportFormat; title: string; desc: string; icon: string }[] = [
    { id: 'floor_plans', title: 'Floor Plans', desc: 'Scaled architectural SVG drawings', icon: '📐' },
    { id: 'material_list', title: 'Bill of Quantities', desc: 'Full material schedule with costs (HTML)', icon: '📝' },
    { id: 'electrical', title: 'Electrical Layout', desc: 'Wiring and device placement plans', icon: '⚡' },
    { id: 'plumbing', title: 'Plumbing Layout', desc: 'Pipe routing and fixture locations', icon: '🚿' },
];

export default function ExportModal({ isOpen, onClose }: ExportModalProps) {
    const [selected, setSelected] = useState<ExportFormat>('floor_plans');
    const [isExporting, setIsExporting] = useState(false);
    const [mounted, setMounted] = useState(false);
    const project = useDesignStore((s) => s.project);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!isOpen || !mounted) return null;

    const handleExport = async () => {
        setIsExporting(true);
        try {
            if (selected === 'floor_plans') {
                const html = generateProjectExportHTML(project);
                downloadFile(html, `${project.name.replace(/\s/g, '_')}_Plans_Elevations.html`, 'text/html');
            } else if (selected === 'material_list') {
                const { items } = calculateProjectCost(project, materialsDatabase as Record<string, Material>);
                const html = generateMaterialScheduleHTML(items, project.budget.currency);
                downloadFile(html, `${project.name.replace(/\s/g, '_')}_Schedule.html`, 'text/html');
            } else if (selected === 'electrical') {
                const svg = generateFloorPlanSVG(project, 0, { plan_type: 'electrical', title: 'Electrical Layout' });
                downloadFile(svg, `${project.name.replace(/\s/g, '_')}_Electrical_Plan.svg`, 'image/svg+xml');
            } else if (selected === 'plumbing') {
                const svg = generateFloorPlanSVG(project, 0, { plan_type: 'plumbing', title: 'Plumbing Layout' });
                downloadFile(svg, `${project.name.replace(/\s/g, '_')}_Plumbing_Plan.svg`, 'image/svg+xml');
            } else {
                alert(`Export for ${selected} is coming in Phase 4!`);
            }
            // onClose();
        } catch (err) {
            console.error('Export failed:', err);
            alert('Export failed. Check console for details.');
        } finally {
            setIsExporting(false);
        }
    };

    const downloadFile = (content: string, fileName: string, contentType: string) => {
        const a = document.createElement('a');
        const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    return createPortal(
        <div className="export-modal-overlay" onClick={onClose}>
            <div className="export-modal" onClick={(e) => e.stopPropagation()}>
                <div className="chat-message-header">
                    <h3 className="panel-title">Export Project</h3>
                    <button onClick={onClose} style={{ fontSize: '20px' }}>×</button>
                </div>

                <p className="panel-empty" style={{ padding: '0 0 20px 0', textAlign: 'left' }}>
                    Generate professional architectural documents for your design.
                </p>

                <div className="export-option-list">
                    {EXPORT_OPTIONS.map((opt) => (
                        <div
                            key={opt.id}
                            className={`export-option ${selected === opt.id ? 'active' : ''}`}
                            onClick={() => setSelected(opt.id)}
                        >
                            <div className="export-option-info">
                                <span className="export-option-title">{opt.icon} {opt.title}</span>
                                <span className="export-option-desc">{opt.desc}</span>
                            </div>
                            {selected === opt.id && <span style={{ color: 'var(--accent-primary)' }}>✓</span>}
                        </div>
                    ))}
                </div>

                <button
                    className="export-btn-primary"
                    onClick={handleExport}
                    disabled={isExporting}
                >
                    {isExporting ? '⏳ Generating...' : `Generate ${selected.replace(/_/g, ' ')}`}
                </button>
            </div>
        </div>,
        document.body
    );
}
