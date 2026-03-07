import { PSGProject } from '@/types';
import fs from 'fs';
import path from 'path';

const PROJECTS_DIR = path.join(process.cwd(), 'storage', 'projects');

// Ensure storage directory exists
if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

export interface ProjectRevision {
    id: string;
    projectId: string;
    timestamp: string;
    version: number;
    description?: string;
}

interface ProjectManifestEntry {
    id: string;
    name: string;
    modified_at: string;
    preview_summary: string;
}

/**
 * Saves the current project state (HEAD).
 * @param createRevision If true, also creates a backup snapshot in the revisions folder.
 */
export async function saveProject(project: PSGProject, createRevision: boolean = false) {
    // 1. Save HEAD
    const projectDir = path.join(PROJECTS_DIR, project.id);
    if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
    }
    
    // Save the main project file
    const filePath = path.join(projectDir, 'project.json');
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2));

    // 2. Update global manifest for listing
    updateManifest(project);

    // 3. Create Revision if requested
    if (createRevision) {
        await saveRevision(project);
    }
}

/**
 * Creates a timestamped backup of the project state.
 */
async function saveRevision(project: PSGProject, description: string = 'Autosave') {
    const projectDir = path.join(PROJECTS_DIR, project.id);
    const revisionsDir = path.join(projectDir, 'revisions');
    
    if (!fs.existsSync(revisionsDir)) {
        fs.mkdirSync(revisionsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const revisionId = `${timestamp}_v${project.version}`;
    const filename = `${revisionId}.json`;
    
    // Save full snapshot
    fs.writeFileSync(
        path.join(revisionsDir, filename), 
        JSON.stringify(project, null, 2)
    );

    // Update revision manifest
    const manifestPath = path.join(revisionsDir, 'manifest.json');
    let manifest: ProjectRevision[] = [];
    
    if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    }

    manifest.unshift({
        id: revisionId,
        projectId: project.id,
        timestamp: new Date().toISOString(),
        version: project.version,
        description
    });

    // Keep only last 50 revisions
    if (manifest.length > 50) {
        const toDelete = manifest.slice(50);
        manifest = manifest.slice(0, 50);
        
        // Cleanup old files
        for (const rev of toDelete) {
            try {
                fs.unlinkSync(path.join(revisionsDir, `${rev.id}.json`));
            } catch (e) {
                console.warn(`Failed to delete old revision ${rev.id}`, e);
            }
        }
    }

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

export async function getProject(id: string): Promise<PSGProject | null> {
    // Try new structure first: projects/<id>/project.json
    const newPath = path.join(PROJECTS_DIR, id, 'project.json');
    if (fs.existsSync(newPath)) {
        return JSON.parse(fs.readFileSync(newPath, 'utf8'));
    }

    // Fallback to old structure: projects/<id>.json
    const oldPath = path.join(PROJECTS_DIR, `${id}.json`);
    if (fs.existsSync(oldPath)) {
        const project = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
        // Migrate to new structure immediately
        await saveProject(project, true); 
        // Remove old file to complete migration
        fs.unlinkSync(oldPath);
        return project;
    }

    return null;
}

export async function listRevisions(projectId: string): Promise<ProjectRevision[]> {
    const manifestPath = path.join(PROJECTS_DIR, projectId, 'revisions', 'manifest.json');
    if (!fs.existsSync(manifestPath)) return [];
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

export async function restoreRevision(projectId: string, revisionId: string): Promise<PSGProject | null> {
    const revPath = path.join(PROJECTS_DIR, projectId, 'revisions', `${revisionId}.json`);
    if (!fs.existsSync(revPath)) return null;
    
    const project = JSON.parse(fs.readFileSync(revPath, 'utf8'));
    
    // When restoring, we effectively "fork" or "revert" HEAD.
    // We update the modified_at but keep the ID.
    project.modified_at = new Date().toISOString();
    
    // Save as new HEAD
    await saveProject(project, true); // Create a backup of the state BEFORE revert? Or just save this as new state?
    // Actually, saveProject(project, true) creates a revision of THIS state.
    // The previous state is already in history (hopefully).
    
    return project;
}

export async function listProjects() {
    const manifestPath = path.join(PROJECTS_DIR, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return [];
    
    const data = fs.readFileSync(manifestPath, 'utf8');
    const projects = JSON.parse(data) as unknown;
    if (!Array.isArray(projects)) return [];
    const parsedProjects = projects.filter((project): project is ProjectManifestEntry => (
        typeof project?.id === 'string' &&
        typeof project?.name === 'string' &&
        typeof project?.modified_at === 'string' &&
        typeof project?.preview_summary === 'string'
    ));
    return parsedProjects.sort((a, b) => {
        const aTime = new Date(a.modified_at || 0).getTime();
        const bTime = new Date(b.modified_at || 0).getTime();
        return bTime - aTime;
    });
}

function updateManifest(project: PSGProject) {
    const manifestPath = path.join(PROJECTS_DIR, 'manifest.json');
    let manifest: ProjectManifestEntry[] = [];

    if (fs.existsSync(manifestPath)) {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
        manifest = Array.isArray(raw)
            ? raw.filter((entry): entry is ProjectManifestEntry => (
                typeof entry?.id === 'string' &&
                typeof entry?.name === 'string' &&
                typeof entry?.modified_at === 'string' &&
                typeof entry?.preview_summary === 'string'
            ))
            : [];
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
