export interface NodeRegistryEntry {
    id: string;
    semanticRole: string;    // e.g. "wall_north_floor1", "slab_ground"
    createdAtTurn: number;
    floorIndex: number;
    nodeType: string;
}

export class IdempotencyRegistry {
    private registry = new Map<string, NodeRegistryEntry>();

    // Call this BEFORE every add_node operation
    checkExists(semanticRole: string): NodeRegistryEntry | null {
        return this.registry.get(semanticRole) ?? null;
    }

    register(entry: NodeRegistryEntry): void {
        this.registry.set(entry.semanticRole, entry);
    }

    // Returns the correct operation: "create" | "update" | "skip"
    resolveOperation(semanticRole: string, proposedOp: "add_node"): "create" | "update" {
        if (this.checkExists(semanticRole)) return "update";
        return "create";
    }
}
