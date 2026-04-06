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
                'Add a new architectural element to the house. ' +
                'All positions are WORLD-SPACE (absolute). You define the MINIMUM corner (x_min, y_min, z_min) where the element starts. ' +
                'Always read the scene state to find explicit edges (like the top surface of a floor) so your elements align perfectly.',
            parameters: {
                type: 'object',
                properties: {
                    id: {
                        type: 'string',
                        description: 'Optional. Use this to explicitly define a unique ID (e.g. "floor_1_new") so you can reference it as a parent_id in subsequent tool calls within the SAME response. If omitted, a random ID is generated.',
                    },
                    type: {
                        type: 'string',
                        enum: ['Wall', 'Window', 'Door', 'Slab', 'Stairs', 'Roof',
                            'Column', 'Beam', 'Foundation', 'Partition', 'Balcony', 'Custom',
                            'Garage', 'Chimney',
                            'Toilet', 'Sink', 'Shower', 'Bathtub', 'LightSwitch', 'ElectricalOutlet', 'ElectricalPanel'],
                        description: 'Type of element to add',
                    },
                    parent_id: {
                        type: 'string',
                        description: 'For Windows/Doors: the Wall ID they cut through. For everything else: any valid node ID (system auto-resolves).',
                    },
                    name: {
                        type: 'string',
                        description: 'Human-readable name (e.g. "North Kitchen Wall", "Master Bedroom Window")',
                    },
                    x_min: { type: 'number', description: 'Starting X edge in meters (East/West)' },
                    y_min: { type: 'number', description: 'Starting Y edge in meters (Up/Down) - e.g. the base of the wall' },
                    z_min: { type: 'number', description: 'Starting Z edge in meters (North/South)' },
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
                'Child elements (e.g. Windows/Doors on a Wall) automatically move with the parent.',
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

    // ─── TOOL 2.5: Set node absolute position ────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'set_node_position',
            description:
                'Set the exact ABSOLUTE starting edges (x_min, y_min, z_min) of an element in meters. ' +
                'Use this for precise placement. Child elements (Windows/Doors) maintain their relative positions. ' +
                'Only specify the coordinates you want to change — others stay the same.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: {
                        type: 'string',
                        description: 'ID of the node to position (e.g. "wall_north_wall_abc12345")',
                    },
                    position_x: { type: 'number', description: 'New X starting edge (x_min) in meters (East/West)' },
                    position_y: { type: 'number', description: 'New Y starting edge (y_min) in meters (Up/Down)' },
                    position_z: { type: 'number', description: 'New Z starting edge (z_min) in meters (North/South)' },
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

    // ─── TOOL 4b: Batch replace materials ─────────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'batch_replace_materials',
            description:
                'Apply materials to MULTIPLE nodes at once in a single call. ' +
                'Much more efficient than calling replace_material repeatedly. ' +
                'Pass an array of {target_id, material_id} pairs. ' +
                'Use this to set materials for ALL nodes in the building at once.',
            parameters: {
                type: 'object',
                properties: {
                    assignments: {
                        type: 'array',
                        description: 'List of material assignments. Each entry maps a node ID to a material ID.',
                        items: {
                            type: 'object',
                            properties: {
                                target_id: {
                                    type: 'string',
                                    description: 'ID of the node to apply material to',
                                },
                                material_id: {
                                    type: 'string',
                                    description: 'Material ID from the materials library',
                                },
                            },
                            required: ['target_id', 'material_id'],
                        },
                    },
                },
                required: ['assignments'],
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
                'Delete an element and all its children (cascade delete). ' +
                'Deleting a Wall also deletes its Windows/Doors. ' +
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
                'The backend will generate appropriate geometry from your description. ' +
                'For STAIRS, prefer "add_node" with type="Stairs" and style="spiral"/"curved"/"l_shaped" as those are now natively supported. ' +
                'Only use this tool for truly unique geometry not covered by standard types.',
            parameters: {
                type: 'object',
                properties: {
                    parent_id: {
                        type: 'string',
                        description: 'ID of any existing node (system auto-parents to root). For Window/Door custom elements, pass the Wall ID.',
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
                    x_min: { type: 'number', description: 'Starting X edge in meters (East/West)' },
                    y_min: { type: 'number', description: 'Starting Y edge in meters (Up/Down) - e.g. the base of the wall' },
                    z_min: { type: 'number', description: 'Starting Z edge in meters (North/South)' },
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
                                enum: ['extrusion', 'lathe', 'sphere', 'box', 'cylinder', 'cone', 'plane', 'arch', 'code', 'loft', 'sweep'],
                                description: 'The primitive operation used to construct the shape. Use "arch" for arches, or use "code" for ANY OTHER fully procedural or highly complex 3D shape (THE UNIVERSAL SOLUTION).'
                            },
                            profile_points: {
                                type: 'array',
                                items: { type: 'array', items: { type: 'number' } },
                                description: 'Array of [x, y] coordinates. MANDATORY for "extrusion" (defines 2D shape to extrude) or "lathe" (defines 2D curve to rotate around Y-axis). Example: [[0,0], [1,0], [1,1], [0,1]]'
                            },
                            path_points: {
                                type: 'array',
                                items: { type: 'array', items: { type: 'number' } },
                                description: 'Array of [x, y, z] coordinates for sweep/extrude path. Used for "sweep" or "extrusion" along a path.'
                            },
                            depth: { type: 'number', description: 'Extrusion length (Z axis) for "extrusion" or "arch" type (if no path).' },
                            radius: { type: 'number', description: 'Radius for sphere, cylinder, cone, or lathe.' },
                            inner_radius: { type: 'number', description: 'Inner radius for tubes/torus.' },
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
                'Level 0 (Conceptual): Basic precision. ' +
                'Level 1 (Standard): Standard precision. ' +
                'Level 2 (Construction): Maximum precision + detailed junctions enabled. ' +
                'Note: Coordinates are always stored exactly as specified (no grid snapping).',
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
                'Sculpt wall thickness using procedural formulas or editable matrices.\n\n' +
                'Core commands:\n' +
                '• set_code: JS expression using u,v returning thickness multiplier.\n' +
                '• set_matrix: explicit FULL matrix of multipliers.\n' +
                '• stamp: apply reusable shape brush with blend mode.\n' +
                '• set_bulb: quick center/radius/strength Gaussian protrusion.\n' +
                '• cut_hole: rectangular hole region.\n' +
                '• draw_curve: sine-wave profile along x or y axis.\n' +
                '• smooth / normalize / invert / set_cell / reset.\n\n' +
                'Values: low=thin, high=thick, value<=hole_threshold creates holes.\n\n' +
                'Matrix orientation for set_matrix data:\n' +
                'data[0][0]=upper-left, data[0][last]=upper-right, data[last][0]=lower-left, data[last][last]=lower-right.\n\n' +
                'USAGE MANDATE: This tool MUST be used by the facade_artist on every exterior wall of landmark structures. ' +
                'For fortress walls, use stamp or set_matrix to create battlements. For curved walls, use set_code with a sine formula. ' +
                'For castle/kremlin walls specifically: the swallow-tail (Ghibelline) merlon pattern is a double-notch at the top of each merlon — ' +
                'model this as 4-column-wide repeating groups: [solid, gap, gap, solid] at the top 2 rows. ' +
                'Always call get_wall_surface FIRST to read the current state before any set_matrix operation.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: 'ID of the Wall or Partition to sculpt' },
                    command: {
                        type: 'string',
                        enum: ['set_code', 'set_matrix', 'stamp', 'set_bulb', 'cut_hole', 'draw_curve', 'smooth', 'normalize', 'invert', 'set_cell', 'reset'],
                        description: 'Surface command to execute'
                    },
                    description: { type: 'string', description: 'Human-readable summary of the shape' },
                    code: {
                        type: 'string',
                        description: 'JS expression for set_code. Variables: u (0-1 horiz), v (0-1 vert). Must return a number.'
                    },
                    resolution: {
                        type: 'number',
                        description: 'Procedural mesh resolution (8-128)'
                    },
                    data: {
                        type: 'array',
                        items: { type: 'array', items: { type: 'number' } },
                        description: 'Raw 2D matrix data for set_matrix mode'
                    },
                    rows: { type: 'number', description: 'Target matrix rows for non-code commands' },
                    cols: { type: 'number', description: 'Target matrix cols for non-code commands' },
                    shape_mode: { type: 'string', enum: ['linear', 'smooth'], description: 'linear = sharper transitions, smooth = rounded transitions' },
                    min_value: { type: 'number', description: 'Lower clamp for thickness multipliers' },
                    max_value: { type: 'number', description: 'Upper clamp for thickness multipliers' },
                    hole_threshold: { type: 'number', description: 'Values <= threshold render as hole' },
                    interpolation: { type: 'string', enum: ['nearest', 'bilinear'], description: 'Sampling mode for matrix data' },
                    cx: { type: 'number', description: 'Center X (0-1) for set_bulb/stamp' },
                    cy: { type: 'number', description: 'Center Y (0-1) for set_bulb/stamp' },
                    radius: { type: 'number', description: 'Radius (0-1) for set_bulb/stamp' },
                    inner_radius: { type: 'number', description: 'Inner radius for ring-like stamp' },
                    strength: { type: 'number', description: 'Shape intensity or target peak' },
                    shape: { type: 'string', enum: ['gaussian', 'cone', 'dome', 'ring', 'ridge_x', 'ridge_y'], description: 'Stamp profile shape' },
                    blend: { type: 'string', enum: ['set', 'add', 'subtract', 'max', 'min', 'multiply'], description: 'Blend strategy for stamp/bulb' },
                    falloff: { type: 'number', description: 'Falloff exponent for stamp profile' },
                    x: { type: 'number', description: 'Hole origin X (0-1) for cut_hole' },
                    y: { type: 'number', description: 'Hole origin Y (0-1) for cut_hole' },
                    w: { type: 'number', description: 'Hole width (0-1) for cut_hole' },
                    h: { type: 'number', description: 'Hole height (0-1) for cut_hole' },
                    axis: { type: 'string', enum: ['x', 'y'], description: 'Wave axis for draw_curve' },
                    amplitude: { type: 'number', description: 'Wave amplitude for draw_curve' },
                    frequency: { type: 'number', description: 'Wave frequency for draw_curve' },
                    phase: { type: 'number', description: 'Wave phase offset for draw_curve' },
                    passes: { type: 'number', description: 'Smoothing iterations for smooth command' },
                    row: { type: 'number', description: 'Matrix row for set_cell' },
                    col: { type: 'number', description: 'Matrix column for set_cell' },
                    value: { type: 'number', description: 'Matrix value for set_cell' }
                },
                required: ['target_id', 'command']
            },
        },
    },
    // ─── TOOL 14: Look up Wall Surface ────────────────────────────────
    {
        type: 'function' as const,
        function: {
            name: 'get_wall_surface',
            description:
                'Inspect a wall\'s current surface configuration (code expression or matrix data). ' +
                'Call this ONLY if you need to see the exact formula/data before editing.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: 'ID of the wall to inspect' }
                },
                required: ['target_id']
            },
        },
    },
];
