import { PSGProject } from '@/types';
import fs from 'fs';
import path from 'path';

const PROJECTS_DIR = path.join(process.cwd(), 'storage', 'projects');

// Ensure storage directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

export async function saveProject(project: PSGProject) {
    const filePath = path.join(PROJECTS_DIR, `${project.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2));

    // Also update a manifest file for quick listing
    updateManifest(project);
}

export async function getProject(id: string): Promise<PSGProject | null> {
    const filePath = path.join(PROJECTS_DIR, `${id}.json`);
    if (!fs.existsSync(filePath)) return null;

    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
}

export async function listProjects() {
    const manifestPath = path.join(PROJECTS_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return [];

    const data = fs.readFileSync(manifestPath, 'utf8');
    return JSON.parse(data);
}

function updateManifest(project: PSGProject) {
    const manifestPath = path.join(PROJECTS_DIR, 'manifest.json');
    let manifest: any[] = [];

    if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }

    const index = manifest.findIndex(p => p.id === project.id);
    const entry = {
        id: project.id,
        name: project.name,
        modified_at: project.modified_at,
        preview_summary: `${Object.keys(project.nodes).length} elements`
    };

    if (index >= 0) {
        manifest[index] = entry;
    } else {
        manifest.push(entry);
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
