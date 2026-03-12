"use client";

import React, { useState, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  Handle,
  Position,
  MarkerType,
  Connection,
  Edge,
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Settings, Brain, Plus, Trash2, X, Users, Wrench, Code, Network, Target, LayoutDashboard, Database, Scale,
  BookOpen, Building2, Layers, Pen
} from 'lucide-react';

import {
  ARCHITECT_PHASE1_PROMPT,
  ARCHITECT_PHASE2_PROMPT,
  CONTRACTOR_PROMPT,
  INSPECTOR_PROMPT,
  RESEARCH_SPECIALIST_V3_PROMPT
} from '@/lib/ai/prompts-v3';

// ============================================================================
// CUSTOM NODE COMPONENTS
// ============================================================================

const AgentNode = ({ data, selected }: any) => {
  const Icon = data.icon || Brain;
  const isOrchestrator = data.role.includes('Chief Architect');
  
  return (
    <div
      className={`relative group rounded-xl max-w-[280px] p-4 border bg-zinc-900/80 backdrop-blur-md transition-all shadow-xl
        ${selected ? 'border-indigo-500 shadow-indigo-500/20' : 'border-zinc-700/50 hover:border-zinc-500/80'}
        ${isOrchestrator ? 'ring-1 ring-amber-500/30 ring-offset-2 ring-offset-zinc-950' : ''}
      `}
    >
      {/* Target Handlers */}
      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !border-none !bg-zinc-600" />
      
      <div className="flex items-start gap-4">
        <div className={`p-2 rounded-lg flex-shrink-0 ${isOrchestrator ? 'bg-amber-500/20 text-amber-400' : 'bg-indigo-500/20 text-indigo-400'}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-zinc-100 text-sm truncate">{data.title}</h3>
          <p className="text-xs text-zinc-400 truncate mt-0.5">{data.role}</p>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-zinc-800/50 flex flex-wrap gap-2">
        {data.tools?.map((tool: string, idx: number) => (
          <span key={idx} className="px-2 py-1 bg-zinc-800 rounded-md text-[10px] text-zinc-300 border border-zinc-700/50">
            {tool}
          </span>
        ))}
        {(!data.tools || data.tools.length === 0) && (
          <span className="px-2 py-1 bg-amber-500/10 rounded-md text-[10px] text-amber-400/80 border border-amber-500/20">
            No Active Tools (Pure Logic)
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !border-none !bg-indigo-500" />
    </div>
  );
};

// ============================================================================
// INITIAL DATA (V3 Architecture)
// ============================================================================

const initialNodes: Node[] = [
  {
    id: 'research_specialist',
    type: 'agentNode',
    position: { x: 400, y: 0 },
    data: {
      title: 'Research Specialist',
      role: 'Phase 0: Knowledge Base',
      prompt: RESEARCH_SPECIALIST_V3_PROMPT,
      icon: BookOpen,
      tools: ['search_documents', 'generate_brief']
    }
  },
  {
    id: 'architect_planning',
    type: 'agentNode',
    position: { x: 400, y: 200 },
    data: {
      title: 'Chief Architect (Phase 1)',
      role: 'Master Builder / Planner',
      prompt: ARCHITECT_PHASE1_PROMPT,
      icon: Network,
      tools: []
    }
  },
  {
    id: 'architect_dispatch',
    type: 'agentNode',
    position: { x: 400, y: 400 },
    data: {
      title: 'Chief Architect (Phase 2)',
      role: 'Contractor Dispatch Loop',
      prompt: ARCHITECT_PHASE2_PROMPT,
      icon: Network,
      tools: []
    }
  },
  {
    id: 'inspector',
    type: 'agentNode',
    position: { x: 700, y: 400 },
    data: {
      title: 'Inspector',
      role: 'Independent Quality QA',
      prompt: INSPECTOR_PROMPT,
      icon: Scale,
      tools: ['generate_report']
    }
  },
  {
    id: 'contractor_structural',
    type: 'agentNode',
    position: { x: 100, y: 650 },
    data: {
      title: 'Structural Engineer',
      role: 'Contractor',
      prompt: CONTRACTOR_PROMPT,
      icon: Building2,
      tools: ['add_node', 'set_node_position', 'delete_node']
    }
  },
  {
    id: 'contractor_interior',
    type: 'agentNode',
    position: { x: 400, y: 650 },
    data: {
      title: 'Interior Architect',
      role: 'Contractor',
      prompt: CONTRACTOR_PROMPT,
      icon: LayoutDashboard,
      tools: ['add_node', 'move_node', 'set_node_position', 'resize_node']
    }
  },
  {
    id: 'contractor_facade',
    type: 'agentNode',
    position: { x: 700, y: 650 },
    data: {
      title: 'Facade Artist',
      role: 'Contractor',
      prompt: CONTRACTOR_PROMPT,
      icon: Pen,
      tools: ['edit_wall_surface', 'create_custom_element']
    }
  }
];

const edgeProps = {
  type: 'smoothstep',
  animated: true,
  style: { stroke: '#6366f1', strokeWidth: 2, opacity: 0.6 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
};

const initialEdges: Edge[] = [
  { id: 'e-r-a1', source: 'research_specialist', target: 'architect_planning', ...edgeProps, style: { stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'e-a1-a2', source: 'architect_planning', target: 'architect_dispatch', ...edgeProps, style: { stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'e-a2-cs', source: 'architect_dispatch', target: 'contractor_structural', ...edgeProps },
  { id: 'e-a2-ci', source: 'architect_dispatch', target: 'contractor_interior', ...edgeProps },
  { id: 'e-a2-cf', source: 'architect_dispatch', target: 'contractor_facade', ...edgeProps },
  { id: 'e-cs-i', source: 'contractor_structural', target: 'inspector', ...edgeProps, style: { stroke: '#ef4444', strokeWidth: 2 } },
  { id: 'e-ci-i', source: 'contractor_interior', target: 'inspector', ...edgeProps, style: { stroke: '#ef4444', strokeWidth: 2 } },
  { id: 'e-cf-i', source: 'contractor_facade', target: 'inspector', ...edgeProps, style: { stroke: '#ef4444', strokeWidth: 2 } },
  { id: 'e-i-a2', source: 'inspector', target: 'architect_dispatch', ...edgeProps, animated: false, style: { stroke: '#10b981', opacity: 0.6 } },
];

export default function AgentFlowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const nodeTypes = useMemo(() => ({ agentNode: AgentNode }), []);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, ...edgeProps }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const addNode = useCallback(() => {
    const newNode: Node = {
      id: `agent-${Date.now()}`,
      type: 'agentNode',
      position: { x: 300, y: 300 },
      data: {
        title: 'New Custom Agent',
        role: 'Assistant',
        prompt: 'You are a helpful assistant specialized in...',
        icon: Users,
        tools: ['tool_custom']
      }
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(newNode.id);
  }, [setNodes]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const updateSelectedNodeData = useCallback((key: string, value: any) => {
    setNodes((nds) => nds.map((n) => {
      if (n.id === selectedNodeId) {
        return { ...n, data: { ...n.data, [key]: value } };
      }
      return n;
    }));
  }, [selectedNodeId, setNodes]);

  const savePromptToCode = useCallback(async () => {
    if (!selectedNodeId || !selectedNode) return;
    
    try {
      const response = await fetch('/api/ai/save-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedNodeId,
          newPrompt: selectedNode.data.prompt
        })
      });
      
      const result = await response.json();
      if (result.success) {
        alert('Prompt saved successfully to source code!');
      } else {
        alert('Error: ' + result.error);
      }
    } catch (e) {
      alert('Failed to connect to API');
    }
  }, [selectedNodeId, selectedNode]);

  const deleteSelectedNode = useCallback(() => {
    if (selectedNodeId) {
      setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
      setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
      setSelectedNodeId(null);
    }
  }, [selectedNodeId, setNodes, setEdges]);

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans pt-16">
      <div className="flex-1 relative">
        {/* TOP BAR */}
        <div className="absolute top-4 left-6 z-10 p-3 bg-zinc-900/80 backdrop-blur-md rounded-xl border border-zinc-800 shadow-xl flex items-center gap-4">
          <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg">
            <Network className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide">AI Agentic Architecture v3.0</h1>
            <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Dynamic Flow Editor</p>
          </div>
          <div className="w-[1px] h-8 bg-zinc-800 mx-2" />
          <button 
            onClick={addNode}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Agent
          </button>
        </div>

        {/* REACT FLOW MAP */}
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            className="bg-zinc-950"
            defaultViewport={{ x: 0, y: 0, zoom: 0.5 }}
          >
            <Background color="#3f3f46" gap={20} size={1} />
            <Controls className="fill-white !bg-zinc-900 !border-zinc-800 drop-shadow-xl !rounded-xl overflow-hidden [&>button]:!border-b [&>button]:!border-zinc-800 [&>button]:hover:!bg-zinc-800" />
          </ReactFlow>
        </ReactFlowProvider>
      </div>

      {/* RIGHT SIDEBAR / DRAWER */}
      {selectedNode && (() => {
        const nodeData = selectedNode.data as Record<string, any>;
        return (
        <div className="w-[450px] border-l border-zinc-800 bg-zinc-900/95 backdrop-blur-xl flex flex-col shadow-2xl transition-all duration-300 transform translate-x-0 overflow-y-auto">
          <div className="p-5 flex items-center justify-between border-b border-zinc-800/50 sticky top-0 bg-zinc-900/90 backdrop-blur z-10">
            <h2 className="text-lg font-bold flex items-center gap-3">
              <Settings className="w-5 h-5 text-zinc-400" /> 
              Agent Configuration
            </h2>
            <button onClick={() => setSelectedNodeId(null)} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="p-6 space-y-6 flex-1">
            {/* AGENT NAME */}
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Agent Name</label>
              <input
                type="text"
                value={nodeData.title || ''}
                onChange={(e) => updateSelectedNodeData('title', e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="Agent Name..."
              />
            </div>

            {/* ROLE */}
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Specialty / Role</label>
              <input
                type="text"
                value={nodeData.role || ''}
                onChange={(e) => updateSelectedNodeData('role', e.target.value)}
                className="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                placeholder="e.g. Heavy Construction"
              />
            </div>

            {/* SYSTEM PROMPT */}
            <div className="space-y-2 flex-1 min-h-[400px]">
              <div className="flex items-center justify-between">
                <label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-2">
                  <span>System Prompt</span>
                  <span className="text-[10px] bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded border border-indigo-500/20">Source Code Sync Enabled</span>
                </label>
                <button 
                  onClick={savePromptToCode}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded uppercase transition-colors shadow-lg shadow-indigo-500/20"
                >
                  Save to Source Code
                </button>
              </div>
              <textarea
                value={nodeData.prompt || ''}
                onChange={(e) => updateSelectedNodeData('prompt', e.target.value)}
                className="w-full h-[500px] bg-zinc-950/80 border border-zinc-800 rounded-xl px-4 py-3 text-xs font-mono focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors scrollbar-thin scrollbar-thumb-zinc-700"
                placeholder="You are a helpful assistant..."
              />
            </div>

            {/* TOOL CONFIG (Visual Only for now) */}
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-wider text-zinc-500 font-semibold">Assigned Tools</label>
              <div className="flex flex-wrap gap-2 p-3 bg-zinc-950/50 border border-zinc-800 rounded-xl">
                {(nodeData.tools || []).map((tool: string, idx: number) => (
                  <div key={idx} className="flex flex-row items-center gap-2 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer group">
                    <Code className="w-3 h-3 text-zinc-400 group-hover:text-indigo-400" />
                    <span>{tool}</span>
                    <button 
                      onClick={() => {
                        const newTools = [...(nodeData.tools || [])];
                        newTools.splice(idx, 1);
                        updateSelectedNodeData('tools', newTools);
                      }}
                      className="ml-1 text-zinc-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                
                {/* Add Tool Input */}
                <div className="relative group/add">
                  <input
                    type="text"
                    placeholder="add_tool..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.currentTarget.value.trim() !== '') {
                        updateSelectedNodeData('tools', [...(nodeData.tools || []), e.currentTarget.value.trim()]);
                        e.currentTarget.value = '';
                      }
                    }}
                    className="w-[120px] bg-zinc-900 border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500 focus:w-[150px] transition-all"
                  />
                  <Plus className="absolute right-2 top-1.5 w-3 h-3 text-zinc-500" />
                </div>
              </div>
            </div>

            {/* DANGER ZONE */}
            <div className="pt-6 mt-6 border-t border-zinc-800/50">
              <button 
                onClick={deleteSelectedNode}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-xl text-sm font-semibold transition-colors border border-red-500/20 hover:border-red-500/30"
              >
                <Trash2 className="w-4 h-4" />
                Delete Agent
              </button>
              <p className="text-[10px] text-zinc-500 text-center mt-3">
                Deleting an agent will remove it from the visualizer. Code generation loops will not be affected unless you export this config.
              </p>
            </div>
            
          </div>
        </div>
        );
      })()}
    </div>
  );
}
