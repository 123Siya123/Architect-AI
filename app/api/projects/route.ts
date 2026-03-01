import { NextRequest, NextResponse } from 'next/server';
import { listProjects, saveProject } from '@/lib/projects';

export async function GET() {
    try {
        const projects = await listProjects();
        return NextResponse.json(projects);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to list projects' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const project = await request.json();
        await saveProject(project);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Save error:', error);
        return NextResponse.json({ error: 'Failed to save project' }, { status: 500 });
    }
}
