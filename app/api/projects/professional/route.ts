import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PSGProject } from '@/types';
import { createEmptyProject } from '@/lib/psg/schema';

const STORAGE_DIR = path.join(process.cwd(), 'storage', 'projects');

// Ensure storage directory exists
async function ensureStorageDir() {
  try {
    await fs.mkdir(STORAGE_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create storage directory:', error);
  }
}

// Load global project manifest
async function loadProjectManifest() {
  const manifestPath = path.join(STORAGE_DIR, 'manifest.json');
  try {
    const data = await fs.readFile(manifestPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { projects: [] };
  }
}

// Save global project manifest
async function saveProjectManifest(manifest: any) {
  const manifestPath = path.join(STORAGE_DIR, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function POST(request: NextRequest) {
  try {
    await ensureStorageDir();

    const body = await request.json();
    const { specs, name, budget, timeline } = body;

    if (!specs) {
      return NextResponse.json({ error: 'Project specs are required' }, { status: 400 });
    }

    // Generate project ID
    const projectId = uuidv4();

    // Create base project structure
    const baseProject: PSGProject = createEmptyProject(
      name || `${specs.clientName} - Professional Project`,
      budget || specs.budget?.total || 250000,
      specs.budget?.currency || 'EUR'
    );

    baseProject.id = projectId;
    baseProject.description = `Professional client project for ${specs.clientName}`;
    baseProject.professional_specs = specs;

    // Create project directory
    const projectDir = path.join(STORAGE_DIR, projectId);
    await fs.mkdir(projectDir, { recursive: true });
    await fs.mkdir(path.join(projectDir, 'revisions'), { recursive: true });

    // Save initial project state
    const projectPath = path.join(projectDir, 'project.json');
    await fs.writeFile(projectPath, JSON.stringify(baseProject, null, 2));

    // Create initial revision
    const revisionManifest = {
      current_revision: 1,
      revisions: [{
        id: 1,
        timestamp: new Date().toISOString(),
        description: 'Initial professional client project creation',
        specs_snapshot: specs
      }]
    };

    const revisionPath = path.join(projectDir, 'revisions', 'manifest.json');
    await fs.writeFile(revisionPath, JSON.stringify(revisionManifest, null, 2));

    // Save initial revision file
    const initialRevisionPath = path.join(projectDir, 'revisions', `${Date.now()}_v1.json`);
    await fs.writeFile(initialRevisionPath, JSON.stringify(baseProject, null, 2));

    // Update global manifest
    const globalManifest = await loadProjectManifest();
    globalManifest.projects.push({
      id: projectId,
      name: baseProject.name,
      description: baseProject.description,
      created_at: baseProject.created_at,
      modified_at: baseProject.modified_at,
      budget: baseProject.budget.total_budget,
      currency: baseProject.budget.currency,
      is_professional: true,
      client_name: specs.clientName,
      project_type: specs.projectType,
      preview_summary: `Professional ${specs.projectType} for ${specs.clientName}`,
      status: 'requirements_gathered'
    });

    await saveProjectManifest(globalManifest);

    // Store professional specs in localStorage (will be handled client-side)
    // This is just for the API response structure

    return NextResponse.json({
      id: projectId,
      project: baseProject,
      message: 'Professional project created successfully',
      next_steps: [
        'AI architect will analyze requirements',
        'Initial design concepts will be generated',
        'Professional workflow will be initiated'
      ]
    });

  } catch (error) {
    console.error('Failed to create professional project:', error);
    return NextResponse.json(
      { error: 'Failed to create professional project' },
      { status: 500 }
    );
  }
}