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

import React, { useEffect, Suspense, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useDesignStore } from '@/store/useDesignStore';
import { createSimple3BedTemplate } from '@/lib/psg/templates';
import { useSearchParams } from 'next/navigation';
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

function DesignStudioContent() {
    const loadProject = useDesignStore((s) => s.loadProject);
    const loadFromServer = useDesignStore((s) => s.loadFromServer);
    const activePanel = useDesignStore((s) => s.activePanel);
    const setActivePanel = useDesignStore((s) => s.setActivePanel);
    const isLoading = useDesignStore((s) => s.isLoading);
    const error = useDesignStore((s) => s.error);
    const setError = useDesignStore((s) => s.setError);
    const project = useDesignStore((s) => s.project);
    const searchParams = useSearchParams();

    const [sidebarWidth, setSidebarWidth] = useState(340);
    const isResizing = useRef(false);
    const [isResizingState, setIsResizingState] = useState(false);

    const startResizing = useCallback(() => {
        isResizing.current = true;
        setIsResizingState(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, []);

    const stopResizing = useCallback(() => {
        isResizing.current = false;
        setIsResizingState(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }, []);

    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        if (isResizing.current) {
            const newWidth = window.innerWidth - mouseMoveEvent.clientX;
            if (newWidth > 250 && newWidth < 800) {
                setSidebarWidth(newWidth);
            }
        }
    }, []);

    useEffect(() => {
        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResizing);
        return () => {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResizing);
        };
    }, [resize, stopResizing]);

    // Load from server if ID is present
    useEffect(() => {
        const projectId = searchParams.get('id');
        if (projectId) {
            loadFromServer(projectId);
        }
    }, [searchParams, loadFromServer]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyboard = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable)
            ) {
                return;
            }
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
            // Escape = Deselect + Reset Nature View
            if (e.key === 'Escape') {
                const state = useDesignStore.getState();
                state.selectNode(null);
                if (state.viewMode === 'front') {
                    state.setViewMode('orbit');
                }
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
                    {error && (
                        <div className="studio-error-banner" role="alert">
                            <span>{error}</span>
                            <button type="button" onClick={() => setError(null)}>Dismiss</button>
                        </div>
                    )}
                    {isLoading && (
                        <div className="scene-loading" style={{ position: 'absolute', inset: 0, zIndex: 10 }}>
                            <div className="scene-loading-spinner" />
                            <p>Loading project...</p>
                        </div>
                    )}
                    <SceneCanvas />
                </div>

                {/* Sidebar */}
                <div 
                    className={`resize-handle ${isResizingState ? 'active' : ''}`}
                    onMouseDown={startResizing}
                />
                <div 
                    className="design-sidebar" 
                    style={{ width: sidebarWidth, minWidth: sidebarWidth }}
                >
                    {/* Panel Tabs */}
                    <div className="sidebar-tabs">
                        <button
                            className={`sidebar-tab ${activePanel === 'chat' ? 'active' : ''}`}
                            onClick={() => setActivePanel('chat')}
                        >
                            Architect
                        </button>
                        <button
                            className={`sidebar-tab ${activePanel === 'inspector' ? 'active' : ''}`}
                            onClick={() => setActivePanel('inspector')}
                        >
                            Inspector
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

export default function DesignStudioPage() {
    return (
        <Suspense fallback={
            <div className="scene-loading">
                <div className="scene-loading-spinner" />
                <p>Loading Design Studio...</p>
            </div>
        }>
            <DesignStudioContent />
        </Suspense>
    );
}
