/**
 * =============================================================================
 * APP/DESIGN/PAGE.TSX — Main Design Studio Page
 * =============================================================================
 *
 * This is the heart of the application — the design studio where users
 * interact with the 3D house model, chat with the AI, and edit properties.
 *
 * LAYOUT:
 * ┌────────────────────────────────────────────────────────┐
 * │                      Toolbar                           │
 * ├────────────────────────────────┬────────────────────────┤
 * │                                │     Sidebar            │
 * │         3D Viewport            │  (Chat / Inspector)   │
 * │       (SceneCanvas)            │                        │
 * │                                │                        │
 * └────────────────────────────────┴────────────────────────┘
 *
 * The 3D viewport uses React Three Fiber (Canvas) which requires
 * client-side only rendering. We use next/dynamic with ssr: false.
 * =============================================================================
 */

'use client';

import React, { useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useDesignStore } from '@/store/useDesignStore';
import { createSimple3BedTemplate } from '@/lib/psg/templates';
import Toolbar from '@/components/ui/Toolbar';
import InspectorPanel from '@/components/ui/InspectorPanel';
import ChatPanel from '@/components/chat/ChatPanel';

// Dynamic import of SceneCanvas — Three.js doesn't work in SSR
const SceneCanvas = dynamic(
    () => import('@/components/three/SceneCanvas'),
    {
        ssr: false,
        loading: () => (
            <div className="scene-loading">
                <div className="scene-loading-spinner" />
                <p>Loading 3D Engine...</p>
            </div>
        ),
    }
);

export default function DesignStudioPage() {
    const loadProject = useDesignStore((s) => s.loadProject);
    const activePanel = useDesignStore((s) => s.activePanel);
    const setActivePanel = useDesignStore((s) => s.setActivePanel);
    const isLoading = useDesignStore((s) => s.isLoading);

    // Load a default template on first mount
    useEffect(() => {
        const defaultProject = createSimple3BedTemplate(200000, 'EUR');
        loadProject(defaultProject);
    }, [loadProject]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyboard = (e: KeyboardEvent) => {
            // Ctrl+Z = Undo
            if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                useDesignStore.getState().undo();
            }
            // Ctrl+Y or Ctrl+Shift+Z = Redo
            if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                useDesignStore.getState().redo();
            }
            // Escape = Deselect
            if (e.key === 'Escape') {
                useDesignStore.getState().selectNode(null);
            }
            // 1-4 = View modes
            if (e.key === '1') useDesignStore.getState().setViewMode('orbit');
            if (e.key === '2') useDesignStore.getState().setViewMode('walkthrough');
            if (e.key === '3') useDesignStore.getState().setViewMode('top_down');
            if (e.key === '4') useDesignStore.getState().setViewMode('front');
        };

        window.addEventListener('keydown', handleKeyboard);
        return () => window.removeEventListener('keydown', handleKeyboard);
    }, []);

    return (
        <div className="design-studio">
            {/* Top Toolbar */}
            <Toolbar />

            {/* Main Content Area */}
            <div className="design-main">
                {/* 3D Viewport */}
                <div className="design-viewport">
                    {isLoading ? (
                        <div className="scene-loading">
                            <div className="scene-loading-spinner" />
                            <p>Loading project...</p>
                        </div>
                    ) : (
                        <SceneCanvas />
                    )}
                </div>

                {/* Sidebar */}
                <div className="design-sidebar">
                    {/* Panel Tabs */}
                    <div className="sidebar-tabs">
                        <button
                            className={`sidebar-tab ${activePanel === 'chat' ? 'active' : ''}`}
                            onClick={() => setActivePanel('chat')}
                        >
                            💬 Chat
                        </button>
                        <button
                            className={`sidebar-tab ${activePanel === 'inspector' ? 'active' : ''}`}
                            onClick={() => setActivePanel('inspector')}
                        >
                            🔍 Inspector
                        </button>
                    </div>

                    {/* Panel Content */}
                    <div className="sidebar-content">
                        {activePanel === 'chat' && <ChatPanel />}
                        {activePanel === 'inspector' && <InspectorPanel />}
                    </div>
                </div>
            </div>
        </div>
    );
}
