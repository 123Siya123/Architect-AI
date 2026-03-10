import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PSGProject } from '@/types';

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
    const baseProject: PSGProject = {
      id: projectId,
      name: name || `${specs.clientName} - Professional Project`,
      description: `Professional client project for ${specs.clientName}`,
      created_at: new Date().toISOString(),
      modified_at: new Date().toISOString(),
      version: 1,
      root_node_id: 'root_house',
      nodes: {
        'root_house': {
          id: 'root_house',
          type: 'House',
          name: 'Main House',
          position: { x: 0, y: 0, z: 0 },
          dimensions: { x: 0, y: 0, z: 0 },
          rotation: { yaw: 0, pitch: 0, roll: 0 },
          material_id: 'mat_concrete_cast',
          opacity: 1,
          tags: [],
          constraints: {},
          systems: { electrical: [], plumbing: [], hvac: [] },
          parent_id: null,
          children_ids: [],
          created_at: new Date().toISOString(),
          modified_at: new Date().toISOString(),
          version: 1
        }
      },
      settings: {
        unit: 'metric',
        grid_size: 0.1,
        precision_level: 1,
        building_standard: 'eurocode',
        default_wall_height: 2.7,
        default_wall_thickness: 0.25,
        locale: 'en-US',
        currency: specs.budget?.currency || 'EUR'
      },
      budget: {
        total_budget: budget || specs.budget?.total || 250000,
        spent: 0,
        remaining: budget || specs.budget?.total || 250000,
        currency: specs.budget?.currency || 'EUR',
        warnings_enabled: true,
        warning_threshold: 10
      },
      professional_specs: specs // This will requires update to types/index.ts
    };

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
      budget: baseProject.budget,
      currency: baseProject.currency,
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