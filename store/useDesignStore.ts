/**
 * =============================================================================
 * STORE/USE-DESIGN-STORE.TS — Global State Management (Zustand)
 * =============================================================================
 *
 * Single source of truth for the entire design studio.
 * Manages: PSG project, camera, selection, layers, chat, undo/redo.
 *
 * WHY ZUSTAND? Tiny (~1KB), no Provider wrapper, works with Three.js,
 * supports selective subscriptions (3D viewport re-renders only when
 * nodes change, not when chat updates).
 *
 * STATE FLOW:
 * User/AI action → Zustand action → PSG operation → Validation → Update
 *                                                     ↓
 * Three.js re-renders ← React detects change ← Zustand notifies
 * =============================================================================
 */

import { create } from 'zustand';
import type {
    PSGProject, PSGNode, PSGOperation, OperationResult,
    ViewMode, ViewLayer, ActivePanel, SelectionState,
    CameraState, ChatMessage,
} from '@/types';
import { applyOperation, applyBatchOperations, createUndoOperation } from '@/lib/psg/operations';
import { createEmptyProject } from '@/lib/psg/schema';
import { calculateProjectCost } from '@/lib/psg/cost-calculator';
import materialsDatabase from '@/data/materials.json';
import type { Material } from '@/types';

// =============================================================================
// HELPER FOR COST CALCULATION
// =============================================================================
function projectWithCalculatedCost(project: PSGProject): PSGProject {
    const { updatedBudget } = calculateProjectCost(project, materialsDatabase as Record<string, Material>);
    return {
        ...project,
        budget: updatedBudget,
    };
}

// =============================================================================
// STATE INTERFACE
// =============================================================================

interface DesignState {
    project: PSGProject;
    viewMode: ViewMode;
    visibleLayers: Set<ViewLayer>;
    camera: CameraState;
    selection: SelectionState;
    activePanel: ActivePanel;
    activeFloorId: string | null;
    isLoading: boolean;
    error: string | null;
    chatMessages: ChatMessage[];
    isAIThinking: boolean;
    undoStack: PSGOperation[];
    redoStack: PSGOperation[];

    // Actions
    loadProject: (project: PSGProject) => void;
    applyOp: (operation: PSGOperation) => OperationResult;
    applyBatchOps: (operations: PSGOperation[]) => OperationResult;
    undo: () => void;
    redo: () => void;
    selectNode: (nodeId: string | null) => void;
    hoverNode: (nodeId: string | null) => void;
    toggleLayer: (layer: ViewLayer) => void;
    setViewMode: (mode: ViewMode) => void;
    setActivePanel: (panel: ActivePanel) => void;
    setActiveFloorId: (floorId: string | null) => void;
    addChatMessage: (message: ChatMessage) => void;
    sendMessageToAI: (text: string) => Promise<void>;
    revertToMessage: (messageId: string) => void;
    setAIThinking: (thinking: boolean) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    getNode: (id: string) => PSGNode | undefined;
    getNodesByType: (type: string) => PSGNode[];
    saveToServer: () => Promise<void>;
    loadFromServer: (id: string) => Promise<void>;
}

// Defaults
const defaultCamera: CameraState = {
    mode: 'orbit',
    position: { x: 15, y: 12, z: 15 },
    target: { x: 5, y: 2, z: 5 },
    fov: 60, near: 0.1, far: 1000,
    walk_height: 1.7, walk_speed: 1.0, collision: true,
};

const defaultSelection: SelectionState = {
    selected_node_id: null,
    hovered_node_id: null,
    multi_select_ids: [],
};

// =============================================================================
// STORE
// =============================================================================

export const useDesignStore = create<DesignState>((set, get) => ({
    project: projectWithCalculatedCost(createEmptyProject()),
    viewMode: 'orbit',
    visibleLayers: new Set<ViewLayer>(['structure', 'grid', 'dimensions']),
    camera: defaultCamera,
    selection: defaultSelection,
    activePanel: 'chat',
    activeFloorId: null,
    isLoading: false,
    error: null,
    chatMessages: [],
    isAIThinking: false,
    undoStack: [],
    redoStack: [],

    loadProject: (project) => set({ project: projectWithCalculatedCost(project), selection: defaultSelection, undoStack: [], redoStack: [], error: null }),

    applyOp: (operation) => {
        const { project, undoStack } = get();
        const result = applyOperation(project, operation);
        if (result.success && result.project) {
            set({ project: projectWithCalculatedCost(result.project), undoStack: [...undoStack, operation], redoStack: [] });
        }
        return result;
    },

    applyBatchOps: (operations) => {
        const { project, undoStack } = get();
        const result = applyBatchOperations(project, operations);
        if (result.success && result.project) {
            set({ project: projectWithCalculatedCost(result.project), undoStack: [...undoStack, ...operations], redoStack: [] });
        }
        return result;
    },

    undo: () => {
        const { undoStack, redoStack, project } = get();
        if (undoStack.length === 0) return;
        const lastOp = undoStack[undoStack.length - 1];
        const undoOp = createUndoOperation(lastOp);
        if (undoOp) {
            const result = applyOperation(project, undoOp);
            if (result.success && result.project) {
                set({ project: projectWithCalculatedCost(result.project), undoStack: undoStack.slice(0, -1), redoStack: [...redoStack, lastOp] });
            }
        }
    },

    redo: () => {
        const { redoStack, project, undoStack } = get();
        if (redoStack.length === 0) return;
        const redoOp = redoStack[redoStack.length - 1];
        const result = applyOperation(project, redoOp);
        if (result.success && result.project) {
            set({ project: projectWithCalculatedCost(result.project), undoStack: [...undoStack, redoOp], redoStack: redoStack.slice(0, -1) });
        }
    },

    selectNode: (nodeId) => set({ selection: { ...get().selection, selected_node_id: nodeId }, activePanel: nodeId ? 'inspector' : get().activePanel }),
    hoverNode: (nodeId) => set({ selection: { ...get().selection, hovered_node_id: nodeId } }),

    toggleLayer: (layer) => {
        const newLayers = new Set(get().visibleLayers);
        if (newLayers.has(layer)) {
            newLayers.delete(layer);
        } else {
            newLayers.add(layer);
        }
        set({ visibleLayers: newLayers });
    },

    setViewMode: (mode) => set({ viewMode: mode, camera: { ...get().camera, mode } }),
    setActivePanel: (panel) => set({ activePanel: panel }),
    setActiveFloorId: (id) => set({ activeFloorId: id }),
    addChatMessage: (message) => set({ chatMessages: [...get().chatMessages, message] }),
    sendMessageToAI: async (text: string) => {
        const { isAIThinking, project, chatMessages, addChatMessage, setAIThinking } = get();
        if (!text.trim() || isAIThinking) return;

        const projectSnapshot = JSON.parse(JSON.stringify(project));

        const userMsg: ChatMessage = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: text.trim(),
            timestamp: new Date().toISOString(),
            snapshot: projectSnapshot,
        };
        addChatMessage(userMsg);
        setAIThinking(true);

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text.trim(),
                    project,
                    history: chatMessages,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `API error ${response.status}`);
            }

            const data = await response.json();
            const allOps = data.operations || [];

            let successCount = 0;
            let failCount = 0;

            for (const op of allOps) {
                try {
                    const result = get().applyOp(op);
                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                        console.warn('[Store] Op failed validation:', op.type, op.target_id, result.errors);
                    }
                } catch (opErr) {
                    failCount++;
                    console.warn('[Store] Op threw at runtime:', op.type, op.target_id, opErr);
                }
            }

            if (allOps.length > 0) {
                console.log(`[Store] Applied ${successCount}/${allOps.length} operations (${failCount} failed)`);
            }

            const aiMsg: ChatMessage = {
                id: `msg_${Date.now()}_ai`,
                role: 'assistant',
                content: data.message || 'I processed your request.',
                timestamp: new Date().toISOString(),
                operations: allOps,
                pipeline_log: data.progress_log || [],
            };
            get().addChatMessage(aiMsg);
        } catch (err) {
            const error = err as Error;
            get().addChatMessage({
                id: `msg_${Date.now()}_err`,
                role: 'assistant',
                content: `Sorry, I encountered an error: ${error.message || 'The AI backend may not be connected yet.'}`,
                timestamp: new Date().toISOString(),
            });
        } finally {
            get().setAIThinking(false);
        }
    },
    revertToMessage: (messageId) => {
        const { chatMessages } = get();
        const msgIndex = chatMessages.findIndex((m) => m.id === messageId);
        if (msgIndex === -1) return;

        const targetMessage = chatMessages[msgIndex];
        if (targetMessage.snapshot) {
            // Restore project state
            const restoredProject = JSON.parse(JSON.stringify(targetMessage.snapshot));
            set({
                project: projectWithCalculatedCost(restoredProject),
                selection: defaultSelection,
                undoStack: [],
                redoStack: [],
                error: null,
                // Remove all messages strictly AFTER the one we revert to
                chatMessages: chatMessages.slice(0, msgIndex + 1)
            });
        }
    },
    setAIThinking: (thinking) => set({ isAIThinking: thinking }),
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),
    getNode: (id) => get().project.nodes[id],
    getNodesByType: (type) => Object.values(get().project.nodes).filter((n) => n.type === type),

    saveToServer: async () => {
        const { project, setLoading, setError } = get();
        setLoading(true);
        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(project)
            });
            if (!res.ok) throw new Error('Failed to save project');
            console.log('[Store] Project saved to server');
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    },

    loadFromServer: async (id: string) => {
        const { setLoading, setError, loadProject } = get();
        setLoading(true);
        try {
            const res = await fetch(`/api/projects/${id}`);
            if (!res.ok) throw new Error('Failed to load project');
            const project = await res.json();
            loadProject(project);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    },
}));
