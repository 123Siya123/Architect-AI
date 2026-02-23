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
import type { PSGNode, PSGProject } from '@/types';

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
            hole.moveTo(cx0, cy0);
            hole.lineTo(cx1, cy0);
            hole.lineTo(cx1, cy1);
            hole.lineTo(cx0, cy1);
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
 * Resolves how two perpendicular walls meet at a corner.
 *
 * When a horizontal wall (yaw=0) and a vertical wall (yaw=90) meet at a corner,
 * the simpler wall (usually the shorter one, or the one facing the same direction)
 * is shortened to avoid overlap.
 *
 * This function returns the ADJUSTED width of the wall, accounting for corners.
 * The renderer calls this before building wall geometry.
 *
 * CORNER TYPES:
 *  - T-junction: one wall ends mid-span of another
 *  - L-corner: two walls meet at their ends
 *  - Cross: four walls meet at a point
 *
 * STRATEGY (simple, reliable):
 *  - For each end of the wall, check if another wall's face is at that exact endpoint
 *  - If so, inset the end by T/2 (half the bisecting wall's thickness)
 *
 * @param wall - The wall to adjust
 * @param allNodes - All nodes in the project
 * @returns { adjustedWidth, startInset, endInset } — how much to inset each end
 */
export function resolveWallCorners(
    wall: PSGNode,
    allNodes: Record<string, PSGNode>
): { adjustedWidth: number; startInset: number; endInset: number } {
    const W = wall.dimensions.x;
    const T = wall.dimensions.z;
    const yaw = Math.round(wall.rotation.yaw) % 180;

    // Axis the wall runs along
    const isNS = (yaw === 90 || yaw === -90);  // North-South (along Z)
    const isEW = (yaw === 0);                   // East-West (along X)

    if (!isEW && !isNS) {
        // Non-orthogonal wall — no auto-corner resolution
        return { adjustedWidth: W, startInset: 0, endInset: 0 };
    }

    // The wall's two endpoints in world space
    const hw = W / 2;
    const startPt = isEW
        ? { x: wall.position.x - hw, z: wall.position.z }
        : { x: wall.position.x, z: wall.position.z - hw };
    const endPt = isEW
        ? { x: wall.position.x + hw, z: wall.position.z }
        : { x: wall.position.x, z: wall.position.z + hw };

    let startInset = 0;
    let endInset = 0;

    const SNAP = 0.05; // 5cm snap tolerance

    for (const other of Object.values(allNodes)) {
        if (other.id === wall.id) continue;
        if (other.type !== 'Wall' && other.type !== 'Partition') continue;

        const otherYaw = Math.round(other.rotation.yaw) % 180;
        const otherIsNS = (otherYaw === 90 || otherYaw === -90);
        const otherIsEW = (otherYaw === 0);

        // Only resolve perpendicular walls
        if (isEW && !otherIsNS) continue;
        if (isNS && !otherIsEW) continue;

        const otherHW = other.dimensions.x / 2;
        const otherT = other.dimensions.z / 2; // half of other wall thickness

        // Check if the other wall's face is at our start endpoint
        if (isEW) {
            // Our wall runs East-West; other runs North-South
            // Other wall face is at some X position
            const otherX = other.position.x;
            const otherZMin = other.position.z - otherHW - 0.01;
            const otherZMax = other.position.z + otherHW + 0.01;
            const wallZ = wall.position.z;

            if (Math.abs(startPt.x - otherX) < SNAP && wallZ >= otherZMin && wallZ <= otherZMax) {
                startInset = Math.max(startInset, otherT);
            }
            if (Math.abs(endPt.x - otherX) < SNAP && wallZ >= otherZMin && wallZ <= otherZMax) {
                endInset = Math.max(endInset, otherT);
            }
        } else {
            // Our wall runs North-South; other runs East-West
            const otherZ = other.position.z;
            const otherXMin = other.position.x - otherHW - 0.01;
            const otherXMax = other.position.x + otherHW + 0.01;
            const wallX = wall.position.x;

            if (Math.abs(startPt.z - otherZ) < SNAP && wallX >= otherXMin && wallX <= otherXMax) {
                startInset = Math.max(startInset, otherT);
            }
            if (Math.abs(endPt.z - otherZ) < SNAP && wallX >= otherXMin && wallX <= otherXMax) {
                endInset = Math.max(endInset, otherT);
            }
        }
    }

    const adjustedWidth = W - startInset - endInset;
    return { adjustedWidth: Math.max(adjustedWidth, 0.1), startInset, endInset };
}

/**
 * Computes the adjusted POSITION of a wall after corner insets are applied.
 * When the wall is inset at the start by S and at end by E, the center shifts.
 */
export function resolveWallPosition(
    wall: PSGNode,
    startInset: number,
    endInset: number
): { x: number; y: number; z: number } {
    const yaw = Math.round(wall.rotation.yaw) % 180;
    const isNS = (yaw === 90 || yaw === -90);
    const shift = (endInset - startInset) / 2;

    return {
        x: wall.position.x + (isNS ? 0 : shift),
        y: wall.position.y,
        z: wall.position.z + (isNS ? shift : 0),
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
