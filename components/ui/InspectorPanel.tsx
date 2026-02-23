/**
 * =============================================================================
 * COMPONENTS/UI/INSPECTOR-PANEL.TSX — Node Property Inspector
 * =============================================================================
 *
 * When a 3D node is selected, this panel shows its properties and
 * provides sliders/inputs for precise editing. This is the "direct
 * manipulation" alternative to AI chat — users can adjust dimensions,
 * position, rotation, and material without talking to the AI.
 *
 * SECTIONS:
 * 1. Node identity (name, type, ID)
 * 2. Position sliders (X, Y, Z in meters)
 * 3. Dimension sliders (width, height, depth)
 * 4. Rotation sliders (yaw, pitch, roll)
 * 5. Material selector dropdown
 * 6. Tags (load_bearing, exterior, etc.)
 * 7. Cost display (volume × density × price)
 *
 * SLIDER DESIGN:
 * Each slider shows: [label] [---●---] [value + unit]
 * The slider range is determined by the node type's constraints.
 * Changes are applied INSTANTLY (on every drag tick) for real-time
 * visual feedback in the 3D viewport.
 * =============================================================================
 */

'use client';

import React from 'react';
import { useDesignStore } from '@/store/useDesignStore';
import { SliderControl } from './SliderControl';

export function InspectorPanel() {
    const selectedId = useDesignStore((s) => s.selection.selected_node_id);
    const getNode = useDesignStore((s) => s.getNode);
    const applyOp = useDesignStore((s) => s.applyOp);

    if (!selectedId) {
        return (
            <div className="panel inspector-panel">
                <h3 className="panel-title">Inspector</h3>
                <p className="panel-empty">Click on an element in the 3D view to inspect and edit it.</p>
            </div>
        );
    }

    const node = getNode(selectedId);
    if (!node) return null;

    /** Handles slider changes by creating a PSG operation */
    const handleMove = (axis: 'x' | 'y' | 'z', value: number) => {
        const delta = { delta_x: 0, delta_y: 0, delta_z: 0 };
        delta[`delta_${axis}`] = value - node.position[axis];
        applyOp({
            type: 'move_node',
            target_id: node.id,
            params: delta,
            timestamp: new Date().toISOString(),
        });
    };

    const handleResize = (dim: 'width' | 'height' | 'depth', value: number) => {
        applyOp({
            type: 'resize_node',
            target_id: node.id,
            params: { [dim]: value },
            timestamp: new Date().toISOString(),
        });
    };

    return (
        <div className="panel inspector-panel">
            <h3 className="panel-title">Inspector</h3>

            {/* ── Identity ──────────────────────────────────────────── */}
            <div className="inspector-section">
                <div className="inspector-field">
                    <label>Name</label>
                    <span className="field-value">{node.name}</span>
                </div>
                <div className="inspector-field">
                    <label>Type</label>
                    <span className="field-value badge">{node.type}</span>
                </div>
                <div className="inspector-field">
                    <label>ID</label>
                    <span className="field-value mono">{node.id}</span>
                </div>
            </div>

            {/* ── Position ──────────────────────────────────────────── */}
            <div className="inspector-section">
                <h4>Position (meters)</h4>
                <SliderControl label="X" value={node.position.x} min={-50} max={50} step={0.1} unit="m" onChange={(v) => handleMove('x', v)} />
                <SliderControl label="Y" value={node.position.y} min={-5} max={20} step={0.1} unit="m" onChange={(v) => handleMove('y', v)} />
                <SliderControl label="Z" value={node.position.z} min={-50} max={50} step={0.1} unit="m" onChange={(v) => handleMove('z', v)} />
            </div>

            {/* ── Dimensions ────────────────────────────────────────── */}
            <div className="inspector-section">
                <h4>Dimensions (meters)</h4>
                <SliderControl label="Width" value={node.dimensions.x} min={0.1} max={20} step={0.05} unit="m" onChange={(v) => handleResize('width', v)} />
                <SliderControl label="Height" value={node.dimensions.y} min={0.1} max={10} step={0.05} unit="m" onChange={(v) => handleResize('height', v)} />
                <SliderControl label="Depth" value={node.dimensions.z} min={0.05} max={10} step={0.01} unit="m" onChange={(v) => handleResize('depth', v)} />
            </div>

            {/* ── Material ──────────────────────────────────────────── */}
            <div className="inspector-section">
                <h4>Material</h4>
                <div className="inspector-field">
                    <label>Current</label>
                    <span className="field-value">{node.material_id || 'None'}</span>
                </div>
                {/* TODO (Phase 3): Material picker dropdown */}
            </div>

            {/* ── Tags ──────────────────────────────────────────────── */}
            <div className="inspector-section">
                <h4>Tags</h4>
                <div className="tag-list">
                    {node.tags.map((tag) => (
                        <span key={tag} className="tag">{tag}</span>
                    ))}
                    {node.tags.length === 0 && <span className="tag-empty">No tags</span>}
                </div>
            </div>
        </div>
    );
}
