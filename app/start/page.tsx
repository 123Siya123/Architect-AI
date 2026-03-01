'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDesignStore } from '@/store/useDesignStore';
import { TEMPLATES } from '@/lib/psg/templates';
import Link from 'next/link';

export default function StartPage() {
    const router = useRouter();
    const loadProject = useDesignStore((s) => s.loadProject);
    const saveToServer = useDesignStore((s) => s.saveToServer);
    const [recentProjects, setRecentProjects] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchProjects = async () => {
            try {
                const res = await fetch('/api/projects');
                if (res.ok) {
                    const data = await res.ok ? await res.json() : [];
                    setRecentProjects(Array.isArray(data) ? data : []);
                }
            } catch (err) {
                console.error('Failed to fetch projects:', err);
            } finally {
                setIsLoading(false);
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

    const handleLoadRecent = async (id: string) => {
        router.push(`/design?id=${id}`);
    };

    return (
        <div className="start-screen">
            <header className="start-header">
                <Link href="/" className="logo">AI House Designer</Link>
                <div className="user-profile">
                    <div className="status-dot online"></div>
                    <span>Design Architect</span>
                </div>
            </header>

            <main className="start-main">
                <section className="start-section hero-section">
                    <div className="section-content">
                        <h1>Start a New Project</h1>
                        <p>Choose from a curated collection of architectural templates or start with a blank canvas.</p>

                        <div className="template-grid">
                            {TEMPLATES.map((template) => (
                                <div
                                    key={template.slug}
                                    className={`template-card ${template.slug === 'empty' ? 'card-empty' : ''}`}
                                    onClick={() => handleSelectTemplate(template.slug)}
                                >
                                    <div className="card-visual">
                                        {template.slug === 'empty' ? (
                                            <div className="empty-icon">📁</div>
                                        ) : (
                                            <>
                                                <img
                                                    src={template.preview_image}
                                                    alt={template.name}
                                                    className="template-img"
                                                />
                                                <div className="template-stats">
                                                    <span>{template.bedrooms} Beds</span>
                                                    <span>{template.floors} Floors</span>
                                                    <span>{template.approx_area_m2}m²</span>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                    <div className="card-info">
                                        <h3>{template.name}</h3>
                                        <p>{template.description}</p>
                                        <div className="card-meta">
                                            <span className="style-tag">{template.style}</span>
                                            <button className="btn-select">Start →</button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="start-section recent-section">
                    <div className="section-content">
                        <div className="section-header">
                            <h2>Continue Building</h2>
                            <p>Recent projects saved to your persistent storage.</p>
                        </div>

                        {isLoading ? (
                            <div className="recent-loading">Fetching your projects...</div>
                        ) : recentProjects.length > 0 ? (
                            <div className="recent-list">
                                {recentProjects.map((project) => (
                                    <div
                                        key={project.id}
                                        className="recent-item"
                                        onClick={() => handleLoadRecent(project.id)}
                                    >
                                        <div className="item-info">
                                            <h4>{project.name}</h4>
                                            <span className="item-meta">Modified {new Date(project.modified_at).toLocaleDateString()}</span>
                                            <span className="item-stats">{project.preview_summary}</span>
                                        </div>
                                        <button className="btn-open">Open</button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="recent-empty">
                                <div className="empty-message">
                                    <h3>No projects yet</h3>
                                    <p>Your designs will appear here once you start your first project.</p>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </main>

            <style jsx>{`
                .start-screen {
                    min-height: 100vh;
                    background: #0a0a0f;
                    color: white;
                    display: flex;
                    flex-direction: column;
                }

                .start-header {
                    padding: 24px 40px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                }

                .logo {
                    font-size: 1.2rem;
                    font-weight: 800;
                    letter-spacing: -0.02em;
                    background: linear-gradient(135deg, #fff, #6c63ff);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .user-profile {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    background: rgba(255, 255, 255, 0.05);
                    padding: 8px 16px;
                    border-radius: 100px;
                    font-size: 0.8rem;
                    color: #8888a0;
                }

                .status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                }

                .status-dot.online { background: #00d4aa; box-shadow: 0 0 10px rgba(0, 212, 170, 0.5); }

                .start-main {
                    flex: 1;
                    padding: 40px;
                    max-width: 1400px;
                    margin: 0 auto;
                    width: 100%;
                    display: grid;
                    grid-template-columns: 1fr 340px;
                    gap: 60px;
                }

                @media (max-width: 1100px) {
                    .start-main { grid-template-columns: 1fr; }
                }

                h1 { font-size: 2.5rem; font-weight: 800; margin-bottom: 12px; }
                h2 { font-size: 1.4rem; font-weight: 700; margin-bottom: 8px; }
                
                .section-content p { color: #8888a0; margin-bottom: 32px; }

                .template-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
                    gap: 24px;
                }

                .template-card {
                    background: #12121a;
                    border: 1px solid rgba(255, 255, 255, 0.06);
                    border-radius: 16px;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                    display: flex;
                    flex-direction: column;
                }

                .template-card:hover {
                    transform: translateY(-8px);
                    border-color: rgba(108, 99, 255, 0.4);
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
                }

                .card-visual {
                    height: 180px;
                    background: linear-gradient(135deg, #1e1e2d, #0a0a0f);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                }

                .template-img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    opacity: 0.7;
                    transition: opacity 0.3s;
                }

                .template-card:hover .template-img {
                    opacity: 1;
                }

                .template-stats {
                    display: flex;
                    gap: 12px;
                    position: absolute;
                    bottom: 16px;
                    left: 16px;
                }

                .template-stats span {
                    background: rgba(0, 0, 0, 0.5);
                    backdrop-filter: blur(8px);
                    padding: 4px 10px;
                    border-radius: 6px;
                    font-size: 0.75rem;
                    font-weight: 600;
                }

                .card-info {
                    padding: 24px;
                }

                .card-info h3 { margin-bottom: 8px; font-size: 1.1rem; }
                .card-info p { font-size: 0.85rem; line-height: 1.5; color: #8888a0; height: 44px; overflow: hidden; }

                .card-meta {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 20px;
                }

                .style-tag {
                    font-size: 0.7rem;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: #6c63ff;
                    font-weight: 700;
                }

                .btn-select {
                    background: rgba(108, 99, 255, 0.1);
                    color: #6c63ff;
                    padding: 6px 14px;
                    border-radius: 8px;
                    font-size: 0.85rem;
                    font-weight: 600;
                    transition: all 0.2s;
                }

                .template-card:hover .btn-select {
                    background: #6c63ff;
                    color: white;
                }

                .card-empty .card-visual {
                    background: repeating-linear-gradient(45deg, #12121a, #12121a 10px, #161622 10px, #161622 20px);
                }

                .empty-icon { font-size: 2.5rem; opacity: 0.3; }

                .recent-section {
                    background: rgba(255, 255, 255, 0.02);
                    padding: 32px;
                    border-radius: 20px;
                    height: fit-content;
                }

                .recent-list {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .recent-item {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    padding: 16px;
                    border-radius: 12px;
                    cursor: pointer;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    transition: all 0.2s;
                }

                .recent-item:hover {
                    background: rgba(255, 255, 255, 0.06);
                    border-color: rgba(255, 255, 255, 0.1);
                }

                .item-info h4 { font-size: 0.95rem; margin-bottom: 4px; }
                .item-meta { font-size: 0.75rem; color: #555566; display: block; }
                .item-stats { font-size: 0.7rem; color: #00d4aa; font-weight: 600; }

                .btn-open {
                    font-size: 0.8rem;
                    font-weight: 600;
                    color: white;
                    opacity: 0.5;
                }

                .recent-item:hover .btn-open { opacity: 1; color: #6c63ff; }

                .recent-empty {
                    text-align: center;
                    padding: 40px 0;
                    border: 1px dashed rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                }

                .recent-loading {
                    text-align: center;
                    color: #555566;
                    padding: 40px 0;
                    font-size: 0.9rem;
                }
            `}</style>
        </div>
    );
}
