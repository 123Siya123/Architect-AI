'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDesignStore } from '@/store/useDesignStore';
import { TEMPLATES } from '@/lib/psg/templates';

export default function HomePage() {
  const router = useRouter();
  const loadProject = useDesignStore((s) => s.loadProject);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setRecentProjects(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error('Failed to fetch projects:', err);
      } finally {
        setIsLoadingRecent(false);
      }
    };
    fetchProjects();
  }, []);

  const handleSelectTemplate = async (templateSlug: string) => {
    const template = TEMPLATES.find(t => t.slug === templateSlug);
    if (template) {
      const project = template.create(250000, 'EUR');
      loadProject(project);
      // Save initial state persistently
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(project)
      });
      router.push('/design');
    }
  };

  return (
    <div className="landing-page dashboard-page">
      {/* ── Hero Section ─────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="hero-content">
          <h1>AI House Designer</h1>
          <p>
            The most advanced AI-powered architectural planning tool.
            Design, visualize, and calculate costs in real-time.
          </p>
        </div>
      </section>

      {/* ── Dashboard: Templates & Recents ───────────────────────── */}
      <section className="dashboard-grid">
        <div className="dashboard-column templates-column">
          <div className="column-header">
            <h2>New Project</h2>
            <p>Choose a base template to start your design</p>
          </div>
          <div className="template-cards-mini">
            {TEMPLATES.map((template) => (
              <div
                key={template.slug}
                className="template-card-mini"
                onClick={() => handleSelectTemplate(template.slug)}
              >
                <div className="card-mini-visual">
                  {template.slug === 'empty' ? (
                    <span className="icon">📁</span>
                  ) : (
                    <img src={template.preview_image} alt={template.name} />
                  )}
                </div>
                <div className="card-mini-info">
                  <h3>{template.name}</h3>
                  <span className="style-tag">{template.style}</span>
                </div>
                <button className="btn-start">Start →</button>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-column recent-column">
          <div className="column-header">
            <h2>Recent Projects</h2>
            <p>Continue working on your saved designs</p>
          </div>
          <div className="recent-projects-list">
            {isLoadingRecent ? (
              <div className="status-message">Loading projects...</div>
            ) : recentProjects.length > 0 ? (
              recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/design?id=${project.id}`}
                  className="recent-project-card"
                >
                  <div className="project-icon">🏛️</div>
                  <div className="project-details">
                    <h4>{project.name}</h4>
                    <span className="project-meta">
                      {project.preview_summary} • {new Date(project.modified_at).toLocaleDateString()}
                    </span>
                  </div>
                  <button className="btn-open">Open</button>
                </Link>
              ))
            ) : (
              <div className="empty-projects">
                <p>No projects found yet. Start a new one!</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────────── */}
      <section className="landing-features">
        <div className="feature-card">
          <div className="feature-icon">🧠</div>
          <h3>AI-Powered Design</h3>
          <p>Describe what you want in natural language. The AI creates and modifies the 3D structure.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">🏗️</div>
          <h3>Real 3D Structure</h3>
          <p>Fully parametric 3D model you can orbit, zoom, and edit with millimeter precision.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">💰</div>
          <h3>Real-Time Budget</h3>
          <p>Every material has a real price. See the total cost update as you design.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon">📄</div>
          <h3>Architect Plans</h3>
          <p>Export professional floor plans, elevations, and material schedules ready for construction.</p>
        </div>
      </section>

      <style jsx>{`
                .dashboard-page {
                    padding-bottom: 80px;
                }
                
                .hero-content {
                    max-width: 800px;
                    margin: 0 auto;
                }

                .dashboard-grid {
                    max-width: 1400px;
                    margin: -60px auto 80px;
                    display: grid;
                    grid-template-columns: 1fr 400px;
                    gap: 32px;
                    padding: 0 40px;
                    position: relative;
                    z-index: 10;
                }

                @media (max-width: 1100px) {
                    .dashboard-grid { grid-template-columns: 1fr; margin-top: 40px; }
                }

                .dashboard-column {
                    background: rgba(18, 18, 26, 0.8);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 24px;
                    padding: 32px;
                    box-shadow: 0 40px 80px rgba(0, 0, 0, 0.5);
                }

                .column-header {
                    margin-bottom: 32px;
                }

                .column-header h2 { font-size: 1.5rem; font-weight: 800; margin-bottom: 8px; }
                .column-header p { color: #8888a0; font-size: 0.9rem; }

                /* Templates */
                .template-cards-mini {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 16px;
                }

                .template-card-mini {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 16px;
                    padding: 16px;
                    cursor: pointer;
                    transition: all 0.2s;
                    position: relative;
                }

                .template-card-mini:hover {
                    background: rgba(108, 99, 255, 0.1);
                    border-color: rgba(108, 99, 255, 0.3);
                    transform: translateY(-4px);
                }

                .card-mini-visual {
                    height: 100px;
                    background: #0a0a0f;
                    border-radius: 12px;
                    overflow: hidden;
                    margin-bottom: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .card-mini-visual img { width: 100%; height: 100%; object-fit: cover; opacity: 0.8; }
                .card-mini-visual .icon { font-size: 2rem; opacity: 0.3; }

                .card-mini-info h3 { font-size: 1rem; margin-bottom: 4px; }
                .style-tag { font-size: 0.65rem; color: #6c63ff; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }

                .btn-start {
                    margin-top: 16px;
                    width: 100%;
                    padding: 8px;
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    color: white;
                    font-size: 0.8rem;
                    font-weight: 600;
                    transition: all 0.2s;
                }

                .template-card-mini:hover .btn-start { background: #6c63ff; }

                /* Recent Projects */
                .recent-projects-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .recent-project-card {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 16px;
                    background: rgba(255, 255, 255, 0.02);
                    border: 1px solid rgba(255, 255, 255, 0.04);
                    border-radius: 16px;
                    text-decoration: none;
                    color: white;
                    transition: all 0.2s;
                }

                .recent-project-card:hover {
                    background: rgba(255, 255, 255, 0.05);
                    border-color: rgba(255, 255, 255, 0.1);
                }

                .project-icon {
                    width: 48px;
                    height: 48px;
                    background: rgba(0, 212, 170, 0.1);
                    color: #00d4aa;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                    border-radius: 12px;
                }

                .project-details { flex: 1; }
                .project-details h4 { font-size: 0.95rem; margin-bottom: 2px; }
                .project-meta { font-size: 0.75rem; color: #555566; }

                .btn-open { font-size: 0.75rem; font-weight: 700; color: #6c63ff; opacity: 0; transition: opacity 0.2s; }
                .recent-project-card:hover .btn-open { opacity: 1; }

                .empty-projects, .status-message {
                    text-align: center;
                    padding: 40px 0;
                    color: #555566;
                    font-size: 0.9rem;
                    border: 1px dashed rgba(255, 255, 255, 0.05);
                    border-radius: 16px;
                }
            `}</style>
    </div>
  );
}
