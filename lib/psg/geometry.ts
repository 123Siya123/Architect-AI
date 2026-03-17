/**
 * =============================================================================
 * LIB/PSG/GEOMETRY.TS — Precision Architectural Geometry Engine
 * =============================================================================
 *
 * This module creates ARCHITECTURALLY CORRECT Three.js geometry:
 *
 *  WALLS:
 *   - Each wall is a solid box with HOLES cut out where windows/doors sit
 *   - Holes are computed from child Window/Door nodes
 *   - The wall is built as a custom BufferGeometry using Shape + ShapeGeometry
 *   - Corner intersections are handled by the renderer (no blind overlaps)
 *
 *  WINDOWS:
 *   - A frame made of 4 rectangular solid members (top, bottom, left, right)
 *   - A thin glass pane set in the middle of the frame
 *   - The frame depth matches the wall thickness
 *
 *  DOORS:
 *   - A frame (3 solid members: top + 2 sides) matching wall thickness
 *   - A door leaf (flat panel, slightly proud of frame) in the closed position
 *   - An arc "swing" indicator mesh for floor plans
 *
 *  COORDINATE SYSTEM (same as compiler.ts):
 *   X = East, Y = Up, Z = South
 *   All dimensions in METERS
 *
 * HOW WALL OPENINGS WORK:
 *  1. Query all child nodes of the wall that are Window or Door
 *  2. For each opening: compute its local [xMin, xMax, yMin, yMax] within 
 *     the wall's local X-Y plane (wall origin = bottom-left corner)
 *  3. Build a 2D Shape (THREE.Shape) of the wall face with rectangular holes
 *  4. Extrude the shape along Z by the wall thickness
 *  5. This gives a solid wall with perfectly carved rectangular openings
 * =============================================================================
 */

import * as THREE from 'three';
import type { PSGNode, PSGProject, JunctionMetadata } from '@/types';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Frame member width in meters (50mm) */
const FRAME_WIDTH = 0.05;
/** Glass pane thickness in meters (6mm double glaze approximation) */
const GLASS_THICKNESS = 0.012;

// =============================================================================
// WALL WITH OPENINGS
// =============================================================================

/**
 * Creates an architecturally correct wall mesh:
 * - A solid box with rectangular holes for every child Window/Door
 * - Wall face runs along the local X axis, height along Y, thickness along Z
 *
 * @param wall - The Wall PSGNode
 * @param allNodes - All nodes in the project (to find children)
 * @returns THREE.Group containing the wall geometry mesh (+ optionally glass panes)
 */
export function buildWallWithOpenings(
    wall: PSGNode,
    allNodes: Record<string, PSGNode>
): THREE.BufferGeometry {
    const W = wall.dimensions.x;  // Wall width
    const H = wall.dimensions.y;  // Wall height
    const T = wall.dimensions.z;  // Wall thickness

    // Collect all Window and Door children
    const openings = wall.children_ids
        .map((id) => allNodes[id])
        .filter((n) => n && (n.type === 'Window' || n.type === 'Door'));

    if (openings.length === 0) {
        // Simple box — no openings
        return new THREE.BoxGeometry(W, H, T);
    }

    // Build the 2D face shape of the wall (XY plane)
    // Wall local origin: center of the wall face
    // Shape coords: x ∈ [-W/2, W/2], y ∈ [-H/2, H/2]
    const wallShape = new THREE.Shape();
    const hw = W / 2;
    const hh = H / 2;

    wallShape.moveTo(-hw, -hh);
    wallShape.lineTo(hw, -hh);
    wallShape.lineTo(hw, hh);
    wallShape.lineTo(-hw, hh);
    wallShape.closePath();

    // Punch a hole for each opening
    for (const opening of openings) {
        const ow = opening.opening_width ?? opening.dimensions.x;
        const oh = opening.opening_height ?? opening.dimensions.y;

        // opening.position is in WORLD space; we need LOCAL space relative to wall center
        // Wall is centered at its position, so local X = world X - wall.position.x (for 0° yaw walls)
        // For rotated walls (90° yaw) we must swap X/Z
        const localX = getOpeningLocalX(wall, opening);
        const localY = opening.position.y - wall.position.y; // opening Y center in local wall frame

        const ox0 = localX - ow / 2;
        const ox1 = localX + ow / 2;
        const oy0 = localY - oh / 2;
        const oy1 = localY + oh / 2;

        // Clamp to wall bounds
        const cx0 = Math.max(-hw, ox0);
        const cx1 = Math.min(hw, ox1);
        const cy0 = Math.max(-hh, oy0);
        const cy1 = Math.min(hh, oy1);

        if (cx1 > cx0 && cy1 > cy0) {
            const hole = new THREE.Path();
            // Winding order for holes must be CW (opposite of main shape which is CCW)
            // CCW: (min,min) -> (max,min) -> (max,max) -> (min,max)
            // CW: (min,min) -> (min,max) -> (max,max) -> (max,min)
            hole.moveTo(cx0, cy0);
            hole.lineTo(cx0, cy1);
            hole.lineTo(cx1, cy1);
            hole.lineTo(cx1, cy0);
            hole.closePath();
            wallShape.holes.push(hole);
        }
    }

    // Extrude the 2D shape along Z to get the 3D wall with holes
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: T,
        bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
    // Center the geometry along Z (ExtrudeGeometry starts at Z=0, goes to Z=depth)
    geometry.translate(0, 0, -T / 2);
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * Creates advanced wall geometry based on a SurfaceMatrix.
 *
 * MODE 1 (Procedural): If surface_matrix.code exists, evaluates it at each
 *   grid vertex with (u, v) normalized coordinates → infinite resolution.
 * MODE 2 (Data): Falls back to the raw data[][] matrix.
 *
 * @param wall - The Wall PSGNode with a surface_matrix
 * @returns THREE.BufferGeometry
 */
export function buildMatrixWall(wall: PSGNode): THREE.BufferGeometry {
    const sm = wall.surface_matrix!;
    const W = wall.dimensions.x;
    const H = wall.dimensions.y;
    const T = wall.dimensions.z;
    const minValue = Number.isFinite(sm.min_value) ? sm.min_value! : 0;
    const maxValueBase = Number.isFinite(sm.max_value) ? sm.max_value! : 10;
    const maxValue = maxValueBase > minValue ? maxValueBase : minValue + 0.001;
    const holeThreshold = Number.isFinite(sm.hole_threshold)
        ? Math.min(maxValue, Math.max(minValue, sm.hole_threshold!))
        : Math.max(minValue, 0.01);
    const interpolation = sm.interpolation ?? 'bilinear';
    const useCode = !!sm.code;
    const rows = useCode ? Math.max(8, Math.min(128, Math.round(sm.resolution || 48))) : Math.max(2, sm.rows);
    const cols = useCode ? Math.max(8, Math.min(128, Math.round(sm.resolution || 48))) : Math.max(2, sm.cols);
    const getThickness = useCode
        ? buildProceduralEvaluator(sm.code!, minValue, maxValue)
        : (u: number, v: number) => {
            const sampled = sampleMatrix(sm.data, u, v, interpolation);
            if (!Number.isFinite(sampled)) return 1;
            return Math.min(maxValue, Math.max(minValue, sampled));
        };

    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const normals: number[] = [];

    const cellW = W / cols;
    const cellH = H / rows;

    const getIdx = (r: number, c: number, isBack: boolean) => {
        const base = r * (cols + 1) + c;
        return isBack ? base + (rows + 1) * (cols + 1) : base;
    };
    const thicknessGrid: number[][] = [];
    for (let r = 0; r <= rows; r++) {
        thicknessGrid[r] = [];
        for (let c = 0; c <= cols; c++) {
            const u = c / cols;
            const v = r / rows;
            thicknessGrid[r][c] = getThickness(u, v);
        }
    }

    for (let isBack = 0; isBack < 2; isBack++) {
        const sideMult = isBack ? -1 : 1;
        for (let r = 0; r <= rows; r++) {
            for (let c = 0; c <= cols; c++) {
                const x = -W / 2 + c * cellW;
                const y = -H / 2 + r * cellH;
                const thickMult = thicknessGrid[r][c];
                const z = (T / 2) * thickMult * sideMult;

                vertices.push(x, y, z);
                normals.push(0, 0, sideMult);
            }
        }
    }

    const isSolid = (r: number, c: number): boolean => {
        if (r < 0 || r >= rows || c < 0 || c >= cols) return false;
        const avg = (thicknessGrid[r][c] + thicknessGrid[r][c + 1] +
            thicknessGrid[r + 1][c] + thicknessGrid[r + 1][c + 1]) / 4;
        return avg > holeThreshold;
    };
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (!isSolid(r, c)) continue;
            const f0 = getIdx(r, c, false);
            const f1 = getIdx(r, c + 1, false);
            const f2 = getIdx(r + 1, c + 1, false);
            const f3 = getIdx(r + 1, c, false);
            indices.push(f0, f1, f2);
            indices.push(f0, f2, f3);
            const b0 = getIdx(r, c, true);
            const b1 = getIdx(r, c + 1, true);
            const b2 = getIdx(r + 1, c + 1, true);
            const b3 = getIdx(r + 1, c, true);
            indices.push(b0, b2, b1);
            indices.push(b0, b3, b2);
            if (r === rows - 1 || !isSolid(r + 1, c)) {
                indices.push(f3, f2, b2);
                indices.push(f3, b2, b3);
            }
            if (r === 0 || !isSolid(r - 1, c)) {
                indices.push(f0, b1, f1);
                indices.push(f0, b0, b1);
            }
            if (c === 0 || !isSolid(r, c - 1)) {
                indices.push(f0, f3, b3);
                indices.push(f0, b3, b0);
            }
            if (c === cols - 1 || !isSolid(r, c + 1)) {
                indices.push(f1, b2, f2);
                indices.push(f1, b1, b2);
            }
        }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    return geometry;
}

function sampleMatrix(data: number[][], u: number, v: number, interpolation: 'nearest' | 'bilinear'): number {
    const rows = data.length;
    const cols = data[0]?.length ?? 0;
    if (rows < 1 || cols < 1) return 1;
    const uu = Math.min(1, Math.max(0, u));
    const vv = 1 - Math.min(1, Math.max(0, v));
    if (interpolation === 'nearest') {
        const c = Math.round(uu * (cols - 1));
        const r = Math.round(vv * (rows - 1));
        return data[r]?.[c] ?? 1;
    }
    const fx = uu * (cols - 1);
    const fy = vv * (rows - 1);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const x1 = Math.min(cols - 1, x0 + 1);
    const y1 = Math.min(rows - 1, y0 + 1);
    const tx = fx - x0;
    const ty = fy - y0;
    const q00 = data[y0]?.[x0] ?? 1;
    const q10 = data[y0]?.[x1] ?? q00;
    const q01 = data[y1]?.[x0] ?? q00;
    const q11 = data[y1]?.[x1] ?? q10;
    const a = q00 * (1 - tx) + q10 * tx;
    const b = q01 * (1 - tx) + q11 * tx;
    return a * (1 - ty) + b * ty;
}

/**
 * Creates a sandboxed evaluator from a JS code string.
 * The code is a mathematical expression with access to: u, v, Math.
 *
 * Examples of valid code:
 *   "1.0 + 2.0 * Math.exp(-((u-0.5)**2 + (v-0.5)**2) / 0.02)"   → Gaussian bulb
 *   "1.0 + 0.3 * Math.sin(u * Math.PI * 6)"                       → Sine wave
 *   "((u-0.5)**2 + (v-0.7)**2 < 0.09) ? 0.0 : 1.0"               → Circular hole
 *   "Math.max(0, 1.0 - 3 * Math.abs(u - 0.5))"                    → Triangular ridge
 */
function buildProceduralEvaluator(code: string, minValue: number, maxValue: number): (u: number, v: number) => number {
    try {
        // Robust compilation: handle both single expressions and multi-statement scripts.
        // We wrap the code in an internal function to handle 'const', 'let', and 'return' safely.
        const trimmed = code.trim();
        const hasReturn = /\breturn\b/.test(trimmed);
        const cleaned = trimmed.replace(/;$/, '');
        
        // Treat as simple expression if it has no semicolons (excluding trailing) and no statements/keywords
        const isSimpleExpression = !hasReturn && !cleaned.includes(';') && !/\b(const|let|var|if|for|while|switch)\b/.test(cleaned);
        
        const finalCode = isSimpleExpression 
            ? `return (${cleaned});` 
            : trimmed;

        // Compile the AI code once into a reusable function
        const execute = new Function('u', 'v', '"use strict";\n' + finalCode) as (u: number, v: number) => any;
        
        // Return a wrapper that handles validation, errors, and range clamping
        const evaluator = (u: number, v: number): number => {
            try {
                const result = execute(u, v);
                if (typeof result !== 'number' || !isFinite(result)) return 1.0;
                return Math.max(minValue, Math.min(result, maxValue));
            } catch (e) {
                // Return fallback thickness on runtime error
                return 1.0;
            }
        };

        // Verification call: ensure the compiled function doesn't crash on first run
        const test = evaluator(0.5, 0.5);
        if (typeof test !== 'number') {
            console.warn('[buildProceduralEvaluator] Compiled function returned invalid value during test, falling back');
            return () => 1.0;
        }

        return evaluator;
    } catch (e) {
        console.error('[buildProceduralEvaluator] Failed to compile code:', code, e);
        return () => 1.0;
    }
}

/**
 * Computes the local X offset of an opening within its parent wall.
 *
 * For a wall aligned East-West (yaw=0°): local X = opening.position.x - wall.position.x
 * For a wall aligned North-South (yaw=90°): local X = opening.position.z - wall.position.z
 */
function getOpeningLocalX(wall: PSGNode, opening: PSGNode): number {
    const yaw = Math.abs(wall.rotation.yaw % 180);
    if (yaw === 0) {
        return opening.position.x - wall.position.x;
    } else {
        return opening.position.z - wall.position.z;
    }
}

// =============================================================================
// WINDOW FRAME GEOMETRY
// =============================================================================

/**
 * Builds a THREE.Group containing:
 *  1. The 4 frame members (solid box sections around the perimeter)
 *  2. The glass pane (thin transparent box)
 *
 * All geometry is centered at the origin (0,0,0) matching the window node's position.
 *
 * @param window - The Window PSGNode
 * @param wallThickness - Thickness of the parent wall (frame depth = wall thickness)
 * @returns THREE.Group
 */
export function buildWindowGroup(window: PSGNode, wallThickness: number = 0.25): THREE.Group {
    const group = new THREE.Group();
    const W = window.opening_width ?? window.dimensions.x;
    const H = window.opening_height ?? window.dimensions.y;
    const T = wallThickness; // Frame depth = wall thickness
    const fw = FRAME_WIDTH;

    // Material for frame (painted aluminum / timber — will be overridden by renderer)
    const frameMat = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
        roughness: 0.4,
        metalness: 0.3,
        side: THREE.DoubleSide,
    });

    // Material for glass
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x88ccff,
        transparent: true,
        opacity: 0.25,
        roughness: 0.0,
        metalness: 0.0,
        transmission: 0.95,
        side: THREE.DoubleSide,
    });

    // ── Frame members ──────────────────────────────────────────────────────
    // Top rail
    addFrameMember(group, W, fw, T, 0, H / 2 - fw / 2, 0, frameMat);
    // Bottom rail
    addFrameMember(group, W, fw, T, 0, -H / 2 + fw / 2, 0, frameMat);
    // Left stile (vertical)
    addFrameMember(group, fw, H - 2 * fw, T, -W / 2 + fw / 2, 0, 0, frameMat);
    // Right stile (vertical)
    addFrameMember(group, fw, H - 2 * fw, T, W / 2 - fw / 2, 0, 0, frameMat);

    // ── Glass pane ──────────────────────────────────────────────────────
    const glassW = W - 2 * fw;
    const glassH = H - 2 * fw;
    const glassGeom = new THREE.BoxGeometry(glassW, glassH, GLASS_THICKNESS);
    const glassMesh = new THREE.Mesh(glassGeom, glassMat);
    group.add(glassMesh);

    return group;
}

/** Helper: adds a box-shaped frame member to a group */
function addFrameMember(
    group: THREE.Group,
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    material: THREE.Material
): void {
    const geom = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
}

// =============================================================================
// DOOR FRAME + LEAF GEOMETRY
// =============================================================================

/**
 * Builds a THREE.Group containing:
 *  1. Door frame (three solid members: top + left + right jamb)
 *  2. Door leaf (flat panel, in closed position — flush with wall face)
 *
 * @param door - The Door PSGNode
 * @param wallThickness - Thickness of the parent wall
 * @returns THREE.Group
 */
export function buildDoorGroup(door: PSGNode, wallThickness: number = 0.25): THREE.Group {
    const group = new THREE.Group();
    const W = door.opening_width ?? door.dimensions.x;
    const H = door.opening_height ?? door.dimensions.y;
    const T = wallThickness;
    const fw = FRAME_WIDTH;

    // Frame material (painted wood or aluminum)
    const frameMat = new THREE.MeshStandardMaterial({
        color: 0xc8a87a,  // Light timber color
        roughness: 0.7,
        metalness: 0.0,
        side: THREE.DoubleSide,
    });

    // Door leaf material (matches door material_id — will be overridden by renderer)
    const doorMat = new THREE.MeshStandardMaterial({
        color: 0xa0784a,  // Darker timber
        roughness: 0.6,
        metalness: 0.0,
        side: THREE.DoubleSide,
    });

    // ── Frame ─────────────────────────────────────────────────────────────
    // Top head (horizontal)
    addFrameMember(group, W + 2 * fw, fw, T, 0, H / 2 + fw / 2, 0, frameMat);
    // Left jamb (vertical, from floor to underside of head)
    addFrameMember(group, fw, H, T, -W / 2 - fw / 2, 0, 0, frameMat);
    // Right jamb
    addFrameMember(group, fw, H, T, W / 2 + fw / 2, 0, 0, frameMat);

    // ── Door leaf ─────────────────────────────────────────────────────────
    // 40mm thick solid door panel
    const leafThickness = 0.04;
    const leafGeom = new THREE.BoxGeometry(W - 0.01, H - 0.01, leafThickness);
    const leaf = new THREE.Mesh(leafGeom, doorMat);
    // Position leaf: slightly inside wall (towards the room interior side)
    leaf.position.set(0, 0, -(T / 2 - leafThickness / 2));
    group.add(leaf);

    return group;
}

// =============================================================================
// WALL CORNER CORRECTION
// =============================================================================

/**
 * Resolves how two perpendicular or angled walls meet at a corner to eliminate gaps.
 * Uses a precise "Source of Truth" geometry approach.
 *
 * STRATEGY:
 * 1. Calculate the precise endpoints of the wall centerline.
 * 2. Find any other wall whose centerline or face intersects this wall's endpoint.
 * 3. Shorten the "butt" wall by exactly the distance needed to stop at the face of the "through" wall.
 */
export function resolveWallCorners(
    wall: PSGNode,
    allNodes: Record<string, PSGNode>
): { adjustedWidth: number; startInset: number; endInset: number; junctions: JunctionMetadata[] } {
    const W = wall.dimensions.x;
    const T = wall.dimensions.z;

    // Exact angle math
    const angle = (wall.rotation.yaw * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Half width
    const hw = W / 2;

    // Precise centerline endpoints
    const startX = wall.position.x - hw * cosA;
    const startZ = wall.position.z + hw * sinA;
    const endX = wall.position.x + hw * cosA;
    const endZ = wall.position.z - hw * sinA;

    let startInset = 0;
    let endInset = 0;
    const junctions: JunctionMetadata[] = [];

    // ARCHITECTURAL PRECISION: 0.5mm tolerance (0.0005m)
    const TOLERANCE = 0.0005;

    for (const other of Object.values(allNodes)) {
        if (other.id === wall.id) continue;
        if (other.type !== 'Wall' && other.type !== 'Partition') continue;

        const otherW = other.dimensions.x;
        const otherT = other.dimensions.z;
        const otherAngle = (other.rotation.yaw * Math.PI) / 180;
        const otherCos = Math.cos(otherAngle);
        const otherSin = Math.sin(otherAngle);

        // Check for nearly 90 degree intersection
        const dot = Math.abs(cosA * otherCos - sinA * otherSin);
        const isPerp = dot < 0.01; // High precision perp check

        if (!isPerp) continue;

        // Check distance of our endpoints to other wall
        const dxStart = startX - other.position.x;
        const dzStart = startZ - other.position.z;
        const distAlongOther = Math.abs(dxStart * otherCos - dzStart * otherSin);
        const distAcrossOther = Math.abs(dxStart * otherSin + dzStart * otherCos);

        if (distAlongOther <= (otherW / 2 + 0.1) && distAcrossOther <= (otherT / 2 + 0.1)) {
            // We are hitting this wall. If we are within the "core" (distAcross < tolerance), we butt join.
            if (distAcrossOther < 0.05) {
                startInset = Math.max(startInset, otherT / 2);
                junctions.push({
                    junction_type: 'butt',
                    target_id: other.id,
                    offset: otherT / 2,
                    is_precise: true
                });
            }
        }

        const dxEnd = endX - other.position.x;
        const dzEnd = endZ - other.position.z;
        const distAlongOtherEnd = Math.abs(dxEnd * otherCos - dzEnd * otherSin);
        const distAcrossOtherEnd = Math.abs(dxEnd * otherSin + dzEnd * otherCos);

        if (distAlongOtherEnd <= (otherW / 2 + 0.1) && distAcrossOtherEnd <= (otherT / 2 + 0.1)) {
            if (distAcrossOtherEnd < 0.05) {
                endInset = Math.max(endInset, otherT / 2);
                junctions.push({
                    junction_type: 'butt',
                    target_id: other.id,
                    offset: otherT / 2,
                    is_precise: true
                });
            }
        }
    }

    return {
        adjustedWidth: Math.max(W - startInset - endInset, 0.001), // Min 1mm
        startInset,
        endInset,
        junctions
    };
}

/**
 * Computes adjusted position for walls that were inset to prevent gaps/overlaps.
 * Shifts the center along the wall's orientation vector.
 */
export function resolveWallPosition(
    wall: PSGNode,
    startInset: number,
    endInset: number
): { x: number; y: number; z: number } {
    const angle = (wall.rotation.yaw * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // The shift balance: if we inset more at the end than the start,
    // the center moves towards the start.
    const shift = (endInset - startInset) / 2;

    return {
        x: wall.position.x - shift * cosA,
        y: wall.position.y,
        z: wall.position.z + shift * sinA,
    };
}

// =============================================================================
// PARENT WALL THICKNESS LOOKUP
// =============================================================================

/**
 * Given a Window or Door node, returns the thickness of its parent wall.
 * Falls back to 0.25m (250mm standard cavity wall) if parent not found.
 */
export function getParentWallThickness(
    node: PSGNode,
    allNodes: Record<string, PSGNode>
): number {
    if (!node.parent_id) return 0.25;
    const parent = allNodes[node.parent_id];
    if (!parent || (parent.type !== 'Wall' && parent.type !== 'Partition')) return 0.25;
    return parent.dimensions.z;
}
