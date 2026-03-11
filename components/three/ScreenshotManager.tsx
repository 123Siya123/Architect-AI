'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useDesignStore } from '@/store/useDesignStore';

export default function ScreenshotManager() {
    const { gl, scene, camera } = useThree();
    const isScreenshotRequested = useDesignStore((s) => s.isScreenshotRequested);
    const setScreenshotRequested = useDesignStore((s) => s.setScreenshotRequested);
    const addChatMessage = useDesignStore((s) => s.addChatMessage);
    
    useEffect(() => {
        if (!isScreenshotRequested) return;
        
        // Disable trigger to prevent loop
        setScreenshotRequested(false);
        
        // Use requestAnimationFrame to let any pending renders finish first
        requestAnimationFrame(() => {
            const originalBackground = scene.background;
            const originalCameraPos = camera.position.clone();
            const originalCameraRot = camera.rotation.clone();
            
            // Cast camera to orthographic or perspective
            const isOrtho = (camera as any).isOrthographicCamera;
            const originalCameraZoom = isOrtho ? (camera as any).zoom : 1;
        
            // Save fog details
            const originalFog = scene.fog;
        
            // 1. Move camera high and look down (Isometric style)
            camera.position.set(25, 35, 25);
            camera.lookAt(0, 0, 0);
            if (isOrtho) {
                (camera as any).zoom = 15; // zoom out further to fit everything
            } else {
                (camera as any).fov = 75; // wider angle if perspective
            }
            camera.updateProjectionMatrix();
        
            // 2. Clear background to white so we can see high-contrast details
            // AI vision models generally perform well on clean solid backgrounds
            scene.background = new THREE.Color(0xFFFFFF);
            scene.fog = null; // Remove fog for clear shot
        
            // 3. Render frame synchronously
            gl.render(scene, camera);
        
            // 4. Capture screenshot
            const dataUrl = gl.domElement.toDataURL('image/png', 1.0);
            
            // 5. Restore camera and background
            camera.position.copy(originalCameraPos);
            camera.rotation.copy(originalCameraRot);
            if (isOrtho) {
                (camera as any).zoom = originalCameraZoom;
            } else {
                // Restore default FOV (usually 60)
                (camera as any).fov = 60;
            }
            camera.updateProjectionMatrix();
            scene.background = originalBackground;
            scene.fog = originalFog;
            
            // Render one more time with exact previous state to clear changes
            gl.render(scene, camera);
            
            // Send to AI QC endpoint
            submitScreenshotForQC(dataUrl);
        });
    }, [isScreenshotRequested, gl, scene, camera]);

    const submitScreenshotForQC = async (dataUrl: string) => {
        // Find the original user prompt by walking back through messages
        const chatMessages = useDesignStore.getState().chatMessages;
        const lastUserMsg = [...chatMessages].reverse().find(m => m.role === 'user');
        
        addChatMessage({
            id: `msg_qc_loading_${Date.now()}`,
            role: 'assistant',
            content: '📸 Taking a snapshot to ensure the design meets your requests...',
            timestamp: new Date().toISOString()
        });

        const b64 = dataUrl.split(',')[1];

        try {
            const res = await fetch('/api/ai/qc', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageBase64: b64,
                    userPrompt: lastUserMsg ? lastUserMsg.content : ''
                })
            });

            if (!res.ok) throw new Error('QC API returned error');

            const data = await res.json();
            
            // Remove loading msg, add real msg
            const finalMsgs = useDesignStore.getState().chatMessages.filter(m => !m.id.startsWith('msg_qc_loading'));
            useDesignStore.setState({ chatMessages: finalMsgs });

            addChatMessage({
                id: `msg_qc_done_${Date.now()}`,
                role: 'assistant',
                content: `**📸 Visual QC Audit:**\n\n${data.message}`,
                timestamp: new Date().toISOString(),
                // Optionally append the image as an attachment so the user sees what was reviewed
                attachments: [{ name: 'snapshot.png', type: 'image/png', data: b64 }]
            });

        } catch (e) {
            console.error('Failed to get QC:', e);
            // remove loading msg
            const finalMsgs = useDesignStore.getState().chatMessages.filter(m => !m.id.startsWith('msg_qc_loading'));
            useDesignStore.setState({ chatMessages: finalMsgs });
        }
    };

    return null;
}
