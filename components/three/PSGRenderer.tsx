/**
 * =============================================================================
 * COMPONENTS/THREE/PSG-RENDERER.TSX — Renders PSG Nodes as Architecturally
 *                                     Correct 3D Meshes
 * =============================================================================
 *
 * RENDERING STRATEGY:
 *
 *  WALLS:
 *   - Built with buildWallWithOpenings() → ExtrudeGeometry with holes
 *   - Corner resolution via resolveWallCorners() → no blind overlaps
 *   - Each wall is a SINGLE mesh (not box + separate window mesh)
 *
 *  WINDOWS:
 *   - buildWindowGroup() → frame (4 solid members) + glass pane
 *   - Positioned exactly at the opening in the parent wall
 *   - No separate "hole" mesh needed — the wall has the hole already
 *
 *  DOORS:
 *   - buildDoorGroup() → frame (3 members) + door leaf
 *   - Door leaf sits in the closed position flush with interior wall face
 *
 *  ALL OTHER TYPES (Roof, Stairs, Slab, etc.):
 *   - Use getGeometryForNode() from compiler.ts (unchanged)
 *
 * PERFORMANCE:
 *  - Geometry is memoized by node.id + node.version
 *  - Material is cached by material_id
 *  - Each node is a separate mesh for raycasting/selection
 * =============================================================================
 */

'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { useDesignStore } from '@/store/useDesignStore';
import {
    buildWallWithOpenings,
    buildWindowGroup,
    buildDoorGroup,
} from '@/lib/psg/geometry';
import { getGeometryForNode, compileMaterial, compileGlassMaterial } from '@/lib/psg/compiler';
import materialsDatabase from '@/data/materials.json';
import type { PSGNode, PSGProject, Material } from '@/types';

// =============================================================================
// MATERIAL CACHE
// =============================================================================

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const glassMaterial = compileGlassMaterial();

function getMaterial(materialId: string, opacity: number): THREE.Material {
    if (opacity < 1 || materialId.includes('glass')) return glassMaterial;
    if (materialCache.has(materialId)) return materialCache.get(materialId)!;
    const matDef = (materialsDatabase as Record<string, Material>)[materialId];
    if (matDef) {
        const m = compileMaterial(matDef);
        materialCache.set(materialId, m);
        return m;
    }
    const fallback = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide });
    materialCache.set(materialId, fallback);
    return fallback;
}

// =============================================================================
// HIGHLIGHT MATERIALS
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

// Openings are rendered AS PART OF their parent wall group — skip standalone rendering
const OPENING_TYPES = new Set(['Window', 'Door']);

// =============================================================================
// WALL MESH — with carved openings (no corner correction needed —
//             templates use through+between joint strategy)
// =============================================================================

interface WallMeshProps {
    node: PSGNode;
    isSelected: boolean;
    isHovered: boolean;
    allNodes: Record<string, PSGNode>;
}

function WallMeshNode({ node, isSelected, isHovered, allNodes }: WallMeshProps) {
    const selectNode = useDesignStore((s) => s.selectNode);
    const hoverNode = useDesignStore((s) => s.hoverNode);

    // Build wall geometry with openings — uses node directly, no corner adjustment
    const wallGeometry = useMemo(
        () => buildWallWithOpenings(node, allNodes),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [node.id, node.version, node.dimensions.x, node.dimensions.y, node.dimensions.z,
        node.children_ids.length,
        // Re-compute when any child opening changes
        ...node.children_ids.map(id => {
            const child = allNodes[id];
            return child ? `${child.version}_${child.position.x}_${child.position.z}_${child.position.y}` : '';
        })]
    );

    const material = useMemo(
        () => getMaterial(node.material_id, node.opacity),
        [node.material_id, node.opacity]
    );

    const rotation = useMemo<[number, number, number]>(() => [
        (node.rotation.pitch * Math.PI) / 180,
        (node.rotation.yaw * Math.PI) / 180,
        (node.rotation.roll * Math.PI) / 180,
    ], [node.rotation.yaw, node.rotation.pitch, node.rotation.roll]);

    const handleClick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); selectNode(node.id); };
    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); hoverNode(node.id); document.body.style.cursor = 'pointer'; };
    const handlePointerOut = () => { hoverNode(null); document.body.style.cursor = 'default'; };

    return (
        <group
            key={`${node.id}_${node.version}`}
            position={[node.position.x, node.position.y, node.position.z]}
            rotation={rotation}
        >
            {/* Wall solid with holes */}
            <mesh
                geometry={wallGeometry}
                onClick={handleClick}
                onPointerOver={handlePointerOver}
                onPointerOut={handlePointerOut}
                castShadow
                receiveShadow
            >
                {(isSelected || isHovered) ? (
                    <meshStandardMaterial
                        color={(material as THREE.MeshStandardMaterial).color || '#888888'}
                        roughness={0.7}
                        metalness={0.1}
                        side={THREE.DoubleSide}
                        emissive={isSelected ? SELECTION_EMISSIVE : HOVER_EMISSIVE}
                        emissiveIntensity={isSelected ? 0.3 : 0.15}
                    />
                ) : (
                    <primitive object={material} attach="material" />
                )}
            </mesh>

            {/* Window + Door groups rendered here, positioned relative to wall center */}
            {node.children_ids.map(childId => {
                const child = allNodes[childId];
                if (!child || !OPENING_TYPES.has(child.type)) return null;
                return (
                    <OpeningGroup
                        key={`${childId}_${child.version}`}
                        node={child}
                        parentWall={node}
                        allNodes={allNodes}
                    />
                );
            })}
        </group>
    );
}

// =============================================================================
// OPENING GROUP (Window / Door)
// =============================================================================

interface OpeningGroupProps {
    node: PSGNode;
    parentWall: PSGNode;
    allNodes: Record<string, PSGNode>;
}

function OpeningGroup({ node, parentWall, allNodes }: OpeningGroupProps) {
    const selectNode = useDesignStore((s) => s.selectNode);
    const hoverNode = useDesignStore((s) => s.hoverNode);
    const selection = useDesignStore((s) => s.selection);
    const isSelected = selection.selected_node_id === node.id;
    const isHovered = selection.hovered_node_id === node.id;

    const wallThickness = parentWall.dimensions.z;

    // Build the 3D group (frame + glass / frame + leaf)
    const group = useMemo(() => {
        return node.type === 'Window'
            ? buildWindowGroup(node, wallThickness)
            : buildDoorGroup(node, wallThickness);
    }, [node.id, node.version, wallThickness, node.opening_width, node.opening_height]);

    // Local position within wall: the opening lives at its world position,
    // but we need to express it RELATIVE to the parent wall group
    const localPos = useMemo(() => {
        const yaw = Math.round(parentWall.rotation.yaw) % 180;
        const isNS = (yaw === 90 || yaw === -90);
        const wx = isNS ? (node.position.z - parentWall.position.z) : (node.position.x - parentWall.position.x);
        const wy = node.position.y - parentWall.position.y;
        return { x: wx, y: wy, z: 0 };
    }, [node.position, parentWall.position, parentWall.rotation.yaw]);

    const handleClick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); selectNode(node.id); };
    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); hoverNode(node.id); document.body.style.cursor = 'pointer'; };
    const handlePointerOut = () => { hoverNode(null); document.body.style.cursor = 'default'; };

    return (
        <group
            key={`${node.id}_${node.version}`}
            position={[localPos.x, localPos.y, localPos.z]}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
        >
            {group.children.map((child, i) => {
                const mesh = child as THREE.Mesh;
                const mat = mesh.material as THREE.Material;
                // Clone and apply selection/hover tint
                let renderMat: THREE.Material;
                if (isSelected || isHovered) {
                    renderMat = mat.clone();
                    if (renderMat instanceof THREE.MeshStandardMaterial) {
                        renderMat.emissive = isSelected ? SELECTION_EMISSIVE : HOVER_EMISSIVE;
                        renderMat.emissiveIntensity = isSelected ? 0.2 : 0.1;
                    }
                } else {
                    renderMat = mat;
                }
                return (
                    <mesh
                        key={`${node.id}_frame_${i}`}
                        geometry={mesh.geometry}
                        position={mesh.position}
                        castShadow
                        receiveShadow
                    >
                        <primitive object={renderMat} attach="material" />
                    </mesh>
                );
            })}
        </group>
    );
}

// =============================================================================
// GENERIC NODE MESH (Roof, Stairs, Slab, Column, Beam, Foundation, ...)
// =============================================================================

interface GenericMeshProps {
    node: PSGNode;
    isSelected: boolean;
    isHovered: boolean;
}

function GenericNodeMesh({ node, isSelected, isHovered }: GenericMeshProps) {
    const selectNode = useDesignStore((s) => s.selectNode);
    const hoverNode = useDesignStore((s) => s.hoverNode);

    const geometryOrGroup = useMemo(
        () => getGeometryForNode(node),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [node.type, node.dimensions.x, node.dimensions.y, node.dimensions.z, node.version, node.roof_style, node.stair_style]
    );

    const material = useMemo(() => getMaterial(node.material_id, node.opacity), [node.material_id, node.opacity]);

    const rotation = useMemo<[number, number, number]>(() => [
        (node.rotation.pitch * Math.PI) / 180,
        (node.rotation.yaw * Math.PI) / 180,
        (node.rotation.roll * Math.PI) / 180,
    ], [node.rotation.yaw, node.rotation.pitch, node.rotation.roll]);

    const handleClick = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); selectNode(node.id); };
    const handlePointerOver = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); hoverNode(node.id); document.body.style.cursor = 'pointer'; };
    const handlePointerOut = () => { hoverNode(null); document.body.style.cursor = 'default'; };

    if (geometryOrGroup instanceof THREE.Group) {
        return (
            <group
                key={`${node.id}_${node.version}`}
                position={[node.position.x, node.position.y, node.position.z]}
                rotation={rotation}
            >
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

    return (
        <mesh
            key={`${node.id}_${node.version}_${node.material_id}`}
            geometry={geometryOrGroup}
            position={[node.position.x, node.position.y, node.position.z]}
            rotation={rotation}
            onClick={handleClick}
            onPointerOver={handlePointerOver}
            onPointerOut={handlePointerOut}
            castShadow
            receiveShadow
        >
            {(isSelected || isHovered) ? (
                <meshStandardMaterial
                    color={(material as THREE.MeshStandardMaterial).color || '#888888'}
                    roughness={0.7}
                    metalness={0.1}
                    side={THREE.DoubleSide}
                    transparent={node.opacity < 1}
                    opacity={node.opacity}
                    emissive={isSelected ? SELECTION_EMISSIVE : HOVER_EMISSIVE}
                    emissiveIntensity={isSelected ? 0.3 : 0.15}
                />
            ) : (
                <primitive object={material} attach="material" />
            )}
        </mesh>
    );
}

// =============================================================================
// PSG RENDERER — iterates all renderable nodes
// =============================================================================

export default function PSGRenderer() {
    const project = useDesignStore((s) => s.project);
    const selection = useDesignStore((s) => s.selection);
    const selectNode = useDesignStore((s) => s.selectNode);

    const allNodes = project.nodes;

    // Nodes that are the "top-level" renderable structural elements
    // Windows and Doors are rendered INSIDE their parent wall group
    const wallAndPartitionNodes = useMemo(
        () => Object.values(allNodes).filter((n) => n.type === 'Wall' || n.type === 'Partition'),
        [allNodes]
    );

    const otherNodes = useMemo(
        () => Object.values(allNodes).filter(
            (n) => RENDERABLE_TYPES.has(n.type) && !OPENING_TYPES.has(n.type) && n.type !== 'Wall' && n.type !== 'Partition'
        ),
        [allNodes]
    );

    return (
        <group
            onClick={(e) => {
                if (e.object.type === 'Mesh' && !e.object.userData.psgNodeId) {
                    selectNode(null);
                }
            }}
        >
            {/* Walls with carved openings */}
            {wallAndPartitionNodes.map((node) => (
                <WallMeshNode
                    key={node.id}
                    node={node}
                    isSelected={selection.selected_node_id === node.id}
                    isHovered={selection.hovered_node_id === node.id}
                    allNodes={allNodes}
                />
            ))}

            {/* All other structural + architectural nodes */}
            {otherNodes.map((node) => (
                <GenericNodeMesh
                    key={node.id}
                    node={node}
                    isSelected={selection.selected_node_id === node.id}
                    isHovered={selection.hovered_node_id === node.id}
                />
            ))}
        </group>
    );
}
