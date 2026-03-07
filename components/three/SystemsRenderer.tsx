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

function WindParticles() {
    const count = 200;
    const meshRef = useRef<THREE.InstancedMesh>(null);
    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < count; i++) {
            temp.push({
                x: (Math.random() - 0.5) * 15,
                y: Math.random() * 6,
                z: (Math.random() - 0.5) * 15,
                speed: 0.5 + Math.random() * 1.5,
                offset: Math.random() * 100
            });
        }
        return temp;
    }, []);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame((state) => {
        if (!meshRef.current) return;
        const time = state.clock.elapsedTime;
        particles.forEach((particle, i) => {
            // Move particles along X axis for wind flow, wrapping around
            let x = particle.x + (time * particle.speed) % 20;
            if (x > 10) x -= 20;
            
            // Add some wave motion
            const y = particle.y + Math.sin(time + particle.offset) * 0.2;
            const z = particle.z + Math.cos(time * 0.5 + particle.offset) * 0.2;

            dummy.position.set(x, y, z);
            
            // Scale based on speed to look like streaks
            dummy.scale.set(0.5, 0.05, 0.05);
            dummy.rotation.z = -0.2; // Slight tilt
            
            dummy.updateMatrix();
            meshRef.current!.setMatrixAt(i, dummy.matrix);
        });
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color="#00ffff" transparent opacity={0.4} blending={THREE.AdditiveBlending} />
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
            {thermalData && (
                <group name="layer-thermal">
                    <WindParticles />
                    {Object.entries(project.nodes).map(([id, node]) => {
                        if (['Room', 'Floor', 'House', 'Group'].includes(node.type)) return null;

                        const tempValue = thermalData.node_temperatures[id] ?? 0.5;

                        // Don't render "neutral" internal elements in heatmap
                        if (tempValue > 0.49 && tempValue < 0.51 && !node.tags.includes('exterior')) return null;

                        // Only render thermal for currently visible nodes in Plan view
                        if (!isNodeVisible(id)) return null;

                        return (
                            <mesh
                                key={`thermal_${id}`}
                                position={[node.position.x, node.position.y, node.position.z]}
                                rotation={[0, (node.rotation?.yaw || 0) * (Math.PI / 180), 0]}
                                scale={[1.005, 1.005, 1.005]}
                            >
                                <boxGeometry args={[node.dimensions.x, node.dimensions.y, node.dimensions.z]} />
                                <shaderMaterial
                                    attach="material"
                                    transparent
                                    side={THREE.DoubleSide}
                                    uniforms={{
                                        ...thermalMaterial.uniforms,
                                        tempValue: { value: tempValue }
                                    }}
                                    vertexShader={thermalMaterial.vertexShader}
                                    fragmentShader={`
                                        uniform float tempValue;
                                        uniform float uTime;
                                        varying vec2 vUv;
                                        varying vec3 vPosition;
                                        
                                        // Simple noise function
                                        float rand(vec2 n) { 
                                            return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
                                        }
                                        
                                        float noise(vec2 p){
                                            vec2 ip = floor(p);
                                            vec2 u = fract(p);
                                            u = u*u*(3.0-2.0*u);
                                            
                                            float res = mix(
                                                mix(rand(ip), rand(ip+vec2(1.0,0.0)), u.x),
                                                mix(rand(ip+vec2(0.0,1.0)), rand(ip+vec2(1.0,1.0)), u.x), u.y);
                                            return res*res;
                                        }

                                        vec3 heatmapColor(float t) {
                                            vec3 blue = vec3(0.0, 0.2, 1.0);
                                            vec3 cyan = vec3(0.0, 1.0, 1.0);
                                            vec3 yellow = vec3(1.0, 1.0, 0.0);
                                            vec3 red = vec3(1.0, 0.0, 0.0);
                                            if (t < 0.33) return mix(blue, cyan, t / 0.33);
                                            if (t < 0.66) return mix(cyan, yellow, (t - 0.33) / 0.33);
                                            return mix(yellow, red, (t - 0.66) / 0.34);
                                        }
                                        
                                        void main() {
                                            // Dynamic flow effect
                                            float flow = noise(vPosition.xz * 2.0 + vec2(uTime * 0.5, uTime * 0.2));
                                            
                                            // Pulse effect based on temperature
                                            float pulse = sin(uTime * 2.0 + vPosition.x + vPosition.y) * 0.1;
                                            
                                            float t = clamp(tempValue + flow * 0.1 + pulse, 0.0, 1.0);
                                            vec3 color = heatmapColor(t);
                                            
                                            // Add "wind lines"
                                            float wind = smoothstep(0.4, 0.6, sin(vPosition.x * 10.0 + vPosition.y * 5.0 - uTime * 5.0));
                                            color += vec3(wind * 0.1);

                                            gl_FragColor = vec4(color, 0.6);
                                        }
                                    `}
                                />
                            </mesh>
                        );
                    })}
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
