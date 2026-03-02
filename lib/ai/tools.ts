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
                'Example: For a 2.7m wall at ground level, position_y=1.35. For stairs spanning 2.7m height at ground level, position_y=1.35.',
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
                            'Column', 'Beam', 'Foundation', 'Partition', 'Balcony', 'Custom',
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
                    position_y: { type: 'number', description: 'Y center position in meters (Up/Down). For ground-floor walls or stairs: height/2' },
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
                        enum: ['flat', 'gable', 'hip', 'shed', 'mansard', 'gambrel', 'butterfly', 'dome', 'conical', 'saltbox', 'pyramid', 'skillion', 'jerkinhead', 'bonnet', 'cross_gable', 'cross_hip', 'round'],
                        description: 'Roof style (only for Roof type)',
                    },
                    roof_pitch_degrees: {
                        type: 'number',
                        description: 'Roof pitch angle (only for Roof type). Common: 15-45 degrees',
                    },
                    stair_style: {
                        type: 'string',
                        enum: ['straight', 'l_shaped', 'u_shaped', 'spiral', 'curved', 'winder', 'bifurcated', 'circular', 'half_turn', 'quarter_turn'],
                        description: 'Stair style (only for Stairs type)',
                    },
                    wall_style: {
                        type: 'string',
                        enum: ['straight', 'curved', 'round', 'wavy', 'sloped'],
                        description: 'Wall style/shape (only for Wall type)',
                    },
                    balcony_style: {
                        type: 'string',
                        enum: ['projecting', 'recessed', 'juliet', 'loggia', 'wrap_around', 'mezzanine', 'deck', 'veranda'],
                        description: 'Balcony style (only for Balcony type)',
                    },
                    stair_riser_height: {
                        type: 'number',
                        description: 'Height of each step (default: 0.18m)',
                    },
                    stair_tread_depth: {
                        type: 'number',
                        description: 'Depth of each step (default: 0.28m)',
                    },
                    assembly: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                material_id: { type: 'string' },
                                thickness: { type: 'number', description: 'Thickness in meters' },
                                role: { type: 'string', enum: ['structural', 'finish', 'insulation', 'substrate', 'air_gap', 'membrane'] },
                                order: { type: 'number', description: '0 = exterior face' }
                            }
                        },
                        description: 'Detailed structural layers of the wall/slab (Construction Mode)'
                    },
                    junctions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                junction_type: { type: 'string', enum: ['butt', 'miter', 'corner', 't-junction', 'cross'] },
                                target_id: { type: 'string', description: 'ID of the node to join with' },
                                offset: { type: 'number', description: 'Join offset in meters (0.5mm precision)' }
                            }
                        },
                        description: 'Precise corner connections (Advanced Architecture)'
                    }
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
                        enum: ['flat', 'gable', 'hip', 'shed', 'mansard', 'gambrel', 'butterfly', 'dome', 'conical', 'saltbox', 'pyramid', 'skillion', 'jerkinhead', 'bonnet', 'cross_gable', 'cross_hip', 'round'],
                        description: 'New roof style (for Roof nodes only)',
                    },
                    roof_pitch_degrees: {
                        type: 'number',
                        description: 'New roof pitch (for Roof nodes only)',
                    },
                    stair_style: {
                        type: 'string',
                        enum: ['straight', 'l_shaped', 'u_shaped', 'spiral', 'curved', 'winder', 'bifurcated', 'circular', 'half_turn', 'quarter_turn'],
                        description: 'New stair style (for Stairs nodes only)',
                    },
                    wall_style: {
                        type: 'string',
                        enum: ['straight', 'curved', 'round', 'wavy', 'sloped'],
                        description: 'New wall style/shape (for Wall nodes only)',
                    },
                    balcony_style: {
                        type: 'string',
                        enum: ['projecting', 'recessed', 'juliet', 'loggia', 'wrap_around', 'mezzanine', 'deck', 'veranda'],
                        description: 'New balcony style (for Balcony nodes only)',
                    },
                    stair_riser_height: {
                        type: 'number',
                        description: 'New height of each step',
                    },
                    stair_tread_depth: {
                        type: 'number',
                        description: 'New depth of each step',
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
                    assembly: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                material_id: { type: 'string' },
                                thickness: { type: 'number' },
                                role: { type: 'string', enum: ['structural', 'finish', 'insulation', 'substrate', 'air_gap', 'membrane'] },
                                order: { type: 'number' }
                            }
                        },
                        description: 'New structural assembly layers'
                    },
                    junctions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                junction_type: { type: 'string', enum: ['butt', 'miter', 'corner', 't-junction', 'cross'] },
                                target_id: { type: 'string' },
                                offset: { type: 'number' }
                            }
                        },
                        description: 'New precise corner connections'
                    }
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
                'Use this for shapes that don\'t fit standard types like arched windows, bay windows, organic forms. ' +
                'DO NOT USE this for staircases or standard balconies (use the "add_node" tool with type "Stairs" or "Balcony" instead, even for spiral). ' +
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
                            'style, and material preferences. Example: "An ornate marble water fountain with ' +
                            'a 1.2m radius basin, fluted pedestal, and central statue"',
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
                    custom_geometry: {
                        type: 'object',
                        description: 'The exact mathematical geometry definition. THIS IS CRITICAL for perfect objects. Instead of a block, you can define perfect spheres, cones, cylinders, or even complex lathed profiles and extruded 2D shapes by providing [x,y] coordinates!',
                        properties: {
                            type: {
                                type: 'string',
                                enum: ['extrusion', 'lathe', 'sphere', 'box', 'cylinder', 'cone', 'plane', 'arch', 'code'],
                                description: 'The primitive operation used to construct the shape. Use "arch" for arches, or use "code" for ANY OTHER fully procedural or highly complex 3D shape (THE UNIVERSAL SOLUTION).'
                            },
                            profile_points: {
                                type: 'array',
                                items: { type: 'array', items: { type: 'number' } },
                                description: 'Array of [x, y] coordinates. MANDATORY for "extrusion" (defines 2D shape to extrude) or "lathe" (defines 2D curve to rotate around Y-axis). Example: [[0,0], [1,0], [1,1], [0,1]]'
                            },
                            depth: { type: 'number', description: 'Extrusion length (Z axis) for "extrusion" or "arch" type.' },
                            radius: { type: 'number', description: 'Radius for sphere, cylinder, cone, or lathe.' },
                            height: { type: 'number', description: 'Height for cylinder, cone or arch.' },
                            thickness: { type: 'number', description: 'Wall/frame thickness for "arch" type.' },
                            segments: { type: 'number', description: 'Number of segments for smooth curves (default 32, use 64 for perfect curves).' },
                            code: { type: 'string', description: 'A Javascript code block (for type "code" only). Evaluates dynamically at runtime. The script MUST return a THREE.BufferGeometry or THREE.Group. You have access to variables: THREE, width, height, depth, radius, segments. Example: "return new THREE.TorusGeometry(radius, 0.4, 16, 100);" or "const shape = new THREE.Shape(); shape.moveTo(0,0); /*...*/ return new THREE.ExtrudeGeometry(shape, {depth});"' }
                        },
                        required: ['type']
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
    // ─── TOOL 10: Solve architectural precision ──────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'solve_precision',
            description:
                'Execute the architectural precision solver. This will iterate through all walls, ' +
                'slabs, and corners, and mathematically align them to a 0.5mm tolerance (Construction level). ' +
                'Call this after major structural changes to "harden" the design.',
            parameters: {
                type: 'object',
                properties: {
                    reasoning: { type: 'string', description: 'Briefly explain why you are refining precision now.' }
                }
            },
        },
    },
    // ─── TOOL 11: Set project precision level ────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'set_precision_level',
            description:
                'Set the architectural precision level of the project. ' +
                'Level 0 (Conceptual): 5cm grid snapping. ' +
                'Level 1 (Standard): 1cm grid snapping. ' +
                'Level 2 (Construction): 0.5mm grid snapping + detailed junctions enabled.',
            parameters: {
                type: 'object',
                properties: {
                    level: { type: 'string', enum: ['0', '1', '2'], description: 'Target precision level: 0=Conceptual, 1=Standard, 2=Construction' }
                },
                required: ['level']
            },
        },
    },
    // ─── TOOL 12: Use a pre-built template ───────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'use_template',
            description:
                'Apply a pre-built house template to the current project. ' +
                'This will REPLACE the entire project state with the template. ' +
                'Use this to quickly satisfy complex requests like "White House", "Mansion", or "3-Bedroom Home". ' +
                'Available templates: "white_house", "modern_4bed", "simple_3bed", "minimalist_studio".',
            parameters: {
                type: 'object',
                properties: {
                    template_slug: {
                        type: 'string',
                        enum: ['white_house', 'modern_4bed', 'simple_3bed_1floor', 'minimalist_studio'],
                        description: 'The slug of the template to apply.'
                    },
                    reasoning: { type: 'string', description: 'Why are you choosing this template?' }
                },
                required: ['template_slug']
            },
        },
    },
    // ─── TOOL 13: Advanced Wall Surface Editing ─────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'edit_wall_surface',
            description:
                'Apply a custom surface modification to a wall (e.g., bulbs, curves, holes, or variable thickness). ' +
                'Internal representation is a 2D matrix representing thickness multipliers across the wall face. ' +
                '0.0 = hole (cutout), 1.0 = standard thickness, 2.0+ = bulbous/thickened area. ' +
                'This tool allows you to "paint" onto the wall surface.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: 'ID of the Wall or Partition' },
                    command: {
                        type: 'string',
                        enum: ['reset', 'set_bulb', 'cut_hole', 'set_matrix', 'draw_curve'],
                        description: 'Operation to perform'
                    },
                    description: { type: 'string', description: 'A short human-readable summary of the modification (e.g., "Bulb in the top-left corner")' },
                    rows: { type: 'number', description: 'Matrix resolution (Y-axis). 2x2 is minimum, 20x20 is standard for bulbs. Default 10.' },
                    cols: { type: 'number', description: 'Matrix resolution (X-axis). Default 10.' },
                    cx: { type: 'number', description: 'X-center (0.0 to 1.0) for bulb' },
                    cy: { type: 'number', description: 'Y-center (0.0 to 1.0) for bulb' },
                    radius: { type: 'number', description: 'Radius (0.0 to 1.0) for bulb' },
                    strength: { type: 'number', description: 'Thickness multiplier at bulb peak. 2.0 means double the wall thickness.' },
                    x: { type: 'number', description: 'X-start (0.0 to 1.0) for rectangular hole' },
                    y: { type: 'number', description: 'Y-start (0.0 to 1.0) for rectangular hole' },
                    w: { type: 'number', description: 'Width percentage (0.0 to 1.0) for rectangular hole' },
                    h: { type: 'number', description: 'Height percentage (0.0 to 1.0) for rectangular hole' },
                    data: {
                        type: 'array',
                        items: { type: 'array', items: { type: 'number' } },
                        description: 'Raw matrix data (optional, only for command="set_matrix")'
                    }
                },
                required: ['target_id', 'command', 'description']
            },
        },
    },
    // ─── TOOL 14: Look up Wall Surface Matrix ────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'get_wall_surface',
            description:
                'Get the full numerical matrix for a wall\'s custom surface. ' +
                'Call this ONLY if you need to precisely edit an existing complex wall shape. ' +
                'By default, you only see a short description of the wall surface.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: 'ID of the wall to look up' }
                },
                required: ['target_id']
            },
        },
    },
];
