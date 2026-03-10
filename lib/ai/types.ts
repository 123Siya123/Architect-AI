import { PhysicsViolation } from './physics-types';

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
