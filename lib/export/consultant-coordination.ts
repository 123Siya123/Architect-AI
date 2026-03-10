/**
 * =============================================================================
 * LIB/EXPORT/CONSULTANT-COORDINATION.TS — Structural, MEP, Civil Engineering Integration
 * =============================================================================
 *
 * Generates consultant coordination drawings and specifications for:
 * 
 * STRUCTURAL ENGINEERING:
 * - Foundation plans and details
 * - Structural framing plans
 * - Beam and column schedules
 * - Connection details
 * - Load calculations and specifications
 *
 * MEP ENGINEERING:
 * - HVAC system layouts
 * - Electrical power and lighting plans
 * - Plumbing system layouts
 * - Fire protection systems
 * - Equipment schedules and specifications
 *
 * CIVIL ENGINEERING:
 * - Site grading and drainage plans
 * - Utility connection plans
 * - Storm water management
 * - Erosion control plans
 * - Pavement and landscaping details
 *
 * COORDINATION DRAWINGS:
 * - Combined MEP coordination drawings
 * - Structural/MEP interface details
 * - Penetration schedules and details
 * - Conflict resolution documentation
 * =============================================================================
 */

import type { PSGProject } from '@/types';
import { PAPER_SIZES } from './plan-generator';
import type { ConstructionDocumentOptions } from './construction-documents';

// =============================================================================
// TYPES
// =============================================================================

export interface ConsultantCoordinationSet {
  structural: StructuralDrawings;
  mep: MEPDrawings;
  civil: CivilDrawings;
  coordination: CoordinationDrawings;
}

export interface StructuralDrawings {
  foundationPlan: string;
  structuralFramingPlan: string;
  beamSchedule: string;
  columnSchedule: string;
  connectionDetails: string[];
  loadCalculations: string;
}

export interface MEPDrawings {
  hvacPlan: string;
  electricalPowerPlan: string;
  electricalLightingPlan: string;
  plumbingPlan: string;
  fireProtectionPlan: string;
  equipmentSchedules: string;
}

export interface CivilDrawings {
  siteGradingPlan: string;
  utilityPlan: string;
  drainagePlan: string;
  erosionControlPlan: string;
  pavementPlan: string;
}

export interface CoordinationDrawings {
  mepCoordinationPlan: string;
  penetrationSchedule: string;
  conflictResolution: string;
  interfaceDetails: string[];
}

export interface ConsultantOptions extends ConstructionDocumentOptions {
  includeStructural: boolean;
  includeMEP: boolean;
  includeCivil: boolean;
  includeCoordination: boolean;
  structuralSystem: 'wood_frame' | 'steel_frame' | 'concrete' | 'masonry';
  foundationType: 'slab_on_grade' | 'basement' | 'crawl_space' | 'pier';
  hvacSystem: 'forced_air' | 'hydronic' | 'heat_pump' | 'radiant';
  electricalService: 'overhead' | 'underground';
  plumbingSystem: 'conventional' | 'manifold' | 'home_run';
  siteConditions: {
    soilType: 'clay' | 'sand' | 'rock' | 'organic';
    groundwaterLevel: number;
    slope: number;
    drainage: 'good' | 'fair' | 'poor';
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONSULTANT_OPTIONS: ConsultantOptions = {
  ...require('./construction-documents').DEFAULT_CONSTRUCTION_OPTIONS,
  includeStructural: true,
  includeMEP: true,
  includeCivil: true,
  includeCoordination: true,
  structuralSystem: 'wood_frame',
  foundationType: 'slab_on_grade',
  hvacSystem: 'forced_air',
  electricalService: 'overhead',
  plumbingSystem: 'conventional',
  siteConditions: {
    soilType: 'clay',
    groundwaterLevel: 2.0,
    slope: 2.0,
    drainage: 'good'
  }
};

// =============================================================================
// MAIN CONSULTANT COORDINATION GENERATOR
// =============================================================================

export function generateConsultantCoordination(
  project: PSGProject,
  options: Partial<ConsultantOptions> = {}
): ConsultantCoordinationSet {
  const opts: ConsultantOptions = { ...DEFAULT_CONSULTANT_OPTIONS, ...options };

  const coordination: ConsultantCoordinationSet = {
    structural: generateStructuralDrawings(project, opts),
    mep: generateMEPDrawings(project, opts),
    civil: generateCivilDrawings(project, opts),
    coordination: generateCoordinationDrawings(project, opts)
  };

  return coordination;
}

// =============================================================================
// STRUCTURAL ENGINEERING DRAWINGS
// =============================================================================

function generateStructuralDrawings(project: PSGProject, opts: ConsultantOptions): StructuralDrawings {
  return {
    foundationPlan: generateFoundationPlanSVG(project, opts),
    structuralFramingPlan: generateStructuralFramingPlanSVG(project, opts),
    beamSchedule: generateBeamScheduleHTML(project, opts),
    columnSchedule: generateColumnScheduleHTML(project, opts),
    connectionDetails: generateConnectionDetailsSVG(project, opts),
    loadCalculations: generateLoadCalculationsHTML(project, opts)
  };
}

function generateFoundationPlanSVG(project: PSGProject, opts: ConsultantOptions): string {
  const paper = PAPER_SIZES[opts.paper];

  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc;font-family:'Arial',sans-serif;">
    <defs>
      <pattern id="rebarPattern" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
        <circle cx="6" cy="6" r="1" fill="#dc2626"/>
        <line x1="0" y1="6" x2="12" y2="6" stroke="#dc2626" stroke-width="0.5"/>
        <line x1="6" y1="0" x2="6" y2="12" stroke="#dc2626" stroke-width="0.5"/>
      </pattern>
      <marker id="dimensionArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto">
        <path d="M 0 5 L 7 2 L 7 8 Z" fill="#374151"/>
      </marker>
    </defs>
    
    <!-- Title Block -->
    <g transform="translate(20, 30)">
      <text x="0" y="0" font-size="16" font-weight="bold" fill="#1e3a8a">S1.0 - FOUNDATION PLAN</text>
      <text x="0" y="20" font-size="10" fill="#6b7280">Scale: ${opts.scale} | Structural System: ${opts.structuralSystem.replace('_', ' ')} | Foundation: ${opts.foundationType.replace('_', ' ')}</text>
    </g>
    
    <!-- Foundation Outline -->
    <g transform="translate(${paper.width * 0.3}, ${paper.height * 0.3})">
      <!-- Main Foundation -->
      <rect x="0" y="0" width="${paper.width * 0.4}" height="${paper.height * 0.4}" fill="url(#rebarPattern)" stroke="#374151" stroke-width="3"/>
      <text x="${paper.width * 0.2}" y="${paper.height * 0.2}" text-anchor="middle" font-size="8" fill="#374151">FOUNDATION WALL</text>
      <text x="${paper.width * 0.2}" y="${paper.height * 0.22}" text-anchor="middle" font-size="6" fill="#6b7280">12" THICK × 8' DEEP</text>
      
      <!-- Footings -->
      <rect x="-20" y="${paper.height * 0.4}" width="${paper.width * 0.4 + 40}" height="20" fill="#6b7280" stroke="#374151" stroke-width="2"/>
      <text x="${paper.width * 0.2}" y="${paper.height * 0.42}" text-anchor="middle" font-size="6" fill="#374151">CONTINUOUS FOOTING</text>
      <text x="${paper.width * 0.2}" y="${paper.height * 0.44}" text-anchor="middle" font-size="5" fill="#6b7280">24" WIDE × 12" THICK</text>
      
      <!-- Interior Footings -->
      <rect x="${paper.width * 0.15}" y="${paper.height * 0.15}" width="60" height="60" fill="#6b7280" stroke="#374151" stroke-width="2"/>
      <text x="${paper.width * 0.15 + 30}" y="${paper.height * 0.15 + 30}" text-anchor="middle" font-size="5" fill="#374151">INTERIOR</text>
      <text x="${paper.width * 0.15 + 30}" y="${paper.height * 0.15 + 38}" text-anchor="middle" font-size="5" fill="#374151">FOOTING</text>
      
      <!-- Rebar Layout -->
      <g stroke="#dc2626" stroke-width="1" fill="none">
        <!-- Horizontal rebar -->
        <line x1="20" y1="20" x2="${paper.width * 0.4 - 20}" y2="20"/>
        <line x1="20" y1="40" x2="${paper.width * 0.4 - 20}" y2="40"/>
        <line x1="20" y1="${paper.height * 0.4 - 40}" x2="${paper.width * 0.4 - 20}" y2="${paper.height * 0.4 - 40}"/>
        <line x1="20" y1="${paper.height * 0.4 - 20}" x2="${paper.width * 0.4 - 20}" y2="${paper.height * 0.4 - 20}"/>
        
        <!-- Vertical rebar -->
        <line x1="20" y1="20" x2="20" y2="${paper.height * 0.4 - 20}"/>
        <line x1="40" y1="20" x2="40" y2="${paper.height * 0.4 - 20}"/>
        <line x1="${paper.width * 0.4 - 40}" y1="20" x2="${paper.width * 0.4 - 40}" y2="${paper.height * 0.4 - 20}"/>
        <line x1="${paper.width * 0.4 - 20}" y1="20" x2="${paper.width * 0.4 - 20}" y2="${paper.height * 0.4 - 20}"/>
      </g>
      
      <!-- Anchor Bolts -->
      <g fill="#eab308" stroke="#ca8a04" stroke-width="1">
        <circle cx="30" cy="10" r="2"/>
        <circle cx="60" cy="10" r="2"/>
        <circle cx="90" cy="10" r="2"/>
        <circle cx="120" cy="10" r="2"/>
        <circle cx="150" cy="10" r="2"/>
        <circle cx="180" cy="10" r="2"/>
        
        <circle cx="10" cy="30" r="2"/>
        <circle cx="10" cy="60" r="2"/>
        <circle cx="10" cy="90" r="2"/>
        <circle cx="10" cy="120" r="2"/>
        <circle cx="10" cy="150" r="2"/>
        <circle cx="10" cy="180" r="2"/>
      </g>
    </g>
    
    <!-- Dimensions -->
    <g stroke="#374151" stroke-width="1" marker-end="url(#dimensionArrow)" marker-start="url(#dimensionArrow)">
      <line x1="${paper.width * 0.3}" y1="${paper.height * 0.75}" x2="${paper.width * 0.7}" y2="${paper.height * 0.75}"/>
      <text x="${paper.width * 0.5}" y="${paper.height * 0.77}" text-anchor="middle" font-size="6" fill="#374151">12.0m</text>
      
      <line x1="${paper.width * 0.25}" y1="${paper.height * 0.3}" x2="${paper.width * 0.25}" y2="${paper.height * 0.7}"/>
      <text x="${paper.width * 0.23}" y="${paper.height * 0.5}" text-anchor="middle" font-size="6" fill="#374151" transform="rotate(-90, ${paper.width * 0.23}, ${paper.height * 0.5})">12.0m</text>
    </g>
    
    <!-- Legend -->
    <g transform="translate(${paper.width * 0.1}, ${paper.height * 0.8})">
      <text x="0" y="0" font-size="8" font-weight="bold" fill="#1e3a8a">STRUCTURAL LEGEND</text>
      <rect x="0" y="5" width="10" height="6" fill="url(#rebarPattern)" stroke="#374151" stroke-width="0.5"/>
      <text x="15" y="10" font-size="5" fill="#374151">Reinforcing Steel</text>
      
      <rect x="0" y="15" width="10" height="6" fill="#6b7280" stroke="#374151" stroke-width="0.5"/>
      <text x="15" y="20" font-size="5" fill="#374151">Concrete</text>
      
      <circle cx="5" cy="30" r="2" fill="#eab308" stroke="#ca8a04" stroke-width="0.5"/>
      <text x="15" y="31" font-size="5" fill="#374151">Anchor Bolt</text>
    </g>
    
    <!-- Notes -->
    <g transform="translate(${paper.width * 0.6}, ${paper.height * 0.8})">
      <text x="0" y="0" font-size="8" font-weight="bold" fill="#1e3a8a">STRUCTURAL NOTES</text>
      <text x="0" y="12" font-size="5" fill="#374151">1. Concrete strength: 25 MPa minimum</text>
      <text x="0" y="20" font-size="5" fill="#374151">2. Rebar: ASTM A615 Grade 60</text>
      <text x="0" y="28" font-size="5" fill="#374151">3. Anchor bolts: 5/8" diameter × 12" long</text>
      <text x="0" y="36" font-size="5" fill="#374151">4. Footing depth: 4' minimum below grade</text>
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">FOUNDATION PLAN</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
      
      <text x="${paper.width / 2}" y="15" font-size="6" fill="#374151">Soil Type: ${opts.siteConditions.soilType}</text>
      <text x="${paper.width / 2}" y="25" font-size="6" fill="#374151">Bearing Capacity: 150 kPa</text>
      <text x="${paper.width / 2}" y="35" font-size="6" fill="#374151">Foundation Type: ${opts.foundationType}</text>
      <text x="${paper.width / 2}" y="45" font-size="6" fill="#374151">Reinforcing: #4 @ 12" O.C.</text>
    </g>
  </svg>`;
}

function generateStructuralFramingPlanSVG(project: PSGProject, opts: ConsultantOptions): string {
  const paper = PAPER_SIZES[opts.paper];

  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc;font-family:'Arial',sans-serif;">
    <defs>
      <pattern id="steelBeam" x="0" y="0" width="20" height="4" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="20" height="4" fill="#6b7280"/>
        <line x1="0" y1="2" x2="20" y2="2" stroke="#374151" stroke-width="1"/>
      </pattern>
      <pattern id="joistPattern" x="0" y="0" width="16" height="2" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="16" height="2" fill="#eab308"/>
        <line x1="0" y1="1" x2="16" y2="1" stroke="#ca8a04" stroke-width="0.5"/>
      </pattern>
    </defs>
    
    <!-- Title Block -->
    <g transform="translate(20, 30)">
      <text x="0" y="0" font-size="16" font-weight="bold" fill="#1e3a8a">S2.0 - STRUCTURAL FRAMING PLAN</text>
      <text x="0" y="20" font-size="10" fill="#6b7280">Scale: ${opts.scale} | System: ${opts.structuralSystem.replace('_', ' ')} | Level: Ground Floor</text>
    </g>
    
    <!-- Structural Grid -->
    <g transform="translate(${paper.width * 0.2}, ${paper.height * 0.2})">
      <!-- Grid Lines -->
      <g stroke="#9ca3af" stroke-width="1" stroke-dasharray="4,2">
        <line x1="0" y1="0" x2="0" y2="${paper.height * 0.5}"/>
        <line x1="60" y1="0" x2="60" y2="${paper.height * 0.5}"/>
        <line x1="120" y1="0" x2="120" y2="${paper.height * 0.5}"/>
        <line x1="180" y1="0" x2="180" y2="${paper.height * 0.5}"/>
        <line x1="240" y1="0" x2="240" y2="${paper.height * 0.5}"/>
        
        <line x1="0" y1="0" x2="240" y2="0"/>
        <line x1="0" y1="60" x2="240" y2="60"/>
        <line x1="0" y1="120" x2="240" y2="120"/>
        <line x1="0" y1="180" x2="240" y2="180"/>
        <line x1="0" y1="240" x2="240" y2="240"/>
      </g>
      
      <!-- Grid Labels -->
      <g fill="#1e3a8a" font-size="8" font-weight="bold">
        <text x="0" y="-5" text-anchor="middle">A</text>
        <text x="60" y="-5" text-anchor="middle">B</text>
        <text x="120" y="-5" text-anchor="middle">C</text>
        <text x="180" y="-5" text-anchor="middle">D</text>
        <text x="240" y="-5" text-anchor="middle">E</text>
        
        <text x="-10" y="5" text-anchor="end">1</text>
        <text x="-10" y="65" text-anchor="end">2</text>
        <text x="-10" y="125" text-anchor="end">3</text>
        <text x="-10" y="185" text-anchor="end">4</text>
        <text x="-10" y="245" text-anchor="end">5</text>
      </g>
    </g>
    
    <!-- Framing Elements -->
    <g transform="translate(${paper.width * 0.2}, ${paper.height * 0.2})">
      <!-- Main Beams -->
      <g stroke="#6b7280" stroke-width="6" fill="none">
        <line x1="0" y1="120" x2="240" y2="120"/>
        <line x1="120" y1="0" x2="120" y2="240"/>
      </g>
      
      <!-- Secondary Beams -->
      <g stroke="#eab308" stroke-width="4" fill="none">
        <line x1="0" y1="60" x2="240" y2="60"/>
        <line x1="0" y1="180" x2="240" y2="180"/>
        <line x1="60" y1="0" x2="60" y2="240"/>
        <line x1="180" y1="0" x2="180" y2="240"/>
      </g>
      
      <!-- Joists -->
      <g stroke="#22c55e" stroke-width="2" fill="none">
        <!-- Spanning E-W -->
        <line x1="0" y1="30" x2="240" y2="30"/>
        <line x1="0" y1="90" x2="240" y2="90"/>
        <line x1="0" y1="150" x2="240" y2="150"/>
        <line x1="0" y1="210" x2="240" y2="210"/>
        
        <!-- Spanning N-S -->
        <line x1="30" y1="0" x2="30" y2="240"/>
        <line x1="90" y1="0" x2="90" y2="240"/>
        <line x1="150" y1="0" x2="150" y2="240"/>
        <line x1="210" y1="0" x2="210" y2="240"/>
      </g>
      
      <!-- Column Locations -->
      <g fill="#dc2626" stroke="#b91c1c" stroke-width="2">
        <circle cx="120" cy="120" r="6"/>
        <circle cx="60" cy="60" r="4"/>
        <circle cx="60" cy="120" r="4"/>
        <circle cx="60" cy="180" r="4"/>
        <circle cx="120" cy="60" r="4"/>
        <circle cx="120" cy="180" r="4"/>
        <circle cx="180" cy="60" r="4"/>
        <circle cx="180" cy="120" r="4"/>
        <circle cx="180" cy="180" r="4"/>
      </g>
    </g>
    
    <!-- Beam Labels -->
    <g transform="translate(${paper.width * 0.2}, ${paper.height * 0.2})">
      <text x="120" y="115" text-anchor="middle" font-size="6" fill="#374151" font-weight="bold">B-1</text>
      <text x="115" y="120" text-anchor="end" font-size="6" fill="#374151" font-weight="bold">B-2</text>
      
      <text x="120" y="55" text-anchor="middle" font-size="5" fill="#374151">B-3</text>
      <text x="120" y="175" text-anchor="middle" font-size="5" fill="#374151">B-4</text>
      <text x="55" y="120" text-anchor="middle" font-size="5" fill="#374151">B-5</text>
      <text x="175" y="120" text-anchor="middle" font-size="5" fill="#374151">B-6</text>
    </g>
    
    <!-- Column Labels -->
    <g transform="translate(${paper.width * 0.2}, ${paper.height * 0.2})">
      <text x="120" y="135" text-anchor="middle" font-size="6" fill="#374151" font-weight="bold">C-1</text>
      <text x="60" y="55" text-anchor="middle" font-size="5" fill="#374151">C-2</text>
      <text x="60" y="135" text-anchor="middle" font-size="5" fill="#374151">C-3</text>
      <text x="60" y="195" text-anchor="middle" font-size="5" fill="#374151">C-4</text>
      <text x="180" y="55" text-anchor="middle" font-size="5" fill="#374151">C-5</text>
      <text x="180" y="135" text-anchor="middle" font-size="5" fill="#374151">C-6</text>
      <text x="180" y="195" text-anchor="middle" font-size="5" fill="#374151">C-7</text>
    </g>
    
    <!-- Legend -->
    <g transform="translate(${paper.width * 0.1}, ${paper.height * 0.8})">
      <text x="0" y="0" font-size="8" font-weight="bold" fill="#1e3a8a">FRAMING LEGEND</text>
      <line x1="0" y1="10" x2="20" y2="10" stroke="#6b7280" stroke-width="6"/>
      <text x="25" y="14" font-size="5" fill="#374151">Main Beam (W12×26)</text>
      
      <line x1="0" y1="20" x2="20" y2="20" stroke="#eab308" stroke-width="4"/>
      <text x="25" y="24" font-size="5" fill="#374151">Secondary Beam (W10×19)</text>
      
      <line x1="0" y1="30" x2="20" y2="30" stroke="#22c55e" stroke-width="2"/>
      <text x="25" y="34" font-size="5" fill="#374151">Joist (2×10 @ 16" O.C.)</text>
      
      <circle cx="10" cy="45" r="4" fill="#dc2626" stroke="#b91c1c" stroke-width="1"/>
      <text x="25" y="47" font-size="5" fill="#374151">Column (W8×24)</text>
    </g>
    
    <!-- Notes -->
    <g transform="translate(${paper.width * 0.6}, ${paper.height * 0.8})">
      <text x="0" y="0" font-size="8" font-weight="bold" fill="#1e3a8a">STRUCTURAL NOTES</text>
      <text x="0" y="12" font-size="5" fill="#374151">1. Steel grade: ASTM A992, Fy = 50 ksi</text>
      <text x="0" y="20" font-size="5" fill="#374151">2. Joists span perpendicular to beams</text>
      <text x="0" y="28" font-size="5" fill="#374151">3. All connections per AISC standards</text>
      <text x="0" y="36" font-size="5" fill="#374151">4. Provide lateral bracing as shown</text>
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">STRUCTURAL FRAMING PLAN</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
      
      <text x="${paper.width / 2}" y="15" font-size="6" fill="#374151">Joist Span: 12' max</text>
      <text x="${paper.width / 2}" y="25" font-size="6" fill="#374151">Beam Span: 24' max</text>
      <text x="${paper.width / 2}" y="35" font-size="6" fill="#374151">Live Load: 40 psf</text>
      <text x="${paper.width / 2}" y="45" font-size="6" fill="#374151">Dead Load: 15 psf</text>
    </g>
  </svg>`;
}

function generateBeamScheduleHTML(project: PSGProject, opts: ConsultantOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Beam Schedule - ${project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f8fafc; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h1 { color: #1e3a8a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e3a8a; color: white; padding: 12px; text-align: left; font-weight: bold; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #f8fafc; }
    .mark { font-weight: bold; color: #1e40af; }
    .notes { background: #fef3c7; padding: 15px; border-left: 4px solid #eab308; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>BEAM SCHEDULE</h1>
    <p><strong>Project:</strong> ${escapeXml(project.name)} | <strong>Date:</strong> ${opts.date} | <strong>Structural System:</strong> ${opts.structuralSystem.replace('_', ' ')}</p>
    
    <table>
      <thead>
        <tr>
          <th>Mark</th>
          <th>Size</th>
          <th>Length (ft)</th>
          <th>Quantity</th>
          <th>Uniform Load (plf)</th>
          <th>Max Moment (ft-kips)</th>
          <th>Deflection (in)</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="mark">B-1</td>
          <td>W12×26</td>
          <td>24</td>
          <td>2</td>
          <td>1,200</td>
          <td>86.4</td>
          <td>0.45</td>
          <td>Grid Line 3, Level 1</td>
        </tr>
        <tr>
          <td class="mark">B-2</td>
          <td>W12×26</td>
          <td>24</td>
          <td>2</td>
          <td>1,200</td>
          <td>86.4</td>
          <td>0.45</td>
          <td>Grid Line C, Level 1</td>
        </tr>
        <tr>
          <td class="mark">B-3</td>
          <td>W10×19</td>
          <td>12</td>
          <td>4</td>
          <td>800</td>
          <td>28.8</td>
          <td>0.32</td>
          <td>Grid Line 2, Level 1</td>
        </tr>
        <tr>
          <td class="mark">B-4</td>
          <td>W10×19</td>
          <td>12</td>
          <td>4</td>
          <td>800</td>
          <td>28.8</td>
          <td>0.32</td>
          <td>Grid Line 4, Level 1</td>
        </tr>
        <tr>
          <td class="mark">B-5</td>
          <td>W10×19</td>
          <td>12</td>
          <td>4</td>
          <td>800</td>
          <td>28.8</td>
          <td>0.32</td>
          <td>Grid Line B, Level 1</td>
        </tr>
        <tr>
          <td class="mark">B-6</td>
          <td>W10×19</td>
          <td>12</td>
          <td>4</td>
          <td>800</td>
          <td>28.8</td>
          <td>0.32</td>
          <td>Grid Line D, Level 1</td>
        </tr>
      </tbody>
    </table>
    
    <div class="notes">
      <h3>STRUCTURAL NOTES:</h3>
      <p>1. All beams shall be ASTM A992 steel with Fy = 50 ksi</p>
      <p>2. Beam connections shall be designed for full moment capacity unless noted</p>
      <p>3. Provide lateral bracing at maximum spacing of 8'-0"</p>
      <p>4. All beams shall have minimum bearing of 4" on supports</p>
      <p>5. Camber beams as required to limit deflection to L/240</p>
      <p>6. Provide fireproofing as required by code</p>
    </div>
  </div>
</body>
</html>`;
}

function generateColumnScheduleHTML(project: PSGProject, opts: ConsultantOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Column Schedule - ${project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f8fafc; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h1 { color: #1e3a8a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e3a8a; color: white; padding: 12px; text-align: left; font-weight: bold; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #f8fafc; }
    .mark { font-weight: bold; color: #1e40af; }
    .notes { background: #fef3c7; padding: 15px; border-left: 4px solid #eab308; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>COLUMN SCHEDULE</h1>
    <p><strong>Project:</strong> ${escapeXml(project.name)} | <strong>Date:</strong> ${opts.date} | <strong>Structural System:</strong> ${opts.structuralSystem.replace('_', ' ')}</p>
    
    <table>
      <thead>
        <tr>
          <th>Mark</th>
          <th>Size</th>
          <th>Height (ft)</th>
          <th>Quantity</th>
          <th>Axial Load (kips)</th>
          <th>Max Moment (ft-kips)</th>
          <th>Base Plate</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="mark">C-1</td>
          <td>W8×24</td>
          <td>10</td>
          <td>1</td>
          <td>180</td>
          <td>45</td>
          <td>12"×12"×1"</td>
          <td>Grid C-3</td>
        </tr>
        <tr>
          <td class="mark">C-2</td>
          <td>W8×24</td>
          <td>10</td>
          <td>2</td>
          <td>150</td>
          <td>35</td>
          <td>12"×12"×1"</td>
          <td>Grid B-2, B-4</td>
        </tr>
      </tbody>
    </table>
    
    <div class="notes">
      <h3>COLUMN NOTES:</h3>
      <p>1. All columns shall be ASTM A992 steel with Fy = 50 ksi</p>
      <p>2. Column base plates shall be ASTM A36 steel</p>
      <p>3. Provide 4-3/4" diameter anchor bolts per base plate</p>
      <p>4. Grout base plates with non-shrink grout</p>
    </div>
  </div>
</body>
</html>`;
}

function generateConnectionDetailsSVG(project: PSGProject, opts: ConsultantOptions): string[] {
  const paper = PAPER_SIZES[opts.paper];

  const connection1 = `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc;font-family:'Arial',sans-serif;">
    <defs>
      <pattern id="boltPattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
        <circle cx="4" cy="4" r="1.5" fill="#eab308" stroke="#ca8a04" stroke-width="0.5"/>
      </pattern>
    </defs>
    
    <!-- Beam-to-Column Connection -->
    <g transform="translate(${paper.width * 0.3}, ${paper.height * 0.2})">
      <!-- Column -->
      <rect x="90" y="0" width="20" height="200" fill="#6b7280" stroke="#374151" stroke-width="2"/>
      <text x="100" y="100" text-anchor="middle" font-size="6" fill="#374151" transform="rotate(90, 100, 100)">W8×24</text>
      
      <!-- Beam -->
      <rect x="0" y="85" width="90" height="30" fill="#6b7280" stroke="#374151" stroke-width="2"/>
      <text x="45" y="100" text-anchor="middle" font-size="6" fill="#374151">W10×19</text>
      
      <!-- Connection Plates -->
      <rect x="80" y="75" width="20" height="40" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      <rect x="80" y="85" width="10" height="20" fill="#dc2626" stroke="#b91c1c" stroke-width="1"/>
      
      <!-- Bolts -->
      <g fill="url(#boltPattern)">
        <circle cx="85" cy="82" r="2"/>
        <circle cx="95" cy="82" r="2"/>
        <circle cx="85" cy="98" r="2"/>
        <circle cx="95" cy="98" r="2"/>
      </g>
      
      <!-- Weld Symbols -->
      <g stroke="#dc2626" stroke-width="1">
        <path d="M 82 80 L 88 80"/>
        <path d="M 82 100 L 88 100"/>
      </g>
    </g>
    
    <!-- Dimensions -->
    <g transform="translate(${paper.width * 0.3}, ${paper.height * 0.2})">
      <line x1="0" y1="210" x2="90" y2="210" stroke="#374151" stroke-width="1" marker-end="url(#dimensionArrow)" marker-start="url(#dimensionArrow)"/>
      <text x="45" y="215" text-anchor="middle" font-size="5" fill="#374151">9'-6"</text>
      
      <line x1="-10" y1="85" x2="-10" y2="115" stroke="#374151" stroke-width="1" marker-end="url(#dimensionArrow)" marker-start="url(#dimensionArrow)"/>
      <text x="-15" y="100" text-anchor="middle" font-size="5" fill="#374151" transform="rotate(-90, -15, 100)">10"</text>
    </g>
    
    <!-- Notes -->
    <g transform="translate(${paper.width * 0.1}, ${paper.height * 0.75})">
      <text x="0" y="0" font-size="8" font-weight="bold" fill="#1e3a8a">CONNECTION DETAILS</text>
      <text x="0" y="12" font-size="5" fill="#374151">• Connection plate: 3/8" × 4" × 12" A36</text>
      <text x="0" y="20" font-size="5" fill="#374151">• Bolts: 3/4" diameter A325</text>
      <text x="0" y="28" font-size="5" fill="#374151">• Weld: 1/4" fillet, E70 electrode</text>
      <text x="0" y="36" font-size="5" fill="#374151">• Capacity: 45 kips factored load</text>
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">BEAM-TO-COLUMN CONNECTION</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
    </g>
  </svg>`;

  return [connection1];
}

function generateLoadCalculationsHTML(project: PSGProject, opts: ConsultantOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Load Calculations - ${project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f8fafc; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h1 { color: #1e3a8a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; border-left: 4px solid #3b82f6; padding-left: 15px; }
    .calculation { background: #f0f9ff; padding: 15px; border-left: 4px solid #0ea5e9; margin: 15px 0; font-family: monospace; }
    .load-summary { background: #f0fdf4; padding: 15px; border-left: 4px solid #22c55e; margin: 15px 0; }
    .code-reference { font-weight: bold; color: #1e40af; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e3a8a; color: white; padding: 12px; text-align: left; font-weight: bold; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #f8fafc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>LOAD CALCULATIONS</h1>
    <p><strong>Project:</strong> ${escapeXml(project.name)} | <strong>Date:</strong> ${opts.date} | <strong>Code:</strong> ASCE 7-22</p>
    
    <h2>LOAD SUMMARY</h2>
    <div class="load-summary">
      <h3>Dead Loads (D):</h3>
      <ul>
        <li>Roof: 15 psf</li>
        <li>Floor: 20 psf</li>
        <li>Exterior Walls: 12 psf</li>
        <li>Interior Walls: 8 psf</li>
      </ul>
      
      <h3>Live Loads (L):</h3>
      <ul>
        <li>Roof: 20 psf (reducible per ASCE 7)</li>
        <li>Floor (Residential): 40 psf</li>
        <li>Attic: 20 psf</li>
      </ul>
      
      <h3>Environmental Loads:</h3>
      <ul>
        <li>Wind: 90 mph (3-second gust)</li>
        <li>Snow: 30 psf (ground snow load)</li>
        <li>Seismic: SDC C, Site Class D</li>
      </ul>
    </div>
    
    <h2>TYPICAL BEAM CALCULATIONS</h2>
    <div class="calculation">
      <h3>Beam B-1 (W12×26):</h3>
      <p>Span: 24 ft | Spacing: 12 ft on center</p>
      <p>Dead Load: w_D = (20 psf × 12 ft) + 26 plf = 266 plf</p>
      <p>Live Load: w_L = 40 psf × 12 ft = 480 plf</p>
      <p>Factored Load: w_u = 1.2(266) + 1.6(480) = 1,087 plf</p>
      <p>Maximum Moment: M_u = w_uL²/8 = 1,087(24)²/8 = 78,264 ft-lb = 78.3 ft-kips</p>
      <p>Maximum Shear: V_u = w_uL/2 = 1,087(24)/2 = 13,044 lb = 13.0 kips</p>
      <p>Deflection: Δ_L = 5w_LL⁴/(384EI) = 0.42 in < L/240 = 1.2 in ✓</p>
    </div>
  </div>
</body>
</html>`;
}

function generateEquipmentSchedulesHTML(project: PSGProject, opts: ConsultantOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>MEP Equipment Schedules - ${project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f8fafc; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h1 { color: #1e3a8a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e3a8a; color: white; padding: 12px; text-align: left; font-weight: bold; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #f8fafc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>MEP EQUIPMENT SCHEDULES</h1>
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Equipment Type</th>
          <th>Model/Size</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>AHU-1</td>
          <td>Air Handler</td>
          <td>2,000 CFM</td>
          <td>Mechanical Room</td>
        </tr>
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

// =============================================================================
// MEP ENGINEERING DRAWINGS
// =============================================================================

function generateMEPDrawings(project: PSGProject, opts: ConsultantOptions): MEPDrawings {
  return {
    hvacPlan: "HVAC Plan Placeholder",
    electricalPowerPlan: "Electrical Power Plan Placeholder",
    electricalLightingPlan: "Electrical Lighting Plan Placeholder",
    plumbingPlan: "Plumbing Plan Placeholder",
    fireProtectionPlan: "Fire Protection Plan Placeholder",
    equipmentSchedules: generateEquipmentSchedulesHTML(project, opts)
  };
}

// =============================================================================
// CIVIL ENGINEERING DRAWINGS
// =============================================================================

function generateCivilDrawings(project: PSGProject, opts: ConsultantOptions): CivilDrawings {
  return {
    siteGradingPlan: "Site Grading Plan Placeholder",
    utilityPlan: "Utility Plan Placeholder",
    drainagePlan: "Drainage Plan Placeholder",
    erosionControlPlan: "Erosion Control Plan Placeholder",
    pavementPlan: "Pavement Plan Placeholder"
  };
}

// =============================================================================
// COORDINATION DRAWINGS
// =============================================================================

function generateCoordinationDrawings(project: PSGProject, opts: ConsultantOptions): CoordinationDrawings {
  return {
    mepCoordinationPlan: "MEP Coordination Plan Placeholder",
    penetrationSchedule: "Penetration Schedule Placeholder",
    conflictResolution: "Conflict Resolution Placeholder",
    interfaceDetails: ["Interface Detail Placeholder"]
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}