export type OperationOutcome =
    | { status: "SUCCESS_VALID" }                    // created + physics clean
    | {
        status: "SUCCESS_NEEDS_PHYSICS_FIX";         // created but physics violation
        nodeId: string;                              // <- the node that needs fixing
        violation: PhysicsViolation
    }
    | {
        status: "FAILED_NOT_CREATED";                // LLM/schema error, node absent
        reason: string
    }
    | {
        status: "SKIPPED_DUPLICATE";                 // idempotency prevented re-creation
        existingNodeId: string
    }

export interface PhysicsViolation {
    severity: "CRITICAL" | "WARNING" | "INFO";
    code: ViolationCode;
    nodeId: string;          // REQUIRED — always the affected node's ID
    nodeSemanticRole: string;
    description: string;
    currentValue: number;
    expectedValue: number;
    suggestedFix: {
        operation: "set_node_position" | "resize_node" | "delete_node" | "add_node";
        x?: number;
        y?: number;           // Always the mathematically correct value
        z?: number;
        width?: number;
        height?: number;
        depth?: number;
    };
    autoFixable: boolean;   // true = apply without asking orchestrator
}

export type ViolationCode =
    | "WALL_FLOATING"          // wall bottom Y != floor top Y
    | "WALL_OVERLAP_FLOOR"     // wall bottom Y < floor top Y
    | "ROOF_GAP"               // roof bottom Y != top wall Y
    | "SLAB_UNSUPPORTED"       // upper floor slab has no walls below
    | "STAIR_DISCONNECTED"     // stair doesn't touch both floor levels
    | "DOOR_OVERFLOW"          // door height > containing wall height
    | "WINDOW_OVERFLOW"        // window extends outside wall bounds
    | "ROOM_BOX_MISMATCH"      // room bounding box != wall-enclosed area
    | "NEGATIVE_SPACE"         // element below Y=0
    | "COLUMN_UNSUPPORTED"     // column has no footing below
    | "CEILING_TOO_LOW"        // clear height < 2.1m
    | "CEILING_TOO_HIGH";      // clear height > 12m (probably a data error)
