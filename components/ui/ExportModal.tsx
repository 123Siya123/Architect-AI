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
import { generateConstructionDocuments } from '@/lib/export/construction-documents';
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
    { id: 'construction_documents', title: 'Construction Documents', desc: 'Complete CD set for permits & construction', icon: '🏗️' },
    { id: 'door_window_schedule', title: 'Door/Window Schedule', desc: 'Detailed door and window specifications', icon: '🚪' },
    { id: 'finish_schedule', title: 'Finish Schedule', desc: 'Room-by-room finish specifications', icon: '🎨' },
    { id: 'technical_specifications', title: 'Technical Specs', desc: 'Material specifications and standards', icon: '📋' },
    { id: 'code_compliance', title: 'Code Compliance', desc: 'Building code compliance documentation', icon: '⚖️' },
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
            } else if (selected === 'construction_documents') {
                const documents = generateConstructionDocuments(project);
                
                // Create a comprehensive HTML document with all construction documents
                const comprehensiveHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Construction Documents - ${project.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .document-section { margin: 30px 0; border: 1px solid #ddd; padding: 20px; border-radius: 8px; }
        .document-title { color: #1e3a8a; font-size: 18px; font-weight: bold; margin-bottom: 15px; }
        .svg-container { text-align: center; margin: 20px 0; }
        .svg-container svg { max-width: 100%; height: auto; border: 1px solid #ccc; }
        @media print { body { background: white; } .container { box-shadow: none; } }
    </style>
</head>
<body>
    <div class="container">
        <h1>Construction Documents - ${project.name}</h1>
        <p><strong>Project:</strong> ${project.name} | <strong>Date:</strong> ${new Date().toISOString().slice(0, 10)} | <strong>Revision:</strong> A</p>
        
        <div class="document-section">
            <div class="document-title">A1.0 - Title Sheet</div>
            <div class="svg-container">${documents.titleSheet}</div>
        </div>
        
        <div class="document-section">
            <div class="document-title">A2.0 - Site Plan</div>
            <div class="svg-container">${documents.sitePlan}</div>
        </div>
        
        ${documents.floorPlans.map((plan, index) => `
            <div class="document-section">
                <div class="document-title">A3.${index + 1} - ${index === 0 ? 'Ground Floor Plan' : `Level ${index} Plan`}</div>
                <div class="svg-container">${plan}</div>
            </div>
        `).join('')}
        
        <div class="document-section">
            <div class="document-title">A4.0 - Roof Plan</div>
            <div class="svg-container">${documents.roofPlan}</div>
        </div>
        
        ${documents.elevations.map((elevation, index) => `
            <div class="document-section">
                <div class="document-title">A5.${index + 1} - ${['North', 'South', 'East', 'West'][index]} Elevation</div>
                <div class="svg-container">${elevation}</div>
            </div>
        `).join('')}
        
        ${documents.buildingSections.map((section, index) => `
            <div class="document-section">
                <div class="document-title">A6.${index} - Building Section</div>
                <div class="svg-container">${section}</div>
            </div>
        `).join('')}
        
        ${documents.wallSections.map((section, index) => `
            <div class="document-section">
                <div class="document-title">A7.${index} - Wall Section</div>
                <div class="svg-container">${section}</div>
            </div>
        `).join('')}
        
        ${documents.detailSheets.map((detail, index) => `
            <div class="document-section">
                <div class="document-title">A8.${index} - Detail Sheet</div>
                <div class="svg-container">${detail}</div>
            </div>
        `).join('')}
        
        <div class="document-section">
            <div class="document-title">A9.0 - Door and Window Schedule</div>
            ${documents.doorWindowSchedule}
        </div>
        
        <div class="document-section">
            <div class="document-title">A9.1 - Finish Schedule</div>
            ${documents.finishSchedule}
        </div>
        
        <div class="document-section">
            <div class="document-title">Technical Specifications</div>
            ${documents.technicalSpecifications}
        </div>
        
        <div class="document-section">
            <div class="document-title">Code Compliance Documentation</div>
            ${documents.codeCompliance}
        </div>
    </div>
</body>
</html>`;
                
                downloadFile(comprehensiveHTML, `${project.name.replace(/\s/g, '_')}_Construction_Documents.html`, 'text/html');
            } else if (selected === 'door_window_schedule') {
                downloadFile(documents.doorWindowSchedule, `${project.name.replace(/\s/g, '_')}_Door_Window_Schedule.html`, 'text/html');
            } else if (selected === 'finish_schedule') {
                downloadFile(documents.finishSchedule, `${project.name.replace(/\s/g, '_')}_Finish_Schedule.html`, 'text/html');
            } else if (selected === 'technical_specifications') {
                downloadFile(documents.technicalSpecifications, `${project.name.replace(/\s/g, '_')}_Technical_Specifications.html`, 'text/html');
            } else if (selected === 'code_compliance') {
                downloadFile(documents.codeCompliance, `${project.name.replace(/\s/g, '_')}_Code_Compliance.html`, 'text/html');
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
