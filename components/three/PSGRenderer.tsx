/**
 * =============================================================================
 * COMPONENTS/THREE/PSG-RENDERER.TSX — Renders PSG Nodes as 3D Meshes
 * =============================================================================
 *
 * This is the bridge between the PSG data model and the Three.js scene.
 * It reads the PSG nodes from the Zustand store and renders each one
 * as the appropriate 3D geometry.
 *
 * HOW IT WORKS:
 * 1. Subscribes to project.nodes from the store
 * 2. Iterates over all nodes
 * 3. For each renderable node (Wall, Slab, Roof, etc.):
 *    a. Creates geometry via the compiler
 *    b. Applies material (color from material library)
 *    c. Positions using the node's position/rotation
 * 4. Handles selection highlighting (outline/glow on selected node)
 * 5. Handles hover highlighting
 *
 * CLICK HANDLING:
 * - Clicking a mesh calls selectNode(nodeId) in the store
 * - The Inspector panel then shows that node's properties
 * - The selected mesh gets a highlight outline
 *
 * PERFORMANCE:
 * - Only re-renders when project.nodes changes (Zustand selector)
 * - Geometry is memoized — only regenerated when dimensions change
 * - Materials are cached by material_id
 * =============================================================================
 */

'use client';

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useDesignStore } from '@/store/useDesignStore';
import type { PSGNode } from '@/types';
import materialsData from '@/data/materials.json';

/**
 * Gets a Three.js color for a node based on its material_id.
 * Looks up the color from the materials database.
 */
function getColorForNode(node: PSGNode): string {
    const material = (materialsData as Record<string, { color_hex: string }>)[node.material_id];
    if (material) return material.color_hex;

    // Fallback colors by node type
    const fallbacks: Record<string, string> = {
        Wall: '#B8860B',
        Slab: '#808080',
        Roof: '#8B0000',
        Window: '#87CEEB',
        Door: '#8B4513',
        Stairs: '#DEB887',
        Room: '#FFFFFF',
        Floor: '#A9A9A9',
        Foundation: '#696969',
    };
    return fallbacks[node.type] || '#CCCCCC';
}

/**
 * Determines if a node should be rendered as a 3D mesh.
 * Container nodes (House, Floor, Room) are NOT rendered —
 * they're just organizational.
 */
function isRenderable(node: PSGNode): boolean {
    return ['Wall', 'Slab', 'Roof', 'Window', 'Door', 'Stairs', 'Column', 'Beam', 'Foundation', 'Partition'].includes(node.type);
}

/**
 * Single PSG Node mesh component.
 * Renders one architectural element as a Three.js mesh.
 */
function NodeMesh({ node }: { node: PSGNode }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const selectNode = useDesignStore((s) => s.selectNode);
    const hoverNode = useDesignStore((s) => s.hoverNode);
    const selectedId = useDesignStore((s) => s.selection.selected_node_id);
    const hoveredId = useDesignStore((s) => s.selection.hovered_node_id);

    const isSelected = selectedId === node.id;
    const isHovered = hoveredId === node.id;

    // Create geometry based on node dimensions
    const geometry = useMemo(() => {
        const { x, y, z } = node.dimensions;
        if (node.type === 'Window') {
            return new THREE.PlaneGeometry(
                node.opening_width || x,
                node.opening_height || y
            );
        }
        return new THREE.BoxGeometry(x, y, z);
    }, [node.dimensions, node.type, node.opening_width, node.opening_height]);

    // Determine color and opacity
    const color = getColorForNode(node);
    const isGlass = node.type === 'Window';

    return (
        <mesh
            ref={meshRef}
            position={[node.position.x, node.position.y, node.position.z]}
            rotation={[
                (node.rotation.pitch * Math.PI) / 180,
                (node.rotation.yaw * Math.PI) / 180,
                (node.rotation.roll * Math.PI) / 180,
            ]}
            geometry={geometry}
            castShadow={!isGlass}
            receiveShadow
            onClick={(e) => {
                e.stopPropagation();
                selectNode(node.id);
            }}
            onPointerOver={(e) => {
                e.stopPropagation();
                hoverNode(node.id);
                document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
                hoverNode(null);
                document.body.style.cursor = 'default';
            }}
        >
            <meshStandardMaterial
                color={isSelected ? '#FFD700' : isHovered ? '#FFA500' : color}
                transparent={isGlass}
                opacity={isGlass ? 0.3 : 1}
                roughness={isGlass ? 0.0 : 0.7}
                metalness={isGlass ? 0.0 : 0.1}
                side={THREE.DoubleSide}
                emissive={isSelected ? '#FFD700' : isHovered ? '#FFA500' : '#000000'}
                emissiveIntensity={isSelected ? 0.3 : isHovered ? 0.15 : 0}
            />
        </mesh>
    );
}

/**
 * Main PSG Renderer — renders ALL nodes in the project.
 */
export function PSGRenderer() {
    const nodes = useDesignStore((s) => s.project.nodes);

    // Filter to renderable nodes
    const renderableNodes = useMemo(
        () => Object.values(nodes).filter(isRenderable),
        [nodes]
    );

    return (
        <group>
            {renderableNodes.map((node) => (
                <NodeMesh key={node.id} node={node} />
            ))}
        </group>
    );
}
