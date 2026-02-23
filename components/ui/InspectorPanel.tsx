/**
 * =============================================================================
 * COMPONENTS/UI/INSPECTOR-PANEL.TSX — Node Property Editor
 * =============================================================================
 *
 * Displays when a node is selected. Shows:
 * - Node name, type, ID
 * - Position (X, Y, Z) with sliders
 * - Dimensions (width, height, depth) with sliders
 * - Rotation (yaw, pitch, roll)
 * - Material selector
 * - Structural tags
 * =============================================================================
 */

'use client';

import React, { useCallback } from 'react';
import { useDesignStore } from '@/store/useDesignStore';
import SliderControl from './SliderControl';
import type { PSGOperation } from '@/types';
import materialsDatabase from '@/data/materials.json';
import type { Material } from '@/types';

const materials = materialsDatabase as Record<string, Material>;

export default function InspectorPanel() {
    const project = useDesignStore((s) => s.project);
    const selection = useDesignStore((s) => s.selection);
    const applyOp = useDesignStore((s) => s.applyOp);

    const selectedNode = selection.selected_node_id
        ? project.nodes[selection.selected_node_id]
        : null;

    const handleMove = useCallback((axis: 'x' | 'y' | 'z', value: number) => {
        if (!selectedNode) return;
        const current = selectedNode.position[axis];
        const delta = value - current;
        if (Math.abs(delta) < 0.001) return;

        const op: PSGOperation = {
            type: 'move_node',
            target_id: selectedNode.id,
            params: {
                [`delta_${axis}`]: delta,
            },
            timestamp: new Date().toISOString(),
        };
        applyOp(op);
    }, [selectedNode, applyOp]);

    const handleResize = useCallback((dim: 'width' | 'height' | 'depth', value: number) => {
        if (!selectedNode) return;
        const op: PSGOperation = {
            type: 'resize_node',
            target_id: selectedNode.id,
            params: { [dim]: value },
            timestamp: new Date().toISOString(),
        };
        applyOp(op);
    }, [selectedNode, applyOp]);

    const handleMaterialChange = useCallback((materialId: string) => {
        if (!selectedNode) return;
        const op: PSGOperation = {
            type: 'replace_material',
            target_id: selectedNode.id,
            params: { material_id: materialId },
            timestamp: new Date().toISOString(),
        };
        applyOp(op);
    }, [selectedNode, applyOp]);

    if (!selectedNode) {
        return (
            <div className="inspector-panel">
                <div className="inspector-empty">
                    <p className="inspector-empty-icon">🏠</p>
                    <p>Click on an element in the 3D view to inspect and edit it.</p>
                </div>
            </div>
        );
    }

    const mat = materials[selectedNode.material_id];

    return (
        <div className="inspector-panel">
            {/* Header */}
            <div className="inspector-header">
                <h3 className="inspector-title">{selectedNode.name}</h3>
                <span className="inspector-type-badge">{selectedNode.type}</span>
            </div>
            <p className="inspector-id">ID: {selectedNode.id}</p>

            {/* Tags */}
            {selectedNode.tags.length > 0 && (
                <div className="inspector-tags">
                    {selectedNode.tags.map((tag) => (
                        <span key={tag} className="inspector-tag">{tag.replace(/_/g, ' ')}</span>
                    ))}
                </div>
            )}

            {/* Position */}
            <div className="inspector-section">
                <h4 className="inspector-section-title">Position (m)</h4>
                <SliderControl
                    label="X (East-West)"
                    value={selectedNode.position.x}
                    min={-30}
                    max={30}
                    step={0.1}
                    onChange={(v) => handleMove('x', v)}
                />
                <SliderControl
                    label="Y (Up-Down)"
                    value={selectedNode.position.y}
                    min={-2}
                    max={15}
                    step={0.1}
                    onChange={(v) => handleMove('y', v)}
                />
                <SliderControl
                    label="Z (North-South)"
                    value={selectedNode.position.z}
                    min={-30}
                    max={30}
                    step={0.1}
                    onChange={(v) => handleMove('z', v)}
                />
            </div>

            {/* Dimensions */}
            <div className="inspector-section">
                <h4 className="inspector-section-title">Dimensions (m)</h4>
                <SliderControl
                    label="Width"
                    value={selectedNode.dimensions.x}
                    min={0.1}
                    max={20}
                    step={0.1}
                    onChange={(v) => handleResize('width', v)}
                />
                <SliderControl
                    label="Height"
                    value={selectedNode.dimensions.y}
                    min={0.1}
                    max={10}
                    step={0.1}
                    onChange={(v) => handleResize('height', v)}
                />
                <SliderControl
                    label="Depth"
                    value={selectedNode.dimensions.z}
                    min={0.01}
                    max={20}
                    step={0.01}
                    onChange={(v) => handleResize('depth', v)}
                />
            </div>

            {/* Material */}
            <div className="inspector-section">
                <h4 className="inspector-section-title">Material</h4>
                <select
                    className="inspector-material-select"
                    value={selectedNode.material_id}
                    onChange={(e) => handleMaterialChange(e.target.value)}
                >
                    {Object.values(materials).map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.name} — €{m.price_per_m3}/m³
                        </option>
                    ))}
                </select>
                {mat && (
                    <div className="inspector-material-info">
                        <div
                            className="inspector-material-swatch"
                            style={{ backgroundColor: mat.color_hex }}
                        />
                        <div>
                            <p className="inspector-material-name">{mat.name}</p>
                            <p className="inspector-material-props">
                                {mat.category} · {mat.fire_rating} · {mat.density_kg_m3} kg/m³
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
