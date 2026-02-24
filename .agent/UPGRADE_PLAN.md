# 🏗️ House Design AI — Architecture Upgrade Plan

## Executive Summary

After auditing all 18 core files, here is a complete, prioritized plan to upgrade the AI edit system from **tool-calling on minified JSON** to **full-PSG-aware editing with validation feedback loops**, while keeping the exact same frontend (Next.js + Three.js/R3F + Zustand).

> **Guiding principle:** Ship incremental improvements that compound. Each phase is independently deployable and makes the AI measurably better.

---

## Current Architecture (What Exists)

```
User types message
  → ChatPanel.tsx POSTs to /api/ai/chat
    → route.ts calls orchestrator.sendChatToAI()
      → orchestrator.ts:
          1. Builds readable PSG context (pos/dim/rot keys)
          2. Generates ASCII floor plan for spatial awareness
          3. Builds messages: [system_prompt, context, last 4 history, user_msg]
          4. Calls callGemini/callGroq/callOpenAI with AI_TOOLS
          5. Parses tool_calls → toolCallToOperation()
          6. Validates → auto-retries once if operations fail
          7. Returns { message, operations[] }
    → route.ts validates each op via validator.ts
    → Returns JSON to client
  → ChatPanel.tsx applies ops via store.applyOp()
    → operations.ts mutates PSG immutably (with 5cm grid snapping)
    → Zustand triggers React re-render
    → PSGRenderer.tsx rebuilds Three.js meshes
```

### Files Inventory

| File | Role | Lines |
|------|------|-------|
| `lib/ai/orchestrator.ts` | LLM call + context prep + auto-retry | ~540 |
| `lib/ai/tools.ts` | Tool definitions (8 tools) | ~240 |
| `lib/ai/prompts.ts` | System prompts + CoT protocol | ~130 |
| `lib/ai/key-manager.ts` | API key rotation + provider config | ~220 |
| `lib/psg/operations.ts` | PSG mutation (9 ops) + grid snapping | ~530 |
| `lib/psg/validator.ts` | 6-layer validation (incl. collision) | ~420 |
| `lib/psg/geometry.ts` | Wall/Window/Door geometry | 424 |
| `lib/psg/compiler.ts` | PSG→Three.js bridge | 544 |
| `lib/psg/schema.ts` | Empty project factory | ~500 |
| `lib/psg/templates.ts` | Starter house templates | ~700 |
| `lib/psg/cost-calculator.ts` | Budget engine | ~300 |
| `types/index.ts` | All TypeScript types | ~480 |
| `store/useDesignStore.ts` | Zustand global state | 160 |
| `components/three/PSGRenderer.tsx` | 3D render loop | 445 |
| `components/chat/ChatPanel.tsx` | Chat UI | 242 |
| `app/api/ai/chat/route.ts` | API route | 93 |
| `app/design/page.tsx` | Main page | ~200 |
| `data/materials.json` | Material library | ~300 |

---

## ✅ PHASE 1 — AI Edit Reliability (COMPLETED)
**Goal:** Make the LLM see the house clearly and verify its own work.

### ✅ 1.1 Readable Keys + Full PSG Context
**File:** `lib/ai/orchestrator.ts` → `prepareProjectContext()`
- Replaced minified keys (`p`, `d`, `r`) with readable names (`pos`, `dim`, `rot`, `mat`, `kids`, `fn`)
- Full PSG sent with readable format (compact enough for <100 node houses)
- IDs kept fully qualified for exact tool call targeting

### ✅ 1.2 ASCII Floor Plan in Context
**File:** `lib/ai/orchestrator.ts` → `generateASCIIFloorPlan()`
- Shows all rooms per floor with size, position, function
- Counts windows/doors per room
- Shows stairs, slabs, roof info
- Inserted before JSON data in the LLM messages

### ✅ 1.3 Chain-of-Thought Coordinate Verification
**File:** `lib/ai/prompts.ts` → `ARCHITECT_SYSTEM_PROMPT`
- 4-step mandatory reasoning protocol: IDENTIFY → CALCULATE → VERIFY → EXECUTE
- Explicit coordinate math examples
- Wall orientation rules (yaw=0 vs yaw=90)
- Standard architectural dimensions reference

### ✅ 1.4 Auto-Retry Feedback Loop
**File:** `lib/ai/orchestrator.ts` → `sendChatToAI()`
- Operations are validated after parsing
- Failed operations generate error details
- Error message sent back to LLM with FIX_PROMPT
- Maximum 1 retry to prevent infinite loops
- Valid operations from retry merged with originals

### ✅ 1.5 Collision Detection
**File:** `lib/psg/validator.ts` → `validateCollisions()` (Layer 6)
- AABB overlap detection for all sibling nodes
- Accounts for wall rotation (yaw=90 swaps width/depth)
- Micro-overlaps (< 0.01m³) ignored
- Windows/doors excluded (intentionally embedded)
- Returns warnings, not errors

---

## ✅ PHASE 2 — Geometry Precision (COMPLETED — Grid Snapping)

### ✅ 2.1 Grid Snapping on All Operations
**File:** `lib/psg/operations.ts`
- 5cm (0.05m) grid snapping on ALL position and dimension changes
- `snapToGrid()` and `snapVec3()` helpers
- Applied in moveNode, resizeNode, addNode, createCustomElement
- Eliminates floating-point micro-gaps between walls

### 2.2 Improved Wall Corner System (PENDING)
**File:** `lib/psg/geometry.ts` (function `resolveWallCorners`)
- Support arbitrary angles (not just 0° and 90°)
- Use proper line-segment intersection math
- Add priority system: exterior walls are "through", interior walls "butt"

### 2.3 Geometry Cache Invalidation (PENDING)
**File:** `components/three/PSGRenderer.tsx`
- Use node version for cache key (already works but could be improved)

---

## ✅ PHASE 3 — AI Freedom: Custom Geometry (CORE IMPLEMENTED)

### ✅ 3.1 New `cad_script` Field on PSGNode
**File:** `types/index.ts`
- Added `cad_script?: string` optional field
- Added `'custom'` to StructuralTag union
- Added `'move_room'` and `'create_custom_element'` to OperationType

### ✅ 3.2 New AI Tools
**File:** `lib/ai/tools.ts`
- `create_custom_element` — natural language shape description
- `move_room` — compound tool that moves room + all children

### ✅ 3.3 Operation Implementations
**File:** `lib/psg/operations.ts`
- `moveRoom()` — validates target is Room, delegates to moveNode
- `createCustomElement()` — creates node with cad_script field, stores description

### 3.4 CadQuery Backend (PENDING)
**New directory:** `cad-backend/`
- Flask/FastAPI microservice
- CadQuery for B-rep geometry generation
- glTF export
- Frontend loads via useGLTF

---

## PHASE 4 — Structural Constraint Solver (PENDING)
**Goal:** Mathematical guarantees that edits don't break physics.

### 4.1 Room Closure Validator
- Check walls form closed polygons per room
- Detect gaps in room boundaries

### 4.2 Load Path Validator
- Every node above ground needs a load path to foundation
- Warn if floors lack supporting walls

### 4.3 Adjacency Graph
- Build graph of physically touching nodes
- Detect orphaned elements
- Suggest cascading edits

---

## PHASE 5 — Export & Compliance (PENDING)
**Goal:** Professional-grade output.

- CadQuery → STEP/IFC export for architects
- SANS 10400 compliance checker
- EnergyPlus thermal simulation
- Detailed Bill of Quantities with labor estimates

---

## Files Changed Summary

| Phase | Files Modified | Status |
|-------|---------------|--------|
| 1.1-1.5 | orchestrator.ts, prompts.ts, tools.ts, validator.ts, key-manager.ts | ✅ DONE |
| 2.1 | operations.ts | ✅ DONE |
| 3.1-3.3 | types/index.ts, tools.ts, operations.ts | ✅ DONE |
| 2.2-2.3 | geometry.ts, PSGRenderer.tsx | ⏳ PENDING |
| 3.4 | cad-backend/ (Python) | ⏳ PENDING |
| 4 | validator.ts | ⏳ PENDING |
| 5 | lib/export/ifc.ts, lib/export/step.ts | ⏳ PENDING |

---

## What NOT to Change

- **Frontend framework** — Next.js + R3F + Zustand stays
- **PSG data model** — The flat node map is correct and performant
- **Material system** — Works perfectly as-is
- **Key carousel** — Already robust with retry logic
- **Cost calculator** — Independent module, no changes needed
- **Export system** — Additive only (new formats, don't touch existing)
