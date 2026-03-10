'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDesignStore } from '@/store/useDesignStore';
import { ProfessionalClientChat } from '@/components/professional-client/ProfessionalClientChat';
import { RequirementsDocument } from '@/components/professional-client/RequirementsDocument';
import { ProjectSpecs } from '@/types/professional-client';

export default function ProfessionalClientPage() {
  const router = useRouter();
  const loadProject = useDesignStore((s) => s.loadProject);
  const [currentPhase, setCurrentPhase] = useState<'interview' | 'review' | 'design'>('interview');
  const [projectSpecs, setProjectSpecs] = useState<ProjectSpecs | null>(null);
  const [isGeneratingProject, setIsGeneratingProject] = useState(false);

  const handleInterviewComplete = async (specs: ProjectSpecs) => {
    setProjectSpecs(specs);
    setCurrentPhase('review');
  };

  const handleStartDesign = async () => {
    if (!projectSpecs) return;
    
    setIsGeneratingProject(true);
    try {
      // Create a new project based on the professional client specs
      const response = await fetch('/api/projects/professional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          specs: projectSpecs,
          name: `${projectSpecs.clientName} - ${projectSpecs.projectType}`,
          budget: projectSpecs.budget,
          timeline: projectSpecs.timeline
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Store the professional specs in the project context
        localStorage.setItem(`professional-specs-${data.id}`, JSON.stringify(projectSpecs));
        
        // Load the project and redirect to design page
        loadProject(data.project);
        router.push(`/design?id=${data.id}&professional=true`);
      }
    } catch (error) {
      console.error('Failed to create professional project:', error);
    } finally {
      setIsGeneratingProject(false);
    }
  };

  return (
    <div className="professional-client-page">
      {/* Header */}
      <header className="professional-header">
        <div className="header-content">
          <h1>Professional Client Project</h1>
          <p>Phase 1: Initial Client Engagement</p>
          <div className="phase-indicator">
            <div className={`phase ${currentPhase === 'interview' ? 'active' : ''}`}>
              <span className="phase-number">1</span>
              <span className="phase-label">Client Interview</span>
            </div>
            <div className={`phase ${currentPhase === 'review' ? 'active' : ''}`}>
              <span className="phase-number">2</span>
              <span className="phase-label">Requirements Review</span>
            </div>
            <div className={`phase ${currentPhase === 'design' ? 'active' : ''}`}>
              <span className="phase-number">3</span>
              <span className="phase-label">Design Phase</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="professional-main">
        {currentPhase === 'interview' && (
          <ProfessionalClientChat 
            onComplete={handleInterviewComplete}
          />
        )}

        {currentPhase === 'review' && projectSpecs && (
          <div className="review-section">
            <RequirementsDocument specs={projectSpecs} />
            <div className="review-actions">
              <button 
                className="btn-secondary"
                onClick={() => setCurrentPhase('interview')}
              >
                ← Back to Interview
              </button>
              <button 
                className="btn-primary"
                onClick={handleStartDesign}
                disabled={isGeneratingProject}
              >
                {isGeneratingProject ? 'Creating Project...' : 'Start Design Phase →'}
              </button>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .professional-client-page {
          min-height: 100vh;
          background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 100%);
          color: white;
        }

        .professional-header {
          background: rgba(18, 18, 26, 0.9);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 2rem 0;
        }

        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 2rem;
          text-align: center;
        }

        .header-content h1 {
          font-size: 2.5rem;
          font-weight: 800;
          margin-bottom: 0.5rem;
          background: linear-gradient(45deg, #6c63ff, #00d4aa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .header-content p {
          font-size: 1.1rem;
          color: #8888a0;
          margin-bottom: 2rem;
        }

        .phase-indicator {
          display: flex;
          justify-content: center;
          gap: 2rem;
          margin-top: 2rem;
        }

        .phase {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          opacity: 0.5;
          transition: all 0.3s ease;
        }

        .phase.active {
          opacity: 1;
        }

        .phase-number {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          font-size: 0.9rem;
        }

        .phase.active .phase-number {
          background: linear-gradient(45deg, #6c63ff, #00d4aa);
        }

        .phase-label {
          font-size: 0.9rem;
          font-weight: 500;
        }

        .professional-main {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem;
          min-height: calc(100vh - 200px);
        }

        .review-section {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .review-actions {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2rem;
          background: rgba(255, 255, 255, 0.02);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .btn-primary {
          background: linear-gradient(45deg, #6c63ff, #00d4aa);
          color: white;
          border: none;
          padding: 1rem 2rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 10px 30px rgba(108, 99, 255, 0.3);
        }

        .btn-primary:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: rgba(255, 255, 255, 0.1);
          color: white;
          border: 1px solid rgba(255, 255, 255, 0.2);
          padding: 1rem 2rem;
          border-radius: 12px;
          font-weight: 600;
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.3s ease;
        }

        .btn-secondary:hover {
          background: rgba(255, 255, 255, 0.15);
          border-color: rgba(255, 255, 255, 0.3);
        }

        @media (max-width: 768px) {
          .phase-indicator {
            flex-direction: column;
            gap: 1rem;
          }

          .review-actions {
            flex-direction: column;
            gap: 1rem;
          }

          .header-content h1 {
            font-size: 2rem;
          }
        }
      `}</style>
    </div>
  );
}