/**
 * =============================================================================
 * LIB/AI/TOOLS.TS — AI Tool Definitions for LLM Function Calling
 * =============================================================================
 *
 * UPGRADE v2 — Added compound tools + custom element creation
 *
 * These tool definitions are sent to the LLM (Gemini/GPT/Groq) so it knows
 * exactly what operations it can perform on the house.
 *
 * Changes from v1:
 * 1. Added create_custom_element — allows freeform shape descriptions
 * 2. Added move_room — compound tool that moves a room with all children
 * 3. Improved descriptions for better LLM comprehension
 * 4. Added Floor to valid node types for add_node
 *
 * WHY FUNCTION CALLING?
 * - Prevents hallucinated/malformed geometry
 * - Each tool maps directly to a PSGOperation
 * - The validator catches any remaining errors
 * - Structured output is deterministic and parseable
 * =============================================================================
 */

export const AI_TOOLS = [
    // ─── TOOL 1: Add a new node ──────────────────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'add_node',
            description:
                'Add a new architectural element to the house. IMPORTANT: Use the correct parent_id — ' +
                'walls go inside rooms, windows/doors go inside walls, rooms go inside floors. ' +
                'Position is the CENTER POINT of the element in meters. ' +
                'For a wall at ground level, position_y should be wall_height/2 (e.g. 1.35 for 2.7m wall).',
            parameters: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Optional. Use this to explicitly define a unique ID (e.g. "floor_1_new") so you can reference it as a parent_id in subsequent tool calls within the SAME response. If omitted, a random ID is generated.',
                    },
                    type: {
                        type: 'string',
                        enum: ['Wall', 'Window', 'Door', 'Room', 'Floor', 'Slab', 'Stairs', 'Roof',
                            'Column', 'Beam', 'Foundation', 'Partition', 'Balcony',
                            'Toilet', 'Sink', 'Shower', 'Bathtub', 'LightSwitch', 'ElectricalOutlet', 'ElectricalPanel'],
                        description: 'Type of element to add',
                    },
                    parent_id: {
                        type: 'string',
                        description: 'ID of the parent node. Walls → room ID, Windows → wall ID, Rooms → floor ID',
                    },
                    name: {
                        type: 'string',
                        description: 'Human-readable name (e.g. "North Kitchen Wall", "Master Bedroom Window")',
                    },
                    position_x: { type: 'number', description: 'X center position in meters (East/West)' },
                    position_y: { type: 'number', description: 'Y center position in meters (Up/Down). For ground-floor walls: height/2' },
                    position_z: { type: 'number', description: 'Z center position in meters (North/South)' },
                    width: { type: 'number', description: 'Width in meters (X dimension, or length for rotated walls)' },
                    height: { type: 'number', description: 'Height in meters (Y dimension)' },
                    depth: { type: 'number', description: 'Depth/thickness in meters (Z dimension). Walls: 0.25, Partitions: 0.12' },
                    yaw: { type: 'number', description: 'Rotation in degrees around Y axis (e.g. 0 for East-West, 90 for North-South)' },
                    material_id: { type: 'string', description: 'Material ID from the materials library' },
                    room_function: {
                        type: 'string',
                        enum: ['living', 'bedroom', 'kitchen', 'bathroom', 'hallway', 'dining', 'office', 'garage', 'laundry', 'storage'],
                        description: 'Function of the room (only for Room type)',
                    },
                    roof_style: {
                        type: 'string',
                        enum: ['flat', 'gable', 'hip', 'shed'],
                        description: 'Roof style (only for Roof type)',
                    },
                    roof_pitch_degrees: {
                        type: 'number',
                        description: 'Roof pitch angle (only for Roof type). Common: 15-45 degrees',
                    },
                    stair_style: {
                        type: 'string',
                        enum: ['straight', 'l_shaped', 'u_shaped', 'spiral'],
                        description: 'Stair style (only for Stairs type)',
                    },
                },
                required: ['type', 'parent_id', 'name'],
            },
        },
    },

    // ─── TOOL 2: Move a node ─────────────────────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'move_node',
            description:
                'Move an element by a DELTA offset (not absolute position). ' +
                'delta_x=+2 means move 2 meters East. delta_z=+1 means move 1 meter South. ' +
                'All child elements automatically move with the parent. ' +
                'IMPORTANT: Use the MANDATORY REASONING PROTOCOL — list current position, ' +
                'calculate delta, verify adjacency before calling.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: {
                        type: 'string',
                        description: 'ID of the node to move (e.g. "wall_north_wall_abc12345")',
                    },
                    delta_x: { type: 'number', description: 'Move East(+) or West(-) in meters' },
                    delta_y: { type: 'number', description: 'Move Up(+) or Down(-) in meters' },
                    delta_z: { type: 'number', description: 'Move South(+) or North(-) in meters' },
                },
                required: ['target_id'],
            },
        },
    },

    // ─── TOOL 3: Resize a node ───────────────────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'resize_node',
            description:
                'Change the dimensions of an element. Provide NEW ABSOLUTE dimensions, not deltas. ' +
                'Only specify the dimensions you want to change — others stay the same. ' +
                'IMPORTANT: After resizing, verify that: ' +
                '1. Windows/doors still fit within the wall ' +
                '2. The room meets minimum size requirements ' +
                '3. Adjacent walls still connect properly',
            parameters: {
                type: 'object',
                properties: {
                    target_id: {
                        type: 'string',
                        description: 'ID of the node to resize',
                    },
                    width: { type: 'number', description: 'New width in meters (X dimension)' },
                    height: { type: 'number', description: 'New height in meters (Y dimension)' },
                    depth: { type: 'number', description: 'New depth/thickness in meters (Z dimension)' },
                },
                required: ['target_id'],
            },
        },
    },

    // ─── TOOL 4: Replace material ────────────────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'replace_material',
            description:
                'Change the material of an element. Use a valid material_id from the materials library. ' +
                'Always mention the cost impact in your response.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: {
                        type: 'string',
                        description: 'ID of the node to change material on',
                    },
                    material_id: {
                        type: 'string',
                        description: 'New material ID from the materials library',
                    },
                },
                required: ['target_id', 'material_id'],
            },
        },
    },

    // ─── TOOL 5: Replace node style ──────────────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'replace_node',
            description:
                'Replace a node\'s style/type (e.g. change roof from gable to flat, stairs from straight to spiral). ' +
                'Children are preserved by default.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: {
                        type: 'string',
                        description: 'ID of the node to replace',
                    },
                    new_type: {
                        type: 'string',
                        description: 'New node type (optional — usually keep the same type)',
                    },
                    roof_style: {
                        type: 'string',
                        enum: ['flat', 'gable', 'hip', 'shed'],
                        description: 'New roof style (for Roof nodes only)',
                    },
                    roof_pitch_degrees: {
                        type: 'number',
                        description: 'New roof pitch (for Roof nodes only)',
                    },
                    stair_style: {
                        type: 'string',
                        enum: ['straight', 'l_shaped', 'u_shaped', 'spiral'],
                        description: 'New stair style (for Stairs nodes only)',
                    },
                    yaw: {
                        type: 'number',
                        description: 'New rotation around Y axis in degrees',
                    },
                    pitch: {
                        type: 'number',
                        description: 'New rotation around X axis in degrees',
                    },
                    roll: {
                        type: 'number',
                        description: 'New rotation around Z axis in degrees',
                    },
                    preserve_children: {
                        type: 'boolean',
                        description: 'Whether to keep child elements (default: true)',
                    },
                },
                required: ['target_id'],
            },
        },
    },

    // ─── TOOL 6: Delete a node ───────────────────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'delete_node',
            description:
                'Delete an element and ALL its children (cascade delete). ' +
                'WARNING: Deleting a room deletes all its walls, windows, and doors. ' +
                'Cannot delete load-bearing walls that have dependents. ' +
                'Cannot delete the root House node.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: {
                        type: 'string',
                        description: 'ID of the node to delete',
                    },
                },
                required: ['target_id'],
            },
        },
    },

    // ─── TOOL 7: Move an entire room ─────────────────────────────────
    // COMPOUND TOOL — moves room + all children in one call
    {
        type: 'function' as const,
        function: {
            name: 'move_room',
            description:
                'Move an entire room including all its walls, windows, doors, and partitions. ' +
                'This is a COMPOUND operation — use this instead of move_node when moving rooms. ' +
                'All children move by the same delta automatically.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: {
                        type: 'string',
                        description: 'ID of the Room node to move',
                    },
                    delta_x: { type: 'number', description: 'Move East(+) or West(-) in meters' },
                    delta_y: { type: 'number', description: 'Move Up(+) or Down(-) in meters' },
                    delta_z: { type: 'number', description: 'Move South(+) or North(-) in meters' },
                },
                required: ['target_id'],
            },
        },
    },

    // ─── TOOL 8: Create custom architectural element ─────────────────
    // NEW — Enables freeform shapes beyond predefined types
    {
        type: 'function' as const,
        function: {
            name: 'create_custom_element',
            description:
                'Create a custom architectural element by describing its shape in natural language. ' +
                'Use this for shapes that don\'t fit standard types: curved walls, spiral stairs, ' +
                'arched windows, bay windows, organic balconies, etc. ' +
                'The backend will generate appropriate geometry from your description.',
            parameters: {
                type: 'object',
                properties: {
                    parent_id: {
                        type: 'string',
                        description: 'ID of the parent node (room, floor, or house)',
                    },
                    name: {
                        type: 'string',
                        description: 'Descriptive name for the element',
                    },
                    description: {
                        type: 'string',
                        description:
                            'Detailed natural language description of the shape. Include dimensions, ' +
                            'style, and material preferences. Example: "A spiral staircase with 1.2m outer ' +
                            'radius, 15 oak treads, wrought iron railing, connecting ground to first floor"',
                    },
                    position_x: { type: 'number', description: 'X center position in meters' },
                    position_y: { type: 'number', description: 'Y center position in meters' },
                    position_z: { type: 'number', description: 'Z center position in meters' },
                    width: { type: 'number', description: 'Approximate bounding width in meters' },
                    height: { type: 'number', description: 'Approximate bounding height in meters' },
                    depth: { type: 'number', description: 'Approximate bounding depth in meters' },
                    material_id: {
                        type: 'string',
                        description: 'Primary material ID',
                    },
                },
                required: ['parent_id', 'name', 'description'],
            },
        },
    },

    // ─── TOOL 9: Rotate a node ───────────────────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'rotate_node',
            description:
                'Rotate an architectural element by specifying new absolute rotation angles in degrees. ' +
                'For walls, use yaw=0 to run East-West (along X-axis) and yaw=90 to run North-South (along Z-axis).',
            parameters: {
                type: 'object',
                properties: {
                    target_id: {
                        type: 'string',
                        description: 'ID of the node to rotate',
                    },
                    yaw: { type: 'number', description: 'Rotation around Y axis (vertical) in degrees. Horizontal orientation.' },
                    pitch: { type: 'number', description: 'Rotation around X axis in degrees. Vertical tilt.' },
                    roll: { type: 'number', description: 'Rotation around Z axis in degrees. Bank/twist.' },
                },
                required: ['target_id'],
            },
        },
    },
];
