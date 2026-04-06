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
    buildMatrixWall,
    buildWindowGroup,
    buildDoorGroup,
    resolveWallCorners,
    resolveWallPosition,
} from '@/lib/psg/geometry';
import { getGeometryForNode, compileMaterial, compileGlassMaterial } from '@/lib/psg/compiler';
import materialsDatabase from '@/data/materials.json';
import type { PSGNode, PSGProject, Material } from '@/types';

// =============================================================================
// MATERIAL CACHE
// =============================================================================

const materialCache = new Map<string, THREE.MeshStandardMaterial>();
const glassMaterial = compileGlassMaterial();

function getMaterial(materialId: string, opacity: number, type?: string): THREE.Material {
    if (opacity < 1 || materialId.includes('glass')) return glassMaterial;
    if (materialId && materialCache.has(materialId)) return materialCache.get(materialId)!;
    
    // Sanitary types default to white porcelain if no ID provided
    if (!materialId && type && ['Toilet', 'Sink', 'Shower', 'Bathtub'].includes(type)) {
        return new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, metalness: 0.2 });
    }

    const matDef = (materialsDatabase as Record<string, Material>)[materialId];
    if (matDef) {
        const m = compileMaterial(matDef);
        materialCache.set(materialId, m);
        return m;
    }
    const fallback = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide });
    if (materialId) materialCache.set(materialId, fallback);
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
<<<<<<< HEAD
    'Balcony', 'Garage', 'Chimney', 'Custom',
    'Toilet', 'Sink', 'Shower', 'Bathtub',
    'LightSwitch', 'ElectricalOutlet', 'ElectricalPanel',
    'Floor', 'Tower', 'Detail'
=======
    'Balcony', 'Garage', 'Chimney', 'Custom', 'Floor',
    'Toilet', 'Sink', 'Shower', 'Bathtub',
    'LightSwitch', 'ElectricalOutlet', 'ElectricalPanel',
>>>>>>> origin/main
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
    isSystemVision: boolean;
    forcedOpacity?: number;
}

function WallMeshNode({ node, isSelected, isHovered, allNodes, isSystemVision, forcedOpacity }: WallMeshProps) {
    const selectNode = useDesignStore((s) => s.selectNode);
    const hoverNode = useDesignStore((s) => s.hoverNode);

    // Get corner-corrected wall data
    const { adjustedWidth, startInset, endInset } = useMemo(
        () => resolveWallCorners(node, allNodes),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [node.id, node.version, node.dimensions.x, node.dimensions.z, node.position.x, node.position.z, node.rotation.yaw]
    );

    // Create a "virtual" node with adjusted width for geometry building
    const adjustedNode = useMemo(() => ({
        ...node,
        dimensions: { ...node.dimensions, x: adjustedWidth },
    }), [node, adjustedWidth]);

    // Build wall geometry with openings OR matrix-based geometry
    const wallGeometry = useMemo(
        () => {
            if (node.surface_matrix) {
                return buildMatrixWall(node);
            }
            return buildWallWithOpenings(adjustedNode, allNodes);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [node.id, node.version, adjustedWidth, node.dimensions.y, node.dimensions.z,
        node.surface_matrix ? JSON.stringify(node.surface_matrix) : '',
        node.children_ids.map(id => {
            const child = allNodes[id];
            return child ? `${child.version}_${child.position.x}_${child.position.z}_${child.position.y}` : '';
        }).join('|')]
    );

    const material = useMemo(
        () => getMaterial(node.material_id, node.opacity, node.type),
        [node.material_id, node.opacity, node.type]
    );

    // Corner-corrected center position
    const position = useMemo(
        () => resolveWallPosition(node, startInset, endInset),
        [node.position, startInset, endInset, node.rotation.yaw]
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
            position={[position.x, position.y, position.z]}
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
                userData={{ psgNodeId: node.id, type: 'Wall' }}
            >
                {isSelected || isHovered ? (
                    <meshStandardMaterial
                        color={(material as THREE.MeshStandardMaterial).color || '#888888'}
                        roughness={0.7}
                        metalness={0.1}
                        side={THREE.DoubleSide}
                        emissive={isSelected ? SELECTION_EMISSIVE : HOVER_EMISSIVE}
                        emissiveIntensity={isSelected ? 0.3 : 0.15}
                        transparent={isSystemVision || node.opacity < 1}
                        opacity={isSystemVision ? 0.3 : node.opacity}
                    />
                ) : (
                    <primitive
                        object={material}
                        attach="material"
                        transparent={isSystemVision || node.opacity < 1 || forcedOpacity !== undefined}
                        opacity={forcedOpacity !== undefined ? forcedOpacity : (isSystemVision ? 0.3 : node.opacity)}
                    />
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
                        parentPosition={position}
                        allNodes={allNodes}
                        forcedOpacity={forcedOpacity}
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
    parentPosition: { x: number; y: number; z: number };
    allNodes: Record<string, PSGNode>;
    forcedOpacity?: number;
}

function OpeningGroup({ node, parentWall, parentPosition, allNodes, forcedOpacity }: OpeningGroupProps) {
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
    }, [node, wallThickness]);

    // Local position within wall: the opening lives at its world position,
    // but we need to express it RELATIVE to the parent wall group
    const localPos = useMemo(() => {
        const yaw = Math.round(parentWall.rotation.yaw) % 180;
        const isNS = (yaw === 90 || yaw === -90);
        // Position relative to the SHIFTED wall center
        const wx = isNS ? (node.position.z - parentPosition.z) : (node.position.x - parentPosition.x);
        const wy = node.position.y - parentPosition.y;
        return { x: wx, y: wy, z: 0 };
    }, [node.position, parentPosition, parentWall.rotation.yaw]);

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
            {useMemo(() => group.children.map((child, i) => {
                const mesh = child as THREE.Mesh;
                const mat = mesh.material as THREE.Material;
                let renderMat: THREE.Material = mat;

                if (isSelected || isHovered) {
                    renderMat = mat.clone();
                    if (renderMat instanceof THREE.MeshStandardMaterial) {
                        renderMat.emissive = isSelected ? SELECTION_EMISSIVE : HOVER_EMISSIVE;
                        renderMat.emissiveIntensity = isSelected ? 0.2 : 0.1;
                    }
                }

                return (
                    <mesh
                        key={`${node.id}_frame_${i}`}
                        geometry={mesh.geometry}
                        position={mesh.position}
                        castShadow
                        receiveShadow
                    >
                        <primitive
                            object={renderMat}
                            attach="material"
                            transparent={forcedOpacity !== undefined || renderMat.transparent}
                            opacity={forcedOpacity !== undefined ? forcedOpacity : renderMat.opacity}
                        />
                    </mesh>
                );
            }), [group.children, isSelected, isHovered, node.id, forcedOpacity])}
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
    isSystemVision: boolean;
    forcedOpacity?: number;
}

function GenericNodeMesh({ node, isSelected, isHovered, isSystemVision, forcedOpacity }: GenericMeshProps) {
    const selectNode = useDesignStore((s) => s.selectNode);
    const hoverNode = useDesignStore((s) => s.hoverNode);

    const geometryOrGroup = useMemo(
        () => getGeometryForNode(node),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [node.type, node.dimensions.x, node.dimensions.y, node.dimensions.z, node.version, node.roof_style, node.stair_style]
    );

    const material = useMemo(
        () => getMaterial(node.material_id, node.opacity, node.type),
        [node.material_id, node.opacity, node.type]
    );

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
                    // Clone the compiled material so PBR properties are preserved
                    const renderMat = (material as THREE.MeshStandardMaterial).clone();
                    if (isSelected) {
                        renderMat.emissive = SELECTION_EMISSIVE;
                        renderMat.emissiveIntensity = 0.3;
                    } else if (isHovered) {
                        renderMat.emissive = HOVER_EMISSIVE;
                        renderMat.emissiveIntensity = 0.15;
                    }
                    if (isSystemVision || node.opacity < 1 || forcedOpacity !== undefined) {
                        renderMat.transparent = true;
                        renderMat.opacity = forcedOpacity !== undefined ? forcedOpacity : (isSystemVision ? 0.2 : node.opacity);
                    }
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
                            userData={{
                                psgNodeId: node.id,
                                isWalkable: true,
                                type: node.type
                            }}
                        >
                            <primitive object={renderMat} attach="material" />
                        </mesh>
                    );
                })}
            </group>
        );
    }

    // Clone the compiled material to preserve PBR props (roughness, metalness, color)
    const renderMat = useMemo(() => {
        const cloned = (material as THREE.MeshStandardMaterial).clone();
        if (isSelected) {
            cloned.emissive = SELECTION_EMISSIVE;
            cloned.emissiveIntensity = 0.3;
        } else if (isHovered) {
            cloned.emissive = HOVER_EMISSIVE;
            cloned.emissiveIntensity = 0.15;
        }
        if (isSystemVision || node.opacity < 1 || forcedOpacity !== undefined) {
            cloned.transparent = true;
            cloned.opacity = forcedOpacity !== undefined ? forcedOpacity : (isSystemVision ? 0.2 : node.opacity);
        }
        return cloned;
    }, [material, isSelected, isHovered, isSystemVision, node.opacity, forcedOpacity]);

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
            userData={{
                psgNodeId: node.id,
                isWalkable: ['Slab', 'Floor', 'Foundation', 'Balcony', 'Roof', 'Garage', 'Tower'].includes(node.type),
                type: node.type
            }}
        >
            <primitive object={renderMat} attach="material" />
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
    const visibleLayers = useDesignStore((s) => s.visibleLayers);
    const viewMode = useDesignStore((s) => s.viewMode);
    const activeFloorId = useDesignStore((s) => s.activeFloorId);

    const isSystemVision = visibleLayers.has('electrical') || visibleLayers.has('plumbing') || visibleLayers.has('thermal') || visibleLayers.has('hvac');

    const allNodes = project.nodes;

    // Helper to find which floor a node belongs to.
    // Uses POSITION-BASED detection (not parent traversal) because flat parenting
    // means all nodes are children of the House root. We assign a node to the
    // floor whose vertical range contains its center Y position.
    const nodeFloorMap = useMemo(() => {
        const map = new Map<string, string>();
        const floors = Object.values(allNodes)
            .filter(n => n.type === 'Floor')
            .sort((a, b) => a.position.y - b.position.y);

        if (floors.length === 0) return map;

        Object.values(allNodes).forEach((node) => {
            if (node.type === 'Floor' || node.type === 'House') return;

            // Find the floor whose vertical range contains this node
            let bestFloor: PSGNode | null = null;
            for (const floor of floors) {
                const floorTop = floor.position.y + floor.dimensions.y / 2;
                // A node "belongs" to the highest floor whose top surface is at or below the node's bottom
                const nodeBottom = node.position.y - node.dimensions.y / 2;
                if (floorTop <= nodeBottom + 0.5) { // 0.5m tolerance
                    bestFloor = floor;
                }
            }
            // Fallback: assign to the nearest floor by Y position
            if (!bestFloor) {
                let minDist = Infinity;
                for (const floor of floors) {
                    const dist = Math.abs(node.position.y - floor.position.y);
                    if (dist < minDist) {
                        minDist = dist;
                        bestFloor = floor;
                    }
                }
            }
            if (bestFloor) map.set(node.id, bestFloor.id);
        });
        return map;
    }, [allNodes]);

    // Floors sorted by height
    const sortedFloors = useMemo(() =>
        Object.values(allNodes)
            .filter(n => n.type === 'Floor')
            .sort((a, b) => a.position.y - b.position.y),
        [allNodes]
    );

    const activeFloorIndex = activeFloorId ? sortedFloors.findIndex(f => f.id === activeFloorId) : -1;

    // Nodes that are the "top-level" renderable structural elements
    // Windows and Doors are rendered INSIDE their parent wall group
    const wallsAndPartitions = useMemo(
        () => Object.values(allNodes).filter((n) => n.type === 'Wall' || n.type === 'Partition'),
        [allNodes]
    );

    const otherNodes = useMemo(
        () => Object.values(allNodes).filter(
            (n) => RENDERABLE_TYPES.has(n.type) && !OPENING_TYPES.has(n.type) && n.type !== 'Wall' && n.type !== 'Partition'
        ),
        [allNodes]
    );

    const isNodeVisible = (node: PSGNode): boolean => {
        if (viewMode !== 'top_down') return true;

        if (activeFloorId) {
            const floorId = nodeFloorMap.get(node.id);
            // Non-floor elements like Foundation are visible
            if (!floorId) {
                if (node.type === 'Roof') return false;
                // If it's foundation and we are looking at ground floor, let's keep it visible or hide?
                // For exact mathematical plan, just show the current floor. We can hide foundation unless it's the ground floor?
                // Actually, if it has no floor, let's just make it visible, maybe it's terrain. 
                // But let's hide roof anyway.
                return true;
            }

            const floorIndex = sortedFloors.findIndex(f => f.id === floorId);

            // Exactly show ONLY the active floor items
            if (floorIndex !== activeFloorIndex) return false;

            // Even if on active floor (e.g., roof on top floor), hide the roof to see the plan
            if (node.type === 'Roof') return false;

            return true;
        }

        // Top down mode but NO active floor selected:
        // Hide roofs to see all floors inside
        if (node.type === 'Roof') return false;

        return true;
    };

    const getForcedOpacity = (node: PSGNode) => {
        return undefined; // We are hiding entirely instead of changing opacity
    };

    return (
        <group
            onClick={(e) => {
                if (e.object.type === 'Mesh' && !e.object.userData.psgNodeId) {
                    selectNode(null);
                }
            }}
        >
            {/* Walls with carved openings */}
            {wallsAndPartitions.filter(isNodeVisible).map((node) => (
                <WallMeshNode
                    key={node.id}
                    node={node}
                    isSelected={selection.selected_node_id === node.id}
                    isHovered={selection.hovered_node_id === node.id}
                    allNodes={allNodes}
                    isSystemVision={isSystemVision}
                    forcedOpacity={getForcedOpacity(node)}
                />
            ))}

            {/* All other structural + architectural nodes */}
            {otherNodes.filter(isNodeVisible).map((node) => (
                <GenericNodeMesh
                    key={node.id}
                    node={node}
                    isSelected={selection.selected_node_id === node.id}
                    isHovered={selection.hovered_node_id === node.id}
                    isSystemVision={isSystemVision}
                    forcedOpacity={getForcedOpacity(node)}
                />
            ))}
        </group>
    );
}
