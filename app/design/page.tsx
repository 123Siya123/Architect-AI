/**
 * =============================================================================
 * APP/DESIGN/PAGE.TSX — Design Studio Page
 * =============================================================================
 *
 * The main design studio where users see and edit their house in 3D.
 * This is the CORE page of the application.
 *
 * LAYOUT:
 * ┌─────────────────────────────────────────────────────────┐
 * │                      TOOLBAR                            │
 * ├──────────┬────────────────────────────────┬──────────────┤
 * │          │                                │              │
 * │ AI CHAT  │      3D VIEWPORT               │  INSPECTOR   │
 * │  PANEL   │      (Three.js Canvas)         │   PANEL      │
 * │          │                                │              │
 * │          │                                │              │
 * └──────────┴────────────────────────────────┴──────────────┘
 *
 * The viewport takes up the majority of the screen.
 * The chat panel is on the left (collapsible).
 * The inspector panel is on the right (shows when a node is selected).
 *
 * STATE:
 * All state comes from the Zustand store. This page just lays out
 * the components — no business logic here.
 *
 * DYNAMIC IMPORT:
 * SceneCanvas uses Three.js which requires the browser's WebGL context.
 * We use Next.js dynamic() with ssr: false to prevent server-side
 * rendering errors (Three.js crashes on the server).
 * =============================================================================
 */

'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Toolbar } from '@/components/ui/Toolbar';
import { InspectorPanel } from '@/components/ui/InspectorPanel';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { useDesignStore } from '@/store/useDesignStore';
import { createSimple3BedTemplate } from '@/lib/psg/templates';

/**
 * Dynamic import for Three.js canvas — MUST disable SSR.
 * Three.js relies on `window`, `document`, and WebGL which don't
 * exist during server-side rendering.
 */
const SceneCanvas = dynamic(
    () => import('@/components/three/SceneCanvas').then((mod) => mod.SceneCanvas),
    { ssr: false, loading: () => <div className="viewport-loading">Loading 3D Engine...</div> }
);

export default function DesignPage() {
    const loadProject = useDesignStore((s) => s.loadProject);
    const activePanel = useDesignStore((s) => s.activePanel);

    // Load a starter template on first mount
    useEffect(() => {
        const template = createSimple3BedTemplate(200000, 'EUR');
        loadProject(template);
    }, [loadProject]);

    return (
        <div className="design-studio">
            {/* ── Top Toolbar ──────────────────────────────────────── */}
            <Toolbar />

            {/* ── Main Content Area ────────────────────────────────── */}
            <div className="design-content">
                {/* Left: AI Chat Panel */}
                <div className={`panel-container left ${activePanel === 'chat' ? 'open' : ''}`}>
                    <ChatPanel />
                </div>

                {/* Center: 3D Viewport */}
                <div className="viewport-container">
                    <SceneCanvas />
                </div>

                {/* Right: Inspector Panel */}
                <div className={`panel-container right ${activePanel === 'inspector' ? 'open' : ''}`}>
                    <InspectorPanel />
                </div>
            </div>
        </div>
    );
}
