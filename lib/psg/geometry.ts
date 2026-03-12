/**
 * =============================================================================
 * LIB/PSG/GEOMETRY.TS — Precision Architectural Geometry Engine
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

/**
 * 🔍 BUG FIX #3: Robust Transparency Check
 * Determines if a material ID indicates a transparent glass-like material.
 */
function isTransparentMaterial(materialId?: string): boolean {
    if (!materialId) return false;
    const lower = materialId.toLowerCase();
    return lower.includes('glass') || lower.includes('transp') || lower.includes('clear') || lower.includes('crystal');
}

// =============================================================================
// WALL WITH OPENINGS
// =============================================================================

/**
 * Creates an architecturally correct wall mesh:
 * - A solid box with rectangular holes for every child Window/Door
 */
export function buildWallWithOpenings(
    wall: PSGNode,
    allNodes: Record<string, PSGNode>
): THREE.BufferGeometry {
    const W = wall.dimensions.x;
    const H = wall.dimensions.y;
    const T = wall.dimensions.z;

    const openings = wall.children_ids
        .map((id) => allNodes[id])
        .filter((n) => n && (n.type === 'Window' || n.type === 'Door'));

    if (openings.length === 0) {
        return new THREE.BoxGeometry(W, H, T);
    }

    const wallShape = new THREE.Shape();
    const hw = W / 2;
    const hh = H / 2;

    wallShape.moveTo(-hw, -hh);
    wallShape.lineTo(hw, -hh);
    wallShape.lineTo(hw, hh);
    wallShape.lineTo(-hw, hh);
    wallShape.closePath();

    for (const opening of openings) {
        const ow = opening.opening_width ?? opening.dimensions.x;
        const oh = opening.opening_height ?? opening.dimensions.y;

        const localX = getOpeningLocalX(wall, opening);
        const localY = opening.position.y - wall.position.y;

        const ox0 = localX - ow / 2;
        const ox1 = localX + ow / 2;
        const oy0 = localY - oh / 2;
        const oy1 = localY + oh / 2;

        const cx0 = Math.max(-hw, ox0);
        const cx1 = Math.min(hw, ox1);
        const cy0 = Math.max(-hh, oy0);
        const cy1 = Math.min(hh, oy1);

        if (cx1 > cx0 && cy1 > cy0) {
            const hole = new THREE.Path();
            hole.moveTo(cx0, cy0);
            hole.lineTo(cx0, cy1);
            hole.lineTo(cx1, cy1);
            hole.lineTo(cx1, cy0);
            hole.closePath();
            wallShape.holes.push(hole);
        }
    }

    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: T,
        bevelEnabled: false,
    };

    const geometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);
    geometry.translate(0, 0, -T / 2);
    geometry.computeVertexNormals();

    return geometry;
}

/**
 * Creates advanced wall geometry based on a SurfaceMatrix.
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

function buildProceduralEvaluator(code: string, minValue: number, maxValue: number): (u: number, v: number) => number {
    try {
        const fn = new Function('u', 'v', `
            "use strict";
            try {
                const result = ${code};
                if (typeof result !== 'number' || !isFinite(result)) return 1.0;
                return Math.max(${minValue}, Math.min(result, ${maxValue}));
            } catch(e) {
                return 1.0;
            }
        `) as (u: number, v: number) => number;
        const test = fn(0.5, 0.5);
        if (typeof test !== 'number') {
            return () => 1.0;
        }
        return fn;
    } catch (e) {
        return () => 1.0;
    }
}

/**
 * Computes the local X offset of an opening within its parent wall.
 * 🧱 UPDATED: Uses vector projection for arbitrary wall angles (0°, 45°, etc.)
 */
function getOpeningLocalX(wall: PSGNode, opening: PSGNode): number {
    const yawRad = (wall.rotation.yaw * Math.PI) / 180;
    const wallDirX = Math.cos(yawRad);
    const wallDirZ = -Math.sin(yawRad);
    const dx = opening.position.x - wall.position.x;
    const dz = opening.position.z - wall.position.z;
    return dx * wallDirX + dz * wallDirZ;
}

export function buildWindowGroup(window: PSGNode, wallThickness: number = 0.25): THREE.Group {
    const group = new THREE.Group();
    const W = window.opening_width ?? window.dimensions.x;
    const H = window.opening_height ?? window.dimensions.y;
    const T = wallThickness;
    const fw = FRAME_WIDTH;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
    
    // 🧱 FIX: Use robust check for glass transparency
    const isTransp = isTransparentMaterial(window.material_id);
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x88ccff,
        transparent: isTransp,
        opacity: isTransp ? 0.35 : 1.0, 
        roughness: 0.0,
        metalness: 0.1,
        transmission: isTransp ? 0.9 : 0.0,
        side: THREE.DoubleSide
    });

    addFrameMember(group, W, fw, T, 0, H / 2 - fw / 2, 0, frameMat);
    addFrameMember(group, W, fw, T, 0, -H / 2 + fw / 2, 0, frameMat);
    addFrameMember(group, fw, H - 2 * fw, T, -W / 2 + fw / 2, 0, 0, frameMat);
    addFrameMember(group, fw, H - 2 * fw, T, W / 2 - fw / 2, 0, 0, frameMat);

    const glassW = W - 2 * fw;
    const glassH = H - 2 * fw;
    const glassGeom = new THREE.BoxGeometry(glassW, glassH, GLASS_THICKNESS);
    const glassMesh = new THREE.Mesh(glassGeom, glassMat);
    group.add(glassMesh);
    return group;
}

function addFrameMember(group: THREE.Group, w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material): void {
    const geom = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geom, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
}

export function buildDoorGroup(door: PSGNode, wallThickness: number = 0.25): THREE.Group {
    const group = new THREE.Group();
    const W = door.opening_width ?? door.dimensions.x;
    const H = door.opening_height ?? door.dimensions.y;
    const T = wallThickness;
    const fw = FRAME_WIDTH;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0xc8a87a, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xa0784a, roughness: 0.6, metalness: 0.0, side: THREE.DoubleSide });

    addFrameMember(group, W + 2 * fw, fw, T, 0, H / 2 + fw / 2, 0, frameMat);
    addFrameMember(group, fw, H, T, -W / 2 - fw / 2, 0, 0, frameMat);
    addFrameMember(group, fw, H, T, W / 2 + fw / 2, 0, 0, frameMat);

    const leafThickness = 0.04;
    const leafGeom = new THREE.BoxGeometry(W - 0.01, H - 0.01, leafThickness);
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    leaf.position.set(0, 0, -(T / 2 - leafThickness / 2));
    group.add(leaf);
    return group;
}

export function resolveWallCorners(wall: PSGNode, allNodes: Record<string, PSGNode>): { adjustedWidth: number; startInset: number; endInset: number; junctions: JunctionMetadata[] } {
    const W = wall.dimensions.x;
    const T = wall.dimensions.z;
    const angle = (wall.rotation.yaw * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const hw = W / 2;
    const startX = wall.position.x - hw * cosA;
    const startZ = wall.position.z + hw * sinA;
    const endX = wall.position.x + hw * cosA;
    const endZ = wall.position.z - hw * sinA;

    let startInset = 0;
    let endInset = 0;
    const junctions: JunctionMetadata[] = [];

    for (const other of Object.values(allNodes)) {
        if (other.id === wall.id) continue;
        if (other.type !== 'Wall' && other.type !== 'Partition') continue;
        const otherW = other.dimensions.x;
        const otherT = other.dimensions.z;
        const otherAngle = (other.rotation.yaw * Math.PI) / 180;
        const otherCos = Math.cos(otherAngle);
        const otherSin = Math.sin(otherAngle);
        const dot = Math.abs(cosA * otherCos - sinA * otherSin);
        if (dot < 0.01) {
            const dxStart = startX - other.position.x;
            const dzStart = startZ - other.position.z;
            const distAlongOther = Math.abs(dxStart * otherCos - dzStart * otherSin);
            const distAcrossOther = Math.abs(dxStart * otherSin + dzStart * otherCos);
            if (distAlongOther <= (otherW / 2 + 0.1) && distAcrossOther <= (otherT / 2 + 0.1)) {
                if (distAcrossOther < 0.05) startInset = Math.max(startInset, otherT / 2);
            }
            const dxEnd = endX - other.position.x;
            const dzEnd = endZ - other.position.z;
            const distAlongOtherEnd = Math.abs(dxEnd * otherCos - dzEnd * otherSin);
            const distAcrossOtherEnd = Math.abs(dxEnd * otherSin + dzEnd * otherCos);
            if (distAlongOtherEnd <= (otherW / 2 + 0.1) && distAcrossOtherEnd <= (otherT / 2 + 0.1)) {
                if (distAcrossOtherEnd < 0.05) endInset = Math.max(endInset, otherT / 2);
            }
        }
    }
    return { adjustedWidth: Math.max(W - startInset - endInset, 0.001), startInset, endInset, junctions };
}

export function resolveWallPosition(wall: PSGNode, startInset: number, endInset: number): { x: number; y: number; z: number } {
    const angle = (wall.rotation.yaw * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const shift = (endInset - startInset) / 2;
    return { x: wall.position.x - shift * cosA, y: wall.position.y, z: wall.position.z + shift * sinA };
}

export function getParentWallThickness(node: PSGNode, allNodes: Record<string, PSGNode>): number {
    if (!node.parent_id) return 0.25;
    const parent = allNodes[node.parent_id];
    if (!parent || (parent.type !== 'Wall' && parent.type !== 'Partition')) return 0.25;
    return parent.dimensions.z;
}

