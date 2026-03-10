export function wallCenterY(floorTopY: number, wallHeight: number): number {
    // Wall sits exactly on top of floor slab. No gaps. No overlaps.
    return parseFloat((floorTopY + wallHeight / 2).toFixed(4));
}

export function floorTopY(floorCenterY: number, floorThickness: number): number {
    return parseFloat((floorCenterY + floorThickness / 2).toFixed(4));
}

export function ceilingSlabCenterY(wallTopY: number, slabThickness: number): number {
    return parseFloat((wallTopY + slabThickness / 2).toFixed(4));
}

export function roofRidgeY(wallTopY: number, pitchAngleDeg: number, spanM: number): number {
    return parseFloat((wallTopY + (spanM / 2) * Math.tan(pitchAngleDeg * Math.PI / 180)).toFixed(4));
}

export function stairLandingY(floorBaseY: number, floorHeight: number): number {
    return parseFloat((floorBaseY + floorHeight).toFixed(4));
}

// STANDARD CONSTRUCTION CONSTANTS — never let LLM override these
export const STANDARDS = {
    SLAB_THICKNESS: 0.15,   // m — standard concrete slab
    WALL_THICKNESS: 0.25,   // m — standard exterior wall
    INTERIOR_WALL_THICK: 0.15,   // m — interior partition
    MIN_CEILING_HEIGHT: 2.40,   // m — minimum habitable
    STANDARD_CEILING: 2.70,   // m — standard residential
    GRAND_CEILING: 4.00,   // m — formal/public spaces
    STAIR_RISER_HEIGHT: 0.175,  // m — standard riser
    STAIR_TREAD_DEPTH: 0.28,   // m — standard tread
    DOOR_HEIGHT_STANDARD: 2.10,   // m
    DOOR_HEIGHT_GRAND: 2.70,   // m
    WINDOW_SILL_HEIGHT: 0.90,   // m from floor
    GOLDEN_RATIO: 1.618,
};
