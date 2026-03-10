"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useDesignStore } from '@/store/useDesignStore';
import { TEMPLATES } from '@/lib/psg/templates';

export default function HomePage() {
  const router = useRouter();
  const loadProject = useDesignStore((s) => s.loadProject);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const res = await fetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setRecentProjects(Array.isArray(data) ? data : []);
        }
      } catch (err) { }
    };
    fetchProjects();
  }, []);

  const handleSelectTemplate = async (templateSlug: string) => {
    const template = TEMPLATES.find(t => t.slug === templateSlug);
    if (template) {
      const project = template.create(250000, 'EUR');
      loadProject(project);

      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(project)
        });
        const data = await res.json();
        const idToLoad = data.id || project.id;
        router.push(`/design?id=${idToLoad}`);
      } catch (err) {
        console.error('Failed to create project:', err);
        router.push('/design');
      }
    }
  };

  return (
    <div className="landing-page dashboard-page">
      {/* ── Hero Section ─────────────────────────────────────── */}
      <section className="landing-hero">
        <div className="hero-content">
          <h1>Complex house design made simple and accurate</h1>
          <p>
            The most advanced AI-powered architectural planning tool.
            Design, visualize, and calculate costs in real-time.
          </p>
          <div className="hero-buttons">
            <button className="btn-primary" onClick={() => handleSelectTemplate('empty')}>Start Designing</button>
            <button className="btn-secondary" onClick={() => router.push('/professional-client')}>Professional Project</button>
            <button className="btn-secondary history-btn" onClick={() => setShowHistory(!showHistory)}>
              {showHistory ? 'Hide History' : 'History'}
            </button>
          </div>
        </div>
      </section>

      {showHistory && (
        <section className="dashboard-grid" style={{ maxWidth: '800px', margin: '40px auto 0 auto', display: 'block' }}>
          <div className="dashboard-column recent-column">
            <div className="column-header">
              <h2>Recent Projects</h2>
              <p>Continue working on your saved designs</p>
            </div>
            <div className="recent-projects-list">
              {recentProjects.length > 0 ? (
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
                        {project.preview_summary || 'Saved Project'} • {new Date(project.modified_at).toLocaleDateString()}
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
      )}

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

      {/* ── Inspiration Gallery ────────────────────────────────────── */}
      <section className="inspiration-gallery">
        <div className="gallery-header">
          <h2>Gallery for Inspiration</h2>
          <p>Explore what's possible with our AI House Designer</p>
        </div>
        <div className="gallery-grid">
          {TEMPLATES.filter(t => t.slug !== 'empty' && t.slug !== 'white_house').map((template) => (
            <div key={template.slug} className="gallery-item">
              <img src={template.preview_image} alt={template.name} />
              <div className="gallery-overlay">
                <h3>{template.name}</h3>
                <span className="style-tag">{template.style}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <style jsx>{`
                .dashboard-page {
                    padding-bottom: 80px;
                }
                
                .hero-content {
                    max-width: 800px;
                    margin: 0 auto;
                    text-align: center;
                }

                .landing-hero h1 {
                    font-size: 3.5rem;
                    background: linear-gradient(45deg, #6c63ff, #00d4aa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 24px;
                    line-height: 1.2;
                }

                .landing-hero p {
                    font-size: 1.2rem;
                    color: #a0a0b8;
                    margin-bottom: 40px;
                }

                .hero-buttons {
                    display: flex;
                    justify-content: center;
                    gap: 16px;
                    margin-top: 32px;
                }

                .hero-buttons button {
                    padding: 14px 32px;
                    border-radius: 12px;
                    font-size: 1.1rem;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }

                .hero-buttons .btn-primary {
                    background: linear-gradient(45deg, #6c63ff, #00d4aa);
                    color: white;
                    border: none;
                    box-shadow: 0 10px 20px rgba(108, 99, 255, 0.2);
                }

                .hero-buttons .btn-primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 15px 30px rgba(108, 99, 255, 0.4);
                }

                .hero-buttons .btn-secondary {
                    background: rgba(255, 255, 255, 0.05);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(10px);
                }

                .hero-buttons .btn-secondary:hover {
                    background: rgba(255, 255, 255, 0.1);
                    border-color: rgba(255, 255, 255, 0.3);
                }

                .landing-features {
                    max-width: 1400px;
                    margin: 60px auto;
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 32px;
                    padding: 0 40px;
                    position: relative;
                    z-index: 10;
                }

                .feature-card {
                    background: rgba(18, 18, 26, 0.8);
                    backdrop-filter: blur(20px);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 24px;
                    padding: 32px;
                    transition: transform 0.3s ease;
                }

                .feature-card:hover {
                    transform: translateY(-5px);
                    border-color: rgba(108, 99, 255, 0.3);
                }

                .feature-icon {
                    font-size: 3rem;
                    margin-bottom: 24px;
                }

                .feature-card h3 {
                    font-size: 1.25rem;
                    font-weight: 700;
                    margin-bottom: 16px;
                    color: white;
                }

                .feature-card p {
                    color: #8888a0;
                    line-height: 1.6;
                }

                .inspiration-gallery {
                    max-width: 1400px;
                    margin: 80px auto;
                    padding: 0 40px;
                }

                .gallery-header {
                    text-align: center;
                    margin-bottom: 48px;
                }

                .gallery-header h2 {
                    font-size: 2.5rem;
                    font-weight: 800;
                    margin-bottom: 12px;
                    color: white;
                }

                .gallery-header p {
                    color: #8888a0;
                    font-size: 1.1rem;
                }

                .gallery-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
                    gap: 32px;
                }

                .gallery-item {
                    position: relative;
                    border-radius: 24px;
                    overflow: hidden;
                    aspect-ratio: 4/3;
                    box-shadow: 0 20px 40px rgba(0,0,0,0.4);
                    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    background: #12121a;
                }

                .gallery-item:hover {
                    transform: translateY(-10px);
                }

                .gallery-item img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    transition: transform 0.6s ease;
                }

                .gallery-item:hover img {
                    transform: scale(1.08);
                }

                .gallery-overlay {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    padding: 40px 24px 24px;
                    background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%);
                    color: white;
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                }

                .gallery-overlay h3 {
                    font-size: 1.5rem;
                    font-weight: 700;
                    margin-bottom: 8px;
                }

                .style-tag {
                    background: rgba(108, 99, 255, 0.8);
                    color: white;
                    padding: 4px 12px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }

                @media (max-width: 768px) {
                    .landing-hero h1 { font-size: 2.5rem; }
                    .hero-buttons { flex-direction: column; }
                    .gallery-grid { grid-template-columns: 1fr; }
                }
            `}</style>
    </div>
  );
}
