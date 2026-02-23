/**
 * =============================================================================
 * LIB/AI/ARCHITECTURAL-RULES.TS — Architectural Domain Knowledge Engine
 * =============================================================================
 *
 * THIS IS THE KEY TO ACCURACY.
 *
 * Instead of relying on the LLM to "know" that a wall facing east needs
 * yaw=90°, or that a second floor starts at Y=2.7m, we encode this
 * knowledge as deterministic rules. The LLM only needs to express
 * INTENT ("add a second floor"), and this engine translates intent into
 * geometrically correct operations.
 *
 * WHY THIS WORKS:
 * - LLMs are great at understanding intent and making decisions
 * - LLMs are BAD at precise geometry, coordinate math, and spatial reasoning
 * - By separating "what to do" from "how to do it geometrically," we get
 *   the best of both worlds
 *
 * ANALOGY:
 * Think of this like an architect's CAD software. The architect says
 * "I want a wall here" and the software handles snapping, alignment,
 * dimensions, and constraints. The architect doesn't manually type
 * coordinates.
 * =============================================================================
 */

import type { PSGNode, PSGProject, Vec3 } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/** Describes an issue found during architectural validation */
export interface ArchitecturalIssue {
    severity: 'error' | 'warning' | 'info';
    category: 'orientation' | 'position' | 'missing_element' | 'overlap' | 'dimension' | 'hierarchy';
    message: string;
    affected_node_id?: string;
    suggested_fix?: SuggestedFix;
}

/** A concrete fix that can be auto-applied */
export interface SuggestedFix {
    operation_type: string;
    target_id: string;
    params: Record<string, unknown>;
    description: string;
}

/** Result of analyzing the house footprint */
export interface FootprintAnalysis {
    min_x: number;
    max_x: number;
    min_z: number;
    max_z: number;
    width: number;    // X extent
    depth: number;    // Z extent
    center_x: number;
    center_z: number;
    walls: WallInfo[];
}

/** Info about a wall's position and orientation */
export interface WallInfo {
    node_id: string;
    name: string;
    facing: 'north' | 'south' | 'east' | 'west' | 'unknown';
    position: Vec3;
    dimensions: Vec3;
    yaw: number;
}

// =============================================================================
// CONSTANTS — Standard architectural dimensions
// =============================================================================

export const ARCH_CONSTANTS = {
    /** Standard residential ceiling height (meters) */
    STANDARD_CEILING_HEIGHT: 2.7,
    /** Standard wall thickness (meters) */
    STANDARD_WALL_THICKNESS: 0.25,
    /** Standard floor slab thickness (meters) */
    STANDARD_SLAB_THICKNESS: 0.2,
    /** Standard door height (meters) */
    STANDARD_DOOR_HEIGHT: 2.1,
    /** Standard interior door width (meters) */
    STANDARD_DOOR_WIDTH: 0.9,
    /** Standard exterior door width (meters) */
    STANDARD_EXT_DOOR_WIDTH: 1.0,
    /** Standard window sill height from floor (meters) */
    STANDARD_WINDOW_SILL: 0.9,
    /** Tolerance for coordinate comparisons (meters) */
    POSITION_TOLERANCE: 0.1,
} as const;

// =============================================================================
// FOOTPRINT ANALYSIS
// =============================================================================

/**
 * Analyzes the footprint of a floor level.
 * Finds all exterior walls and calculates the bounding box.
 */
export function analyzeFloorFootprint(
    project: PSGProject,
    floorNodeId: string
): FootprintAnalysis {
    const floorNode = project.nodes[floorNodeId];
    if (!floorNode) {
        return {
            min_x: 0, max_x: 10, min_z: 0, max_z: 10,
            width: 10, depth: 10, center_x: 5, center_z: 5, walls: [],
        };
    }

    const walls: WallInfo[] = [];
    const wallNodes = getAllDescendantsOfType(project, floorNodeId, 'Wall');

    for (const wall of wallNodes) {
        const facing = determineWallFacing(wall);
        walls.push({
            node_id: wall.id,
            name: wall.name,
            facing,
            position: wall.position,
            dimensions: wall.dimensions,
            yaw: wall.rotation.yaw,
        });
    }

    // Calculate bounding box from walls
    let min_x = Infinity, max_x = -Infinity;
    let min_z = Infinity, max_z = -Infinity;

    for (const wall of wallNodes) {
        const halfW = wall.dimensions.x / 2;
        const halfD = wall.dimensions.z / 2;

        // Account for wall rotation
        if (Math.abs(wall.rotation.yaw % 180) < ARCH_CONSTANTS.POSITION_TOLERANCE) {
            // Wall aligned with X axis (north/south facing)
            min_x = Math.min(min_x, wall.position.x - halfW);
            max_x = Math.max(max_x, wall.position.x + halfW);
            min_z = Math.min(min_z, wall.position.z - halfD);
            max_z = Math.max(max_z, wall.position.z + halfD);
        } else {
            // Wall rotated 90° — aligned with Z axis (east/west facing)
            min_x = Math.min(min_x, wall.position.x - halfD);
            max_x = Math.max(max_x, wall.position.x + halfD);
            min_z = Math.min(min_z, wall.position.z - halfW);
            max_z = Math.max(max_z, wall.position.z + halfW);
        }
    }

    // Fallback if no walls found — use floor node dimensions
    if (walls.length === 0) {
        min_x = floorNode.position.x - floorNode.dimensions.x / 2;
        max_x = floorNode.position.x + floorNode.dimensions.x / 2;
        min_z = floorNode.position.z - floorNode.dimensions.z / 2;
        max_z = floorNode.position.z + floorNode.dimensions.z / 2;
    }

    return {
        min_x, max_x, min_z, max_z,
        width: max_x - min_x,
        depth: max_z - min_z,
        center_x: (min_x + max_x) / 2,
        center_z: (min_z + max_z) / 2,
        walls,
    };
}

// =============================================================================
// WALL ORIENTATION
// =============================================================================

/**
 * Determines which direction a wall is facing based on its rotation and
 * position relative to the house center.
 *
 * CRITICAL RULE:
 * - yaw = 0°  → wall is along X axis → faces north or south
 * - yaw = 90° → wall is along Z axis → faces east or west
 */
export function determineWallFacing(wall: PSGNode): WallInfo['facing'] {
    const normalizedYaw = ((wall.rotation.yaw % 360) + 360) % 360;

    if (Math.abs(normalizedYaw) < 10 || Math.abs(normalizedYaw - 180) < 10) {
        // Wall runs east-west → faces north or south
        // If z is at the top = north wall, at the bottom = south wall
        return normalizedYaw < 90 ? 'north' : 'south';
    }

    if (Math.abs(normalizedYaw - 90) < 10 || Math.abs(normalizedYaw - 270) < 10) {
        // Wall runs north-south → faces east or west
        return Math.abs(normalizedYaw - 90) < 10 ? 'east' : 'west';
    }

    return 'unknown';
}

/**
 * Returns the correct yaw rotation for a wall, given which axis it aligns with.
 *
 * This is one of the most common AI mistakes:
 * - A wall running along the X-axis (east-west) should have yaw = 0
 * - A wall running along the Z-axis (north-south) should have yaw = 90
 */
export function getCorrectWallYaw(wallAxis: 'x' | 'z'): number {
    return wallAxis === 'x' ? 0 : 90;
}

// =============================================================================
// FLOOR LEVEL CALCULATIONS
// =============================================================================

/**
 * Calculates the walking surface Y position (top of slab) for a floor.
 */
export function calculateFloorTopY(
    floorIndex: number,
    ceilingHeight = ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT,
    slabThickness = ARCH_CONSTANTS.STANDARD_SLAB_THICKNESS
): number {
    // Floor 0: top is 0 (ground level)
    // Floor 1: top is 2.7 + 0.2 = 2.9
    return floorIndex * (ceilingHeight + slabThickness);
}

/**
 * Calculates the required CENTER Y coordinate for a wall to sit ON TOP of a floor.
 * Formula: FloorTopY + (WallHeight / 2)
 */
export function calculateWallCenterY(
    floorIndex: number,
    wallHeight = ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT,
    ceilingHeight = ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT,
    slabThickness = ARCH_CONSTANTS.STANDARD_SLAB_THICKNESS
): number {
    const floorTop = calculateFloorTopY(floorIndex, ceilingHeight, slabThickness);
    return floorTop + (wallHeight / 2);
}

/**
 * Calculates the required CENTER Y coordinate for a floor slab.
 * Formula: FloorTopY - (SlabThickness / 2)
 */
export function calculateSlabCenterY(
    floorIndex: number,
    ceilingHeight = ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT,
    slabThickness = ARCH_CONSTANTS.STANDARD_SLAB_THICKNESS
): number {
    if (floorIndex === 0) return -(slabThickness / 2); // Ground slab sits below 0
    const floorTop = calculateFloorTopY(floorIndex, ceilingHeight, slabThickness);
    return floorTop - (slabThickness / 2);
}

/**
 * Finds the topmost floor level in the house and returns its top Y position.
 */
export function getTopFloorY(project: PSGProject): number {
    let maxFloorY = 0;
    for (const node of Object.values(project.nodes)) {
        if (node.type === 'Floor' || node.type === 'Slab') {
            maxFloorY = Math.max(maxFloorY, node.position.y);
        }
    }
    return maxFloorY;
}

/**
 * Counts how many floor levels exist in the house.
 */
export function countFloors(project: PSGProject): number {
    return Object.values(project.nodes).filter(n => n.type === 'Floor').length;
}

// =============================================================================
// ARCHITECTURAL VALIDATION
// =============================================================================

/**
 * Validates the architectural correctness of the entire house.
 * This runs AFTER operations are proposed but BEFORE they are applied.
 *
 * Returns a list of issues that should be auto-fixed before applying.
 */
export function validateArchitecture(project: PSGProject): ArchitecturalIssue[] {
    const issues: ArchitecturalIssue[] = [];

    issues.push(...checkWallOrientations(project));
    issues.push(...checkFloorCompleteness(project));
    issues.push(...checkRoofPosition(project));
    issues.push(...checkElementHierarchy(project));

    return issues;
}

/**
 * Checks that all walls have correct orientations.
 * A wall's "long" dimension should match its yaw rotation.
 */
function checkWallOrientations(project: PSGProject): ArchitecturalIssue[] {
    const issues: ArchitecturalIssue[] = [];

    for (const node of Object.values(project.nodes)) {
        if (node.type !== 'Wall') continue;

        const { x: width, z: depth } = node.dimensions;
        const yaw = ((node.rotation.yaw % 360) + 360) % 360;

        // A wall's width (x dimension) should be its "long" side
        // If depth > width, the wall might be oriented wrong
        if (depth > width * 2 && Math.abs(yaw) < ARCH_CONSTANTS.POSITION_TOLERANCE) {
            issues.push({
                severity: 'error',
                category: 'orientation',
                message: `Wall "${node.name}" (${node.id}) appears to have incorrect orientation. ` +
                    `Depth (${depth}m) > Width (${width}m) with yaw=${yaw}°. Should yaw be 90°?`,
                affected_node_id: node.id,
                suggested_fix: {
                    operation_type: 'rotate_node',
                    target_id: node.id,
                    params: { yaw: 90 },
                    description: `Rotate "${node.name}" by 90° to correct orientation`,
                },
            });
        }
    }

    return issues;
}

/**
 * Checks that each floor level has the minimum required elements:
 * - A floor slab
 * - At least 3 walls (to form an enclosure)
 */
function checkFloorCompleteness(project: PSGProject): ArchitecturalIssue[] {
    const issues: ArchitecturalIssue[] = [];

    const floors = Object.values(project.nodes).filter(n => n.type === 'Floor');

    for (const floor of floors) {
        const children = floor.children_ids.map(id => project.nodes[id]).filter(Boolean);
        const hasSlabs = children.some(c => c.type === 'Slab');
        const wallCount = children.filter(c => c.type === 'Wall').length;
        // Also count walls in rooms that are children of this floor
        const rooms = children.filter(c => c.type === 'Room');
        let roomWallCount = 0;
        for (const room of rooms) {
            const roomChildren = room.children_ids.map(id => project.nodes[id]).filter(Boolean);
            roomWallCount += roomChildren.filter(c => c.type === 'Wall').length;
            if (roomChildren.some(c => c.type === 'Slab')) {
                // Room has its own slab, that's fine too
            }
        }

        const totalWalls = wallCount + roomWallCount;

        if (!hasSlabs && floor.position.y > 0) {
            issues.push({
                severity: 'error',
                category: 'missing_element',
                message: `Floor "${floor.name}" at Y=${floor.position.y}m has no floor slab. ` +
                    `Upper floors need a slab to walk on.`,
                affected_node_id: floor.id,
            });
        }

        if (totalWalls < 3) {
            issues.push({
                severity: 'warning',
                category: 'missing_element',
                message: `Floor "${floor.name}" only has ${totalWalls} walls. ` +
                    `A minimum of 4 walls is recommended for a proper enclosure.`,
                affected_node_id: floor.id,
            });
        }
    }

    return issues;
}

/**
 * Checks that the roof is positioned above the topmost floor.
 */
function checkRoofPosition(project: PSGProject): ArchitecturalIssue[] {
    const issues: ArchitecturalIssue[] = [];

    const roofs = Object.values(project.nodes).filter(n => n.type === 'Roof');
    const topFloorY = getTopFloorY(project);
    const topWallTop = getHighestWallTop(project);

    for (const roof of roofs) {
        if (roof.position.y < topWallTop - ARCH_CONSTANTS.POSITION_TOLERANCE) {
            issues.push({
                severity: 'error',
                category: 'position',
                message: `Roof "${roof.name}" is at Y=${roof.position.y}m but the highest wall top ` +
                    `is at Y=${topWallTop}m. The roof should be at or above the wall tops.`,
                affected_node_id: roof.id,
                suggested_fix: {
                    operation_type: 'move_node',
                    target_id: roof.id,
                    params: {
                        delta_x: 0,
                        delta_y: topWallTop - roof.position.y,
                        delta_z: 0,
                    },
                    description: `Move roof up to Y=${topWallTop}m`,
                },
            });
        }
    }

    return issues;
}

/**
 * Checks that the parent-child hierarchy makes architectural sense.
 */
function checkElementHierarchy(project: PSGProject): ArchitecturalIssue[] {
    const issues: ArchitecturalIssue[] = [];

    for (const node of Object.values(project.nodes)) {
        // Windows and doors should be children of walls
        if ((node.type === 'Window' || node.type === 'Door') && node.parent_id) {
            const parent = project.nodes[node.parent_id];
            if (parent && parent.type !== 'Wall' && parent.type !== 'Partition') {
                issues.push({
                    severity: 'warning',
                    category: 'hierarchy',
                    message: `${node.type} "${node.name}" is a child of ${parent.type} "${parent.name}". ` +
                        `Windows and doors should typically be children of walls.`,
                    affected_node_id: node.id,
                });
            }
        }
    }

    return issues;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Gets all descendant nodes of a specific type.
 */
export function getAllDescendantsOfType(
    project: PSGProject,
    parentId: string,
    type: string
): PSGNode[] {
    const results: PSGNode[] = [];
    const parent = project.nodes[parentId];
    if (!parent) return results;

    for (const childId of parent.children_ids) {
        const child = project.nodes[childId];
        if (!child) continue;
        if (child.type === type) results.push(child);
        // Recurse into children
        results.push(...getAllDescendantsOfType(project, childId, type));
    }

    return results;
}

/**
 * Finds the highest Y coordinate of any wall's top edge.
 */
function getHighestWallTop(project: PSGProject): number {
    let maxTop = 0;
    for (const node of Object.values(project.nodes)) {
        if (node.type === 'Wall') {
            const top = node.position.y + node.dimensions.y;
            maxTop = Math.max(maxTop, top);
        }
    }
    return maxTop;
}

/**
 * Summarizes the current house structure for inclusion in prompts.
 * Much more informative than raw JSON — tells the AI what rooms exist,
 * how many floors, where walls are, etc.
 */
export function summarizeHouseStructure(project: PSGProject): string {
    const floors = Object.values(project.nodes).filter(n => n.type === 'Floor');
    const rooms = Object.values(project.nodes).filter(n => n.type === 'Room');
    const roofs = Object.values(project.nodes).filter(n => n.type === 'Roof');
    const stairs = Object.values(project.nodes).filter(n => n.type === 'Stairs');

    const lines: string[] = [];
    lines.push(`HOUSE STRUCTURE SUMMARY:`);
    lines.push(`- ${floors.length} floor(s), ${rooms.length} room(s), ${roofs.length} roof(s), ${stairs.length} staircase(s)`);

    for (const floor of floors) {
        const floorRooms = rooms.filter(r => r.parent_id === floor.id ||
            floor.children_ids.some(cid => {
                const child = project.nodes[cid];
                return child && child.children_ids.includes(r.id);
            })
        );
        const floorWalls = getAllDescendantsOfType(project, floor.id, 'Wall');
        lines.push(`  Floor "${floor.name}" at Y=${floor.position.y}m:`);
        lines.push(`    - ${floorRooms.length} rooms, ${floorWalls.length} walls`);
        for (const wall of floorWalls) {
            const facing = determineWallFacing(wall);
            lines.push(`    - Wall "${wall.name}" (${wall.id}): facing=${facing}, pos=[${wall.position.x},${wall.position.y},${wall.position.z}], dim=[${wall.dimensions.x},${wall.dimensions.y},${wall.dimensions.z}], yaw=${wall.rotation.yaw}°`);
        }
    }

    if (roofs.length > 0) {
        for (const roof of roofs) {
            lines.push(`  Roof "${roof.name}" at Y=${roof.position.y}m, style=${roof.roof_style || 'unknown'}`);
        }
    }

    return lines.join('\n');
}

/**
 * Given a ground floor footprint and the desired floor index,
 * generates the operations needed to create a complete new floor.
 * This is deterministic — no LLM needed.
 */
export function generateFloorOperations(
    project: PSGProject,
    groundFloorId: string,
    newFloorIndex: number
): Record<string, unknown>[] {
    const footprint = analyzeFloorFootprint(project, groundFloorId);
    const floorTopY = calculateFloorTopY(newFloorIndex);
    const wallCenterY = calculateWallCenterY(newFloorIndex);
    const slabCenterY = calculateSlabCenterY(newFloorIndex);
    const houseRootId = project.root_node_id;

    const ops: Record<string, unknown>[] = [];

    // 1. Add the floor node (container)
    ops.push({
        tool: 'add_node',
        args: {
            type: 'Floor',
            parent_id: houseRootId,
            name: `Floor ${newFloorIndex}`,
            position_x: footprint.center_x,
            position_y: floorTopY, // Container pos is the logical floor level
            position_z: footprint.center_z,
            width: footprint.width,
            height: ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT,
            depth: footprint.depth,
        },
    });

    // 2. Add a slab for the floor
    ops.push({
        tool: 'add_node',
        args: {
            type: 'Slab',
            parent_id: '__LAST_FLOOR_ID__',
            name: `Floor ${newFloorIndex} Slab`,
            position_x: footprint.center_x,
            position_y: slabCenterY,
            position_z: footprint.center_z,
            width: footprint.width,
            height: ARCH_CONSTANTS.STANDARD_SLAB_THICKNESS,
            depth: footprint.depth,
        },
    });

    // 3. Add walls matching the ground floor exterior walls
    for (const wall of footprint.walls) {
        if (wall.facing === 'unknown') continue;

        ops.push({
            tool: 'add_node',
            args: {
                type: 'Wall',
                parent_id: '__LAST_FLOOR_ID__',
                name: `Floor ${newFloorIndex} ${wall.facing.charAt(0).toUpperCase() + wall.facing.slice(1)} Wall`,
                position_x: wall.position.x,
                position_y: wallCenterY,
                position_z: wall.position.z,
                width: wall.dimensions.x,
                height: ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT,
                depth: wall.dimensions.z,
            },
        });
    }

    // 4. Move the roof up
    const roofs = Object.values(project.nodes).filter(n => n.type === 'Roof');
    for (const roof of roofs) {
        ops.push({
            tool: 'move_node',
            args: {
                target_id: roof.id,
                delta_x: 0,
                delta_y: ARCH_CONSTANTS.STANDARD_CEILING_HEIGHT + ARCH_CONSTANTS.STANDARD_SLAB_THICKNESS,
                delta_z: 0,
            },
        });
    }

    return ops;
}
