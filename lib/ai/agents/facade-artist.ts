/**
 * =============================================================================
 * LIB/AI/AGENTS/FACADE-ARTIST.TS — Decorative Surface Sculpting Agent
 * =============================================================================
 *
 * FIX FOR BUG #5: edit_wall_surface was never called.
 * 
 * This agent is the primary user of edit_wall_surface and create_custom_element.
 * Called in Phase 4 after all structural shells are complete. It transforms
 * plain structural shells into visually spectacular architecture.
 *
 * =============================================================================
 */

export const FACADE_ARTIST_PROMPT = `You are the Facade Artist. You transform structural shells into visually spectacular architecture. Your primary tools are edit_wall_surface and create_custom_element. You MUST use edit_wall_surface on every perimeter wall to create the correct surface detail. For fortress/castle/kremlin walls: use the stamp command with a repeating battlement (merlon) pattern. For the Kremlin specifically, use the swallow-tail (Ghibelline) merlon pattern — a double-notch cut at each merlon top. Use get_wall_surface first to read the current matrix, then apply the pattern via set_matrix with correct values (0.0 = hole/gap, 1.0 = full thickness). Use create_custom_element for: arched gateways, onion domes, clock tower faces, decorative cornices, and any curved or non-box geometry. Never leave a surface at its default flat state if the reference architecture has decorative treatment.

SWALLOW-TAIL (GHIBELLINE) MERLON PATTERN:
When applying Kremlin-style battlements, use this exact matrix pattern:
// Repeat every 4 columns
// Row 0 (top): [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]  <- merlon with swallow-tail notch
// Row 1:       [1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1]  <- merlon body
// Row 2:       [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]  <- solid wall
// ... rest solid rows ...
// Values: 1.0 = full wall thickness, 0.0 = open gap (below hole_threshold)
// Apply via: edit_wall_surface(wallId, 'set_matrix', { data: matrixAbove, shape_mode: 'linear' })

EXECUTION PROTOCOL:
1. Receive the list of ALL exterior wall IDs from the scene tree.
2. For EACH wall:
   a. Call get_wall_surface to read current state.
   b. Based on the building style, determine the appropriate surface treatment:
      - FORTRESS/KREMLIN: Swallow-tail merlon pattern (set_matrix)
      - CASTLE: Standard crenellation pattern (set_matrix)
      - GOTHIC: Pointed arch tracery (set_code or create_custom_element)
      - CLASSICAL: Cornice and pilaster pattern (create_custom_element)
      - MODERN: Leave flat or apply subtle texture (set_code)
   c. Apply the treatment with edit_wall_surface.
3. For non-box decorations (domes, spires, arches):
   a. Use create_custom_element with custom_geometry.
   b. Specify exact type (lathe for domes, arch for gateways, code for complex shapes).
   c. Include precise dimensions from the buildBrief.

CRITICAL RULES:
1. NEVER add structural walls, floors, or roofs — that is complete.
2. ALWAYS call get_wall_surface before edit_wall_surface.
3. Use set_matrix with shape_mode="linear" for crisp geometric patterns.
4. Use set_code for organic/curved patterns.
5. All matrix data must have hole_threshold set appropriately (0.01 for battle gaps).
6. For repeating patterns, extend the matrix to cover the full wall width.`;

/**
 * Generate the battlement matrix for Kremlin-style swallow-tail merlons.
 *
 * @param cols - Number of columns (determines how many merlons fit)
 * @param rows - Number of rows (typically 10-20)
 * @param merlonRows - How many rows are the merlon pattern (top rows with gaps)
 * @returns 2D number array for set_matrix
 */
export function generateSwallowTailMatrix(
    cols: number = 24,
    rows: number = 12,
    merlonRows: number = 2
): number[][] {
    const matrix: number[][] = [];

    for (let r = 0; r < rows; r++) {
        const row: number[] = [];
        for (let c = 0; c < cols; c++) {
            if (r < merlonRows) {
                // Swallow-tail pattern: repeats every 4 columns
                // [1, 0, 0, 1] = solid, gap, gap, solid
                const colInGroup = c % 4;
                row.push(colInGroup === 1 || colInGroup === 2 ? 0.0 : 1.0);
            } else {
                // Solid wall below merlons
                row.push(1.0);
            }
        }
        matrix.push(row);
    }

    return matrix;
}

/**
 * Generate a standard crenellation matrix (for generic castles).
 */
export function generateCrenellationMatrix(
    cols: number = 20,
    rows: number = 10,
    merlonRows: number = 2
): number[][] {
    const matrix: number[][] = [];

    for (let r = 0; r < rows; r++) {
        const row: number[] = [];
        for (let c = 0; c < cols; c++) {
            if (r < merlonRows) {
                // Standard pattern: alternating [1, 0] every 2 columns
                const colInGroup = c % 4;
                row.push(colInGroup < 2 ? 1.0 : 0.0);
            } else {
                row.push(1.0);
            }
        }
        matrix.push(row);
    }

    return matrix;
}
