'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDesignStore } from '@/store/useDesignStore';
import { ProfessionalClientChat } from '@/components/professional-client/ProfessionalClientChat';
import { ProjectSpecs } from '@/types/professional-client';

export default function ProfessionalClientPage() {
  const router = useRouter();
  const loadProject = useDesignStore((s) => s.loadProject);
  const setProfessionalSpecs = useDesignStore((s) => s.setProfessionalSpecs);
  const setTotalBudget = useDesignStore((s) => s.setTotalBudget);
  const setUserSpecifications = useDesignStore((s) => s.setUserSpecifications);
  const [isGeneratingProject, setIsGeneratingProject] = useState(false);

  const handleInterviewComplete = async (specs: ProjectSpecs) => {
    setIsGeneratingProject(true);

    try {
      // ── 1. Push specs into the design store ────────────
      setProfessionalSpecs(specs);
      setTotalBudget(specs.budget.total);

      // Build a user-specifications string the AI can use as context
      const userSpecText = [
        `Project Type: ${specs.projectType}`,
        `Vision: ${specs.vision}`,
        `Style: ${specs.style.architectural}`,
        `Rooms: ${specs.requirements.bedrooms} bed, ${specs.requirements.bathrooms} bath, ${specs.requirements.floors} floor(s)`,
        `Budget: €${specs.budget.total.toLocaleString()}`,
        `Family Size: ${specs.lifestyle.familySize}`,
        `Key Priorities: ${specs.mustHaves.join(', ')}`,
        specs.practicalNeeds ? `Notes: ${specs.practicalNeeds}` : '',
      ].filter(Boolean).join('\n');

      setUserSpecifications(userSpecText);

      // ── 2. Create project on backend ───────────────────
      const response = await fetch('/api/projects/professional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specs: specs,
          name: `${specs.projectType} – ${specs.style.architectural}`,
          budget: specs.budget,
          timeline: specs.timeline,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem(`professional-specs-${data.id}`, JSON.stringify(specs));
        loadProject(data.project);
        router.push(`/design?id=${data.id}&professional=true`);
      } else {
        // Fallback: just go to design page with specs in store
        router.push('/design?professional=true');
      }
    } catch (error) {
      console.error('Failed to create professional project:', error);
      router.push('/design?professional=true');
    } finally {
      setIsGeneratingProject(false);
    }
  };

  return (
    <div className="professional-page">
      {/* Ambient glow */}
      <div className="ambient-glow glow-1" />
      <div className="ambient-glow glow-2" />

      {/* ── Header ────────────────────────────────────────── */}
      <header className="pro-header">
        <button className="back-btn" onClick={() => router.push('/')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Home
        </button>
        <div className="header-center">
          <h1>New Project</h1>
          <p>Tell us about your dream home</p>
        </div>
        <div className="header-right" />
      </header>

      {/* ── Loading Overlay ───────────────────────────────── */}
      {isGeneratingProject && (
        <div className="loading-overlay">
          <div className="loading-card">
            <div className="loading-spinner" />
            <h3>Setting up your project…</h3>
            <p>Configuring AI with your preferences</p>
          </div>
        </div>
      )}

      {/* ── Main Content ──────────────────────────────────── */}
      <main className="pro-main">
        <ProfessionalClientChat onComplete={handleInterviewComplete} />
      </main>

      <style jsx>{`
        .professional-page {
          min-height: 100vh;
          background: #0a0a10;
          color: white;
          position: relative;
          overflow: hidden;
          font-family: 'Inter', -apple-system, sans-serif;
        }

        /* ── Ambient Glows ─────────────────────────────── */
        .ambient-glow {
          position: fixed;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.12;
          pointer-events: none;
          z-index: 0;
        }
        .glow-1 {
          width: 500px;
          height: 500px;
          background: #6c63ff;
          top: -100px;
          right: -100px;
        }
        .glow-2 {
          width: 400px;
          height: 400px;
          background: #00d4aa;
          bottom: -80px;
          left: -80px;
        }

        /* ── Header ────────────────────────────────────── */
        .pro-header {
          position: relative;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.25rem 2rem;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          background: rgba(10,10,16,0.8);
          backdrop-filter: blur(20px);
        }
        .back-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          background: none;
          border: none;
          color: rgba(255,255,255,0.5);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: color 0.2s;
          padding: 0.4rem 0.6rem;
          border-radius: 8px;
        }
        .back-btn:hover {
          color: white;
          background: rgba(255,255,255,0.05);
        }
        .header-center {
          text-align: center;
        }
        .header-center h1 {
          font-size: 1.15rem;
          font-weight: 700;
          margin: 0;
          background: linear-gradient(135deg, #fff, rgba(255,255,255,0.7));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .header-center p {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.35);
          margin: 0.15rem 0 0;
        }
        .header-right {
          width: 80px;
        }

        /* ── Main ──────────────────────────────────────── */
        .pro-main {
          position: relative;
          z-index: 10;
          max-width: 760px;
          margin: 0 auto;
          padding: 1rem 1.5rem 2rem;
          min-height: calc(100vh - 80px);
          display: flex;
          flex-direction: column;
        }

        /* ── Loading Overlay ───────────────────────────── */
        .loading-overlay {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(10,10,16,0.85);
          backdrop-filter: blur(12px);
        }
        .loading-card {
          text-align: center;
          padding: 3rem;
        }
        .loading-spinner {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          border: 3px solid rgba(255,255,255,0.1);
          border-top-color: #6c63ff;
          animation: spin 0.8s linear infinite;
          margin: 0 auto 1.5rem;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .loading-card h3 {
          font-size: 1.2rem;
          font-weight: 700;
          margin: 0 0 0.4rem;
        }
        .loading-card p {
          font-size: 0.85rem;
          color: rgba(255,255,255,0.4);
          margin: 0;
        }

        @media (max-width: 640px) {
          .pro-header {
            padding: 1rem;
          }
          .pro-main {
            padding: 0.5rem 1rem 1.5rem;
          }
        }
      `}</style>
    </div>
  );
}