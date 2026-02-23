/**
 * =============================================================================
 * LIB/AI/TOOLS.TS — AI Tool Definitions for LLM Function Calling
 * =============================================================================
 *
 * These tool definitions are sent to the LLM (Gemini/GPT) so it knows
 * exactly what operations it can perform on the house. The LLM cannot
 * generate arbitrary JSON — it can ONLY call these tools.
 *
 * WHY FUNCTION CALLING?
 * - Prevents hallucinated/malformed geometry
 * - Every tool maps 1:1 to a validated PSG operation
 * - The LLM's output is structured and parseable
 * - We can validate parameters before applying anything
 *
 * FORMAT: OpenAI-compatible function calling schema.
 * Works with Gemini (via compatible format) and GPT-4.
 * =============================================================================
 */

/**
 * The complete list of tools the AI can use.
 * Each tool maps to a PSGOperation type in operations.ts.
 */
export const AI_TOOLS = [
    {
        type: 'function' as const,
        function: {
            name: 'move_node',
            description: 'Move a node by a delta offset in meters. Positive X = east, positive Y = up, positive Z = south. Children move with the parent.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: 'ID of the node to move' },
                    delta_x: { type: 'number', description: 'Meters to move east (negative = west)' },
                    delta_y: { type: 'number', description: 'Meters to move up (negative = down)' },
                    delta_z: { type: 'number', description: 'Meters to move south (negative = north)' },
                },
                required: ['target_id'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'resize_node',
            description: 'Set new absolute dimensions for a node. Only specify dimensions you want to change.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: 'ID of the node to resize' },
                    width: { type: 'number', description: 'New width in meters (X dimension)' },
                    height: { type: 'number', description: 'New height in meters (Y dimension)' },
                    depth: { type: 'number', description: 'New depth/thickness in meters (Z dimension)' },
                },
                required: ['target_id'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'replace_material',
            description: 'Change the material of a node. Provide the material_id from the materials library.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: 'ID of the node' },
                    material_id: { type: 'string', description: 'ID of the new material (e.g., "mat_brick_red", "mat_stone_granite")' },
                },
                required: ['target_id', 'material_id'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'add_node',
            description: 'Add a new architectural element (wall, window, door, room, etc.) to the house.',
            parameters: {
                type: 'object',
                properties: {
                    type: { type: 'string', enum: ['Wall', 'Window', 'Door', 'Room', 'Slab', 'Stairs', 'Roof', 'Partition', 'Column', 'Beam'], description: 'Type of element to add' },
                    parent_id: { type: 'string', description: 'ID of the parent node to attach to' },
                    name: { type: 'string', description: 'Human-readable name, e.g. "Kitchen East Wall"' },
                    position_x: { type: 'number', description: 'X position in meters relative to parent' },
                    position_y: { type: 'number', description: 'Y position in meters relative to parent' },
                    position_z: { type: 'number', description: 'Z position in meters relative to parent' },
                    width: { type: 'number', description: 'Width in meters' },
                    height: { type: 'number', description: 'Height in meters' },
                    depth: { type: 'number', description: 'Depth/thickness in meters' },
                    material_id: { type: 'string', description: 'Material ID' },
                },
                required: ['type', 'parent_id', 'name'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'delete_node',
            description: 'Remove a node and all its children. Cannot delete load-bearing elements with dependents.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: 'ID of the node to delete' },
                },
                required: ['target_id'],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'replace_node',
            description: 'Replace a node with a different version (e.g., replace straight stairs with spiral). Preserves children by default.',
            parameters: {
                type: 'object',
                properties: {
                    target_id: { type: 'string', description: 'ID of the node to replace' },
                    new_type: { type: 'string', description: 'New node type if changing type' },
                    stair_style: { type: 'string', enum: ['straight', 'l_shaped', 'u_shaped', 'spiral', 'curved'], description: 'For stairs: the new style' },
                    roof_style: { type: 'string', enum: ['gable', 'hip', 'flat', 'mansard', 'shed', 'gambrel'], description: 'For roofs: the new style' },
                    preserve_children: { type: 'boolean', description: 'Keep existing children (default true)' },
                },
                required: ['target_id'],
            },
        },
    },
];

/**
 * Converts an AI tool call response into a PSGOperation.
 * This bridges the gap between the LLM's function call format
 * and our internal operation format.
 */
export function toolCallToOperation(
    toolName: string,
    args: Record<string, unknown>
): import('@/types').PSGOperation {
    return {
        type: toolName as import('@/types').OperationType,
        target_id: (args.target_id as string) || '',
        params: args,
        timestamp: new Date().toISOString(),
    };
}
