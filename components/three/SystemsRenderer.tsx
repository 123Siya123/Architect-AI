/**
 * =============================================================================
 * COMPONENTS/THREE/SYSTEMS-RENDERER.TSX — Visualizes Technical Layers
 * =============================================================================
 * 
 * Renders non-structural layers when toggled on:
 * 1. ELECTRICAL: Wires (yellow lines) + Sockets/Switches (boxes)
 * 2. PLUMBING: Cold supply (green), Hot supply (orange), Drain (red)
 * 3. THERMAL: Heatmap overlay using custom shader
 * 4. DIMENSIONS: 3D labels and lines (future Phase 4)
 * =============================================================================
 */

'use client';

import React, { useMemo } from 'react';
import * as THREE from 'three';
import { useDesignStore } from '@/store/useDesignStore';
import { generateElectricalLayout } from '@/lib/systems/electrical';
import { generatePlumbingLayout } from '@/lib/systems/plumbing';
import { runThermalSimulation } from '@/lib/thermal/simulator';
import { LAYER_MATERIALS, createThermalShaderMaterial } from '@/lib/psg/compiler';
import materialsDatabase from '@/data/materials.json';
import type { Material } from '@/types';

export default function SystemsRenderer() {
    const project = useDesignStore((s) => s.project);
    const visibleLayers = useDesignStore((s) => s.visibleLayers);

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

    // Thermal material
    const thermalMaterial = useMemo(() => createThermalShaderMaterial(), []);

    return (
        <group>
            {/* Electrical Visualization */}
            {electricalData && (
                <group name="layer-electrical">
                    {electricalData.devices.map((dev) => (
                        <mesh
                            key={dev.id}
                            position={[dev.position.x, dev.position.y, dev.position.z]}
                        >
                            <boxGeometry args={[0.08, 0.08, 0.02]} />
                            <primitive object={LAYER_MATERIALS.electrical()} attach="material" />
                        </mesh>
                    ))}
                    {/* Cables - simplified as lines */}
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
                            <lineBasicMaterial color="#ffaa00" linewidth={2} />
                        </line>
                    ))}
                </group>
            )}

            {/* Plumbing Visualization */}
            {plumbingData && (
                <group name="layer-plumbing">
                    {plumbingData.pipes.map((pipe) => {
                        const midX = (pipe.from.x + pipe.to.x) / 2;
                        const midY = (pipe.from.y + pipe.to.y) / 2;
                        const midZ = (pipe.from.z + pipe.to.z) / 2;
                        const dist = Math.sqrt(
                            (pipe.to.x - pipe.from.x) ** 2 +
                            (pipe.to.y - pipe.from.y) ** 2 +
                            (pipe.to.z - pipe.from.z) ** 2
                        );

                        return (
                            <mesh
                                key={pipe.id}
                                position={[midX, midY, midZ]}
                            // Logic to rotate cylinder to face points would go here, 
                            // for now we use a simpler line-mesh for performance
                            >
                                <boxGeometry args={[dist, pipe.diameter_mm / 1000, pipe.diameter_mm / 1000]} />
                                <primitive
                                    object={
                                        pipe.type === 'supply_cold' ? LAYER_MATERIALS.plumbing_supply() :
                                            pipe.type === 'supply_hot' ? LAYER_MATERIALS.plumbing_supply() : // orange color todo
                                                LAYER_MATERIALS.plumbing_drain()
                                    }
                                    attach="material"
                                />
                            </mesh>
                        );
                    })}
                </group>
            )}

            {/* Thermal Layer Overlay */}
            {thermalData && (
                <group name="layer-thermal">
                    {Object.entries(project.nodes).map(([id, node]) => {
                        if (['Room', 'Floor', 'House'].includes(node.type)) return null;

                        const tempValue = thermalData.node_temperatures[id] ?? 0.5;

                        // We render a slightly larger "skin" over the existing geometry
                        // to show the thermal heatmap.
                        return (
                            <mesh
                                key={`thermal_${id}`}
                                position={[node.position.x, node.position.y, node.position.z]}
                                scale={[1.01, 1.01, 1.01]}
                            >
                                {/* Reuse geometry logic for thermal skin */}
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
                                        uniform float opacity;
                                        varying vec2 vUv;
                                        
                                        vec3 heatmapColor(float t) {
                                            vec3 blue = vec3(0.1, 0.1, 1.0);
                                            vec3 cyan = vec3(0.1, 1.0, 1.0);
                                            vec3 yellow = vec3(1.0, 1.0, 0.1);
                                            vec3 red = vec3(1.0, 0.1, 0.1);
                                            if (t < 0.33) return mix(blue, cyan, t / 0.33);
                                            if (t < 0.66) return mix(cyan, yellow, (t - 0.33) / 0.33);
                                            return mix(yellow, red, (t - 0.66) / 0.34);
                                        }
                                        
                                        void main() {
                                            vec3 color = heatmapColor(tempValue);
                                            gl_FragColor = vec4(color, 0.6);
                                        }
                                    `}
                                />
                            </mesh>
                        );
                    })}
                </group>
            )}

            {/* Dimensions Visualization */}
            {visibleLayers.has('dimensions') && (
                <group name="layer-dimensions">
                    {Object.values(project.nodes).map((node) => {
                        if (node.type !== 'Wall' && node.type !== 'Partition' && node.type !== 'Slab') return null;

                        const label = node.dimensions.x >= node.dimensions.z
                            ? `${node.dimensions.x.toFixed(2)}m`
                            : `${node.dimensions.z.toFixed(2)}m`;

                        return (
                            <group
                                key={`dim_${node.id}`}
                                position={[node.position.x, node.position.y + node.dimensions.y / 2 + 0.2, node.position.z]}
                            >
                                <Html center distanceFactor={10}>
                                    <div className="dimension-label">
                                        {label}
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

import { Html } from '@react-three/drei';
