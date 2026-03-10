/**
 * =============================================================================
 * COMPONENTS/THREE/SYSTEMS-RENDERER.TSX — Visualizes Technical Layers
 * =============================================================================
 * 
 * Renders non-structural layers when toggled on:
 * 1. ELECTRICAL: Wires (yellow lines) + Sockets/Switches (boxes)
 * 2. PLUMBING: Cold supply (cyan), Hot supply (orange), Drain (red)
 * 3. THERMAL: Heatmap overlay using custom shader
 * 4. DIMENSIONS: 3D measurement labels on walls/openings
 * =============================================================================
 */

'use client';

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useDesignStore } from '@/store/useDesignStore';
import { generateElectricalLayout } from '@/lib/systems/electrical';
import { generatePlumbingLayout } from '@/lib/systems/plumbing';
import { generateHVACLayout } from '@/lib/systems/hvac';
import { runThermalSimulation } from '@/lib/thermal/simulator';
import { createThermalShaderMaterial } from '@/lib/psg/compiler';
import materialsDatabase from '@/data/materials.json';
import type { Material } from '@/types';

/**
 * Calculates the rotation quaternion to orient a cylinder/box from point A to point B.
 */
function getPipeTransform(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
    const dir = new THREE.Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
    const length = dir.length();
    if (length < 0.001) return null;

    const mid = new THREE.Vector3(
        (from.x + to.x) / 2,
        (from.y + to.y) / 2,
        (from.z + to.z) / 2,
    );

    // Build a quaternion that rotates the default Y-axis to the pipe direction
    dir.normalize();
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);

    return { position: mid, quaternion, length };
}

function RealThermalSimulation({ project }: { project: any }) {
    const GRID_X = 60;
    const GRID_Z = 60;
    const SIZE = 30; // 30x30 meters (-15 to +15)

    const count = GRID_X * GRID_Z;
    const meshRef = useRef<THREE.InstancedMesh>(null);

    // Double buffering for Cellular Automata
    const tempGrid = useRef(new Float32Array(count).fill(0.0)); // 0 = cold outside
    const nextGrid = useRef(new Float32Array(count).fill(0.0));
    const colors = useMemo(() => new Float32Array(count * 3), [count]);

    const cellTypes = useMemo(() => {
        const types = new Uint8Array(count).fill(0);
        // 0: air
        // 1: wall (insulator, blocks heat)
        // 2: window (cold source leak)
        // 3: heater / HVAC (heat source)

        const getCell = (gx: number, gz: number) => gz * GRID_X + gx;
        const toGrid = (worldX: number, worldZ: number) => {
            const gx = Math.floor((worldX + SIZE / 2) / (SIZE / GRID_X));
            const gz = Math.floor((worldZ + SIZE / 2) / (SIZE / GRID_Z));
            return [gx, gz];
        };

        // Rasterize walls/windows
        Object.values(project.nodes).forEach((n: any) => {
            if (n.type === 'Wall' || n.type === 'Partition' || n.type === 'Window' || n.type === 'Door') {
                const length = n.dimensions.x;
                const typeVal = n.type === 'Window' || n.type === 'Door' ? 2 : 1;

                // Sample points along the wall
                const steps = Math.ceil(length / (SIZE / GRID_X)); // 1 step per cell
                for (let i = 0; i <= steps; i++) {
                    const t = (i / steps) - 0.5;
                    const lx = t * length;

                    // Rotate into world space
                    const yaw = (n.rotation?.yaw || 0) * (Math.PI / 180);
                    const wx = n.position.x + lx * Math.cos(yaw);
                    const wz = n.position.z - lx * Math.sin(yaw); // Z axis relation

                    const [gx, gz] = toGrid(wx, wz);
                    if (gx >= 0 && gx < GRID_X && gz >= 0 && gz < GRID_Z) {
                        types[getCell(gx, gz)] = typeVal;
                    }
                }
            }
        });

        // Heat sources (Rooms get a heater, pretend it's mini-split or underfloor)
        Object.values(project.nodes).forEach((n: any) => {
            if (n.type === 'Room') {
                const [gx, gz] = toGrid(n.position.x, n.position.z);
                if (gx >= 0 && gx < GRID_X && gz >= 0 && gz < GRID_Z) {
                    types[getCell(gx, gz)] = 3;
                }
            }
        });

        return types;
    }, [project, count]);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    React.useEffect(() => {
        if (!meshRef.current) return;
        let i = 0;
        const cellW = SIZE / GRID_X;
        for (let z = 0; z < GRID_Z; z++) {
            for (let x = 0; x < GRID_X; x++) {
                const worldX = x * cellW - SIZE / 2 + cellW / 2;
                const worldZ = z * cellW - SIZE / 2 + cellW / 2;
                dummy.position.set(worldX, 1.0, worldZ); // Float above floor
                dummy.scale.set(cellW * 0.95, 0.2, cellW * 0.95);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);
                i++;
            }
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    }, [dummy]);

    const tempColor = useMemo(() => new THREE.Color(), []);
    // Noise offset for simulated wind flow
    const timeRef = useRef(0);

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        const current = tempGrid.current;
        const next = nextGrid.current;
        const types = cellTypes;
        timeRef.current += delta;

        // Simulation constants
        const diffRate = 0.2; // Heat diffusion speed
        const coolingRate = 0.005; // Outside cold seepage

        for (let z = 0; z < GRID_Z; z++) {
            for (let x = 0; x < GRID_X; x++) {
                const idx = z * GRID_X + x;

                if (types[idx] === 3) {
                    // Heater
                    next[idx] = 1.0;
                } else if (types[idx] === 2) {
                    // Window (cold leak)
                    next[idx] = 0.0;
                } else if (types[idx] === 1) {
                    // Wall: Slows heat, slightly cold
                    next[idx] = Math.max(0, current[idx] - 0.1);
                } else {
                    // Air: diffuse from neighbors
                    let sum = 0;
                    let n = 0;
                    if (x > 0) { sum += current[idx - 1]; n++; }
                    if (x < GRID_X - 1) { sum += current[idx + 1]; n++; }
                    if (z > 0) { sum += current[idx - GRID_X]; n++; }
                    if (z < GRID_Z - 1) { sum += current[idx + GRID_X]; n++; }

                    const avg = sum / n;

                    // Add wind/flow direction
                    const windX = Math.sin(timeRef.current * 0.5) > 0 ? 1 : -1;
                    const windZ = Math.cos(timeRef.current * 0.3) > 0 ? 1 : -1;

                    let advect = 0;
                    if (x > 0 && x < GRID_X - 1) {
                        advect += current[idx - windX] * 0.05;
                    }
                    if (z > 0 && z < GRID_Z - 1) {
                        advect += current[idx - windZ * GRID_X] * 0.05;
                    }

                    next[idx] = current[idx] + (avg - current[idx]) * diffRate + advect - coolingRate;
                    if (next[idx] < 0) next[idx] = 0;
                    if (next[idx] > 1) next[idx] = 1;
                }
            }
        }

        // Swap grids and update colors
        for (let i = 0; i < count; i++) {
            current[i] = next[i];

            // Mapping: 0.0 (Cold, Blue) -> 0.5 (Comfortable, Green/Yellow) -> 1.0 (Hot, Red)
            let h = (1.0 - current[i]) * 0.6; // 0.6 = blue, 0.0 = red

            // Render only where room heat exists to hide empty outdoor areas, or show ambient cold
            // To make it look cool, we will color everything, but set dark/dim for freezing outdoor
            const l = current[i] * 0.4 + 0.1; // Darker when cold
            tempColor.setHSL(h, 1.0, l);

            colors[i * 3] = tempColor.r;
            colors[i * 3 + 1] = tempColor.g;
            colors[i * 3 + 2] = tempColor.b;
        }

        meshRef.current.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
        meshRef.current.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
        </instancedMesh>
    );
}

export default function SystemsRenderer() {
    const project = useDesignStore((s) => s.project);
    const visibleLayers = useDesignStore((s) => s.visibleLayers);
    const viewMode = useDesignStore((s) => s.viewMode);
    const activeFloorId = useDesignStore((s) => s.activeFloorId);

    // --- 1. Electrical Layer ---
    const electricalData = useMemo(() => {
        if (!visibleLayers.has('electrical')) return null;
        return generateElectricalLayout(project);
    }, [project, visibleLayers]);

    // --- 2. Plumbing Layer ---
    const plumbingData = useMemo(() => {
        if (!visibleLayers.has('plumbing')) return null;
        return generatePlumbingLayout(project);
    }, [project, visibleLayers]);

    // --- 3. Thermal Layer ---
    const thermalData = useMemo(() => {
        if (!visibleLayers.has('thermal')) return null;
        return runThermalSimulation(project, materialsDatabase as Record<string, Material>);
    }, [project, visibleLayers]);

    // --- 4. HVAC Layer ---
    const hvacData = useMemo(() => {
        if (!visibleLayers.has('hvac')) return null;
        return generateHVACLayout(project);
    }, [project, visibleLayers]);

    // Thermal material with time uniform
    const thermalMaterial = useMemo(() => {
        const mat = createThermalShaderMaterial();
        mat.uniforms.uTime = { value: 0 };
        return mat;
    }, []);

    useFrame((state) => {
        if (thermalMaterial.uniforms.uTime) {
            thermalMaterial.uniforms.uTime.value = state.clock.elapsedTime;
        }
    });

    // Filter for top_down viewing
    const isNodeVisible = useMemo(() => {
        const map = new Map<string, string>();
        const findFloor = (nodeId: string): string | null => {
            const node = project.nodes[nodeId];
            if (!node) return null;
            if (node.type === 'Floor') return node.id;
            if (!node.parent_id) return null;
            return findFloor(node.parent_id);
        };
        Object.values(project.nodes).forEach(n => {
            const fId = findFloor(n.id);
            if (fId) map.set(n.id, fId);
        });

        const sortedFloors = Object.values(project.nodes).filter(n => n.type === 'Floor').sort((a, b) => a.position.y - b.position.y);
        const activeFloorIndex = activeFloorId ? sortedFloors.findIndex(f => f.id === activeFloorId) : -1;

        return (nodeId: string) => {
            if (viewMode !== 'top_down') return true;
            const node = project.nodes[nodeId];
            if (!node) return false;

            if (activeFloorId) {
                const floorId = map.get(nodeId);
                if (!floorId) {
                    if (node.type === 'Roof') return false;
                    return true;
                }
                const floorIndex = sortedFloors.findIndex(f => f.id === floorId);
                if (floorIndex !== activeFloorIndex) return false;
                if (node.type === 'Roof') return false;
                return true;
            }
            if (node.type === 'Roof') return false;
            return true;
        };
    }, [project.nodes, viewMode, activeFloorId]);

    return (
        <group>
            {/* ─── Electrical Visualization ──────────────────────────────── */}
            {electricalData && (
                <group name="layer-electrical">
                    {electricalData.devices.map((dev) => (
                        <mesh
                            key={dev.id}
                            position={[dev.position.x, dev.position.y, dev.position.z]}
                        >
                            <boxGeometry args={[0.1, 0.1, 0.04]} />
                            <meshStandardMaterial color="#ffff00" emissive="#ffff00" emissiveIntensity={0.5} />
                        </mesh>
                    ))}
                    {electricalData.cables.map((cable) => (
                        <line key={cable.id}>
                            <bufferGeometry>
                                <bufferAttribute
                                    attach="attributes-position"
                                    args={[new Float32Array([
                                        cable.from.x, cable.from.y, cable.from.z,
                                        cable.to.x, cable.to.y, cable.to.z
                                    ]), 3]}
                                />
                            </bufferGeometry>
                            <lineBasicMaterial color="#ffcc00" linewidth={3} transparent opacity={0.8} />
                        </line>
                    ))}
                </group>
            )}

            {/* ─── Plumbing Visualization ────────────────────────────────── */}
            {plumbingData && (
                <group name="layer-plumbing">
                    {plumbingData.pipes.map((pipe) => {
                        const transform = getPipeTransform(pipe.from, pipe.to);
                        if (!transform) return null;

                        const radius = (pipe.diameter_mm / 1000) / 2;
                        const color = pipe.type === 'supply_cold' ? '#00ccff'
                            : pipe.type === 'supply_hot' ? '#ff6600'
                                : '#ff3333';

                        return (
                            <mesh
                                key={pipe.id}
                                position={transform.position}
                                quaternion={transform.quaternion}
                            >
                                <cylinderGeometry args={[radius, radius, transform.length, 6]} />
                                <meshStandardMaterial
                                    color={color}
                                    emissive={color}
                                    emissiveIntensity={0.3}
                                    transparent
                                    opacity={0.85}
                                />
                            </mesh>
                        );
                    })}
                </group>
            )}

            {/* ─── Thermal Layer Overlay ─────────────────────────────────── */}
            {visibleLayers.has('thermal') && (
                <group name="layer-thermal">
                    <RealThermalSimulation project={project} />
                </group>
            )}

            {/* ─── HVAC Visualization ────────────────────────────────────── */}
            {hvacData && (
                <group name="layer-hvac">
                    {hvacData.components.map((comp) => (
                        <mesh
                            key={comp.id}
                            position={[comp.position.x, comp.position.y, comp.position.z]}
                            rotation={[comp.rotation.x, comp.rotation.y, comp.rotation.z]}
                        >
                            <boxGeometry args={[comp.dimensions.x, comp.dimensions.y, comp.dimensions.z]} />
                            <meshStandardMaterial
                                color={comp.type.includes('unit') ? '#888888' : '#aaaaaa'}
                                metalness={0.8}
                                roughness={0.2}
                            />
                        </mesh>
                    ))}
                    {hvacData.ducts.map((duct) => {
                        const transform = getPipeTransform(duct.from, duct.to);
                        if (!transform) return null;

                        return (
                            <mesh
                                key={duct.id}
                                position={transform.position}
                                quaternion={transform.quaternion}
                            >
                                {duct.shape === 'round' ? (
                                    <cylinderGeometry args={[duct.width / 2, duct.width / 2, transform.length, 8]} />
                                ) : (
                                    // Box is Y-up, so width/height map to X/Z relative to the length Y
                                    <boxGeometry args={[duct.width, transform.length, duct.height]} />
                                )}
                                <meshStandardMaterial
                                    color="#c0c0c0"
                                    metalness={0.6}
                                    roughness={0.4}
                                    side={THREE.DoubleSide}
                                />
                            </mesh>
                        );
                    })}
                </group>
            )}

            {/* ─── Dimensions Visualization ──────────────────────────────── */}
            {visibleLayers.has('dimensions') && (
                <group name="layer-dimensions">
                    {Object.values(project.nodes).map((node) => {
                        if (node.type !== 'Wall' && node.type !== 'Partition' && node.type !== 'Window' && node.type !== 'Door') return null;
                        if (!isNodeVisible(node.id)) return null;

                        // dimensions.x is always the "length" of the element (along its local axis)
                        const lengthM = node.dimensions.x;
                        const heightM = node.dimensions.y;

                        // Format: show meters if >= 1m, otherwise mm
                        const lengthLabel = lengthM >= 1
                            ? `${lengthM.toFixed(2)}m`
                            : `${Math.round(lengthM * 1000)}mm`;
                        const heightLabel = heightM >= 1
                            ? `${heightM.toFixed(2)}m`
                            : `${Math.round(heightM * 1000)}mm`;

                        // Position label above the node
                        const labelY = node.position.y + node.dimensions.y / 2 + 0.15;

                        return (
                            <group
                                key={`dim_${node.id}_${lengthM}_${heightM}`}
                                position={[node.position.x, labelY, node.position.z]}
                            >
                                <Html center distanceFactor={viewMode === 'top_down' ? undefined : 12}>
                                    <div style={{
                                        background: 'rgba(0,0,0,0.85)',
                                        color: '#00f0ff',
                                        padding: '2px 6px',
                                        borderRadius: '3px',
                                        fontSize: '10px',
                                        fontFamily: 'monospace',
                                        fontWeight: 'bold',
                                        border: '1px solid #00f0ff',
                                        whiteSpace: 'nowrap',
                                        pointerEvents: 'none',
                                        textShadow: '0 0 5px #00f0ff88',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '1px',
                                        lineHeight: '1.2',
                                    }}>
                                        <span>{lengthLabel} × {heightLabel}</span>
                                        {node.type === 'Wall' || node.type === 'Partition' ? (
                                            <span style={{ fontSize: '8px', opacity: 0.7 }}>
                                                t: {Math.round(node.dimensions.z * 1000)}mm
                                            </span>
                                        ) : null}
                                    </div>
                                </Html>
                            </group>
                        );
                    })}
                </group>
            )}
        </group>
    );
}
