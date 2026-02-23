/**
 * =============================================================================
 * APP/PAGE.TSX — Landing Page
 * =============================================================================
 *
 * The home page that users see when they first visit the app.
 * Introduces the concept, shows features, and provides a CTA to
 * start designing.
 *
 * DESIGN: Full-screen hero with gradient background, feature cards
 * grid below, and a prominent "Start Designing" button.
 * =============================================================================
 */

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="landing-page">
      {/* ── Hero Section ─────────────────────────────────────── */}
      <section className="landing-hero">
        <h1>AI House Designer</h1>
        <p>
          Describe your dream home. Watch it come to life in 3D.
          Walk through every room. Refine every detail with AI.
          Get professional building plans when you&apos;re ready.
        </p>
        <Link href="/design" className="landing-cta">
          🏠 Start Designing →
        </Link>
      </section>

      {/* ── Features Grid ────────────────────────────────────── */}
      <section className="landing-features">
        <div className="feature-card">
          <div className="feature-icon">🧠</div>
          <h3>AI-Powered Design</h3>
          <p>
            Describe what you want in natural language. The AI creates
            and modifies the 3D structure following your instructions.
            Upload reference images for style guidance.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🏗️</div>
          <h3>Real 3D Structure</h3>
          <p>
            Not just a render — a fully parametric 3D model you can
            orbit, zoom, and walk through at eye level. Every wall,
            window, and door is individually editable.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🚶</div>
          <h3>Walk-Through Mode</h3>
          <p>
            Walk through your house at head height with WASD controls.
            Experience the space exactly as you would in real life.
            Check room sizes, window views, and natural light.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">💰</div>
          <h3>Real-Time Budget</h3>
          <p>
            Every material has a real price. See the total cost update
            as you design. The AI warns you about budget impacts and
            suggests cost-saving alternatives.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <h3>Electrical & Plumbing</h3>
          <p>
            Toggle visibility of electrical wiring (yellow), water supply
            (green), and drainage (red). The AI auto-places sockets,
            switches, and fixtures based on room function.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🌡️</div>
          <h3>Thermal Analysis</h3>
          <p>
            See a heat map overlay showing how heat flows through your
            house. Identify cold spots, optimize insulation, and
            estimate annual heating costs.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">🎚️</div>
          <h3>Precision Sliders</h3>
          <p>
            Don&apos;t want to use AI? Click any element and use sliders
            to adjust dimensions, position, and materials with
            millimeter precision. Changes are instant.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon">📄</div>
          <h3>Architect Plans</h3>
          <p>
            Export professional building documents: floor plans,
            elevations, cross-sections, material schedules, and
            electrical/plumbing layouts. Ready for construction.
          </p>
        </div>
      </section>
    </div>
  );
}
