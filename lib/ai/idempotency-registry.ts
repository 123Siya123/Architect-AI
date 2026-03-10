export interface NodeRegistryEntry {
    id: string;
    semanticRole: string;    // e.g. "wall_north_floor1"
    status: 'pending' | 'solid';
}

export class IdempotencyRegistry {
    private registry = new Map<string, NodeRegistryEntry>();

    checkExists(semanticRole: string): NodeRegistryEntry | null {
        return this.registry.get(semanticRole) ?? null;
    }

    register(semanticRole: string, status: 'pending' | 'solid'): void {
        this.registry.set(semanticRole, { id: 'pending', semanticRole, status });
    }

    updateId(semanticRole: string, id: string): void {
        const existing = this.registry.get(semanticRole);
        if (existing) {
            this.registry.set(semanticRole, { ...existing, id, status: 'solid' });
        }
    }

    getPromptBlock(): string {
        if (this.registry.size === 0) return "No nodes created yet.";
        let block = "EXISTING SEMANTIC NODES:\n";
        this.registry.forEach((entry, role) => {
            block += `- ${role}: ${entry.id} (${entry.status})\n`;
        });
        return block;
    }
}
