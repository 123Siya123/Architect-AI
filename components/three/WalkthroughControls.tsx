/**
 * =============================================================================
 * COMPONENTS/THREE/WALKTHROUGH-CONTROLS.TSX — First-Person Viewport Controls
 * =============================================================================
 * 
 * Provides a 'walk-through' experience similar to a 3D game.
 * Uses PointerLockControls for mouse-look and keyboard for movement.
 * 
 * FEATURES:
 * 1. WASD + Arrow keys for horizontal movement
 * 2. Mouse-look (Pointer Lock)
 * 3. Constant Eye-Level (Locks Y to walk_height)
 * 4. Movement smoothing (Damping)
 * 5. Simple Boundary Collision
 * =============================================================================
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useDesignStore } from '@/store/useDesignStore';

/**
 * Key mapping for movement
 */
const KEY_MAP: Record<string, string> = {
    KeyW: 'forward',
    ArrowUp: 'forward',
    KeyS: 'backward',
    ArrowDown: 'backward',
    KeyA: 'left',
    ArrowLeft: 'left',
    KeyD: 'right',
    ArrowRight: 'right',
};

export default function WalkthroughControls() {
    const { camera } = useThree();
    const cameraState = useDesignStore((s) => s.camera);
    const viewMode = useDesignStore((s) => s.viewMode);

    // Movement state
    const moveState = useRef({
        forward: false,
        backward: false,
        left: false,
        right: false,
        velocity: new THREE.Vector3(),
        direction: new THREE.Vector3(),
    });

    const [isLocked, setIsLocked] = useState(false);
    const controlsRef = useRef<any>(null); // Still using any because Drei's PointerLockControls type is complex to import directly here without potentially breaking, but removing the lint warning comment as I will fix the type if possible or just suppress it more specifically.

    // Manual lock handler with safety check
    const handleLock = () => {
        if (!controlsRef.current || isLocked) return;

        // Some browsers require a fresh user gesture and might throw if 
        // a previous request is still pending.
        try {
            controlsRef.current.lock();
        } catch (err) {
            console.warn('WalkthroughControls: Pointer lock request failed', err);
        }
    };

    // Setup keyboard listeners
    useEffect(() => {
        if (viewMode !== 'walkthrough') return;

        const handleKeyDown = (e: KeyboardEvent) => {
            const action = KEY_MAP[e.code];
            if (action === 'forward' || action === 'backward' || action === 'left' || action === 'right') {
                moveState.current[action] = true;
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            const action = KEY_MAP[e.code];
            if (action === 'forward' || action === 'backward' || action === 'left' || action === 'right') {
                moveState.current[action] = false;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [viewMode]);

    // Reusable objects to avoid per-frame allocations
    const raycaster = useRef(new THREE.Raycaster());
    const downDirection = useRef(new THREE.Vector3(0, -1, 0));

    // Handle frame-based movement
    useFrame((state, delta) => {
        if (viewMode !== 'walkthrough' || !isLocked) return;

        const { forward, backward, left, right, velocity, direction } = moveState.current;

        // 1. Calculate direction vector from inputs
        direction.z = Number(forward) - Number(backward);
        direction.x = Number(right) - Number(left);
        direction.normalize();

        // 2. Apply damping (friction) to velocity
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        // 3. Apply acceleration
        const speed = 40.0 * cameraState.walk_speed;
        if (forward || backward) velocity.z -= direction.z * speed * delta;
        if (left || right) velocity.x -= direction.x * speed * delta;

        // 4. Apply velocity to camera position (local space)
        state.camera.translateX(-velocity.x * delta);
        state.camera.translateZ(velocity.z * delta);

        // 5. Vertical Raycasting (Gravity/Stairs)
        // We cast a ray down from slightly above the camera to find the "active ground"
        const rayOrigin = state.camera.position.clone();
        rayOrigin.y += 0.1;

        raycaster.current.set(rayOrigin, downDirection.current);

        // Only check for "walkable" objects
        const intersects = raycaster.current.intersectObjects(state.scene.children, true);
        const walkableIntersect = intersects.find(intersect =>
            intersect.object.userData.isWalkable === true
        );

        let targetFloorY = 0;
        if (walkableIntersect) {
            targetFloorY = walkableIntersect.point.y;
        }

        // Smooth vertical transition
        const targetCameraY = targetFloorY + cameraState.walk_height;
        const verticalSmoothing = 10.0;
        state.camera.position.y += (targetCameraY - state.camera.position.y) * verticalSmoothing * delta;

        // 6. Simple Boundary Collision (don't wander too far)
        const LIMIT = 100;
        state.camera.position.x = THREE.MathUtils.clamp(state.camera.position.x, -LIMIT, LIMIT);
        state.camera.position.z = THREE.MathUtils.clamp(state.camera.position.z, -LIMIT, LIMIT);
    });

    if (viewMode !== 'walkthrough') return null;

    return (
        <>
            <PointerLockControls
                ref={controlsRef}
                onLock={() => setIsLocked(true)}
                onUnlock={() => setIsLocked(false)}
            />

            {/* Visual Indicator/Instruction when not locked */}
            {!isLocked && (
                <Html fullscreen>
                    <div
                        className="walkthrough-overlay"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleLock();
                        }}
                    >
                        <div className="walkthrough-hint">
                            <p className="walkthrough-hint-title">Walkthrough Mode</p>
                            <p>Click anywhere to start</p>
                            <div className="walkthrough-keys">
                                <span>W A S D</span> — Move
                                <br />
                                <span>MOUSE</span> — Look
                                <br />
                                <span>ESC</span> — Exit
                            </div>
                        </div>
                    </div>
                </Html>
            )}
        </>
    );
}
