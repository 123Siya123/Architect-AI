/**
 * =============================================================================
 * COMPONENTS/THREE/SCENE-CANVAS.TSX — Main 3D Viewport
 * =============================================================================
 *
 * Wraps the Three.js canvas in a React Three Fiber component.
 * Sets up: camera, lighting, shadows, orbit controls, grid, and
 * the PSG renderer that draws the actual house geometry.
 *
 * RENDERING PIPELINE:
 * SceneCanvas sets up the "world" → PSGRenderer draws each node
 *
 * IMPORTANT: This component must be loaded with dynamic import
 * (next/dynamic with ssr: false) because Three.js doesn't work
 * in server-side rendering.
 * =============================================================================
 */

'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, GizmoHelper, GizmoViewport, Sky, OrthographicCamera } from '@react-three/drei';
import { useDesignStore } from '@/store/useDesignStore';
import PSGRenderer from './PSGRenderer';

// =============================================================================
// LIGHTING SETUP
// =============================================================================

/**
 * Three-point lighting: ambient fill + directional sun + soft secondary.
 * The directional light casts shadows for visual depth.
 */
function SceneLighting() {
    return (
        <>
            {/* Ambient fill — prevents pure-black shadows */}
            <ambientLight intensity={0.4} color="#e0e8ff" />

            {/* Main sun light — positioned high and to the northwest */}
            <directionalLight
                position={[20, 30, -10]}
                intensity={1.2}
                color="#fff5e6"
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-camera-left={-30}
                shadow-camera-right={30}
                shadow-camera-top={30}
                shadow-camera-bottom={-30}
                shadow-camera-near={0.5}
                shadow-camera-far={80}
                shadow-bias={-0.0001}
            />

            {/* Secondary fill light — softer, from the opposite side */}
            <directionalLight
                position={[-15, 10, 15]}
                intensity={0.3}
                color="#b0c4ff"
            />

            {/* Hemisphere light — sky + ground bounce */}
            <hemisphereLight
                args={['#87CEEB', '#556B2F', 0.3]}
            />
        </>
    );
}

// =============================================================================
// GROUND GRID
// =============================================================================

function SceneGrid() {
    const visibleLayers = useDesignStore((s) => s.visibleLayers);
    if (!visibleLayers.has('grid')) return null;

    return (
        <Grid
            args={[50, 50]}
            position={[0, -0.01, 0]}
            cellSize={1}
            cellThickness={0.5}
            cellColor="#444466"
            sectionSize={5}
            sectionThickness={1}
            sectionColor="#6666aa"
            fadeDistance={60}
            fadeStrength={1.5}
            infiniteGrid
        />
    );
}

// =============================================================================
// LOADING FALLBACK
// =============================================================================

function LoadingFallback() {
    return (
        <mesh position={[5, 1, 5]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color="#666" wireframe />
        </mesh>
    );
}

// =============================================================================
// MAIN CANVAS
// =============================================================================

import WalkthroughControls from './WalkthroughControls';
import SystemsRenderer from './SystemsRenderer';

export default function SceneCanvas() {
    const camera = useDesignStore((s) => s.camera);
    const viewMode = useDesignStore((s) => s.viewMode);

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <Canvas
                shadows
                camera={{
                    position: [camera.position.x, camera.position.y, camera.position.z],
                    fov: camera.fov,
                    near: camera.near,
                    far: camera.far,
                }}
                gl={{
                    antialias: true,
                    alpha: false,
                    powerPreference: 'high-performance',
                    stencil: true,
                }}
                style={{ background: '#0a0a1a' }}
            >
                {/* Cameras */}
                {viewMode === 'top_down' && (
                    <OrthographicCamera
                        makeDefault
                        position={[camera.target.x, 100, camera.target.z]}
                        up={[0, 0, -1]}
                        zoom={50}
                        near={0.1}
                        far={1000}
                    />
                )}

                {/* Background Color */}
                <color attach="background" args={[viewMode === 'top_down' ? '#ffffff' : '#0a0a1a']} />

                {/* Sky/Environment (Only for perspectives) */}
                {viewMode !== 'top_down' && (
                    <Suspense fallback={null}>
                        {viewMode === 'front' ? (
                            <>
                                <Sky sunPosition={[100, 20, 100]} turbidity={0.1} rayleigh={0.5} />
                                <Environment preset="forest" background />
                                <fog attach="fog" args={['#a0d0ff', 40, 150]} />
                            </>
                        ) : (
                            <fog attach="fog" args={['#0a0a1a', 40, 100]} />
                        )}
                    </Suspense>
                )}

                {/* Lighting */}
                {viewMode === 'top_down' ? (
                    <>
                        <ambientLight intensity={1.5} />
                        <directionalLight position={[0, 100, 0]} intensity={0.5} />
                    </>
                ) : (
                    <SceneLighting />
                )}

                {/* Controls - Conditional based on ViewMode */}
                {viewMode === 'orbit' || viewMode === 'top_down' || viewMode === 'front' ? (
                    <OrbitControls
                        makeDefault
                        target={[camera.target.x, camera.target.y, camera.target.z]}
                        enableDamping
                        dampingFactor={0.1}
                        enableRotate={viewMode !== 'top_down'}
                        minDistance={2}
                        maxDistance={80}
                        maxPolarAngle={viewMode === 'top_down' ? 0 : Math.PI / 2 + 0.1}
                        minPolarAngle={viewMode === 'top_down' ? 0 : 0}
                    />
                ) : null}

                {viewMode === 'walkthrough' && <WalkthroughControls />}

                {/* Grid */}
                {viewMode !== 'front' && <SceneGrid />}

                {/* Ground plane (receives shadows) */}
                {viewMode !== 'top_down' && (
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
                        <planeGeometry args={[200, 200]} />
                        {viewMode === 'front' ? (
                            <meshStandardMaterial
                                color="#2d4a1e"
                                roughness={0.8}
                                metalness={0.05}
                            />
                        ) : (
                            <shadowMaterial opacity={0.3} />
                        )}
                    </mesh>
                )}

                {/* PSG Scene — wrapped in Suspense for async loads */}
                <Suspense fallback={<LoadingFallback />}>
                    <PSGRenderer />
                    <SystemsRenderer />
                </Suspense>

                {/* Orientation gizmo (top-right corner) */}
                <GizmoHelper alignment="bottom-right" margin={[60, 60]}>
                    <GizmoViewport
                        axisColors={['#ff4060', '#40ff60', '#4060ff']}
                        labelColor="white"
                    />
                </GizmoHelper>
            </Canvas>
        </div>
    );
}
