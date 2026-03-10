'use client';

import React from 'react';
import { ProjectSpecs } from '@/types/professional-client';

interface RequirementsDocumentProps {
  specs: ProjectSpecs;
}

export function RequirementsDocument({ specs }: RequirementsDocumentProps) {
  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="requirements-document">
      <div className="document-header">
        <h1>Professional Client Requirements Document</h1>
        <div className="document-meta">
          <p><strong>Client:</strong> {specs.clientName}</p>
          <p><strong>Project Type:</strong> {specs.projectType}</p>
          <p><strong>Location:</strong> {specs.projectLocation}</p>
          <p><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
        </div>
      </div>

      <div className="document-content">
        {/* Executive Summary */}
        <section className="section">
          <h2>Executive Summary</h2>
          <div className="summary-grid">
            <div className="summary-item">
              <h3>Budget</h3>
              <p className="highlight">{formatCurrency(specs.budget.total, specs.budget.currency)}</p>
              <p className="detail">Flexibility: {specs.budget.flexibility}</p>
            </div>
            <div className="summary-item">
              <h3>Timeline</h3>
              <p className="highlight">Start: {formatDate(specs.timeline.startDate)}</p>
              <p className="detail">Target: {formatDate(specs.timeline.targetCompletion)}</p>
              <p className="detail">Urgency: {specs.timeline.urgency}</p>
            </div>
            <div className="summary-item">
              <h3>Site Size</h3>
              <p className="highlight">{specs.site.size.toLocaleString()} m²</p>
              <p className="detail">Topography: {specs.site.topography}</p>
            </div>
            <div className="summary-item">
              <h3>Key Requirements</h3>
              <p className="highlight">{specs.requirements.bedrooms} bed • {specs.requirements.bathrooms} bath</p>
              <p className="detail">{specs.requirements.floors} floors</p>
            </div>
          </div>
        </section>

        {/* Site Information */}
        <section className="section">
          <h2>Site Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <h4>Property Details</h4>
              <ul>
                <li>Size: {specs.site.size.toLocaleString()} m²</li>
                <li>Topography: {specs.site.topography}</li>
                <li>Orientation: {specs.site.orientation}</li>
                <li>Access: {specs.site.access}</li>
              </ul>
            </div>
            <div className="info-item">
              <h4>Utilities Available</h4>
              <ul>
                {Object.entries(specs.site.utilities).map(([utility, available]) => (
                  <li key={utility} className={available ? 'available' : 'unavailable'}>
                    {utility.charAt(0).toUpperCase() + utility.slice(1)}: {available ? '✓' : '✗'}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {specs.site.constraints.length > 0 && (
            <div className="constraints">
              <h4>Site Constraints</h4>
              <ul>
                {specs.site.constraints.map((constraint, index) => (
                  <li key={index}>{constraint}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Zoning & Regulations */}
        <section className="section">
          <h2>Zoning & Regulations</h2>
          <div className="zoning-grid">
            <div className="zoning-item">
              <h4>Setbacks Required</h4>
              <ul>
                <li>Front: {specs.zoning.setbacks.front}m</li>
                <li>Rear: {specs.zoning.setbacks.rear}m</li>
                <li>Sides: {specs.zoning.setbacks.sides}m</li>
              </ul>
            </div>
            <div className="zoning-item">
              <h4>Restrictions</h4>
              <ul>
                <li>Max Height: {specs.zoning.heightRestrictions}m</li>
                <li>Floor Area Ratio: {specs.zoning.far}</li>
                <li>Site Coverage: {specs.zoning.coverage}%</li>
                <li>Parking Spaces: {specs.zoning.parkingRequirements}</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Design Requirements */}
        <section className="section">
          <h2>Design Requirements</h2>
          <div className="requirements-grid">
            <div className="requirement-category">
              <h4>Basic Layout</h4>
              <ul>
                <li>Bedrooms: {specs.requirements.bedrooms}</li>
                <li>Bathrooms: {specs.requirements.bathrooms}</li>
                <li>Floors: {specs.requirements.floors}</li>
                <li>Garage: {specs.requirements.garage ? '✓' : '✗'}</li>
                <li>Basement: {specs.requirements.basement ? '✓' : '✗'}</li>
                <li>Attic: {specs.requirements.attic ? '✓' : '✗'}</li>
              </ul>
            </div>
            <div className="requirement-category">
              <h4>Special Features</h4>
              <ul>
                {specs.requirements.specialRooms.map((room, index) => (
                  <li key={index}>{room}</li>
                ))}
              </ul>
            </div>
            <div className="requirement-category">
              <h4>Outdoor Spaces</h4>
              <ul>
                {specs.requirements.outdoorSpaces.map((space, index) => (
                  <li key={index}>{space}</li>
                ))}
              </ul>
            </div>
          </div>
          <div className="additional-requirements">
            <p><strong>Accessibility:</strong> {specs.requirements.accessibility ? 'Required' : 'Not Required'}</p>
            <p><strong>Energy Efficiency:</strong> {specs.requirements.energyEfficiency}</p>
          </div>
        </section>

        {/* Style & Aesthetics */}
        <section className="section">
          <h2>Style & Aesthetics</h2>
          <div className="style-section">
            <div className="style-item">
              <h4>Architectural Style</h4>
              <p>{specs.style.architectural}</p>
            </div>
            <div className="style-item">
              <h4>Interior Style</h4>
              <p>{specs.style.interior}</p>
            </div>
            <div className="style-item">
              <h4>Preferred Materials</h4>
              <div className="material-tags">
                {specs.style.materials.map((material, index) => (
                  <span key={index} className="tag">{material}</span>
                ))}
              </div>
            </div>
            <div className="style-item">
              <h4>Color Palette</h4>
              <div className="color-palette">
                {specs.style.colors.map((color, index) => (
                  <div key={index} className="color-swatch" style={{ backgroundColor: color }} title={color}></div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Lifestyle & Functionality */}
        <section className="section">
          <h2>Lifestyle & Functionality</h2>
          <div className="lifestyle-grid">
            <div className="lifestyle-item">
              <h4>Family Details</h4>
              <ul>
                <li>Family Size: {specs.lifestyle.familySize}</li>
                <li>Age Groups: {specs.lifestyle.ageGroups.join(', ')}</li>
                <li>Work From Home: {specs.lifestyle.workFromHome ? 'Yes' : 'No'}</li>
                <li>Entertaining: {specs.lifestyle.entertaining}</li>
                <li>Cooking: {specs.lifestyle.cooking}</li>
              </ul>
            </div>
            <div className="lifestyle-item">
              <h4>Hobbies & Interests</h4>
              <ul>
                {specs.lifestyle.hobbies.map((hobby, index) => (
                  <li key={index}>{hobby}</li>
                ))}
              </ul>
            </div>
            <div className="lifestyle-item">
              <h4>Pets</h4>
              <ul>
                {specs.lifestyle.pets.map((pet, index) => (
                  <li key={index}>{pet}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Sustainability & Technology */}
        <section className="section">
          <h2>Sustainability & Technology</h2>
          <div className="sustainability-grid">
            <div className="sustainability-item">
              <h4>Green Features</h4>
              <ul>
                <li className={specs.sustainability.solarPanels ? 'available' : 'unavailable'}>
                  Solar Panels: {specs.sustainability.solarPanels ? '✓' : '✗'}
                </li>
                <li className={specs.sustainability.rainwaterHarvesting ? 'available' : 'unavailable'}>
                  Rainwater Harvesting: {specs.sustainability.rainwaterHarvesting ? '✓' : '✗'}
                </li>
                <li className={specs.sustainability.greywaterSystem ? 'available' : 'unavailable'}>
                  Greywater System: {specs.sustainability.greywaterSystem ? '✓' : '✗'}
                </li>
                <li className={specs.sustainability.greenRoof ? 'available' : 'unavailable'}>
                  Green Roof: {specs.sustainability.greenRoof ? '✓' : '✗'}
                </li>
                <li className={specs.sustainability.geothermal ? 'available' : 'unavailable'}>
                  Geothermal: {specs.sustainability.geothermal ? '✓' : '✗'}
                </li>
              </ul>
            </div>
            <div className="sustainability-item">
              <h4>Smart Home Level</h4>
              <p className="highlight">{specs.sustainability.smartHome}</p>
            </div>
          </div>
        </section>

        {/* Vision & Priorities */}
        <section className="section">
          <h2>Vision & Priorities</h2>
          <div className="vision-section">
            <div className="vision-item">
              <h4>Project Vision</h4>
              <p>{specs.vision}</p>
            </div>
            <div className="vision-item">
              <h4>Practical Needs</h4>
              <p>{specs.practicalNeeds}</p>
            </div>
          </div>
          
          {specs.mustHaves.length > 0 && (
            <div className="priority-lists">
              <div className="priority-item">
                <h4>Must-Haves</h4>
                <ul>
                  {specs.mustHaves.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          
          {specs.niceToHaves.length > 0 && (
            <div className="priority-lists">
              <div className="priority-item">
                <h4>Nice-to-Haves</h4>
                <ul>
                  {specs.niceToHaves.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          
          {specs.absoluteNoGos.length > 0 && (
            <div className="priority-lists">
              <div className="priority-item no-go">
                <h4>Absolute No-Gos</h4>
                <ul>
                  {specs.absoluteNoGos.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* Concerns */}
        {specs.concerns.length > 0 && (
          <section className="section">
            <h2>Client Concerns</h2>
            <ul>
              {specs.concerns.map((concern, index) => (
                <li key={index}>{concern}</li>
              ))}
            </ul>
          </section>
        )}

        {/* AI Recommendations */}
        {specs.aiRecommendations && specs.aiRecommendations.length > 0 && (
          <section className="section recommendations">
            <h2>AI Architect Recommendations</h2>
            <ul>
              {specs.aiRecommendations.map((recommendation, index) => (
                <li key={index}>{recommendation}</li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <style jsx>{`
        .requirements-document {
          background: rgba(18, 18, 26, 0.9);
          backdrop-filter: blur(20px);
          border-radius: 24px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 2rem;
          max-width: 1000px;
          margin: 0 auto;
          color: white;
        }

        .document-header {
          text-align: center;
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1);
        }

        .document-header h1 {
          font-size: 2rem;
          font-weight: 800;
          margin-bottom: 1rem;
          background: linear-gradient(45deg, #6c63ff, #00d4aa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .document-meta {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1rem;
          text-align: left;
        }

        .document-meta p {
          margin: 0.25rem 0;
        }

        .section {
          margin-bottom: 2rem;
          padding-bottom: 2rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .section:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }

        .section h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 1.5rem;
          color: #6c63ff;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .summary-item {
          background: rgba(255, 255, 255, 0.02);
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .summary-item h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
          color: #00d4aa;
        }

        .highlight {
          font-size: 1.25rem;
          font-weight: 700;
          color: #6c63ff;
          margin: 0.5rem 0;
        }

        .detail {
          font-size: 0.9rem;
          color: #8888a0;
          margin: 0.25rem 0;
        }

        .info-grid, .zoning-grid, .requirements-grid, .lifestyle-grid, .sustainability-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .info-item, .zoning-item, .requirement-category, .lifestyle-item, .sustainability-item {
          background: rgba(255, 255, 255, 0.02);
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .info-item h4, .zoning-item h4, .requirement-category h4, .lifestyle-item h4, .sustainability-item h4 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: #00d4aa;
        }

        ul {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        li {
          margin: 0.5rem 0;
          padding-left: 1rem;
          position: relative;
        }

        li:before {
          content: '•';
          color: #6c63ff;
          position: absolute;
          left: 0;
        }

        .available {
          color: #00d4aa;
        }

        .unavailable {
          color: #ff6b6b;
        }

        .constraints, .additional-requirements, .vision-section, .priority-lists {
          background: rgba(255, 255, 255, 0.02);
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
          margin-top: 1.5rem;
        }

        .material-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .tag {
          background: rgba(108, 99, 255, 0.2);
          color: #6c63ff;
          padding: 0.25rem 0.75rem;
          border-radius: 16px;
          font-size: 0.85rem;
          font-weight: 500;
        }

        .color-palette {
          display: flex;
          gap: 0.5rem;
          margin-top: 0.5rem;
        }

        .color-swatch {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          border: 2px solid rgba(255, 255, 255, 0.2);
          cursor: pointer;
        }

        .style-section, .vision-section {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1.5rem;
        }

        .style-item, .vision-item {
          background: rgba(255, 255, 255, 0.02);
          padding: 1.5rem;
          border-radius: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .style-item h4, .vision-item h4 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: #00d4aa;
        }

        .recommendations {
          background: rgba(108, 99, 255, 0.1);
          border: 1px solid rgba(108, 99, 255, 0.2);
        }

        .recommendations h2 {
          color: #6c63ff;
        }

        .no-go {
          background: rgba(255, 107, 107, 0.1);
          border: 1px solid rgba(255, 107, 107, 0.2);
        }

        @media (max-width: 768px) {
          .requirements-document {
            padding: 1rem;
            margin: 1rem;
          }

          .summary-grid, .info-grid, .zoning-grid, .requirements-grid, .lifestyle-grid, .sustainability-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}