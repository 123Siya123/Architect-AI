/**
 * =============================================================================
 * COMPONENTS/THREE/PSG-RENDERER.TSX — Renders PSG Nodes as 3D Meshes
 * =============================================================================
 *
 * Iterates over all nodes in the PSGProject and renders each as a
 * Three.js mesh with the correct geometry, material, position, and
 * rotation. Handles selection highlighting and hover outlines.
 *
 * RENDERING STRATEGY:
 * - Skip House/Floor/Room nodes (containers only — no geometry)
 * - Render Walls, Windows, Doors, Roof, Stairs, Slabs, etc.
 * - Use the compiler to generate geometry per node type
 * - Color from materials.json, with selection/hover highlights
 *
 * PERFORMANCE:
 * - Each node is a separate <mesh> for raycasting/selection
 * - Geometry is created once per node (keyed by node.id + version)
 * - Materials are cached by material_id
 * =============================================================================
 */

'use client';

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useDesignStore } from '@/store/useDesignStore';
import { getGeometryForNode, compileMaterial, compileGlassMaterial } from '@/lib/psg/compiler';
import materialsDatabase from '@/data/materials.json';
import type { PSGNode, Material } from '@/types';

// =============================================================================
// MATERIAL CACHE
// =============================================================================

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const glassMaterial = compileGlassMaterial();

function getMaterial(materialId: string, opacity: number): THREE.Material {
    // Glass materials for windows
    if (opacity < 1 || materialId.includes('glass')) {
        return glassMaterial;
    }

    // Look up from cache first
    if (materialCache.has(materialId)) {
        return materialCache.get(materialId)!;
    }

    // Look up from the materials database
    const matDef = (materialsDatabase as Record<string, Material>)[materialId];
    if (matDef) {
        const threeMat = compileMaterial(matDef);
        materialCache.set(materialId, threeMat);
        return threeMat;
    }

    // Fallback: grey material for unknown material IDs
    const fallback = new THREE.MeshStandardMaterial({
        color: '#888888',
        roughness: 0.8,
        metalness: 0.1,
        side: THREE.DoubleSide,
    });
    materialCache.set(materialId, fallback);
    return fallback;
}

// =============================================================================
// HIGHLIGHT MATERIALS (for selection and hover)
// =============================================================================

const SELECTION_EMISSIVE = new THREE.Color(0x2266ff);
const HOVER_EMISSIVE = new THREE.Color(0x115599);

// =============================================================================
// NODE TYPES THAT RENDER GEOMETRY
// =============================================================================

const RENDERABLE_TYPES = new Set([
    'Wall', 'Window', 'Door', 'Roof', 'Stairs', 'Slab',
    'Foundation', 'Column', 'Beam', 'Partition',
    'Balcony', 'Garage', 'Chimney',
]);

// =============================================================================
// SINGLE NODE MESH
// =============================================================================

interface NodeMeshProps {
    node: PSGNode;
    isSelected: boolean;
    isHovered: boolean;
}

function NodeMesh({ node, isSelected, isHovered }: NodeMeshProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const selectNode = useDesignStore((s) => s.selectNode);
    const hoverNode = useDesignStore((s) => s.hoverNode);

    // Generate geometry (memoized per node version + style)
    const geometryOrGroup = useMemo(() => {
        return getGeometryForNode(node);
    }, [node.type, node.dimensions.x, node.dimensions.y, node.dimensions.z, node.version, node.roof_style, node.stair_style]);

    // Get material (recomputed when material_id changes)
    const material = useMemo(() => {
        return getMaterial(node.material_id, node.opacity);
    }, [node.material_id, node.opacity]);

    // Rotation: convert yaw/pitch/roll degrees to radians
    const rotation = useMemo<[number, number, number]>(() => [
        (node.rotation.pitch * Math.PI) / 180,
        (node.rotation.yaw * Math.PI) / 180,
        (node.rotation.roll * Math.PI) / 180,
    ], [node.rotation.yaw, node.rotation.pitch, node.rotation.roll]);

    // Click → select
    const handleClick = (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        selectNode(node.id);
    };

    // Hover
    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        hoverNode(node.id);
        document.body.style.cursor = 'pointer';
    };

    const handlePointerOut = () => {
        hoverNode(null);
        document.body.style.cursor = 'default';
    };

    // If the compiler returned a Group (e.g. stairs), wrap differently
    if (geometryOrGroup instanceof THREE.Group) {
        return (
            <group
                key={`${node.id}_${node.version}_${node.stair_style}`}
                position={[node.position.x, node.position.y, node.position.z]}
                rotation={rotation}
            >
                {/* Render each mesh in the group */}
                {geometryOrGroup.children.map((child, i) => {
                    const mesh = child as THREE.Mesh;
                    return (
                        <mesh
                            key={`${node.id}_step_${i}`}
                            geometry={mesh.geometry}
                            position={mesh.position}
                            onClick={handleClick}
                            onPointerOver={handlePointerOver}
                            onPointerOut={handlePointerOut}
                            castShadow
                            receiveShadow
                        >
                            <meshStandardMaterial
                                color={(material as THREE.MeshStandardMaterial).color}
                                roughness={0.6}
                                metalness={0.1}
                                side={THREE.DoubleSide}
                                emissive={isSelected ? SELECTION_EMISSIVE : isHovered ? HOVER_EMISSIVE : undefined}
                                emissiveIntensity={isSelected ? 0.3 : isHovered ? 0.15 : 0}
                            />
                        </mesh>
                    );
                })}
            </group>
        );
    }

    // Standard single-mesh node
    return (
        <mesh
            key={`${node.id}_${node.version}_${node.material_id}`}
            ref={meshRef}
            geometry={geometryOrGroup}
            material={material}
            position={[node.position.x, node.position.y, node.position.z]}
            rotation={rotation}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            castShadow
            receiveShadow
        >
            {/* Selection/hover overlay — apply emissive glow */}
            {(isSelected || isHovered) && (
                <meshStandardMaterial
                    attach="material"
                    color={(material as THREE.MeshStandardMaterial).color || '#888888'}
                    roughness={0.7}
                    metalness={0.1}
                    side={THREE.DoubleSide}
                    transparent={node.opacity < 1}
                    opacity={node.opacity}
                    emissive={isSelected ? SELECTION_EMISSIVE : HOVER_EMISSIVE}
                    emissiveIntensity={isSelected ? 0.3 : 0.15}
                />
            )}
        </mesh>
    );
}

// =============================================================================
// PSG RENDERER (iterates all nodes)
// =============================================================================

export default function PSGRenderer() {
    const project = useDesignStore((s) => s.project);
    const selection = useDesignStore((s) => s.selection);

    // Get all renderable nodes
    const renderableNodes = useMemo(() => {
        return Object.values(project.nodes).filter(
            (node) => RENDERABLE_TYPES.has(node.type)
        );
    }, [project.nodes]);

    // Click on empty space → deselect
    const selectNode = useDesignStore((s) => s.selectNode);

    return (
        <group
            onClick={(e) => {
                // Only deselect if clicking the background (no mesh hit)
                if (e.object.type === 'Mesh' && !e.object.userData.psgNodeId) {
                    selectNode(null);
                }
            }}
        >
            {renderableNodes.map((node) => (
                <NodeMesh
                    key={node.id}
                    node={node}
                    isSelected={selection.selected_node_id === node.id}
                    isHovered={selection.hovered_node_id === node.id}
                />
            ))}
        </group>
    );
}
