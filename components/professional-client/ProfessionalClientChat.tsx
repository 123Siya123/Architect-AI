'use client';

import React, { useState, useRef } from 'react';
import { ProjectSpecs } from '@/types/professional-client';

interface ProfessionalClientChatProps {
  onComplete: (specs: ProjectSpecs) => void;
}

// ── Step Data ────────────────────────────────────────────
const PROJECT_TYPES = [
  { id: 'new-build', label: 'New Build', icon: '🏗️', desc: 'Start from scratch' },
  { id: 'renovation', label: 'Renovation', icon: '🔨', desc: 'Transform existing' },
  { id: 'extension', label: 'Extension', icon: '📐', desc: 'Expand your home' },
  { id: 'interior', label: 'Interior', icon: '🎨', desc: 'Redesign spaces' },
];

const STYLE_OPTIONS = [
  { id: 'modern', label: 'Modern', icon: '◻️' },
  { id: 'traditional', label: 'Traditional', icon: '🏛️' },
  { id: 'minimalist', label: 'Minimalist', icon: '▫️' },
  { id: 'contemporary', label: 'Contemporary', icon: '🔷' },
  { id: 'industrial', label: 'Industrial', icon: '⚙️' },
  { id: 'mediterranean', label: 'Mediterranean', icon: '🌊' },
];

const PRIORITY_OPTIONS = [
  { id: 'natural-light', label: 'Natural Light', icon: '☀️' },
  { id: 'open-plan', label: 'Open Plan', icon: '🚪' },
  { id: 'privacy', label: 'Privacy', icon: '🔒' },
  { id: 'outdoor-living', label: 'Outdoor Living', icon: '🌿' },
  { id: 'smart-home', label: 'Smart Home', icon: '📱' },
  { id: 'energy-efficient', label: 'Energy Efficient', icon: '⚡' },
  { id: 'home-office', label: 'Home Office', icon: '💻' },
  { id: 'entertainment', label: 'Entertainment', icon: '🎉' },
];

const BUDGET_RANGES = [
  { id: 'starter', label: '€100K – €250K', min: 100000, max: 250000, tag: 'Starter' },
  { id: 'mid', label: '€250K – €500K', min: 250000, max: 500000, tag: 'Mid-Range' },
  { id: 'premium', label: '€500K – €1M', min: 500000, max: 1000000, tag: 'Premium' },
  { id: 'luxury', label: '€1M+', min: 1000000, max: 5000000, tag: 'Luxury' },
];

// ── Component ────────────────────────────────────────────
export function ProfessionalClientChat({ onComplete }: ProfessionalClientChatProps) {
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Step 1: Vision
  const [projectType, setProjectType] = useState('');
  const [vision, setVision] = useState('');

  // Step 2: Essentials
  const [bedrooms, setBedrooms] = useState(3);
  const [bathrooms, setBathrooms] = useState(2);
  const [floors, setFloors] = useState(1);
  const [style, setStyle] = useState('');
  const [budgetRange, setBudgetRange] = useState('');

  // Step 3: Priorities
  const [priorities, setPriorities] = useState<string[]>([]);
  const [familySize, setFamilySize] = useState(4);
  const [additionalNotes, setAdditionalNotes] = useState('');

  const STEPS = [
    { label: 'Vision', icon: '✨' },
    { label: 'Essentials', icon: '🏠' },
    { label: 'Priorities', icon: '🎯' },
  ];

  const canProceed = () => {
    switch (step) {
      case 0: return projectType !== '' && vision.trim().length > 0;
      case 1: return style !== '' && budgetRange !== '';
      case 2: return priorities.length > 0;
      default: return false;
    }
  };

  const goNext = () => {
    if (!canProceed()) return;
    if (step < STEPS.length - 1) {
      setAnimating(true);
      setTimeout(() => {
        setStep(s => s + 1);
        setAnimating(false);
      }, 300);
    } else {
      handleComplete();
    }
  };

  const goBack = () => {
    if (step > 0) {
      setAnimating(true);
      setTimeout(() => {
        setStep(s => s - 1);
        setAnimating(false);
      }, 300);
    }
  };

  const togglePriority = (id: string) => {
    setPriorities(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const selectedBudget = BUDGET_RANGES.find(b => b.id === budgetRange);

  const handleComplete = () => {
    const specs: ProjectSpecs = {
      clientName: '',
      clientContact: '',
      projectType: PROJECT_TYPES.find(p => p.id === projectType)?.label || projectType,
      projectLocation: '',
      budget: {
        total: selectedBudget?.max || 250000,
        currency: 'EUR',
        flexibility: 'flexible',
      },
      timeline: {
        startDate: new Date().toISOString().split('T')[0],
        targetCompletion: '',
        urgency: 'medium',
      },
      site: {
        size: 0,
        topography: 'flat',
        orientation: '',
        access: 'easy',
        utilities: { electricity: true, water: true, sewer: true, gas: true, internet: true },
        constraints: [],
      },
      zoning: {
        zone: '',
        setbacks: { front: 0, rear: 0, sides: 0 },
        heightRestrictions: 0,
        far: 0,
        coverage: 0,
        parkingRequirements: 0,
      },
      requirements: {
        bedrooms,
        bathrooms,
        floors,
        garage: false,
        basement: false,
        attic: false,
        outdoorSpaces: priorities.includes('outdoor-living') ? ['patio', 'garden'] : [],
        specialRooms: priorities.filter(p => ['home-office', 'entertainment'].includes(p)),
        accessibility: false,
        energyEfficiency: priorities.includes('energy-efficient') ? 'excellent' : 'good',
      },
      style: {
        architectural: STYLE_OPTIONS.find(s => s.id === style)?.label || style,
        interior: '',
        materials: [],
        colors: [],
        inspiration: [],
      },
      lifestyle: {
        familySize,
        ageGroups: [],
        workFromHome: priorities.includes('home-office'),
        entertaining: priorities.includes('entertainment') ? 'frequently' : 'occasionally',
        cooking: 'enthusiast',
        hobbies: [],
        pets: [],
      },
      sustainability: {
        solarPanels: priorities.includes('energy-efficient'),
        rainwaterHarvesting: false,
        greywaterSystem: false,
        smartHome: priorities.includes('smart-home') ? 'advanced' : 'none',
        greenRoof: false,
        geothermal: false,
      },
      vision,
      practicalNeeds: additionalNotes,
      concerns: [],
      mustHaves: priorities.map(p => PRIORITY_OPTIONS.find(o => o.id === p)?.label || p),
      niceToHaves: [],
      absoluteNoGos: [],
      documents: { photos: [], inspirationImages: [], documents: [] },
    };
    onComplete(specs);
  };

  return (
    <div className="wizard-root" ref={containerRef}>
      {/* ── Progress Dots ─────────────────────────────────── */}
      <div className="wizard-progress">
        {STEPS.map((s, i) => (
          <div key={i} className={`progress-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}>
            <div className="step-dot">
              {i < step ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <span>{s.icon}</span>
              )}
            </div>
            <span className="step-name">{s.label}</span>
          </div>
        ))}
        <div className="progress-line">
          <div className="progress-fill" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
        </div>
      </div>

      {/* ── Step Content ─────────────────────────────────── */}
      <div className={`wizard-content ${animating ? 'fade-out' : 'fade-in'}`}>

        {/* ── Step 1: Vision ─────────────────────────────── */}
        {step === 0 && (
          <div className="step-card">
            <h2 className="step-title">What kind of home are you dreaming of?</h2>
            <p className="step-subtitle">Choose your project type and describe your vision</p>

            <div className="type-grid">
              {PROJECT_TYPES.map(t => (
                <button
                  key={t.id}
                  className={`type-card ${projectType === t.id ? 'selected' : ''}`}
                  onClick={() => setProjectType(t.id)}
                >
                  <span className="type-icon">{t.icon}</span>
                  <span className="type-label">{t.label}</span>
                  <span className="type-desc">{t.desc}</span>
                </button>
              ))}
            </div>

            <div className="vision-input-group">
              <label htmlFor="vision-input">Describe your dream home in a few sentences</label>
              <textarea
                id="vision-input"
                value={vision}
                onChange={e => setVision(e.target.value)}
                placeholder="e.g. A bright, open home with lots of natural light, a modern kitchen, and a cozy reading nook..."
                rows={3}
              />
            </div>
          </div>
        )}

        {/* ── Step 2: Essentials ──────────────────────────── */}
        {step === 1 && (
          <div className="step-card">
            <h2 className="step-title">The essentials</h2>
            <p className="step-subtitle">Rooms, style, and budget</p>

            <div className="counter-row">
              <CounterInput label="Bedrooms" value={bedrooms} onChange={setBedrooms} min={1} max={10} />
              <CounterInput label="Bathrooms" value={bathrooms} onChange={setBathrooms} min={1} max={8} />
              <CounterInput label="Floors" value={floors} onChange={setFloors} min={1} max={4} />
            </div>

            <div className="section-label">Architectural Style</div>
            <div className="style-grid">
              {STYLE_OPTIONS.map(s => (
                <button
                  key={s.id}
                  className={`style-chip ${style === s.id ? 'selected' : ''}`}
                  onClick={() => setStyle(s.id)}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>

            <div className="section-label">Budget Range</div>
            <div className="budget-grid">
              {BUDGET_RANGES.map(b => (
                <button
                  key={b.id}
                  className={`budget-card ${budgetRange === b.id ? 'selected' : ''}`}
                  onClick={() => setBudgetRange(b.id)}
                >
                  <span className="budget-tag">{b.tag}</span>
                  <span className="budget-amount">{b.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 3: Priorities ──────────────────────────── */}
        {step === 2 && (
          <div className="step-card">
            <h2 className="step-title">What matters most to you?</h2>
            <p className="step-subtitle">Select your top priorities — pick as many as you like</p>

            <div className="priority-grid">
              {PRIORITY_OPTIONS.map(p => (
                <button
                  key={p.id}
                  className={`priority-chip ${priorities.includes(p.id) ? 'selected' : ''}`}
                  onClick={() => togglePriority(p.id)}
                >
                  <span className="priority-icon">{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <div className="counter-row" style={{ marginTop: '1.5rem' }}>
              <CounterInput label="Family Size" value={familySize} onChange={setFamilySize} min={1} max={12} />
            </div>

            <div className="vision-input-group" style={{ marginTop: '1rem' }}>
              <label htmlFor="notes-input">Anything else we should know? <span className="optional">(optional)</span></label>
              <textarea
                id="notes-input"
                value={additionalNotes}
                onChange={e => setAdditionalNotes(e.target.value)}
                placeholder="Special requirements, accessibility needs, must-haves..."
                rows={2}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────── */}
      <div className="wizard-nav">
        {step > 0 ? (
          <button className="nav-back" onClick={goBack}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
        ) : <div />}
        <button
          className={`nav-next ${!canProceed() ? 'disabled' : ''}`}
          onClick={goNext}
          disabled={!canProceed()}
        >
          {step === STEPS.length - 1 ? 'Start Designing' : 'Continue'}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>

      <style jsx>{`
        .wizard-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          max-width: 680px;
          margin: 0 auto;
          padding: 2rem 1rem 1.5rem;
        }

        /* ── Progress ─────────────────────────────────────── */
        .wizard-progress {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: 3rem;
          margin-bottom: 2.5rem;
          position: relative;
        }
        .progress-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          z-index: 2;
        }
        .step-dot {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: rgba(255,255,255,0.06);
          border: 2px solid rgba(255,255,255,0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.1rem;
          color: rgba(255,255,255,0.4);
          transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
        }
        .progress-step.active .step-dot {
          background: linear-gradient(135deg, #6c63ff, #00d4aa);
          border-color: transparent;
          color: white;
          box-shadow: 0 0 24px rgba(108,99,255,0.4);
          transform: scale(1.1);
        }
        .progress-step.done .step-dot {
          background: #00d4aa;
          border-color: transparent;
          color: white;
        }
        .step-name {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.3);
          transition: color 0.3s;
        }
        .progress-step.active .step-name,
        .progress-step.done .step-name {
          color: rgba(255,255,255,0.8);
        }
        .progress-line {
          position: absolute;
          top: 20px;
          left: 50%;
          transform: translateX(-50%);
          width: 200px;
          height: 2px;
          background: rgba(255,255,255,0.08);
          border-radius: 2px;
          z-index: 1;
        }
        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #00d4aa, #6c63ff);
          border-radius: 2px;
          transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
        }

        /* ── Content ──────────────────────────────────────── */
        .wizard-content {
          flex: 1;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.1) transparent;
        }
        .wizard-content.fade-out {
          opacity: 0;
          transform: translateY(8px);
          transition: all 0.2s ease;
        }
        .wizard-content.fade-in {
          opacity: 1;
          transform: translateY(0);
          transition: all 0.35s ease;
        }

        .step-card {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 20px;
          padding: 2rem;
        }

        .step-title {
          font-size: 1.6rem;
          font-weight: 700;
          color: white;
          margin: 0 0 0.4rem;
          line-height: 1.3;
        }
        .step-subtitle {
          font-size: 0.9rem;
          color: rgba(255,255,255,0.45);
          margin: 0 0 1.8rem;
        }

        /* ── Type Grid ────────────────────────────────────── */
        .type-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
          margin-bottom: 1.8rem;
        }
        .type-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.35rem;
          padding: 1rem 0.5rem;
          border-radius: 14px;
          background: rgba(255,255,255,0.04);
          border: 1.5px solid rgba(255,255,255,0.08);
          cursor: pointer;
          transition: all 0.25s ease;
          color: rgba(255,255,255,0.6);
        }
        .type-card:hover {
          border-color: rgba(108,99,255,0.3);
          background: rgba(108,99,255,0.06);
        }
        .type-card.selected {
          border-color: #6c63ff;
          background: rgba(108,99,255,0.12);
          color: white;
          box-shadow: 0 0 20px rgba(108,99,255,0.15);
        }
        .type-icon { font-size: 1.5rem; }
        .type-label { font-size: 0.8rem; font-weight: 600; }
        .type-desc { font-size: 0.65rem; opacity: 0.6; }

        /* ── Vision Input ─────────────────────────────────── */
        .vision-input-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .vision-input-group label {
          font-size: 0.8rem;
          font-weight: 600;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .optional {
          text-transform: none;
          font-weight: 400;
          opacity: 0.6;
        }
        .vision-input-group textarea {
          width: 100%;
          padding: 0.85rem 1rem;
          border-radius: 12px;
          border: 1.5px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.04);
          color: white;
          font-size: 0.9rem;
          line-height: 1.5;
          resize: none;
          outline: none;
          font-family: inherit;
          transition: border-color 0.2s;
        }
        .vision-input-group textarea::placeholder {
          color: rgba(255,255,255,0.2);
        }
        .vision-input-group textarea:focus {
          border-color: rgba(108,99,255,0.5);
        }

        /* ── Counter Row ──────────────────────────────────── */
        .counter-row {
          display: flex;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        /* ── Style Grid ───────────────────────────────────── */
        .section-label {
          font-size: 0.75rem;
          font-weight: 600;
          color: rgba(255,255,255,0.4);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 0.6rem;
        }
        .style-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }
        .style-chip {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.9rem;
          border-radius: 100px;
          background: rgba(255,255,255,0.04);
          border: 1.5px solid rgba(255,255,255,0.08);
          color: rgba(255,255,255,0.6);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .style-chip:hover {
          border-color: rgba(108,99,255,0.3);
        }
        .style-chip.selected {
          background: rgba(108,99,255,0.15);
          border-color: #6c63ff;
          color: white;
        }

        /* ── Budget Grid ──────────────────────────────────── */
        .budget-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.6rem;
        }
        .budget-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
          padding: 0.8rem 0.4rem;
          border-radius: 12px;
          background: rgba(255,255,255,0.04);
          border: 1.5px solid rgba(255,255,255,0.08);
          cursor: pointer;
          transition: all 0.2s ease;
          color: rgba(255,255,255,0.5);
        }
        .budget-card:hover {
          border-color: rgba(0,212,170,0.3);
        }
        .budget-card.selected {
          background: rgba(0,212,170,0.1);
          border-color: #00d4aa;
          color: white;
          box-shadow: 0 0 16px rgba(0,212,170,0.12);
        }
        .budget-tag {
          font-size: 0.6rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          opacity: 0.6;
        }
        .budget-card.selected .budget-tag {
          color: #00d4aa;
          opacity: 1;
        }
        .budget-amount {
          font-size: 0.8rem;
          font-weight: 600;
        }

        /* ── Priority Grid ────────────────────────────────── */
        .priority-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.6rem;
        }
        .priority-chip {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
          padding: 0.85rem 0.4rem;
          border-radius: 14px;
          background: rgba(255,255,255,0.04);
          border: 1.5px solid rgba(255,255,255,0.08);
          cursor: pointer;
          transition: all 0.25s ease;
          font-size: 0.75rem;
          font-weight: 500;
          color: rgba(255,255,255,0.5);
        }
        .priority-chip:hover {
          border-color: rgba(108,99,255,0.3);
          background: rgba(108,99,255,0.05);
        }
        .priority-chip.selected {
          background: rgba(108,99,255,0.12);
          border-color: #6c63ff;
          color: white;
        }
        .priority-icon {
          font-size: 1.3rem;
        }

        /* ── Navigation ───────────────────────────────────── */
        .wizard-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 1.5rem;
          margin-top: 0.5rem;
        }
        .nav-back {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.65rem 1.2rem;
          border-radius: 12px;
          background: rgba(255,255,255,0.06);
          border: 1px solid rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .nav-back:hover {
          background: rgba(255,255,255,0.1);
          color: white;
        }
        .nav-next {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.75rem 1.8rem;
          border-radius: 12px;
          background: linear-gradient(135deg, #6c63ff, #00d4aa);
          border: none;
          color: white;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
          box-shadow: 0 4px 20px rgba(108,99,255,0.3);
        }
        .nav-next:hover:not(.disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 30px rgba(108,99,255,0.45);
        }
        .nav-next.disabled {
          opacity: 0.35;
          cursor: not-allowed;
          box-shadow: none;
        }

        @media (max-width: 640px) {
          .type-grid { grid-template-columns: repeat(2, 1fr); }
          .budget-grid { grid-template-columns: repeat(2, 1fr); }
          .priority-grid { grid-template-columns: repeat(2, 1fr); }
          .counter-row { flex-wrap: wrap; }
          .progress-line { width: 140px; }
          .wizard-progress { gap: 2rem; }
        }
      `}</style>
    </div>
  );
}

// ── Counter Input Sub-Component ─────────────────────────
function CounterInput({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="counter-input">
      <span className="counter-label">{label}</span>
      <div className="counter-controls">
        <button
          className="counter-btn"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
        >−</button>
        <span className="counter-value">{value}</span>
        <button
          className="counter-btn"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
        >+</button>
      </div>

      <style jsx>{`
        .counter-input {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }
        .counter-label {
          font-size: 0.7rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: rgba(255,255,255,0.4);
        }
        .counter-controls {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          background: rgba(255,255,255,0.04);
          border: 1.5px solid rgba(255,255,255,0.08);
          border-radius: 12px;
          padding: 0.3rem;
        }
        .counter-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          border: none;
          background: rgba(255,255,255,0.08);
          color: white;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }
        .counter-btn:hover:not(:disabled) {
          background: rgba(108,99,255,0.3);
        }
        .counter-btn:disabled {
          opacity: 0.25;
          cursor: not-allowed;
        }
        .counter-value {
          font-size: 1.2rem;
          font-weight: 700;
          color: white;
          min-width: 28px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}