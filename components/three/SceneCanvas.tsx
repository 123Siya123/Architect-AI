/**
 * =============================================================================
 * COMPONENTS/THREE/SCENE-CANVAS.TSX — Main Three.js Canvas Wrapper
 * =============================================================================
 *
 * The root 3D viewport component. Wraps React Three Fiber's <Canvas>
 * with our application-specific configuration:
 * - Camera setup (position, FOV, clipping planes)
 * - Lighting (ambient + directional for realistic shadows)
 * - Fog (depth cue for large scenes)
 * - Performance settings (pixel ratio, frame loop)
 * - Post-processing (future: SSAO, bloom)
 *
 * This component renders the PSGRenderer (which draws the house)
 * and the CameraController (which handles orbit/walk-through).
 *
 * USAGE:
 * <SceneCanvas /> — that's it. It reads all state from the Zustand store.
 *
 * WHY A SEPARATE WRAPPER?
 * - Isolates Three.js setup from business logic
 * - Easy to add/remove post-processing effects
 * - Camera configuration in one place
 * - Performance tuning without touching components
 * =============================================================================
 */

'use client';

import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, GizmoHelper, GizmoViewport } from '@react-three/drei';
import { PSGRenderer } from './PSGRenderer';
import { useDesignStore } from '@/store/useDesignStore';

export function SceneCanvas() {
    const viewMode = useDesignStore((s) => s.viewMode);

    return (
        <Canvas
            /**
             * Camera configuration:
             * - position: starts zoomed out to see the whole house
             * - fov: 60° is natural for architectural visualization
             * - near/far: clipping planes in meters
             */
            camera={{
                position: [15, 12, 15],
                fov: 60,
                near: 0.1,
                far: 500,
            }}
            /**
             * Performance settings:
             * - dpr: device pixel ratio (auto-adjust for retina)
             * - shadows: enabled for realism in walk-through mode
             */
            dpr={[1, 2]}
            shadows
            style={{ background: 'transparent' }}
        >
            {/* ── Lighting ────────────────────────────────────────────────── */}
            {/* Ambient: soft fill light so nothing is pure black */}
            <ambientLight intensity={0.4} />
            {/* Directional: sun-like light casting shadows */}
            <directionalLight
                position={[20, 30, 10]}
                intensity={1.2}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-camera-far={100}
                shadow-camera-left={-30}
                shadow-camera-right={30}
                shadow-camera-top={30}
                shadow-camera-bottom={-30}
            />
            {/* Hemisphere: sky/ground color bleed for natural look */}
            <hemisphereLight args={['#87CEEB', '#8B7D6B', 0.3]} />

            {/* ── Scene Content ───────────────────────────────────────────── */}
            <Suspense fallback={null}>
                {/* The PSG Renderer draws all house nodes */}
                <PSGRenderer />
            </Suspense>

            {/* ── Ground Grid ─────────────────────────────────────────────── */}
            {/* Helps with spatial orientation; 1m grid squares */}
            <Grid
                position={[0, -0.01, 0]}
                args={[100, 100]}
                cellSize={1}
                cellThickness={0.5}
                cellColor="#6e6e6e"
                sectionSize={5}
                sectionThickness={1}
                sectionColor="#9d4b4b"
                fadeDistance={50}
                fadeStrength={1}
                infiniteGrid
            />

            {/* ── Camera Controls ─────────────────────────────────────────── */}
            {viewMode === 'orbit' && (
                <OrbitControls
                    makeDefault
                    enableDamping
                    dampingFactor={0.1}
                    minDistance={2}
                    maxDistance={100}
                    maxPolarAngle={Math.PI / 2.1} // Prevent going below ground
                />
            )}

            {/* ── Gizmo (axis indicator in corner) ────────────────────────── */}
            <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                <GizmoViewport labelColor="white" axisHeadScale={1} />
            </GizmoHelper>
        </Canvas>
    );
}
