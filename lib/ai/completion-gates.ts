export interface GateResult {
    name: string;
    passed: boolean;
    failReason?: string;
}

export function gate(name: string, check: () => boolean, failReason?: string): GateResult {
    const passed = check();
    return { name, passed, failReason: passed ? undefined : failReason || "Not satisfied" };
}

export function checkCompletionGates(state: any, brief: any): GateResult[] {
    // state and brief types would be BuildingState and BuildingBrief
    // For now using any to avoid deep dependency chain in first pass

    return [
        gate("PHYSICS_CLEAN", () => (state.physicsViolations?.critical?.length || 0) === 0, "Critical physics violations remain"),
        gate("ALL_FLOORS_SLABBED", () => state.floors?.every((f: any) => f.hasSlab) || false, "Some floors are missing slabs"),
        gate("ALL_WALLS_GROUNDED", () => state.walls?.every((w: any) => Math.abs(w.bottomY - w.floor?.topY) < 0.001) || false, "Some walls are floating or overlapping"),
        gate("ROOMS_COVER_PLAN", () => (state.roomCoveragePercent || 0) >= 95, "Total room area is less than 95% of plan"),
        gate("HAS_ROOF", () => (state.roofElements?.length || 0) > 0, "Building is missing a roof"),
        gate("HAS_STAIRS", () => (brief.floorCount || 1) < 2 || (state.stairElements?.length || 0) > 0, "Multi-floor building is missing stairs"),
        gate("ROOMS_MATCH_BRIEF", () => (state.roomMatchScore || 0) >= 0.9, "Rooms don't match the requirements in the brief"),
        gate("EXITS_EXIST", () => state.doors?.some((d: any) => d.isExterior) || false, "No exterior door found"),
        gate("NO_ORPHAN_NODES", () => (state.orphanNodes?.length || 0) === 0, "Orphaned elements detected in scene"),
        gate("EXPORT_READY", () => state.exportPackage !== null, "Export package not generated"),
    ];
}
