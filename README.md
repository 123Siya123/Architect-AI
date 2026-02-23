# 🏠 AI House Designer

**AI-powered parametric house design with real-time 3D visualization, walk-through mode, thermal analysis, and professional building plan export.**

## 🧠 Core Concept

This application uses a **Parametric Scene Graph (PSG)** — a JSON tree structure that represents every architectural element of the house. The PSG is:

- **LLM-readable**: An AI can read the entire house structure as JSON and make precise edits via function calling
- **Renderable**: Three.js compiles the PSG into a real-time 3D scene you can walk through
- **Computable**: Material volumes, costs, and thermal properties are calculated directly from the PSG

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js)                 │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────┐  │
│  │ 3D Viewport   │  │ AI Chat Panel│  │ Inspector│  │
│  │ (Three.js)    │  │ + Sliders    │  │ + Layers │  │
│  └───────┬───────┘  └──────┬───────┘  └────┬─────┘  │
│          └─────────────────┼───────────────┘         │
│                    PSG Store (Zustand)                │
└──────────────────────┬──────────────────────────────┘
                       │ REST + WebSocket
┌──────────────────────▼──────────────────────────────┐
│                  BACKEND (Next.js API)                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐  │
│  │ PSG Engine  │  │ AI Orchestr. │  │ Exporters  │  │
│  └─────────────┘  └──────────────┘  └────────────┘  │
└─────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
house-design-ai/
├── app/                        # Next.js app router
│   ├── layout.tsx              # Root layout (fonts, metadata)
│   ├── page.tsx                # Landing page
│   ├── globals.css             # Complete design system
│   ├── design/
│   │   └── page.tsx            # Main 3D design studio
│   └── api/
│       ├── ai/chat/route.ts    # AI chat endpoint
│       └── materials/route.ts  # Materials library API
├── lib/                        # Core business logic
│   ├── psg/                    # Parametric Scene Graph engine
│   │   ├── schema.ts           # Node factory functions + defaults
│   │   ├── validator.ts        # 5-layer validation engine
│   │   ├── operations.ts       # Immutable PSG mutation functions
│   │   ├── compiler.ts         # PSG → Three.js geometry compiler
│   │   ├── cost-calculator.ts  # Volume-based cost engine
│   │   ├── templates.ts        # Starter house templates
│   │   └── index.ts            # Barrel export
│   ├── ai/                     # AI integration
│   │   ├── orchestrator.ts     # LLM request orchestration
│   │   ├── tools.ts            # Function calling tool definitions
│   │   └── prompts.ts         # System prompts for AI architect
│   ├── thermal/
│   │   └── simulator.ts        # Steady-state thermal simulation
│   ├── systems/
│   │   ├── electrical.ts       # Electrical wiring auto-placement
│   │   └── plumbing.ts         # Plumbing fixture auto-placement
│   └── export/
│       └── plan-generator.ts   # Architect document generation
├── components/                 # React components
│   ├── three/                  # Three.js / R3F components
│   │   ├── SceneCanvas.tsx     # Main 3D canvas wrapper
│   │   └── PSGRenderer.tsx     # Renders PSG nodes as 3D meshes
│   ├── ui/                     # UI components
│   │   ├── Toolbar.tsx         # Top toolbar (view modes, layers)
│   │   ├── InspectorPanel.tsx  # Node property editor + sliders
│   │   └── SliderControl.tsx   # Precision slider component
│   └── chat/
│       └── ChatPanel.tsx       # AI chat sidebar
├── store/
│   └── useDesignStore.ts       # Zustand global state store
├── types/
│   └── index.ts                # All TypeScript type definitions
├── data/
│   └── materials.json          # 22 construction materials database
└── public/
    └── textures/               # Material texture images (future)
```

## 🚀 Getting Started

```bash
# Install dependencies
cd house-design-ai
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local and add your API key

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the landing page, then click "Start Designing" to enter the 3D studio.

## 🛣️ Build Roadmap

| Phase | Feature | Status |
|-------|---------|--------|
| **1** | PSG schema + Three.js renderer + basic UI | ✅ Scaffolded |
| **2** | AI chat → LLM function calls → PSG edits | 🔜 Next |
| **3** | Walk-through camera + layer system | 📋 Planned |
| **4** | Electrical & plumbing auto-placement | 📋 Planned |
| **5** | Thermal simulation overlay | 📋 Planned |
| **6** | PDF export + architect documents | 📋 Planned |

## 🔑 Key Technical Decisions

1. **PSG (Parametric Scene Graph)**: A flat JSON map of nodes that the LLM reads/writes and Three.js renders. The AI never generates geometry directly — it calls validated operations.

2. **Function Calling**: The LLM can only call 6 tools: `move_node`, `resize_node`, `replace_material`, `add_node`, `delete_node`, `replace_node`. Every call is validated before application.

3. **Immutable Operations**: All PSG mutations return a new project object (never mutate in place). This enables undo/redo and React's change detection.

4. **Volume-Based Costing**: Cost = volume × density × price_per_kg. Calculated from geometry dimensions, not estimated.

5. **5-Layer Validation**: Schema → Constraints → Structural → Budget → Physics. The AI cannot create structurally impossible houses.

## 📜 License

MIT
