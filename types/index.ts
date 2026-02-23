/**
 * =============================================================================
 * TYPES/INDEX.TS — Master Type Definitions for House Design AI
 * =============================================================================
 *
 * This file is the single source of truth for ALL TypeScript types used
 * throughout the application. Every component, store, API route, and utility
 * imports its types from here.
 *
 * WHY ONE FILE?
 * - Prevents circular dependencies between type files
 * - Makes the type system discoverable — one place to look
 * - Ensures PSG node types, material types, and AI tool types are always
 *   consistent with each other
 *
 * ORGANIZATION:
 * 1. Geometry primitives (Vec3, BoundingBox)
 * 2. Material system types
 * 3. PSG Node types (the core data model)
 * 4. AI Tool/Operation types
 * 5. Camera & Viewport types
 * 6. UI State types
 * 7. API types
 * =============================================================================
 */

// =============================================================================
// 1. GEOMETRY PRIMITIVES
// =============================================================================
// These are the mathematical building blocks. Every position, size, and
// rotation in the entire system uses these types.

/** 3D vector — used for positions, dimensions, and offsets */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Euler rotation in degrees — yaw (Y-axis), pitch (X-axis), roll (Z-axis) */
export interface Rotation {
  yaw: number;    // Rotation around vertical axis (most common for walls)
  pitch: number;  // Tilt forward/back (rare for architecture)
  roll: number;   // Tilt sideways (rare for architecture)
}

/** Axis-aligned bounding box for collision detection and spatial queries */
export interface BoundingBox {
  min: Vec3;
  max: Vec3;
}

// =============================================================================
// 2. MATERIAL SYSTEM
// =============================================================================
// Materials are a SEPARATE concern from geometry. A wall's shape is defined
// by its PSG node; its appearance AND physical properties come from its
// material. This separation allows the AI to swap materials without touching
// geometry, and vice versa.

/** Material category — used for filtering in the material picker UI */
export type MaterialCategory =
  | 'structure'     // Load-bearing: concrete, steel, timber
  | 'cladding'      // External finish: brick, stone, render
  | 'insulation'    // Thermal: mineral wool, foam, etc.
  | 'interior'      // Internal finish: plaster, drywall, paint
  | 'roofing'       // Roof coverings: tile, slate, metal
  | 'flooring'      // Floor surfaces: wood, tile, carpet
  | 'glazing'       // Glass types: single, double, triple
  | 'waterproofing' // Membranes, barriers
  | 'other';

/**
 * Material definition — every material in the library follows this schema.
 *
 * WHY SO MANY PROPERTIES?
 * The material isn't just for rendering. It feeds into:
 * - Cost calculator (price_per_kg * density * volume = total cost)
 * - Thermal simulator (thermal_conductivity → heat loss calculation)
 * - Structural warnings (compressive_strength → load bearing checks)
 * - Fire safety compliance (fire_rating)
 */
export interface Material {
  id: string;                        // Unique ID, e.g. "mat_brick_red"
  name: string;                      // Human-readable, e.g. "Red Facing Brick"
  category: MaterialCategory;
  color_hex: string;                 // Fallback color when texture isn't loaded
  texture_url: string | null;        // Path to texture image (null = solid color)
  texture_scale: number;             // How many meters per texture repeat
  // Physical properties
  density_kg_m3: number;             // Mass per cubic meter
  thermal_conductivity: number;      // W/(m·K) — lower = better insulator
  compressive_strength_mpa: number;  // Megapascals — structural capacity
  fire_rating: string;               // Euroclass rating, e.g. "A1", "B-s1-d0"
  // Cost
  price_per_kg: number;              // Base cost per kilogram
  price_per_m3: number;              // Convenience: price_per_kg * density
  sourcing: 'local' | 'imported';    // Affects delivery cost estimates
}

// =============================================================================
// 3. PSG (PARAMETRIC SCENE GRAPH) NODE TYPES
// =============================================================================
// The PSG is the HEART of the entire application. It's a tree of nodes where
// each node represents one architectural element (wall, floor, roof, window,
// door, stairs, etc.).
//
// WHY A TREE?
// - LLMs can read JSON trees natively — no special encoding needed
// - Trees map naturally to Three.js scene graphs
// - Parent-child relationships express containment (wall contains window)
// - The entire house fits in one LLM context window (~2000 nodes max)
//
// EVERY NODE HAS:
// - Identity (id, type, name)
// - Spatial data (position, dimensions, rotation)
// - Material reference
// - Structural metadata (tags, constraints)
// - System connections (which pipes/cables run through it)
// - Children (things attached to or contained within this element)

/** All possible node types in the PSG */
export type PSGNodeType =
  | 'House'      // Root node — contains everything
  | 'Floor'      // A storey/level of the house
  | 'Room'       // A named room within a floor
  | 'Wall'       // Vertical surface
  | 'Window'     // Opening in a wall with glazing
  | 'Door'       // Opening in a wall with a door
  | 'Roof'       // Roof surface/structure
  | 'Stairs'     // Staircase connecting floors
  | 'Slab'       // Horizontal structural element (floor/ceiling)
  | 'Column'     // Vertical structural element
  | 'Beam'       // Horizontal structural spanning element
  | 'Foundation' // Below-grade structural element
  | 'Partition'  // Non-load-bearing internal wall
  | 'Balcony'    // External platform
  | 'Garage'     // Vehicle storage
  | 'Chimney'    // Vertical flue
  | 'Custom';    // User-defined geometry (future)

/** Tags that classify a node's structural role */
export type StructuralTag =
  | 'load_bearing'    // Removing this would compromise structure
  | 'exterior'        // Part of the building envelope
  | 'interior'        // Inside the envelope
  | 'wet_room'        // Bathroom/kitchen — needs waterproofing
  | 'fire_wall'       // Fire separation wall
  | 'party_wall'      // Shared wall with neighbor
  | 'perimeter'       // Part of the building's outer boundary
  | 'insulated';      // Has insulation layer

/** Constraints prevent the AI from making structurally invalid edits */
export interface NodeConstraints {
  min_width?: number;       // Minimum dimension (meters)
  max_width?: number;
  min_height?: number;
  max_height?: number;
  min_thickness?: number;
  fixed_position?: boolean; // Cannot be moved (e.g., foundation)
  connected_to: string[];   // IDs of nodes this MUST touch/connect to
}

/** System connections — tracks which building systems pass through this node */
export interface SystemConnections {
  electrical: string[];  // IDs of electrical cable/circuit nodes
  plumbing: string[];    // IDs of pipe nodes
  hvac: string[];        // IDs of duct/vent nodes
}

/**
 * PSGNode — THE core data structure of the entire application.
 *
 * This single interface represents EVERY architectural element.
 * The `type` field determines which properties are relevant.
 * The Three.js renderer reads this and creates the appropriate mesh.
 * The AI reads/writes this as JSON.
 *
 * DESIGN DECISION: We use a single flat interface rather than a union
 * of per-type interfaces because:
 * 1. LLMs handle flat JSON better than discriminated unions
 * 2. It simplifies the PSG editor operations (one move_node function for all)
 * 3. Optional fields handle type-specific properties cleanly
 */
export interface PSGNode {
  // --- Identity ---
  id: string;              // Unique identifier, e.g. "wall_living_north"
  type: PSGNodeType;       // What kind of element this is
  name: string;            // Human-readable label, e.g. "Living Room North Wall"

  // --- Spatial ---
  position: Vec3;          // Center position in meters, relative to parent
  dimensions: Vec3;        // Size: x=width, y=height, z=depth/thickness
  rotation: Rotation;      // Orientation

  // --- Appearance ---
  material_id: string;     // Reference to a Material.id
  opacity: number;         // 0-1, used for glass/transparency

  // --- Structure ---
  tags: StructuralTag[];
  constraints: NodeConstraints;
  systems: SystemConnections;

  // --- Hierarchy ---
  parent_id: string | null;  // null only for root House node
  children_ids: string[];    // Ordered list of child node IDs

  // --- Type-specific properties ---
  // These are optional because they only apply to certain node types.
  // The alternative would be a discriminated union, but flat JSON is
  // easier for LLMs to parse and edit.

  /** Window/Door: the opening dimensions within the wall */
  opening_width?: number;
  opening_height?: number;

  /** Stairs: configuration */
  stair_style?: 'straight' | 'l_shaped' | 'u_shaped' | 'spiral' | 'curved';
  stair_riser_height?: number;  // Height of each step
  stair_tread_depth?: number;   // Depth of each step

  /** Roof: configuration */
  roof_style?: 'gable' | 'hip' | 'flat' | 'mansard' | 'shed' | 'gambrel';
  roof_pitch_degrees?: number;  // Angle of the roof slope
  roof_overhang?: number;       // How far the roof extends past walls

  /** Room: metadata */
  room_function?: string;       // "bedroom", "kitchen", "bathroom", etc.

  // --- Metadata ---
  created_at: string;      // ISO timestamp
  modified_at: string;     // ISO timestamp
  version: number;         // Incremented on each edit (for undo/redo)
}

/**
 * PSGProject — The complete project file.
 *
 * Contains the flat node map (for O(1) lookups) plus project-level metadata.
 * The tree structure is implicit via parent_id/children_ids references.
 *
 * WHY A FLAT MAP INSTEAD OF A NESTED TREE?
 * - O(1) node lookup by ID (vs O(n) tree traversal)
 * - Easier to apply diffs/patches
 * - LLM can reference any node by ID without traversing
 * - The tree structure is still available via parent_id/children_ids
 */
export interface PSGProject {
  id: string;                       // Project UUID
  name: string;                     // "Smith Family Home"
  description: string;              // User's brief
  created_at: string;
  modified_at: string;
  version: number;

  // The house data
  root_node_id: string;             // ID of the House root node
  nodes: Record<string, PSGNode>;   // Flat map: node_id → PSGNode

  // Project settings
  settings: ProjectSettings;

  // Budget
  budget: BudgetConfig;
}

export interface ProjectSettings {
  unit: 'metric' | 'imperial';     // Meters or feet
  grid_size: number;                // Snap-to-grid increment (meters)
  default_wall_height: number;      // Default wall height for new walls
  default_wall_thickness: number;   // Default wall thickness
  locale: string;                   // For currency formatting
  currency: string;                 // "EUR", "USD", etc.
}

export interface BudgetConfig {
  total_budget: number;             // User's total budget
  spent: number;                    // Calculated from materials
  remaining: number;                // total - spent
  currency: string;
  warnings_enabled: boolean;        // Show cost warnings on edits
  warning_threshold: number;        // Warn when within this % of budget
}

// =============================================================================
// 4. AI TOOL / OPERATION TYPES
// =============================================================================
// These define the EXACT operations the LLM can perform on the PSG.
// The LLM uses function calling to invoke these operations.
// Each operation is validated before being applied.

/** All possible AI edit operations */
export type OperationType =
  | 'move_node'
  | 'resize_node'
  | 'rotate_node'
  | 'replace_material'
  | 'add_node'
  | 'delete_node'
  | 'replace_node'
  | 'add_system_element'
  | 'set_constraint'
  | 'batch_edit';

/**
 * PSGOperation — A single atomic edit to the scene graph.
 *
 * Operations are the ONLY way the PSG can be modified (by AI or UI).
 * This ensures every change is:
 * 1. Validated against constraints
 * 2. Recorded in the undo/redo history
 * 3. Broadcast to the 3D viewport via WebSocket/state update
 * 4. Budget-checked before application
 */
export interface PSGOperation {
  type: OperationType;
  target_id: string;          // The node being edited
  params: Record<string, unknown>; // Operation-specific parameters
  timestamp: string;
  // Undo support
  previous_state?: Partial<PSGNode>; // Snapshot before the edit
}

/** Result of applying an operation — includes warnings/errors */
export interface OperationResult {
  success: boolean;
  operation: PSGOperation;
  warnings: OperationWarning[];
  errors: string[];
  budget_impact?: {
    cost_change: number;     // Positive = more expensive
    new_total: number;
    exceeds_budget: boolean;
  };
}

export interface OperationWarning {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  suggestion?: string;       // AI's suggestion to resolve the warning
}

// =============================================================================
// 5. CAMERA & VIEWPORT TYPES
// =============================================================================

/** Available camera/view modes in the 3D viewport */
export type ViewMode =
  | 'orbit'        // Free orbit around the house (default)
  | 'walkthrough'  // First-person walk-through at eye level
  | 'top_down'     // Bird's eye plan view
  | 'section'      // Cross-section cut view
  | 'front'        // Front elevation
  | 'side'         // Side elevation
  | 'landscape';   // AI-generated photorealistic render

/** Layer visibility toggles */
export type ViewLayer =
  | 'structure'    // Walls, floors, roof (always on)
  | 'electrical'   // Wiring, sockets, switches, panel
  | 'plumbing'     // Supply (green) and drain (red) pipes
  | 'hvac'         // Heating, ventilation, air conditioning ducts
  | 'thermal'      // Heat map overlay
  | 'dimensions'   // Measurement annotations
  | 'grid';        // Ground grid

export interface CameraState {
  mode: ViewMode;
  position: Vec3;
  target: Vec3;           // Look-at point (orbit mode)
  fov: number;            // Field of view in degrees
  near: number;           // Near clipping plane
  far: number;            // Far clipping plane
  // Walk-through specific
  walk_height: number;    // Camera height in meters (default 1.7)
  walk_speed: number;     // Movement speed multiplier
  collision: boolean;     // Enable wall collision
}

// =============================================================================
// 6. UI STATE TYPES
// =============================================================================

/** Which panel is currently active in the sidebar */
export type ActivePanel =
  | 'chat'         // AI chat panel
  | 'inspector'    // Node property inspector
  | 'materials'    // Material library browser
  | 'layers'       // Layer visibility toggles
  | 'export'       // Export options
  | 'budget';      // Budget overview

/** The currently selected node (if any) */
export interface SelectionState {
  selected_node_id: string | null;
  hovered_node_id: string | null;
  multi_select_ids: string[];      // For batch operations
}

// =============================================================================
// 7. API TYPES
// =============================================================================

/** Chat message in the AI conversation */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  // If the AI made edits, they're attached here
  operations?: PSGOperation[];
  // If the user uploaded reference images
  image_urls?: string[];
}

/** Request to the AI chat endpoint */
export interface AIChatRequest {
  message: string;
  project: PSGProject;        // Current state of the house
  history: ChatMessage[];      // Conversation context
  image_urls?: string[];       // Reference images uploaded by user
}

/** Response from the AI chat endpoint */
export interface AIChatResponse {
  message: string;             // AI's text response
  operations: PSGOperation[];  // Edits to apply
  warnings: OperationWarning[];
  suggestions?: string[];      // Follow-up suggestions
}

/** Request to generate initial house from description */
export interface GenerateHouseRequest {
  description: string;         // User's style/size description
  reference_images?: string[]; // Uploaded inspiration images
  budget: number;
  currency: string;
  num_bedrooms: number;
  num_bathrooms: number;
  num_floors: number;
  total_area_m2?: number;      // Desired total floor area
  style_preferences: string[]; // e.g. ["modern", "minimalist", "open-plan"]
}

/** Response with the generated PSG project */
export interface GenerateHouseResponse {
  project: PSGProject;
  ai_message: string;          // AI's explanation of the design
  cost_estimate: number;
  material_summary: MaterialSummaryItem[];
}

/** One line item in the materials summary */
export interface MaterialSummaryItem {
  material: Material;
  volume_m3: number;
  weight_kg: number;
  cost: number;
  used_in: string[];           // Node IDs where this material is used
}

/** Export request — what documents to generate */
export interface ExportRequest {
  project: PSGProject;
  formats: ExportFormat[];
}

export type ExportFormat =
  | 'floor_plans'      // Scaled floor plan PDFs
  | 'elevations'       // Front/side/rear elevation drawings
  | 'sections'         // Cross-section drawings
  | 'material_list'    // Full material schedule with costs
  | 'electrical'       // Electrical layout drawings
  | 'plumbing'         // Plumbing layout drawings
  | 'bill_of_quantities' // Detailed BoQ
  | 'full_package';    // Everything above
