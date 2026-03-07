import { NextRequest, NextResponse } from 'next/server';
import { getProject, saveProject } from '@/lib/projects';

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        const project = await getProject(id);
        if (!project) {
            return NextResponse.json({ error: 'Project not found' }, { status: 404 });
        }
        return NextResponse.json(project);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const project = await request.json();
        const { id } = await context.params;
        
        // Ensure ID matches
        if (project.id !== id) {
             // Optional: warn or correct, but usually trust body
        }
        
        // Check if this is an autosave/revision trigger
        const { searchParams } = new URL(request.url);
        const createRevision = searchParams.get('revision') === 'true';
        
        await saveProject(project, createRevision);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }
}
