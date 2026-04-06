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
    CameraState, ChatMessage, ArchitectureMode, ThinkingEffort,
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

// Architecture mode for benchmarking different orchestration strategies


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
    aiThinkingLogs: string[];
    isScreenshotRequested: boolean;
    undoStack: PSGOperation[];
    redoStack: PSGOperation[];

    // Architecture mode for benchmarking
    architectureMode: ArchitectureMode;
    thinkingEffort: ThinkingEffort;

    // Autosave & Status
    isDirty: boolean;
    lastSaved: string | null;
    autosaveTimer: ReturnType<typeof setTimeout> | null;

    // Professional Client Project Support
    professionalSpecs: any | null;
    isProfessionalProject: boolean;
    userSpecifications: string;

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
    sendMessageToAI: (text: string, attachments?: { name: string; type: string; data: string }[]) => Promise<void>;
    revertToMessage: (messageId: string) => void;
    setAIThinking: (thinking: boolean) => void;
    setAIThinkingLogs: (logs: string[]) => void;
    setScreenshotRequested: (requested: boolean) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;
    getNode: (id: string) => PSGNode | undefined;
    getNodesByType: (type: string) => PSGNode[];
    saveProject: (isAutosave?: boolean) => Promise<void>;
    triggerAutosave: () => void;
    loadFromServer: (id: string) => Promise<void>;
    setProfessionalSpecs: (specs: any) => void;
    getProfessionalContext: () => string;
    setTotalBudget: (amount: number) => void;
    setUserSpecifications: (specs: string) => void;
    setArchitectureMode: (mode: ArchitectureMode) => void;
    setThinkingEffort: (effort: ThinkingEffort) => void;
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
    aiThinkingLogs: [],
    isScreenshotRequested: false,
    undoStack: [],
    redoStack: [],
    isDirty: false,
    lastSaved: null,
    autosaveTimer: null,
    architectureMode: 'v3' as ArchitectureMode,
    thinkingEffort: 'high',
    professionalSpecs: null,
    isProfessionalProject: false,
    userSpecifications: '',

    loadProject: (project) => set({
        project: projectWithCalculatedCost(project),
        selection: defaultSelection,
        undoStack: [],
        redoStack: [],
        error: null,
        isDirty: false,
        lastSaved: null,
        autosaveTimer: null
    }),

    applyOp: (operation) => {
        const { project, undoStack, triggerAutosave } = get();
        const result = applyOperation(project, operation);
        if (result.success && result.project) {
            set({
                project: projectWithCalculatedCost(result.project),
                undoStack: [...undoStack, operation],
                redoStack: [],
                isDirty: true
            });
            triggerAutosave();
        }
        return result;
    },

    applyBatchOps: (operations) => {
        const { project, undoStack, triggerAutosave } = get();
        const result = applyBatchOperations(project, operations);
        if (result.success && result.project) {
            set({
                project: projectWithCalculatedCost(result.project),
                undoStack: [...undoStack, ...operations],
                redoStack: [],
                isDirty: true
            });
            triggerAutosave();
        }
        return result;
    },

    undo: () => {
        const { undoStack, redoStack, project, triggerAutosave } = get();
        if (undoStack.length === 0) return;
        const lastOp = undoStack[undoStack.length - 1];
        const undoOp = createUndoOperation(lastOp);
        if (undoOp) {
            const result = applyOperation(project, undoOp);
            if (result.success && result.project) {
                set({
                    project: projectWithCalculatedCost(result.project),
                    undoStack: undoStack.slice(0, -1),
                    redoStack: [...redoStack, lastOp],
                    isDirty: true
                });
                triggerAutosave();
            }
        }
    },

    redo: () => {
        const { redoStack, project, undoStack, triggerAutosave } = get();
        if (redoStack.length === 0) return;
        const redoOp = redoStack[redoStack.length - 1];
        const result = applyOperation(project, redoOp);
        if (result.success && result.project) {
            set({
                project: projectWithCalculatedCost(result.project),
                undoStack: [...undoStack, redoOp],
                redoStack: redoStack.slice(0, -1),
                isDirty: true
            });
            triggerAutosave();
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
    sendMessageToAI: async (text: string, attachments?: { name: string; type: string; data: string }[]) => {
        const { isAIThinking, project, chatMessages, addChatMessage, setAIThinking, setAIThinkingLogs, triggerAutosave, getProfessionalContext } = get();
        if ((!text.trim() && (!attachments || attachments.length === 0)) || isAIThinking) return;

        const projectSnapshot = JSON.parse(JSON.stringify(project));
        const professionalContext = getProfessionalContext();
        const userSpecsContext = get().userSpecifications ? `User Global Specifications:\n${get().userSpecifications}\n\n` : '';
        const combinedContext = [userSpecsContext, professionalContext].filter(Boolean).join('\n') || undefined;

        const userMsg: ChatMessage = {
            id: `msg_${Date.now()}`,
            role: 'user',
            content: text.trim(),
            timestamp: new Date().toISOString(),
            snapshot: projectSnapshot,
            attachments: attachments
        };
        addChatMessage(userMsg);
        setAIThinking(true);
        setAIThinkingLogs([]);
        let hasChanges = false;

        try {
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text.trim(),
                    project,
                    history: chatMessages,
                    attachments: attachments,
                    professionalContext: combinedContext,
                    architecture: get().architectureMode,
                    thinkingEffort: get().thinkingEffort
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `API error ${response.status}`);
            }

            if (!response.body) throw new Error('Response body is not readable');

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            const currentLogs: string[] = [];
            let finalData: any = null;
            const streamedOperationKeys = new Set<string>();
            let streamedSuccessCount = 0;
            let streamedFailCount = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const event = JSON.parse(line);
                        if (event.type === 'log') {
                            currentLogs.push(event.content);
                            setAIThinkingLogs([...currentLogs]);
                        } else if (event.type === 'operation' && event.operation) {
                            const key = JSON.stringify(event.operation);
                            if (!streamedOperationKeys.has(key)) {
                                streamedOperationKeys.add(key);
                                const result = get().applyOp(event.operation);
                                if (result.success) {
                                    streamedSuccessCount++;
                                    hasChanges = true;
                                    // FORCE UPDATE: Trigger a re-render by creating a new object reference
                                    // This is sometimes needed if Zustand's shallow compare misses deep changes
                                    set((state) => ({
                                        project: { ...state.project }
                                    }));
                                } else {
                                    streamedFailCount++;
                                    console.warn('[Store] Streamed op failed validation:', event.operation.type, event.operation.target_id, result.errors);
                                }
                            }
                        } else if (event.type === 'result') {
                            finalData = event.data;
                        } else if (event.type === 'error') {
                            throw new Error(event.message);
                        }
                    } catch (e) {
                        console.warn('[Store] Failed to parse stream line:', line);
                    }
                }
            }

            if (!finalData) {
                throw new Error('No result data received from AI');
            }

            const allOps = finalData.operations || [];
            let successCount = streamedSuccessCount;
            let failCount = streamedFailCount;

            for (const op of allOps) {
                try {
                    const key = JSON.stringify(op);
                    if (streamedOperationKeys.has(key)) continue;

                    const result = get().applyOp(op);
                    if (result.success) {
                        successCount++;
                        hasChanges = true;
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

            if (hasChanges) {
                triggerAutosave();
            }

            const aiMsg: ChatMessage = {
                id: `msg_${Date.now()}_ai`,
                role: 'assistant',
                content: finalData.message || 'I processed your request.',
                timestamp: new Date().toISOString(),
                operations: allOps,
                pipeline_log: finalData.progress_log || currentLogs,
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
            get().setAIThinkingLogs([]);
            if (hasChanges) {
                get().setScreenshotRequested(true);
            }
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
                isDirty: true, // Revert makes it dirty
                // Remove all messages strictly AFTER the one we revert to
                chatMessages: chatMessages.slice(0, msgIndex + 1)
            });
            get().triggerAutosave();
        }
    },
    setAIThinking: (thinking) => set({ isAIThinking: thinking }),
    setAIThinkingLogs: (logs) => set({ aiThinkingLogs: logs }),
    setScreenshotRequested: (requested) => set({ isScreenshotRequested: requested }),
    setLoading: (loading) => set({ isLoading: loading }),
    setError: (error) => set({ error }),
    getNode: (id) => get().project.nodes[id],
    getNodesByType: (type) => Object.values(get().project.nodes).filter((n) => n.type === type),

    triggerAutosave: () => {
        const { autosaveTimer, saveProject } = get();
        if (autosaveTimer) clearTimeout(autosaveTimer);

        // Debounce for 2 seconds
        const timer = setTimeout(() => {
            saveProject(true);
        }, 2000);

        set({ autosaveTimer: timer });
    },

    saveProject: async (isAutosave = false) => {
        const { project, setLoading, setError } = get();
        if (!isAutosave) setLoading(true);

        try {
            // Use PUT to update existing project
            // Add ?revision=true if manual save or periodic autosave? 
            // Maybe we only create revision on manual save?
            // Or create revision on autosave too? Let's say yes for now but maybe limit frequency.
            // For now, let's create revision on EVERY save to be safe (backend limits to 50 anyway).

            const url = `/api/projects/${project.id}?revision=${isAutosave ? 'true' : 'true'}`;

            const res = await fetch(url, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(project)
            });

            if (!res.ok) throw new Error('Failed to save project');

            console.log(`[Store] Project saved (${isAutosave ? 'Autosave' : 'Manual'})`);
            set({
                isDirty: false,
                lastSaved: new Date().toISOString(),
                autosaveTimer: null
            });

        } catch (err) {
            console.error('Save failed:', err);
            if (!isAutosave) setError((err as Error).message);
        } finally {
            if (!isAutosave) setLoading(false);
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

    setProfessionalSpecs: (specs) => {
        set({
            professionalSpecs: specs,
            isProfessionalProject: true
        });

        // Add professional context to the first AI message
        const { addChatMessage } = get();
        const contextMessage: ChatMessage = {
            id: `professional-context-${Date.now()}`,
            role: 'system',
            content: `Professional Client Project Context: ${specs.clientName} - ${specs.projectType}. Budget: ${specs.budget.total} ${specs.budget.currency}. Key requirements: ${specs.requirements.bedrooms} bed, ${specs.requirements.bathrooms} bath, ${specs.requirements.floors} floors. Site: ${specs.site.size}m², ${specs.site.topography} topography.`,
            timestamp: new Date().toISOString(),
            type: 'context'
        };
        addChatMessage(contextMessage);
    },

    getProfessionalContext: () => {
        const { professionalSpecs } = get();
        if (!professionalSpecs) return '';

        return `
Professional Client Context:
- Client: ${professionalSpecs.clientName}
- Project: ${professionalSpecs.projectType}
- Budget: ${professionalSpecs.budget.total} ${professionalSpecs.budget.currency} (${professionalSpecs.budget.flexibility})
- Timeline: ${professionalSpecs.timeline.startDate} to ${professionalSpecs.timeline.targetCompletion}
- Site: ${professionalSpecs.site.size}m², ${professionalSpecs.site.topography} topography
- Requirements: ${professionalSpecs.requirements.bedrooms} bed, ${professionalSpecs.requirements.bathrooms} bath, ${professionalSpecs.requirements.floors} floors
- Style: ${professionalSpecs.style.architectural} architecture, ${professionalSpecs.style.interior} interior
- Energy Efficiency: ${professionalSpecs.requirements.energyEfficiency}
- Must-haves: ${professionalSpecs.mustHaves.join(', ')}
- Absolute no-gos: ${professionalSpecs.absoluteNoGos.join(', ')}
`;
    },

    setTotalBudget: (amount: number) => {
        const { project, triggerAutosave } = get();
        set({
            project: {
                ...project,
                budget: {
                    ...project.budget,
                    total_budget: amount,
                    remaining: amount - project.budget.spent,
                },
            },
            isDirty: true,
        });
        triggerAutosave();
    },

    setUserSpecifications: (specs: string) => {
        set({ userSpecifications: specs });
        get().triggerAutosave();
    },

    setArchitectureMode: (mode: ArchitectureMode) => {
        set({ architectureMode: mode });
        console.log(`[Store] Architecture mode set to: ${mode}`);
    },
    setThinkingEffort: (effort: ThinkingEffort) => {
        set({ thinkingEffort: effort });
        console.log(`[Store] Thinking effort set to: ${effort}`);
    },
}));
