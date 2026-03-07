import { NextRequest, NextResponse } from 'next/server';
import { listRevisions, restoreRevision } from '@/lib/projects';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const revisions = await listRevisions(id);
        return NextResponse.json(revisions);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to list revisions' }, { status: 500 });
    }
}

export async function POST(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const { revisionId } = await request.json();
        if (!revisionId) {
            return NextResponse.json({ error: 'Missing revisionId' }, { status: 400 });
        }

        const project = await restoreRevision(id, revisionId);
        if (!project) {
            return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
        }

        return NextResponse.json(project);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to restore revision' }, { status: 500 });
    }
}
