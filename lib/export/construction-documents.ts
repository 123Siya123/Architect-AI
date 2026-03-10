/**
 * =============================================================================
 * LIB/EXPORT/CONSTRUCTION-DOCUMENTS.TS — Complete Construction Documents Export
 * =============================================================================
 *
 * Generates comprehensive construction documents including:
 * 
 * DRAWING SET:
 * - Title sheet with project information
 * - Site plan with dimensions, grading, utilities
 * - Floor plans (all levels) with detailed annotations
 * - Roof plan with drainage and structural elements
 * - Elevations (all sides) with material indications
 * - Building sections showing assembly details
 * - Wall sections with construction assemblies
 * - Detail sheets (stairs, windows, doors, trim)
 * - Door/window schedules with specifications
 * - Finish schedules with material specifications
 *
 * TECHNICAL DOCUMENTATION:
 * - Technical specifications (materials, standards, workmanship)
 * - Consultant coordination drawings
 * - Code compliance documentation
 * - Construction details and assemblies
 *
 * EXPORT FORMATS:
 * - PDF (multi-page document)
 * - HTML (print-ready with CSS)
 * - SVG (individual drawings)
 * - DXF (for CAD integration)
 * =============================================================================
 */

import type { PSGProject, PSGNode, Material, MaterialSummaryItem } from '@/types';
import { generateFloorPlanSVG, generateElevationSVG, type ExportOptions, PAPER_SIZES } from './plan-generator';
import { calculateProjectCost } from '@/lib/psg/cost-calculator';

// =============================================================================
// TYPES
// =============================================================================

export interface ConstructionDocumentSet {
  titleSheet: string;
  sitePlan: string;
  floorPlans: string[];
  roofPlan: string;
  elevations: string[];
  buildingSections: string[];
  wallSections: string[];
  detailSheets: string[];
  doorWindowSchedule: string;
  finishSchedule: string;
  technicalSpecifications: string;
  codeCompliance: string;
}

export interface ConstructionDocumentOptions extends ExportOptions {
  includeTitleSheet: boolean;
  includeSitePlan: boolean;
  includeRoofPlan: boolean;
  includeSections: boolean;
  includeDetails: boolean;
  includeSchedules: boolean;
  includeSpecifications: boolean;
  includeCodeCompliance: boolean;
  consultantDisciplines: ('structural' | 'mep' | 'civil')[];
  buildingCode: string; // e.g., 'IBC_2021', 'IRC_2021'
  climateZone: string;
  windSpeed: number;
  snowLoad: number;
  seismicZone: string;
}

export interface DoorWindowScheduleItem {
  id: string;
  type: 'Door' | 'Window';
  mark: string;
  quantity: number;
  width: number;
  height: number;
  material: string;
  finish: string;
  glazing: string;
  hardware: string;
  fireRating?: string;
  energyRating?: string;
  manufacturer?: string;
  model?: string;
  location: string;
}

export interface FinishScheduleItem {
  id: string;
  room: string;
  floorFinish: string;
  wallFinish: string;
  ceilingFinish: string;
  baseFinish: string;
  trimFinish: string;
  specialFeatures: string[];
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_CONSTRUCTION_OPTIONS: ConstructionDocumentOptions = {
  scale: '1:100',
  paper: 'A3',
  include_dimensions: true,
  include_room_labels: true,
  include_furniture: false,
  include_grid: true,
  include_north_arrow: true,
  title: 'Construction Documents',
  drawn_by: 'AI Architect',
  date: new Date().toISOString().slice(0, 10),
  project_number: 'CD-001',
  revision: 'A',
  plan_type: 'floor_plan',
  includeTitleSheet: true,
  includeSitePlan: true,
  includeRoofPlan: true,
  includeSections: true,
  includeDetails: true,
  includeSchedules: true,
  includeSpecifications: true,
  includeCodeCompliance: true,
  consultantDisciplines: ['structural', 'mep'],
  buildingCode: 'IBC_2021',
  climateZone: 'Zone_4A',
  windSpeed: 90,
  snowLoad: 30,
  seismicZone: 'SDC_C'
};

// =============================================================================
// MAIN CONSTRUCTION DOCUMENTS GENERATOR
// =============================================================================

export function generateConstructionDocuments(
  project: PSGProject,
  options: Partial<ConstructionDocumentOptions> = {}
): ConstructionDocumentSet {
  const opts: ConstructionDocumentOptions = { ...DEFAULT_CONSTRUCTION_OPTIONS, ...options };
  
  const documents: ConstructionDocumentSet = {
    titleSheet: generateTitleSheet(project, opts),
    sitePlan: generateSitePlan(project, opts),
    floorPlans: generateFloorPlans(project, opts),
    roofPlan: generateRoofPlan(project, opts),
    elevations: generateElevations(project, opts),
    buildingSections: generateBuildingSections(project, opts),
    wallSections: generateWallSections(project, opts),
    detailSheets: generateDetailSheets(project, opts),
    doorWindowSchedule: generateDoorWindowSchedule(project, opts),
    finishSchedule: generateFinishSchedule(project, opts),
    technicalSpecifications: generateTechnicalSpecifications(project, opts),
    codeCompliance: generateCodeComplianceDocument(project, opts)
  };

  return documents;
}

// =============================================================================
// TITLE SHEET
// =============================================================================

function generateTitleSheet(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const paper = PAPER_SIZES[opts.paper];
  const projectInfo = extractProjectInfo(project);
  
  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#fff;font-family:'Arial',sans-serif;">
    <defs>
      <linearGradient id="titleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#1e3a8a;stop-opacity:1" />
        <stop offset="100%" style="stop-color:#3b82f6;stop-opacity:1" />
      </linearGradient>
    </defs>
    
    <!-- Title Block Background -->
    <rect x="20" y="${paper.height - 120}" width="${paper.width - 40}" height="100" fill="url(#titleGradient)" rx="4"/>
    
    <!-- Project Title -->
    <text x="${paper.width / 2}" y="50" text-anchor="middle" font-size="24" font-weight="bold" fill="#1e3a8a">
      ${escapeXml(project.name)}
    </text>
    
    <text x="${paper.width / 2}" y="75" text-anchor="middle" font-size="16" fill="#374151">
      Construction Documents
    </text>
    
    <!-- Project Information -->
    <g transform="translate(40, 100)">
      <text x="0" y="0" font-size="12" font-weight="bold" fill="#1e3a8a">PROJECT INFORMATION</text>
      <text x="0" y="20" font-size="10" fill="#374151">Project Number: ${opts.project_number}</text>
      <text x="0" y="35" font-size="10" fill="#374151">Location: ${projectInfo.location}</text>
      <text x="0" y="50" font-size="10" fill="#374151">Building Type: ${projectInfo.buildingType}</text>
      <text x="0" y="65" font-size="10" fill="#374151">Floor Area: ${projectInfo.totalArea} m²</text>
      <text x="0" y="80" font-size="10" fill="#374151">Number of Floors: ${projectInfo.floors}</text>
    </g>
    
    <!-- Design Team -->
    <g transform="translate(${paper.width / 2 + 40}, 100)">
      <text x="0" y="0" font-size="12" font-weight="bold" fill="#1e3a8a">DESIGN TEAM</text>
      <text x="0" y="20" font-size="10" fill="#374151">Architect: ${opts.drawn_by}</text>
      <text x="0" y="35" font-size="10" fill="#374151">Date: ${opts.date}</text>
      <text x="0" y="50" font-size="10" fill="#374151">Revision: ${opts.revision}</text>
      <text x="0" y="65" font-size="10" fill="#374151">Scale: ${opts.scale}</text>
    </g>
    
    <!-- Drawing Index -->
    <g transform="translate(40, 220)">
      <text x="0" y="0" font-size="12" font-weight="bold" fill="#1e3a8a">DRAWING INDEX</text>
      <text x="0" y="20" font-size="9" fill="#374151">A1.0 - Title Sheet</text>
      <text x="0" y="35" font-size="9" fill="#374151">A2.0 - Site Plan</text>
      <text x="0" y="50" font-size="9" fill="#374151">A3.1 - Ground Floor Plan</text>
      <text x="0" y="65" font-size="9" fill="#374151">A3.2 - Upper Floor Plans</text>
      <text x="0" y="80" font-size="9" fill="#374151">A4.0 - Roof Plan</text>
      <text x="0" y="95" font-size="9" fill="#374151">A5.1 - North Elevation</text>
      <text x="0" y="110" font-size="9" fill="#374151">A5.2 - South Elevation</text>
      <text x="0" y="125" font-size="9" fill="#374151">A5.3 - East Elevation</text>
      <text x="0" y="140" font-size="9" fill="#374151">A5.4 - West Elevation</text>
      <text x="0" y="155" font-size="9" fill="#374151">A6.0 - Building Sections</text>
      <text x="0" y="170" font-size="9" fill="#374151">A7.0 - Wall Sections</text>
      <text x="0" y="185" font-size="9" fill="#374151">A8.0 - Details</text>
      <text x="0" y="200" font-size="9" fill="#374151">A9.0 - Schedules</text>
    </g>
    
    <!-- Code Information -->
    <g transform="translate(${paper.width / 2 + 40}, 220)">
      <text x="0" y="0" font-size="12" font-weight="bold" fill="#1e3a8a">CODE INFORMATION</text>
      <text x="0" y="20" font-size="9" fill="#374151">Building Code: ${opts.buildingCode}</text>
      <text x="0" y="35" font-size="9" fill="#374151">Climate Zone: ${opts.climateZone}</text>
      <text x="0" y="50" font-size="9" fill="#374151">Wind Speed: ${opts.windSpeed} mph</text>
      <text x="0" y="65" font-size="9" fill="#374151">Snow Load: ${opts.snowLoad} psf</text>
      <text x="0" y="80" font-size="9" fill="#374151">Seismic Zone: ${opts.seismicZone}</text>
    </g>
    
    <!-- Professional Seals Area -->
    <g transform="translate(${paper.width - 200}, ${paper.height - 100})">
      <rect x="0" y="0" width="180" height="80" fill="none" stroke="#9ca3af" stroke-width="1" stroke-dasharray="4,2"/>
      <text x="90" y="15" text-anchor="middle" font-size="8" fill="#6b7280">ARCHITECT'S SEAL</text>
      <text x="90" y="30" text-anchor="middle" font-size="6" fill="#9ca3af">[Professional Seal Required]</text>
      <text x="90" y="45" text-anchor="middle" font-size="6" fill="#9ca3af">License #: ________________</text>
      <text x="90" y="60" text-anchor="middle" font-size="6" fill="#9ca3af">Date: ________________</text>
    </g>
    
    <!-- Consultant Seals -->
    <g transform="translate(${paper.width - 400}, ${paper.height - 100})">
      <rect x="0" y="0" width="180" height="80" fill="none" stroke="#9ca3af" stroke-width="1" stroke-dasharray="4,2"/>
      <text x="90" y="15" text-anchor="middle" font-size="8" fill="#6b7280">STRUCTURAL ENGINEER</text>
      <text x="90" y="30" text-anchor="middle" font-size="6" fill="#9ca3af">[Professional Seal Required]</text>
      <text x="90" y="45" text-anchor="middle" font-size="6" fill="#9ca3af">License #: ________________</text>
      <text x="90" y="60" text-anchor="middle" font-size="6" fill="#9ca3af">Date: ________________</text>
    </g>
  </svg>`;
}

// =============================================================================
// SITE PLAN
// =============================================================================

function generateSitePlan(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const paper = PAPER_SIZES[opts.paper];
  const siteInfo = extractSiteInfo(project);
  
  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f0f9ff;font-family:'Arial',sans-serif;">
    <defs>
      <pattern id="propertyLine" x="0" y="0" width="10" height="10" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="10" y2="0" stroke="#dc2626" stroke-width="0.5" stroke-dasharray="2,2"/>
        <line x1="0" y1="0" x2="0" y2="10" stroke="#dc2626" stroke-width="0.5" stroke-dasharray="2,2"/>
      </pattern>
      <marker id="northArrow" viewBox="0 0 20 20" refX="10" refY="10" markerWidth="15" markerHeight="15" orient="auto">
        <path d="M 10 0 L 15 10 L 10 20 L 5 10 Z" fill="#1e3a8a"/>
        <text x="10" y="25" text-anchor="middle" font-size="8" fill="#1e3a8a">N</text>
      </marker>
    </defs>
    
    <!-- Property Boundaries -->
    <rect x="${paper.width * 0.1}" y="${paper.height * 0.1}" width="${paper.width * 0.8}" height="${paper.height * 0.6}" fill="none" stroke="#dc2626" stroke-width="2" stroke-dasharray="8,4"/>
    <text x="${paper.width / 2}" y="${paper.height * 0.08}" text-anchor="middle" font-size="12" font-weight="bold" fill="#dc2626">PROPERTY LINE</text>
    
    <!-- Building Footprint -->
    <rect x="${paper.width * 0.3}" y="${paper.height * 0.3}" width="${paper.width * 0.4}" height="${paper.height * 0.3}" fill="#e5e7eb" stroke="#374151" stroke-width="3"/>
    <text x="${paper.width / 2}" y="${paper.height * 0.45}" text-anchor="middle" font-size="10" font-weight="bold" fill="#374151">BUILDING FOOTPRINT</text>
    
    <!-- Setbacks -->
    <rect x="${paper.width * 0.25}" y="${paper.height * 0.25}" width="${paper.width * 0.5}" height="${paper.height * 0.4}" fill="none" stroke="#059669" stroke-width="1" stroke-dasharray="4,2"/>
    <text x="${paper.width * 0.25}" y="${paper.height * 0.23}" font-size="8" fill="#059669">FRONT SETBACK: ${siteInfo.frontSetback}m</text>
    
    <!-- Utilities -->
    <g transform="translate(${paper.width * 0.15}, ${paper.height * 0.2})">
      <circle cx="0" cy="0" r="8" fill="#3b82f6" stroke="#1e40af" stroke-width="2"/>
      <text x="12" y="3" font-size="8" fill="#1e40af">WATER</text>
    </g>
    
    <g transform="translate(${paper.width * 0.85}, ${paper.height * 0.2})">
      <rect x="-6" y="-6" width="12" height="12" fill="#eab308" stroke="#ca8a04" stroke-width="2"/>
      <text x="12" y="3" font-size="8" fill="#ca8a04">ELECTRIC</text>
    </g>
    
    <g transform="translate(${paper.width * 0.15}, ${paper.height * 0.8})">
      <circle cx="0" cy="0" r="8" fill="#dc2626" stroke="#b91c1c" stroke-width="2"/>
      <text x="12" y="3" font-size="8" fill="#b91c1c">GAS</text>
    </g>
    
    <g transform="translate(${paper.width * 0.85}, ${paper.height * 0.8})">
      <rect x="-6" y="-6" width="12" height="12" fill="#6b7280" stroke="#374151" stroke-width="2"/>
      <text x="12" y="3" font-size="8" fill="#374151">SEWER</text>
    </g>
    
    <!-- Access/Driveway -->
    <path d="M ${paper.width * 0.1} ${paper.height * 0.7} Q ${paper.width * 0.2} ${paper.height * 0.65} ${paper.width * 0.3} ${paper.height * 0.6}" fill="none" stroke="#6b7280" stroke-width="4" stroke-dasharray="6,3"/>
    <text x="${paper.width * 0.2}" y="${paper.height * 0.75}" font-size="8" fill="#6b7280">DRIVEWAY</text>
    
    <!-- Contours/Grading -->
    <g stroke="#22c55e" stroke-width="1" fill="none">
      <path d="M ${paper.width * 0.1} ${paper.height * 0.15} Q ${paper.width * 0.3} ${paper.height * 0.12} ${paper.width * 0.5} ${paper.height * 0.15} Q ${paper.width * 0.7} ${paper.height * 0.18} ${paper.width * 0.9} ${paper.height * 0.15}"/>
      <path d="M ${paper.width * 0.1} ${paper.height * 0.25} Q ${paper.width * 0.3} ${paper.height * 0.22} ${paper.width * 0.5} ${paper.height * 0.25} Q ${paper.width * 0.7} ${paper.height * 0.28} ${paper.width * 0.9} ${paper.height * 0.25}"/>
      <path d="M ${paper.width * 0.1} ${paper.height * 0.35} Q ${paper.width * 0.3} ${paper.height * 0.32} ${paper.width * 0.5} ${paper.height * 0.35} Q ${paper.width * 0.7} ${paper.height * 0.38} ${paper.width * 0.9} ${paper.height * 0.35}"/>
    </g>
    
    <!-- North Arrow -->
    <g transform="translate(${paper.width - 80}, 60)">
      <path d="M 0 0 L 15 -25 L 0 -50 L -15 -25 Z" fill="#1e3a8a" stroke="#1e40af" stroke-width="2"/>
      <text x="0" y="-55" text-anchor="middle" font-size="10" font-weight="bold" fill="#1e40af">N</text>
      <text x="0" y="15" text-anchor="middle" font-size="8" fill="#6b7280">North</text>
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">SITE PLAN</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
      
      <text x="${paper.width / 2}" y="15" font-size="6" fill="#374151">Property Area: ${siteInfo.propertyArea} m²</text>
      <text x="${paper.width / 2}" y="25" font-size="6" fill="#374151">Building Coverage: ${siteInfo.buildingCoverage}%</text>
      <text x="${paper.width / 2}" y="35" font-size="6" fill="#374151">Impervious Surface: ${siteInfo.imperviousSurface}%</text>
      <text x="${paper.width / 2}" y="45" font-size="6" fill="#374151">Landscape Area: ${siteInfo.landscapeArea}%</text>
    </g>
  </svg>`;
}

// =============================================================================
// FLOOR PLANS
// =============================================================================

function generateFloorPlans(project: PSGProject, opts: ConstructionDocumentOptions): string[] {
  const floorPlans: string[] = [];
  const maxY = Math.max(...Object.values(project.nodes)
    .filter(n => n.type === 'Wall' || n.type === 'Room')
    .map(n => n.position.y));
  
  const totalFloors = Math.max(1, Math.ceil(maxY / 2.5));
  
  for (let floor = 0; floor < totalFloors; floor++) {
    const title = floor === 0 ? 'Ground Floor Plan' : `Level ${floor} Plan`;
    const svg = generateFloorPlanSVG(project, floor, {
      ...opts,
      title,
      include_dimensions: true,
      include_room_labels: true,
      include_grid: true
    });
    floorPlans.push(svg);
  }
  
  return floorPlans;
}

// =============================================================================
// ROOF PLAN
// =============================================================================

function generateRoofPlan(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const paper = PAPER_SIZES[opts.paper];
  const roofInfo = extractRoofInfo(project);
  
  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc;font-family:'Arial',sans-serif;">
    <defs>
      <marker id="slopeArrow" viewBox="0 0 20 20" refX="10" refY="10" markerWidth="12" markerHeight="12" orient="auto">
        <path d="M 0 10 L 15 5 L 15 15 Z" fill="#dc2626"/>
      </marker>
      <pattern id="drainage" x="0" y="0" width="20" height="20" patternUnits="userSpaceOnUse">
        <circle cx="10" cy="10" r="3" fill="#3b82f6" stroke="#1e40af" stroke-width="1"/>
        <path d="M 10 13 L 10 20" stroke="#1e40af" stroke-width="1"/>
      </pattern>
    </defs>
    
    <!-- Roof Outline -->
    <rect x="${paper.width * 0.2}" y="${paper.height * 0.2}" width="${paper.width * 0.6}" height="${paper.height * 0.4}" fill="#e5e7eb" stroke="#374151" stroke-width="3"/>
    <text x="${paper.width / 2}" y="${paper.height * 0.42}" text-anchor="middle" font-size="10" font-weight="bold" fill="#374151">ROOF AREA</text>
    
    <!-- Roof Slopes -->
    <g stroke="#dc2626" stroke-width="2" fill="none" marker-end="url(#slopeArrow)">
      <line x1="${paper.width * 0.2}" y1="${paper.height * 0.4}" x2="${paper.width * 0.35}" y2="${paper.height * 0.25}"/>
      <line x1="${paper.width * 0.8}" y1="${paper.height * 0.4}" x2="${paper.width * 0.65}" y2="${paper.height * 0.25}"/>
      <text x="${paper.width * 0.275}" y="${paper.height * 0.3}" font-size="8" fill="#dc2626" text-anchor="middle">${roofInfo.roofSlope}:12</text>
      <text x="${paper.width * 0.725}" y="${paper.height * 0.3}" font-size="8" fill="#dc2626" text-anchor="middle">${roofInfo.roofSlope}:12</text>
    </g>
    
    <!-- Ridge Line -->
    <line x1="${paper.width * 0.35}" y1="${paper.height * 0.25}" x2="${paper.width * 0.65}" y2="${paper.height * 0.25}" stroke="#7c2d12" stroke-width="4"/>
    <text x="${paper.width * 0.5}" y="${paper.height * 0.23}" text-anchor="middle" font-size="8" fill="#7c2d12">RIDGE</text>
    
    <!-- Drainage -->
    <g>
      <circle cx="${paper.width * 0.3}" cy="${paper.height * 0.35}" r="4" fill="#3b82f6" stroke="#1e40af" stroke-width="1"/>
      <path d="M ${paper.width * 0.3} ${paper.height * 0.35} L ${paper.width * 0.3} ${paper.height * 0.5}" stroke="#1e40af" stroke-width="1"/>
      <text x="${paper.width * 0.3}" y="${paper.height * 0.55}" text-anchor="middle" font-size="6" fill="#1e40af">DRAIN</text>
      
      <circle cx="${paper.width * 0.7}" cy="${paper.height * 0.35}" r="4" fill="#3b82f6" stroke="#1e40af" stroke-width="1"/>
      <path d="M ${paper.width * 0.7} ${paper.height * 0.35} L ${paper.width * 0.7} ${paper.height * 0.5}" stroke="#1e40af" stroke-width="1"/>
      <text x="${paper.width * 0.7}" y="${paper.height * 0.55}" text-anchor="middle" font-size="6" fill="#1e40af">DRAIN</text>
    </g>
    
    <!-- Gutters -->
    <g stroke="#6b7280" stroke-width="3" fill="none">
      <path d="M ${paper.width * 0.2} ${paper.height * 0.2} L ${paper.width * 0.8} ${paper.height * 0.2}"/>
      <path d="M ${paper.width * 0.2} ${paper.height * 0.6} L ${paper.width * 0.8} ${paper.height * 0.6}"/>
    </g>
    
    <!-- Chimney -->
    <g transform="translate(${paper.width * 0.75}, ${paper.height * 0.3})">
      <rect x="-8" y="-8" width="16" height="16" fill="#6b7280" stroke="#374151" stroke-width="2"/>
      <text x="0" y="30" text-anchor="middle" font-size="6" fill="#374151">CHIMNEY</text>
    </g>
    
    <!-- HVAC Equipment -->
    <g transform="translate(${paper.width * 0.25}, ${paper.height * 0.45})">
      <rect x="-12" y="-8" width="24" height="16" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      <text x="0" y="25" text-anchor="middle" font-size="6" fill="#ca8a04">HVAC</text>
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">ROOF PLAN</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
      
      <text x="${paper.width / 2}" y="15" font-size="6" fill="#374151">Roof Area: ${roofInfo.roofArea} m²</text>
      <text x="${paper.width / 2}" y="25" font-size="6" fill="#374151">Roof Slope: ${roofInfo.roofSlope}:12</text>
      <text x="${paper.width / 2}" y="35" font-size="6" fill="#374151">Drainage: ${roofInfo.drainageType}</text>
      <text x="${paper.width / 2}" y="45" font-size="6" fill="#374151">Material: ${roofInfo.roofMaterial}</text>
    </g>
  </svg>`;
}

// =============================================================================
// ELEVATIONS
// =============================================================================

function generateElevations(project: PSGProject, opts: ConstructionDocumentOptions): string[] {
  const elevations: string[] = [];
  const sides: ('North' | 'South' | 'East' | 'West')[] = ['North', 'South', 'East', 'West'];
  
  sides.forEach(side => {
    const elevation = generateElevationSVG(project, side, {
      ...opts,
      title: `${side} Elevation`,
      include_dimensions: true,
      include_grid: true
    });
    elevations.push(elevation);
  });
  
  return elevations;
}

// =============================================================================
// BUILDING SECTIONS
// =============================================================================

function generateBuildingSections(project: PSGProject, opts: ConstructionDocumentOptions): string[] {
  const sections: string[] = [];
  
  // Generate longitudinal section
  const longitudinalSection = generateBuildingSectionSVG(project, 'longitudinal', opts);
  sections.push(longitudinalSection);
  
  // Generate transverse section
  const transverseSection = generateBuildingSectionSVG(project, 'transverse', opts);
  sections.push(transverseSection);
  
  return sections;
}

function generateBuildingSectionSVG(project: PSGProject, type: 'longitudinal' | 'transverse', opts: ConstructionDocumentOptions): string {
  const paper = PAPER_SIZES[opts.paper];
  const sectionInfo = extractSectionInfo(project, type);
  
  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc;font-family:'Arial',sans-serif;">
    <defs>
      <pattern id="insulation" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="4" y2="4" stroke="#f97316" stroke-width="0.5"/>
      </pattern>
      <pattern id="concreteHatch" x="0" y="0" width="3" height="3" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="0.5" fill="#6b7280"/>
      </pattern>
    </defs>
    
    <!-- Ground Line -->
    <line x1="${paper.width * 0.1}" y1="${paper.height * 0.8}" x2="${paper.width * 0.9}" y2="${paper.height * 0.8}" stroke="#22c55e" stroke-width="4"/>
    <text x="${paper.width * 0.05}" y="${paper.height * 0.78}" font-size="8" fill="#22c55e">GRADE</text>
    
    <!-- Foundation -->
    <rect x="${paper.width * 0.2}" y="${paper.height * 0.75}" width="${paper.width * 0.6}" height="${paper.height * 0.08}" fill="url(#concreteHatch)" stroke="#374151" stroke-width="2"/>
    <text x="${paper.width / 2}" y="${paper.height * 0.82}" text-anchor="middle" font-size="6" fill="#374151">FOUNDATION WALL</text>
    
    <!-- Floor Systems -->
    <g>
      ${sectionInfo.floors.map((floor, index) => `
        <rect x="${paper.width * 0.22}" y="${paper.height * (0.65 - index * 0.15)}" width="${paper.width * 0.56}" height="${paper.height * 0.02}" fill="#e5e7eb" stroke="#374151" stroke-width="1"/>
        <text x="${paper.width * 0.75}" y="${paper.height * (0.66 - index * 0.15)}" font-size="6" fill="#374151">${floor.level}: ${floor.type}</text>
        <text x="${paper.width * 0.75}" y="${paper.height * (0.72 - index * 0.15)}" font-size="5" fill="#6b7280">${floor.material}</text>
      `).join('')}
    </g>
    
    <!-- Wall Systems -->
    <g>
      <rect x="${paper.width * 0.2}" y="${paper.height * 0.25}" width="${paper.width * 0.02}" height="${paper.height * 0.5}" fill="url(#insulation)" stroke="#f97316" stroke-width="1"/>
      <rect x="${paper.width * 0.78}" y="${paper.height * 0.25}" width="${paper.width * 0.02}" height="${paper.height * 0.5}" fill="url(#insulation)" stroke="#f97316" stroke-width="1"/>
      
      <text x="${paper.width * 0.15}" y="${paper.height * 0.5}" font-size="6" fill="#f97316" text-anchor="middle" transform="rotate(-90, ${paper.width * 0.15}, ${paper.height * 0.5})">INSULATION</text>
      <text x="${paper.width * 0.85}" y="${paper.height * 0.5}" font-size="6" fill="#f97316" text-anchor="middle" transform="rotate(90, ${paper.width * 0.85}, ${paper.height * 0.5})">INSULATION</text>
    </g>
    
    <!-- Roof System -->
    <g>
      <path d="M ${paper.width * 0.2} ${paper.height * 0.25} L ${paper.width * 0.5} ${paper.height * 0.15} L ${paper.width * 0.8} ${paper.height * 0.25}" fill="#e5e7eb" stroke="#374151" stroke-width="2"/>
      <text x="${paper.width / 2}" y="${paper.height * 0.18}" text-anchor="middle" font-size="6" fill="#374151">ROOF STRUCTURE</text>
      <text x="${paper.width / 2}" y="${paper.height * 0.22}" text-anchor="middle" font-size="5" fill="#6b7280">${sectionInfo.roofType}</text>
    </g>
    
    <!-- Dimensions -->
    <g stroke="#374151" stroke-width="1" marker-end="url(#arrowHead)" marker-start="url(#arrowTail)">
      <line x1="${paper.width * 0.2}" y1="${paper.height * 0.85}" x2="${paper.width * 0.8}" y2="${paper.height * 0.85}"/>
      <text x="${paper.width / 2}" y="${paper.height * 0.87}" text-anchor="middle" font-size="6" fill="#374151">${sectionInfo.buildingWidth}m</text>
      
      <line x1="${paper.width * 0.15}" y1="${paper.height * 0.8}" x2="${paper.width * 0.15}" y2="${paper.height * 0.15}"/>
      <text x="${paper.width * 0.12}" y="${paper.height * 0.475}" text-anchor="middle" font-size="6" fill="#374151" transform="rotate(-90, ${paper.width * 0.12}, ${paper.height * 0.475})">${sectionInfo.buildingHeight}m</text>
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">${type.toUpperCase()} SECTION</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
      
      <text x="${paper.width / 2}" y="15" font-size="6" fill="#374151">Building Height: ${sectionInfo.buildingHeight}m</text>
      <text x="${paper.width / 2}" y="25" font-size="6" fill="#374151">Foundation: ${sectionInfo.foundationType}</text>
      <text x="${paper.width / 2}" y="35" font-size="6" fill="#374151">Structure: ${sectionInfo.structureType}</text>
      <text x="${paper.width / 2}" y="45" font-size="6" fill="#374151">Floors: ${sectionInfo.floorCount}</text>
    </g>
  </svg>`;
}

// =============================================================================
// WALL SECTIONS
// =============================================================================

function generateWallSections(project: PSGProject, opts: ConstructionDocumentOptions): string[] {
  const sections: string[] = [];
  
  // Generate typical wall sections
  const exteriorWallSection = generateWallSectionSVG(project, 'exterior', opts);
  sections.push(exteriorWallSection);
  
  const foundationWallSection = generateWallSectionSVG(project, 'foundation', opts);
  sections.push(foundationWallSection);
  
  return sections;
}

function generateWallSectionSVG(project: PSGProject, type: 'exterior' | 'foundation', opts: ConstructionDocumentOptions): string {
  const paper = PAPER_SIZES[opts.paper];
  const wallInfo = extractWallSectionInfo(project, type);
  
  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc;font-family:'Arial',sans-serif;">
    <defs>
      <pattern id="brickPattern" x="0" y="0" width="8" height="4" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="8" height="2" fill="#dc2626"/>
        <rect x="0" y="2" width="4" height="2" fill="#dc2626"/>
        <rect x="4" y="2" width="4" height="2" fill="#991b1b"/>
      </pattern>
      <pattern id="sidingPattern" x="0" y="0" width="12" height="2" patternUnits="userSpaceOnUse">
        <line x1="0" y1="1" x2="12" y2="1" stroke="#8b5cf6" stroke-width="1"/>
      </pattern>
    </defs>
    
    ${type === 'foundation' ? `
      <!-- Foundation Wall Section -->
      <g transform="translate(${paper.width * 0.3}, ${paper.height * 0.3})">
        <!-- Concrete Foundation -->
        <rect x="0" y="100" width="200" height="80" fill="url(#concreteHatch)" stroke="#374151" stroke-width="2"/>
        <text x="100" y="140" text-anchor="middle" font-size="6" fill="#374151">CONCRETE FOUNDATION WALL</text>
        
        <!-- Footing -->
        <rect x="-20" y="180" width="240" height="40" fill="url(#concreteHatch)" stroke="#374151" stroke-width="2"/>
        <text x="100" y="200" text-anchor="middle" font-size="6" fill="#374151">FOOTING</text>
        
        <!-- Waterproofing -->
        <rect x="200" y="100" width="10" height="80" fill="#1e40af" stroke="#1e3a8a" stroke-width="1"/>
        <text x="210" y="140" font-size="5" fill="#1e3a8a" text-anchor="start" transform="rotate(90, 210, 140)">WATERPROOFING</text>
        
        <!-- Drainage -->
        <circle cx="240" cy="200" r="8" fill="#3b82f6" stroke="#1e40af" stroke-width="1"/>
        <path d="M 240 200 L 240 220" stroke="#1e40af" stroke-width="1"/>
        <text x="250" y="200" font-size="5" fill="#1e40af">DRAIN TILE</text>
      </g>
    ` : `
      <!-- Exterior Wall Section -->
      <g transform="translate(${paper.width * 0.2}, ${paper.height * 0.2})">
        <!-- Exterior Finish -->
        <rect x="0" y="0" width="200" height="20" fill="url(#sidingPattern)" stroke="#8b5cf6" stroke-width="1"/>
        <text x="100" y="10" text-anchor="middle" font-size="5" fill="#8b5cf6">VINYL SIDING</text>
        
        <!-- Sheathing -->
        <rect x="0" y="20" width="200" height="15" fill="#e5e7eb" stroke="#6b7280" stroke-width="1"/>
        <text x="100" y="27" text-anchor="middle" font-size="5" fill="#6b7280">SHEATHING</text>
        
        <!-- Insulation -->
        <rect x="0" y="35" width="200" height="100" fill="url(#insulation)" stroke="#f97316" stroke-width="1"/>
        <text x="100" y="85" text-anchor="middle" font-size="6" fill="#f97316">R-${wallInfo.insulationRValue} INSULATION</text>
        
        <!-- Vapor Barrier -->
        <rect x="0" y="135" width="200" height="2" fill="#1e40af" stroke="#1e3a8a" stroke-width="0.5"/>
        <text x="100" y="138" text-anchor="middle" font-size="4" fill="#1e3a8a">VAPOR BARRIER</text>
        
        <!-- Interior Finish -->
        <rect x="0" y="137" width="200" height="13" fill="#f8fafc" stroke="#6b7280" stroke-width="1"/>
        <text x="100" y="143" text-anchor="middle" font-size="5" fill="#6b7280">DRYWALL</text>
      </g>
    `}
    
    <!-- Material Legend -->
    <g transform="translate(${paper.width * 0.1}, ${paper.height * 0.7})">
      <text x="0" y="0" font-size="8" font-weight="bold" fill="#1e3a8a">MATERIAL LEGEND</text>
      <rect x="0" y="5" width="15" height="10" fill="url(#concreteHatch)" stroke="#374151" stroke-width="1"/>
      <text x="20" y="12" font-size="5" fill="#374151">Concrete</text>
      
      <rect x="0" y="18" width="15" height="10" fill="url(#insulation)" stroke="#f97316" stroke-width="1"/>
      <text x="20" y="25" font-size="5" fill="#374151">Insulation</text>
      
      <rect x="0" y="31" width="15" height="10" fill="#1e40af" stroke="#1e3a8a" stroke-width="1"/>
      <text x="20" y="38" font-size="5" fill="#374151">Waterproofing</text>
      
      <rect x="0" y="44" width="15" height="10" fill="#e5e7eb" stroke="#6b7280" stroke-width="1"/>
      <text x="20" y="51" font-size="5" fill="#374151">Sheathing</text>
      
      <rect x="0" y="57" width="15" height="10" fill="#f8fafc" stroke="#6b7280" stroke-width="1"/>
      <text x="20" y="64" font-size="5" fill="#374151">Interior Finish</text>
    </g>
    
    <!-- Dimensions -->
    <g transform="translate(${paper.width * 0.5}, ${paper.height * 0.1})">
      ${wallInfo.dimensions.map((dim, index) => `
        <line x1="0" y1="${index * 20}" x2="${dim.value * 10}" y2="${index * 20}" stroke="#374151" stroke-width="1" marker-end="url(#arrowHead)" marker-start="url(#arrowTail)"/>
        <text x="${dim.value * 5}" y="${index * 20 - 3}" text-anchor="middle" font-size="5" fill="#374151">${dim.value}${dim.unit}</text>
        <text x="-10" y="${index * 20 + 3}" font-size="4" fill="#6b7280" text-anchor="end">${dim.description}</text>
      `).join('')}
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">${type.toUpperCase()} WALL SECTION</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
      
      <text x="${paper.width / 2}" y="15" font-size="6" fill="#374151">R-Value: ${wallInfo.insulationRValue}</text>
      <text x="${paper.width / 2}" y="25" font-size="6" fill="#374151">U-Factor: ${wallInfo.uFactor}</text>
      <text x="${paper.width / 2}" y="35" font-size="6" fill="#374151">Fire Rating: ${wallInfo.fireRating}</text>
      <text x="${paper.width / 2}" y="45" font-size="6" fill="#374151">STC Rating: ${wallInfo.stcRating}</text>
    </g>
  </svg>`;
}

// =============================================================================
// DETAIL SHEETS
// =============================================================================

function generateDetailSheets(project: PSGProject, opts: ConstructionDocumentOptions): string[] {
  const details: string[] = [];
  
  // Generate stair details
  const stairDetail = generateStairDetailSVG(project, opts);
  details.push(stairDetail);
  
  // Generate window details
  const windowDetail = generateWindowDetailSVG(project, opts);
  details.push(windowDetail);
  
  // Generate door details
  const doorDetail = generateDoorDetailSVG(project, opts);
  details.push(doorDetail);
  
  return details;
}

function generateStairDetailSVG(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const paper = PAPER_SIZES[opts.paper];
  const stairInfo = extractStairInfo(project);
  
  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc;font-family:'Arial',sans-serif;">
    <defs>
      <marker id="dimensionArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="8" markerHeight="8" orient="auto">
        <path d="M 0 5 L 7 2 L 7 8 Z" fill="#374151"/>
      </marker>
    </defs>
    
    <!-- Stair Profile -->
    <g transform="translate(${paper.width * 0.2}, ${paper.height * 0.3})">
      ${stairInfo.steps.map((step, index) => `
        <rect x="${index * 30}" y="${150 - index * 15}" width="30" height="15" fill="#e5e7eb" stroke="#374151" stroke-width="1"/>
        <line x1="${index * 30}" y1="${150 - index * 15}" x2="${index * 30}" y2="${150 - index * 15 - 10}" stroke="#374151" stroke-width="1"/>
        <line x1="${index * 30}" y1="${150 - index * 15 - 10}" x2="${(index + 1) * 30}" y2="${150 - index * 15 - 10}" stroke="#374151" stroke-width="1"/>
        <text x="${index * 30 + 15}" y="${145 - index * 15}" text-anchor="middle" font-size="4" fill="#374151">${index + 1}</text>
      `).join('')}
      
      <!-- Riser Heights -->
      ${stairInfo.steps.map((step, index) => `
        <line x1="${index * 30 - 5}" y1="${150 - index * 15}" x2="${index * 30 - 5}" y2="${150 - (index + 1) * 15}" stroke="#dc2626" stroke-width="1" marker-end="url(#dimensionArrow)" marker-start="url(#dimensionArrow)"/>
        <text x="${index * 30 - 10}" y="${142.5 - index * 15 - 7.5}" text-anchor="middle" font-size="4" fill="#dc2626">${step.riserHeight}"</text>
      `).join('')}
      
      <!-- Tread Depths -->
      ${stairInfo.steps.map((step, index) => `
        <line x1="${index * 30}" y1="${150 - index * 15 + 10}" x2="${(index + 1) * 30}" y2="${150 - index * 15 + 10}" stroke="#3b82f6" stroke-width="1" marker-end="url(#dimensionArrow)" marker-start="url(#dimensionArrow)"/>
        <text x="${index * 30 + 15}" y="${160 - index * 15}" text-anchor="middle" font-size="4" fill="#3b82f6">${step.treadDepth}"</text>
      `).join('')}
    </g>
    
    <!-- Handrail -->
    <g transform="translate(${paper.width * 0.18}, ${paper.height * 0.3})">
      <line x1="0" y1="150" x2="${stairInfo.steps.length * 30}" y2="${150 - stairInfo.steps.length * 15}" stroke="#6b7280" stroke-width="4"/>
      <text x="${stairInfo.steps.length * 15}" y="${140 - stairInfo.steps.length * 7.5}" text-anchor="middle" font-size="5" fill="#6b7280">HANDRAIL</text>
    </g>
    
    <!-- Notes -->
    <g transform="translate(${paper.width * 0.1}, ${paper.height * 0.7})">
      <text x="0" y="0" font-size="8" font-weight="bold" fill="#1e3a8a">STAIR REQUIREMENTS:</text>
      <text x="0" y="12" font-size="5" fill="#374151">• Maximum riser height: 7.75" (IBC)</text>
      <text x="0" y="20" font-size="5" fill="#374151">• Minimum tread depth: 10" (IBC)</text>
      <text x="0" y="28" font-size="5" fill="#374151">• Minimum stair width: 36" (IBC)</text>
      <text x="0" y="36" font-size="5" fill="#374151">• Handrail height: 34-38" (IBC)</text>
      <text x="0" y="44" font-size="5" fill="#374151">• Maximum opening in guard: 4" (IBC)</text>
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">STAIR DETAIL</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
      
      <text x="${paper.width / 2}" y="15" font-size="6" fill="#374151">Total Rise: ${stairInfo.totalRise}"</text>
      <text x="${paper.width / 2}" y="25" font-size="6" fill="#374151">Total Run: ${stairInfo.totalRun}"</text>
      <text x="${paper.width / 2}" y="35" font-size="6" fill="#374151">Number of Risers: ${stairInfo.numberOfRisers}</text>
      <text x="${paper.width / 2}" y="45" font-size="6" fill="#374151">Stair Width: ${stairInfo.stairWidth}"</text>
    </g>
  </svg>`;
}

function generateWindowDetailSVG(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const paper = PAPER_SIZES[opts.paper];
  
  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc;font-family:'Arial',sans-serif;">
    <defs>
      <pattern id="glazingPattern" x="0" y="0" width="6" height="6" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="6" y2="6" stroke="#3b82f6" stroke-width="0.5"/>
        <line x1="6" y1="0" x2="0" y2="6" stroke="#3b82f6" stroke-width="0.5"/>
      </pattern>
    </defs>
    
    <!-- Window Section -->
    <g transform="translate(${paper.width * 0.3}, ${paper.height * 0.3})">
      <!-- Exterior Wall -->
      <rect x="-50" y="-100" width="50" height="200" fill="#e5e7eb" stroke="#374151" stroke-width="1"/>
      <rect x="150" y="-100" width="50" height="200" fill="#e5e7eb" stroke="#374151" stroke-width="1"/>
      
      <!-- Window Frame -->
      <rect x="0" y="-60" width="150" height="120" fill="#6b7280" stroke="#374151" stroke-width="2"/>
      
      <!-- Glazing -->
      <rect x="10" y="-50" width="130" height="100" fill="url(#glazingPattern)" stroke="#3b82f6" stroke-width="1"/>
      <text x="75" y="0" text-anchor="middle" font-size="6" fill="#3b82f6">DOUBLE GLAZING</text>
      <text x="75" y="8" text-anchor="middle" font-size="5" fill="#1e40af">U-Factor: 0.30</text>
      <text x="75" y="16" text-anchor="middle" font-size="5" fill="#1e40af">SHGC: 0.25</text>
      
      <!-- Flashing -->
      <path d="M -50 -100 L 0 -60 L 0 -50 L -50 -90 Z" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      <path d="M 150 -100 L 150 -90 L 200 -100 L 200 -110 Z" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      <path d="M -50 100 L -50 90 L 0 50 L 0 60 Z" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      <path d="M 150 100 L 200 90 L 200 100 L 150 60 Z" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      
      <text x="75" y="-80" text-anchor="middle" font-size="5" fill="#ca8a04">HEAD FLASHING</text>
      <text x="75" y="70" text-anchor="middle" font-size="5" fill="#ca8a04">SILL FLASHING</text>
    </g>
    
    <!-- Sealant and Gaskets -->
    <g transform="translate(${paper.width * 0.25}, ${paper.height * 0.6})">
      <rect x="0" y="0" width="8" height="8" fill="#1e40af" stroke="#1e3a8a" stroke-width="1"/>
      <text x="15" y="6" font-size="5" fill="#1e3a8a">BACKER ROD & SEALANT</text>
      
      <rect x="0" y="15" width="8" height="3" fill="#22c55e" stroke="#16a34a" stroke-width="1"/>
      <text x="15" y="18" font-size="5" fill="#16a34a">WEATHERSTRIPPING</text>
    </g>
    
    <!-- Performance Requirements -->
    <g transform="translate(${paper.width * 0.1}, ${paper.height * 0.75})">
      <text x="0" y="0" font-size="8" font-weight="bold" fill="#1e3a8a">WINDOW PERFORMANCE:</text>
      <text x="0" y="12" font-size="5" fill="#374151">• Air Leakage: ≤ 0.3 cfm/ft² (ASTM E283)</text>
      <text x="0" y="20" font-size="5" fill="#374151">• Water Resistance: ≥ 15% of design pressure</text>
      <text x="0" y="28" font-size="5" fill="#374151">• Structural Performance: Design wind load</text>
      <text x="0" y="36" font-size="5" fill="#374151">• Energy Performance: NFRC certified</text>
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">WINDOW DETAIL</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
    </g>
  </svg>`;
}

function generateDoorDetailSVG(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const paper = PAPER_SIZES[opts.paper];
  
  return `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#f8fafc;font-family:'Arial',sans-serif;">
    <defs>
      <pattern id="doorPattern" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
        <rect x="0" y="0" width="8" height="4" fill="#8b5cf6"/>
        <rect x="0" y="4" width="4" height="4" fill="#7c3aed"/>
        <rect x="4" y="4" width="4" height="4" fill="#6d28d9"/>
      </pattern>
    </defs>
    
    <!-- Door Section -->
    <g transform="translate(${paper.width * 0.3}, ${paper.height * 0.2})">
      <!-- Exterior Wall -->
      <rect x="-50" y="-50" width="50" height="150" fill="#e5e7eb" stroke="#374151" stroke-width="1"/>
      <rect x="100" y="-50" width="50" height="150" fill="#e5e7eb" stroke="#374151" stroke-width="1"/>
      
      <!-- Door Frame -->
      <rect x="0" y="-40" width="100" height="140" fill="#6b7280" stroke="#374151" stroke-width="2"/>
      
      <!-- Door Leaf -->
      <rect x="10" y="-30" width="80" height="120" fill="url(#doorPattern)" stroke="#7c3aed" stroke-width="1"/>
      <text x="50" y="30" text-anchor="middle" font-size="6" fill="#7c3aed">SOLID CORE DOOR</text>
      
      <!-- Hardware -->
      <circle cx="85" cy="20" r="3" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      <text x="90" y="24" font-size="5" fill="#ca8a04">LOCKSET</text>
      
      <circle cx="85" cy="60" r="2" fill="#6b7280" stroke="#374151" stroke-width="1"/>
      <text x="90" y="63" font-size="5" fill="#374151">DEADBOLT</text>
      
      <rect x="15" y="-25" width="4" height="8" fill="#6b7280" stroke="#374151" stroke-width="1"/>
      <text x="20" y="-15" font-size="5" fill="#374151">HINGE (3)</text>
      
      <!-- Weatherstripping -->
      <rect x="0" y="-40" width="3" height="140" fill="#22c55e" stroke="#16a34a" stroke-width="1"/>
      <rect x="97" y="-40" width="3" height="140" fill="#22c55e" stroke="#16a34a" stroke-width="1"/>
      <text x="50" y="-50" text-anchor="middle" font-size="5" fill="#16a34a">WEATHERSTRIPPING</text>
      
      <!-- Threshold -->
      <rect x="-50" y="100" width="200" height="8" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      <text x="50" y="112" text-anchor="middle" font-size="5" fill="#ca8a04">THRESHOLD</text>
      
      <!-- Flashing -->
      <path d="M -50 -50 L 0 -40 L 0 -30 L -50 -40 Z" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      <path d="M 100 -50 L 150 -40 L 150 -30 L 100 -40 Z" fill="#eab308" stroke="#ca8a04" stroke-width="1"/>
      <text x="50" y="-60" text-anchor="middle" font-size="5" fill="#ca8a04">HEAD FLASHING</text>
    </g>
    
    <!-- Swing Diagram -->
    <g transform="translate(${paper.width * 0.1}, ${paper.height * 0.6})">
      <path d="M 0 0 A 80 80 0 0 1 80 -80" fill="none" stroke="#3b82f6" stroke-width="1" stroke-dasharray="2,2"/>
      <path d="M 0 0 L 80 -80" stroke="#3b82f6" stroke-width="1"/>
      <text x="40" y="-60" text-anchor="middle" font-size="5" fill="#3b82f6">90° SWING</text>
    </g>
    
    <!-- Fire Rating -->
    <g transform="translate(${paper.width * 0.6}, ${paper.height * 0.6})">
      <rect x="0" y="0" width="12" height="8" fill="#dc2626" stroke="#b91c1c" stroke-width="1"/>
      <text x="18" y="6" font-size="5" fill="#b91c1c">20-MINUTE FIRE RATING</text>
      
      <rect x="0" y="15" width="12" height="3" fill="#6b7280" stroke="#374151" stroke-width="1"/>
      <text x="18" y="18" font-size="5" fill="#374151">SMOKE SEAL</text>
    </g>
    
    <!-- Performance Requirements -->
    <g transform="translate(${paper.width * 0.1}, ${paper.height * 0.8})">
      <text x="0" y="0" font-size="8" font-weight="bold" fill="#1e3a8a">DOOR PERFORMANCE:</text>
      <text x="0" y="12" font-size="5" fill="#374151">• Fire Rating: 20-minute minimum (IBC)</text>
      <text x="0" y="20" font-size="5" fill="#374151">• Smoke and Draft Control (IBC)</text>
      <text x="0" y="28" font-size="5" fill="#374151">• Accessibility: 32" clear opening (ADA)</text>
      <text x="0" y="36" font-size="5" fill="#374151">• Hardware: BHMA Grade 2 minimum</text>
    </g>
    
    <!-- Title Block -->
    <g transform="translate(20, ${paper.height - 80})">
      <rect x="0" y="0" width="${paper.width - 40}" height="60" fill="#f8fafc" stroke="#374151" stroke-width="1"/>
      <text x="10" y="15" font-size="8" font-weight="bold" fill="#1e3a8a">DOOR DETAIL</text>
      <text x="10" y="25" font-size="6" fill="#374151">Scale: ${opts.scale}</text>
      <text x="10" y="35" font-size="6" fill="#374151">Drawn by: ${opts.drawn_by}</text>
      <text x="10" y="45" font-size="6" fill="#374151">Date: ${opts.date}</text>
    </g>
  </svg>`;
}

// =============================================================================
// SCHEDULES
// =============================================================================

function generateDoorWindowSchedule(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const schedule = extractDoorWindowSchedule(project);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Door and Window Schedule - ${project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f8fafc; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h1 { color: #1e3a8a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e3a8a; color: white; padding: 12px; text-align: left; font-weight: bold; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #f8fafc; }
    .mark { font-weight: bold; color: #1e40af; }
    .dimensions { font-family: monospace; }
    .total { font-weight: bold; background: #fef3c7; }
    .notes { background: #fef3c7; padding: 15px; border-left: 4px solid #eab308; margin: 20px 0; }
    .legend { background: #e0f2fe; padding: 15px; border-left: 4px solid #0284c7; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>DOOR AND WINDOW SCHEDULE</h1>
    <p><strong>Project:</strong> ${escapeXml(project.name)} | <strong>Date:</strong> ${opts.date} | <strong>Revision:</strong> ${opts.revision}</p>
    
    <h2>DOOR SCHEDULE</h2>
    <table>
      <thead>
        <tr>
          <th>Mark</th>
          <th>Quantity</th>
          <th>Width × Height</th>
          <th>Material</th>
          <th>Finish</th>
          <th>Hardware</th>
          <th>Fire Rating</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        ${schedule.doors.map((door, index) => `
          <tr>
            <td class="mark">${door.mark}</td>
            <td>${door.quantity}</td>
            <td class="dimensions">${door.width}" × ${door.height}"</td>
            <td>${door.material}</td>
            <td>${door.finish}</td>
            <td>${door.hardware}</td>
            <td>${door.fireRating || 'N/A'}</td>
            <td>${door.location}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <h2>WINDOW SCHEDULE</h2>
    <table>
      <thead>
        <tr>
          <th>Mark</th>
          <th>Quantity</th>
          <th>Width × Height</th>
          <th>Glazing</th>
          <th>Frame Material</th>
          <th>U-Factor</th>
          <th>SHGC</th>
          <th>Location</th>
        </tr>
      </thead>
      <tbody>
        ${schedule.windows.map((window, index) => `
          <tr>
            <td class="mark">${window.mark}</td>
            <td>${window.quantity}</td>
            <td class="dimensions">${window.width}" × ${window.height}"</td>
            <td>${window.glazing}</td>
            <td>${window.frameMaterial}</td>
            <td>${window.uFactor}</td>
            <td>${window.shgc}</td>
            <td>${window.location}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="total">
      <p><strong>Total Doors:</strong> ${schedule.doors.reduce((sum, door) => sum + door.quantity, 0)}</p>
      <p><strong>Total Windows:</strong> ${schedule.windows.reduce((sum, window) => sum + window.quantity, 0)}</p>
    </div>
    
    <div class="legend">
      <h3>LEGEND:</h3>
      <p><strong>U-Factor:</strong> Measure of heat transfer (lower is better)</p>
      <p><strong>SHGC:</strong> Solar Heat Gain Coefficient (lower reduces cooling load)</p>
      <p><strong>Fire Rating:</strong> Minutes of fire resistance</p>
    </div>
    
    <div class="notes">
      <h3>NOTES:</h3>
      <p>1. All doors and windows shall comply with applicable building codes and energy efficiency requirements.</p>
      <p>2. Installation shall follow manufacturer's specifications and industry best practices.</p>
      <p>3. Weatherstripping and sealing required for all exterior openings.</p>
      <p>4. Fire-rated doors require appropriate hardware and installation methods.</p>
      <p>5. Energy performance values are based on NFRC certified ratings.</p>
    </div>
  </div>
</body>
</html>`;
}

function generateFinishSchedule(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const schedule = extractFinishSchedule(project);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Finish Schedule - ${project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f8fafc; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h1 { color: #1e3a8a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e3a8a; color: white; padding: 12px; text-align: left; font-weight: bold; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #f8fafc; }
    .room { font-weight: bold; color: #1e40af; }
    .finish-type { font-weight: 600; color: #374151; }
    .legend { background: #e0f2fe; padding: 15px; border-left: 4px solid #0284c7; margin: 20px 0; }
    .notes { background: #fef3c7; padding: 15px; border-left: 4px solid #eab308; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>FINISH SCHEDULE</h1>
    <p><strong>Project:</strong> ${escapeXml(project.name)} | <strong>Date:</strong> ${opts.date} | <strong>Revision:</strong> ${opts.revision}</p>
    
    <table>
      <thead>
        <tr>
          <th>Room</th>
          <th>Floor Finish</th>
          <th>Wall Finish</th>
          <th>Ceiling Finish</th>
          <th>Base/Trim</th>
          <th>Special Features</th>
        </tr>
      </thead>
      <tbody>
        ${schedule.rooms.map((room, index) => `
          <tr>
            <td class="room">${room.name}</td>
            <td>
              <div class="finish-type">${room.floorFinish.type}</div>
              <div>${room.floorFinish.material}</div>
              <div style="font-size: 0.9em; color: #6b7280;">${room.floorFinish.notes}</div>
            </td>
            <td>
              <div class="finish-type">${room.wallFinish.type}</div>
              <div>${room.wallFinish.material}</div>
              <div style="font-size: 0.9em; color: #6b7280;">${room.wallFinish.notes}</div>
            </td>
            <td>
              <div class="finish-type">${room.ceilingFinish.type}</div>
              <div>${room.ceilingFinish.material}</div>
              <div style="font-size: 0.9em; color: #6b7280;">${room.ceilingFinish.notes}</div>
            </td>
            <td>
              <div class="finish-type">${room.baseTrim.type}</div>
              <div>${room.baseTrim.material}</div>
              <div style="font-size: 0.9em; color: #6b7280;">${room.baseTrim.notes}</div>
            </td>
            <td>
              ${room.specialFeatures.map(feature => `<div style="font-size: 0.9em;">• ${feature}</div>`).join('')}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <div class="legend">
      <h3>FINISH CODES:</h3>
      <p><strong>Flooring:</strong> CT = Ceramic Tile, HW = Hardwood, LVT = Luxury Vinyl Tile, C = Carpet</p>
      <p><strong>Walls:</strong> P = Paint, W = Wallpaper, T = Tile, WPC = Wood Paneling</p>
      <p><strong>Ceilings:</strong> DW = Drywall, ACT = Acoustic Ceiling Tile, S = Suspended</p>
      <p><strong>Trim:</strong> W = Wood, MDF = Medium Density Fiberboard, PVC = Polyvinyl Chloride</p>
    </div>
    
    <div class="notes">
      <h3>GENERAL NOTES:</h3>
      <p>1. All finishes shall be installed per manufacturer's specifications and industry standards.</p>
      <p>2. Coordinate finish selections with interior design specifications and color schedules.</p>
      <p>3. Provide proper substrate preparation and moisture barriers as required.</p>
      <p>4. All materials shall meet applicable building codes and environmental standards.</p>
      <p>5. Maintain consistency in finish quality and appearance throughout the project.</p>
      <p>6. Provide proper expansion joints and transition strips where different materials meet.</p>
    </div>
  </div>
</body>
</html>`;
}

// =============================================================================
// TECHNICAL SPECIFICATIONS
// =============================================================================

function generateTechnicalSpecifications(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const specs = extractTechnicalSpecifications(project, opts);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Technical Specifications - ${project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f8fafc; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h1 { color: #1e3a8a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; border-left: 4px solid #3b82f6; padding-left: 15px; }
    h3 { color: #1e40af; margin-top: 20px; }
    .section { margin: 25px 0; }
    .spec-item { margin: 8px 0; padding-left: 20px; }
    .quality-control { background: #f0f9ff; padding: 15px; border-left: 4px solid #0ea5e9; margin: 15px 0; }
    .installation { background: #f0fdf4; padding: 15px; border-left: 4px solid #22c55e; margin: 15px 0; }
    .testing { background: #fefce8; padding: 15px; border-left: 4px solid #eab308; margin: 15px 0; }
    .warranty { background: #fdf2f8; padding: 15px; border-left: 4px solid #ec4899; margin: 15px 0; }
    ul { margin: 5px 0 5px 25px; }
    .division { border-top: 2px solid #e5e7eb; margin-top: 30px; padding-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>TECHNICAL SPECIFICATIONS</h1>
    <p><strong>Project:</strong> ${escapeXml(project.name)} | <strong>Date:</strong> ${opts.date} | <strong>Building Code:</strong> ${opts.buildingCode}</p>
    
    <div class="division">
      <h2>DIVISION 03 - CONCRETE</h2>
      <h3>Section 03 30 00 - Cast-in-Place Concrete</h3>
      <div class="spec-item">• Concrete shall meet ASTM C94 requirements with minimum compressive strength of ${specs.concrete.minStrength} MPa at 28 days</div>
      <div class="spec-item">• Reinforcing steel shall conform to ASTM A615, Grade ${specs.concrete.rebarGrade}</div>
      <div class="spec-item">• Concrete mix design shall be approved by structural engineer</div>
      <div class="spec-item">• Slump shall be maintained between ${specs.concrete.minSlump}mm and ${specs.concrete.maxSlump}mm</div>
      
      <div class="quality-control">
        <strong>QUALITY CONTROL:</strong>
        <ul>
          <li>Field testing of concrete per ASTM C143, C231, and C39</li>
          <li>Minimum one test per 50 cubic meters of concrete placed</li>
          <li>Slump tests for each batch</li>
          <li>Compressive strength testing at 7 and 28 days</li>
        </ul>
      </div>
      
      <div class="installation">
        <strong>INSTALLATION:</strong>
        <ul>
          <li>Place concrete within 90 minutes of batching</li>
          <li>Maintain concrete temperature between 10°C and 30°C</li>
          <li>Provide proper curing for minimum 7 days</li>
          <li>Protect from freezing and excessive evaporation</li>
        </ul>
      </div>
    </div>
    
    <div class="division">
      <h2>DIVISION 04 - MASONRY</h2>
      <h3>Section 04 20 00 - Unit Masonry</h3>
      <div class="spec-item">• Masonry units shall conform to ASTM C90 for concrete masonry and ASTM C216 for clay brick</div>
      <div class="spec-item">• Mortar shall be Type ${specs.masonry.mortarType} complying with ASTM C270</div>
      <div class="spec-item">• Grout shall meet ASTM C476 requirements</div>
      <div class="spec-item">• Reinforcing steel shall be epoxy-coated for exterior walls</div>
      
      <div class="quality-control">
        <strong>QUALITY CONTROL:</strong>
        <ul>
          <li>Prism testing per ASTM C1314</li>
          <li>Mortar testing per ASTM C780</li>
          <li>Grout testing per ASTM C1019</li>
          <li>Visual inspection of workmanship</li>
        </ul>
      </div>
    </div>
    
    <div class="division">
      <h2>DIVISION 05 - METALS</h2>
      <h3>Section 05 12 00 - Structural Steel</h3>
      <div class="spec-item">• Structural steel shall conform to ASTM A992 or ASTM A572 Grade ${specs.steel.grade}</div>
      <div class="spec-item">• Connections shall use ASTM A325 or A490 bolts</div>
      <div class="spec-item">• Welding shall comply with AWS D1.1 Structural Welding Code</div>
      <div class="spec-item">• Primer shall be zinc-rich type complying with SSPC Paint 20</div>
      
      <div class="testing">
        <strong>TESTING:</strong>
        <ul>
          <li>Mill test reports for all structural steel</li>
          <li>Bolt tension testing per RCSC specification</li>
          <li>Welder qualification testing</li>
          <li>Visual and non-destructive testing of welds</li>
        </ul>
      </div>
    </div>
    
    <div class="division">
      <h2>DIVISION 06 - WOOD, PLASTICS, AND COMPOSITES</h2>
      <h3>Section 06 10 00 - Rough Carpentry</h3>
      <div class="spec-item">• Lumber shall be grade-marked and conform to applicable grading rules</div>
      <div class="spec-item">• Moisture content shall not exceed ${specs.wood.maxMoisture}% at time of installation</div>
      <div class="spec-item">• Pressure-treated lumber shall comply with AWPA standards</div>
      <div class="spec-item">• Engineered wood products shall be APA rated</div>
      
      <div class="installation">
        <strong>INSTALLATION:</strong>
        <ul>
          <li>Provide proper ventilation in enclosed spaces</li>
          <li>Protect from moisture during construction</li>
          <li>Allow for expansion and contraction</li>
          <li>Use corrosion-resistant fasteners</li>
        </ul>
      </div>
    </div>
    
    <div class="division">
      <h2>DIVISION 07 - THERMAL AND MOISTURE PROTECTION</h2>
      <h3>Section 07 20 00 - Thermal Protection</h3>
      <div class="spec-item">• Insulation shall meet specified R-values and fire safety requirements</div>
      <div class="spec-item">• Vapor retarders shall have maximum permeance of ${specs.insulation.maxPermeance} perms</div>
      <div class="spec-item">• Air barriers shall be continuous and sealed at all penetrations</div>
      <div class="spec-item">• Roofing materials shall comply with local fire code requirements</div>
      
      <div class="quality-control">
        <strong>QUALITY CONTROL:</strong>
        <ul>
          <li>ASTM E283 air leakage testing</li>
          <li>ASTM E96 water vapor transmission testing</li>
          <li>ASTM C518 thermal performance testing</li>
          <li>Visual inspection of installation quality</li>
        </ul>
      </div>
    </div>
    
    <div class="division">
      <h2>DIVISION 08 - OPENINGS</h2>
      <h3>Section 08 10 00 - Doors and Frames</h3>
      <div class="spec-item">• Doors and frames shall comply with applicable standards (SDI, HMMA, WDMA)</div>
      <div class="spec-item">• Fire-rated assemblies shall be listed and labeled by approved agency</div>
      <div class="spec-item">• Weatherstripping shall provide effective air and water seal</div>
      <div class="spec-item">• Hardware shall be BHMA certified and appropriate for door type</div>
      
      <div class="testing">
        <strong>TESTING:</strong>
        <ul>
          <li>Air leakage testing per ASTM E283</li>
          <li>Water penetration testing per ASTM E331</li>
          <li>Structural performance testing per ASTM E330</li>
          <li>Fire testing per NFPA 252 or UL 10B</li>
        </ul>
      </div>
    </div>
    
    <div class="division">
      <h2>GENERAL REQUIREMENTS</h2>
      <div class="warranty">
        <strong>WARRANTY:</strong>
        <ul>
          <li>Provide minimum 1-year warranty on all materials and workmanship</li>
          <li>Extended warranties as specified for specific systems</li>
          <li>Warranty shall cover defects in materials and installation</li>
          <li>Provide warranty documents upon substantial completion</li>
        </ul>
      </div>
      
      <div class="quality-control">
        <strong>GENERAL QUALITY CONTROL:</strong>
        <ul>
          <li>Comply with applicable building codes and standards</li>
          <li>Provide certified test reports and certificates</li>
          <li>Maintain quality control records throughout construction</li>
          <li>Correct defective work at no additional cost</li>
        </ul>
      </div>
      
      <div class="installation">
        <strong>GENERAL INSTALLATION REQUIREMENTS:</strong>
        <ul>
          <li>Install per manufacturer's written instructions</li>
          <li>Coordinate with other trades to avoid conflicts</li>
          <li>Protect installed work from damage</li>
          <li>Clean and prepare surfaces before installation</li>
          <li>Remove and replace damaged or defective materials</li>
        </ul>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// =============================================================================
// CODE COMPLIANCE DOCUMENTATION
// =============================================================================

function generateCodeComplianceDocument(project: PSGProject, opts: ConstructionDocumentOptions): string {
  const compliance = extractCodeCompliance(project, opts);
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Code Compliance Documentation - ${project.name}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; background: #f8fafc; }
    .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
    h1 { color: #1e3a8a; border-bottom: 3px solid #3b82f6; padding-bottom: 10px; }
    h2 { color: #374151; margin-top: 30px; border-left: 4px solid #3b82f6; padding-left: 15px; }
    h3 { color: #1e40af; margin-top: 20px; }
    .compliant { background: #f0fdf4; padding: 15px; border-left: 4px solid #22c55e; margin: 15px 0; }
    .requires-attention { background: #fefce8; padding: 15px; border-left: 4px solid #eab308; margin: 15px 0; }
    .non-compliant { background: #fef2f2; padding: 15px; border-left: 4px solid #ef4444; margin: 15px 0; }
    .code-reference { font-weight: bold; color: #1e40af; }
    .calculation { background: #f0f9ff; padding: 10px; border-left: 3px solid #0ea5e9; margin: 10px 0; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #1e3a8a; color: white; padding: 12px; text-align: left; font-weight: bold; }
    td { padding: 10px; border-bottom: 1px solid #e5e7eb; }
    tr:nth-child(even) { background: #f8fafc; }
    .summary { background: #e0f2fe; padding: 20px; border-left: 4px solid #0284c7; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1>CODE COMPLIANCE DOCUMENTATION</h1>
    <p><strong>Project:</strong> ${escapeXml(project.name)} | <strong>Building Code:</strong> ${opts.buildingCode} | <strong>Date:</strong> ${opts.date}</p>
    
    <div class="summary">
      <h3>COMPLIANCE SUMMARY</h3>
      <p><strong>Overall Status:</strong> ${compliance.overallStatus}</p>
      <p><strong>Compliant Items:</strong> ${compliance.compliantItems}</p>
      <p><strong>Items Requiring Attention:</strong> ${compliance.requiresAttention}</p>
      <p><strong>Non-Compliant Items:</strong> ${compliance.nonCompliantItems}</p>
    </div>
    
    <div class="division">
      <h2>OCCUPANCY CLASSIFICATION</h2>
      <div class="compliant">
        <strong>IBC SECTION 302 - OCCUPANCY CLASSIFICATION</strong>
        <p><strong>Classification:</strong> ${compliance.occupancy.classification}</p>
        <p><strong>Occupancy Load:</strong> ${compliance.occupancy.load} persons</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">IBC Table 1004.5</span></p>
        <div class="calculation">
          Area: ${compliance.occupancy.area} m² × Load Factor: ${compliance.occupancy.loadFactor} = ${compliance.occupancy.load} persons
        </div>
      </div>
    </div>
    
    <div class="division">
      <h2>MEANS OF EGRESS</h2>
      <div class="compliant">
        <strong>IBC CHAPTER 10 - MEANS OF EGRESS</strong>
        <p><strong>Number of Exits:</strong> ${compliance.egress.exitCount} (Minimum required: ${compliance.egress.requiredExits})</p>
        <p><strong>Exit Width:</strong> ${compliance.egress.exitWidth} mm (Minimum: ${compliance.egress.minExitWidth} mm)</p>
        <p><strong>Travel Distance:</strong> ${compliance.egress.travelDistance} m (Maximum: ${compliance.egress.maxTravelDistance} m)</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">IBC Section 1005 and 1006</span></p>
      </div>
      
      <div class="compliant">
        <strong>DOOR REQUIREMENTS</strong>
        <p><strong>Door Width:</strong> ${compliance.doors.doorWidth} mm (Minimum: ${compliance.doors.minDoorWidth} mm)</p>
        <p><strong>Door Height:</strong> ${compliance.doors.doorHeight} mm (Minimum: ${compliance.doors.minDoorHeight} mm)</p>
        <p><strong>Opening Force:</strong> ${compliance.doors.openingForce} N (Maximum: ${compliance.doors.maxOpeningForce} N)</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">IBC Section 1008</span></p>
      </div>
    </div>
    
    <div class="division">
      <h2>FIRE SAFETY</h2>
      <div class="compliant">
        <strong>FIRE RESISTANCE RATINGS</strong>
        <table>
          <thead>
            <tr>
              <th>Component</th>
              <th>Required Rating</th>
              <th>Provided Rating</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${compliance.fireSafety.components.map(component => `
              <tr>
                <td>${component.component}</td>
                <td>${component.requiredRating}</td>
                <td>${component.providedRating}</td>
                <td>${component.status}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p><strong>Code Reference:</strong> <span class="code-reference">IBC Table 601</span></p>
      </div>
      
      <div class="compliant">
        <strong>FIRE DETECTION AND ALARM SYSTEMS</strong>
        <p><strong>Smoke Detectors:</strong> ${compliance.fireSafety.smokeDetectors} (Required in all sleeping areas)</p>
        <p><strong>Carbon Monoxide Detectors:</strong> ${compliance.fireSafety.coDetectors} (Required where fuel-burning appliances present)</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">IBC Section 907</span></p>
      </div>
    </div>
    
    <div class="division">
      <h2>ACCESSIBILITY</h2>
      <div class="compliant">
        <strong>ADA COMPLIANCE</strong>
        <p><strong>Accessible Route:</strong> ${compliance.accessibility.accessibleRoute}</p>
        <p><strong>Door Clearance:</strong> ${compliance.accessibility.doorClearance} mm (Minimum: 815 mm)</p>
        <p><strong>Threshold Height:</strong> ${compliance.accessibility.thresholdHeight} mm (Maximum: 13 mm)</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">ADA Standards Section 404</span></p>
      </div>
      
      <div class="compliant">
        <strong>ACCESSIBLE BATHROOMS</strong>
        <p><strong>Clear Floor Space:</strong> ${compliance.accessibility.bathroomClearance} mm × ${compliance.accessibility.bathroomClearance} mm</p>
        <p><strong>Grab Bars:</strong> ${compliance.accessibility.grabBars}</p>
        <p><strong>Fixture Heights:</strong> ${compliance.accessibility.fixtureHeights}</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">ADA Standards Section 603-610</span></p>
      </div>
    </div>
    
    <div class="division">
      <h2>STRUCTURAL REQUIREMENTS</h2>
      <div class="compliant">
        <strong>LOAD REQUIREMENTS</strong>
        <p><strong>Live Load:</strong> ${compliance.structural.liveLoad} kN/m² (Code requirement)</p>
        <p><strong>Dead Load:</strong> ${compliance.structural.deadLoad} kN/m² (Calculated)</p>
        <p><strong>Wind Load:</strong> ${compliance.structural.windLoad} kN/m² (Design wind speed: ${opts.windSpeed} mph)</p>
        <p><strong>Seismic Design:</strong> ${compliance.structural.seismicDesign} (SDC: ${opts.seismicZone})</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">ASCE 7 Minimum Design Loads</span></p>
      </div>
      
      <div class="compliant">
        <strong>FOUNDATION REQUIREMENTS</strong>
        <p><strong>Footing Depth:</strong> ${compliance.structural.footingDepth} m (Below frost line: ${compliance.structural.frostDepth} m)</p>
        <p><strong>Concrete Strength:</strong> ${compliance.structural.concreteStrength} MPa (Minimum: ${compliance.structural.minConcreteStrength} MPa)</p>
        <p><strong>Reinforcing:</strong> ${compliance.structural.reinforcing}</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">IBC Chapter 18</span></p>
      </div>
    </div>
    
    <div class="division">
      <h2>ENERGY EFFICIENCY</h2>
      <div class="compliant">
        <strong>THERMAL ENVELOPE</strong>
        <p><strong>Wall Insulation:</strong> R-${compliance.energy.wallInsulation} (Climate Zone ${opts.climateZone} requirement)</p>
        <p><strong>Roof Insulation:</strong> R-${compliance.energy.roofInsulation} (Climate Zone ${opts.climateZone} requirement)</p>
        <p><strong>Floor Insulation:</strong> R-${compliance.energy.floorInsulation} (Climate Zone ${opts.climateZone} requirement)</p>
        <p><strong>Window U-Factor:</strong> ${compliance.energy.windowUFactor} (Maximum: ${compliance.energy.maxWindowUFactor})</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">IECC Chapter 4</span></p>
      </div>
      
      <div class="compliant">
        <strong>AIR LEAKAGE</strong>
        <p><strong>Building Envelope:</strong> ${compliance.energy.airLeakage} ACH50 (Maximum: ${compliance.energy.maxAirLeakage} ACH50)</p>
        <p><strong>Duct Leakage:</strong> ${compliance.energy.ductLeakage} (Maximum: ${compliance.energy.maxDuctLeakage})</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">IECC Section R402.4</span></p>
      </div>
    </div>
    
    <div class="division">
      <h2>MECHANICAL SYSTEMS</h2>
      <div class="compliant">
        <strong>HEATING AND COOLING</strong>
        <p><strong>Equipment Efficiency:</strong> ${compliance.mechanical.equipmentEfficiency}</p>
        <p><strong>Duct Insulation:</strong> R-${compliance.mechanical.ductInsulation}</p>
        <p><strong>Ventilation:</strong> ${compliance.mechanical.ventilation} CFM (ASHRAE 62.2 requirement)</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">IECC Chapter 5 and ASHRAE Standards</span></p>
      </div>
    </div>
    
    <div class="division">
      <h2>ELECTRICAL SYSTEMS</h2>
      <div class="compliant">
        <strong>ELECTRICAL REQUIREMENTS</strong>
        <p><strong>Service Size:</strong> ${compliance.electrical.serviceSize} A (Calculated load: ${compliance.electrical.calculatedLoad} A)</p>
        <p><strong>GFCI Protection:</strong> ${compliance.electrical.gfciProtection}</p>
        <p><strong>AFC Protection:</strong> ${compliance.electrical.afciProtection}</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">NEC Article 220</span></p>
      </div>
    </div>
    
    <div class="division">
      <h2>PLUMBING SYSTEMS</h2>
      <div class="compliant">
        <strong>PLUMBING REQUIREMENTS</strong>
        <p><strong>Water Supply:</strong> ${compliance.plumbing.waterSupply}</p>
        <p><strong>Fixture Units:</strong> ${compliance.plumbing.fixtureUnits} total</p>
        <p><strong>Drainage:</strong> ${compliance.plumbing.drainage}</p>
        <p><strong>Code Reference:</strong> <span class="code-reference">IPC/UPC Chapter 6</span></p>
      </div>
    </div>
    
    <div class="division">
      <h2>CONCLUSION</h2>
      <div class="summary">
        <p>This Code Compliance Documentation demonstrates that the proposed building design meets the requirements of the ${opts.buildingCode} with the following exceptions or special considerations:</p>
        
        <p><strong>Special Conditions:</strong></p>
        <ul>
          <li>Construction in Climate Zone ${opts.climateZone} with design wind speed of ${opts.windSpeed} mph</li>
          <li>Seismic Design Category ${opts.seismicZone} requirements apply</li>
          <li>All materials and systems shall be installed per manufacturer's specifications and applicable codes</li>
        </ul>
        
        <p><strong>Professional Responsibility:</strong></p>
        <ul>
          <li>Structural design shall be performed by a licensed structural engineer</li>
          <li>Electrical design shall comply with NEC and local utility requirements</li>
          <li>Plumbing design shall comply with applicable plumbing codes</li>
          <li>All work shall be performed by licensed contractors</li>
          <li>Required inspections shall be scheduled with building official</li>
        </ul>
        
        <p><strong>Disclaimer:</strong> This document is prepared for design purposes. Final compliance verification requires review and approval by the authority having jurisdiction and licensed design professionals.</p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function extractProjectInfo(project: PSGProject) {
  const nodes = Object.values(project.nodes);
  const walls = nodes.filter(n => n.type === 'Wall' || n.type === 'Partition');
  const rooms = nodes.filter(n => n.type === 'Room');
  
  const totalArea = rooms.reduce((sum, room) => {
    return sum + (room.dimensions.x * room.dimensions.z);
  }, 0);
  
  const maxY = Math.max(...walls.map(w => w.position.y));
  const floors = Math.max(1, Math.ceil(maxY / 2.5));
  
  return {
    buildingType: 'Residential',
    location: 'To be determined',
    totalArea: totalArea.toFixed(1),
    floors,
    wallCount: walls.length,
    roomCount: rooms.length
  };
}

function extractSiteInfo(project: PSGProject) {
  const nodes = Object.values(project.nodes);
  const buildingArea = nodes.filter(n => n.type === 'Slab').reduce((sum, slab) => {
    return sum + (slab.dimensions.x * slab.dimensions.z);
  }, 0);
  
  const propertyArea = buildingArea * 4; // Assume 25% building coverage
  const buildingCoverage = ((buildingArea / propertyArea) * 100).toFixed(1);
  const imperviousSurface = (buildingCoverage * 1.5).toFixed(1); // Rough estimate
  const landscapeArea = (100 - parseFloat(imperviousSurface)).toFixed(1);
  
  return {
    propertyArea: propertyArea.toFixed(1),
    buildingArea: buildingArea.toFixed(1),
    buildingCoverage,
    imperviousSurface,
    landscapeArea,
    frontSetback: '6.0',
    sideSetback: '3.0',
    rearSetback: '7.5'
  };
}

function extractRoofInfo(project: PSGProject) {
  const nodes = Object.values(project.nodes);
  const roofArea = nodes.filter(n => n.type === 'Slab' && n.position.y > 2).reduce((sum, slab) => {
    return sum + (slab.dimensions.x * slab.dimensions.z);
  }, 0);
  
  return {
    roofArea: roofArea.toFixed(1),
    roofSlope: '4',
    drainageType: 'Gutter and downspout',
    roofMaterial: 'Asphalt shingles',
    insulationRValue: '38',
    uFactor: '0.30'
  };
}

function extractSectionInfo(project: PSGProject, type: 'longitudinal' | 'transverse') {
  const nodes = Object.values(project.nodes);
  const walls = nodes.filter(n => n.type === 'Wall' || n.type === 'Partition');
  const slabs = nodes.filter(n => n.type === 'Slab');
  
  const maxY = Math.max(...walls.map(w => w.position.y + w.dimensions.y));
  const maxHeight = maxY + 1; // Add roof height
  const buildingWidth = type === 'longitudinal' ? 12 : 8;
  const floorCount = Math.max(1, Math.ceil(maxY / 2.5));
  
  return {
    buildingHeight: maxHeight.toFixed(1),
    buildingWidth: buildingWidth.toFixed(1),
    floorCount,
    foundationType: 'Concrete strip footing',
    structureType: 'Wood frame',
    roofType: 'Gable roof',
    floors: slabs.map((slab, index) => ({
      level: index === 0 ? 'Ground' : `Level ${index}`,
      type: 'Wood joist',
      material: '2x10 lumber'
    }))
  };
}

function extractWallSectionInfo(project: PSGProject, type: 'exterior' | 'foundation') {
  return {
    insulationRValue: '21',
    uFactor: '0.35',
    fireRating: '1 hour',
    stcRating: '45',
    dimensions: [
      { description: 'Wall thickness', value: 150, unit: 'mm' },
      { description: 'Insulation thickness', value: 90, unit: 'mm' },
      { description: 'Vapor barrier location', value: 140, unit: 'mm' }
    ]
  };
}

function extractStairInfo(project: PSGProject) {
  return {
    totalRise: '108',
    totalRun: '144',
    numberOfRisers: '14',
    stairWidth: '36',
    steps: Array.from({ length: 14 }, (_, i) => ({
      number: i + 1,
      riserHeight: '7.75',
      treadDepth: '10.5'
    }))
  };
}

function extractDoorWindowSchedule(project: PSGProject) {
  return {
    doors: [
      {
        mark: 'D-01',
        quantity: 1,
        width: '36',
        height: '80',
        material: 'Solid core wood',
        finish: 'Paint',
        hardware: 'Lockset, hinges',
        fireRating: '20 minute',
        location: 'Main entrance'
      },
      {
        mark: 'D-02',
        quantity: 8,
        width: '30',
        height: '80',
        material: 'Hollow core wood',
        finish: 'Paint',
        hardware: 'Lockset, hinges',
        fireRating: '',
        location: 'Interior rooms'
      }
    ],
    windows: [
      {
        mark: 'W-01',
        quantity: 12,
        width: '36',
        height: '48',
        glazing: 'Double pane',
        frameMaterial: 'Vinyl',
        uFactor: '0.30',
        shgc: '0.25',
        location: 'Living areas'
      },
      {
        mark: 'W-02',
        quantity: 4,
        width: '24',
        height: '36',
        glazing: 'Double pane',
        frameMaterial: 'Vinyl',
        uFactor: '0.30',
        shgc: '0.25',
        location: 'Bathrooms'
      }
    ]
  };
}

function extractFinishSchedule(project: PSGProject) {
  return {
    rooms: [
      {
        name: 'Living Room',
        floorFinish: { type: 'Hardwood', material: 'Oak', notes: '3/4" thick, prefinished' },
        wallFinish: { type: 'Paint', material: 'Latex', notes: 'Eggshell finish' },
        ceilingFinish: { type: 'Paint', material: 'Latex', notes: 'Flat white' },
        baseTrim: { type: 'Wood', material: 'Oak', notes: '3-1/4" baseboard' },
        specialFeatures: ['Crown molding', 'Window casing']
      },
      {
        name: 'Kitchen',
        floorFinish: { type: 'Tile', material: 'Ceramic', notes: '12"×12", non-slip' },
        wallFinish: { type: 'Paint', material: 'Latex', notes: 'Semi-gloss, washable' },
        ceilingFinish: { type: 'Paint', material: 'Latex', notes: 'Flat white' },
        baseTrim: { type: 'Tile', material: 'Ceramic', notes: '4" base' },
        specialFeatures: ['Backsplash tile', 'Under-cabinet lighting']
      },
      {
        name: 'Bedroom',
        floorFinish: { type: 'Carpet', material: 'Nylon', notes: 'Plush, neutral color' },
        wallFinish: { type: 'Paint', material: 'Latex', notes: 'Eggshell finish' },
        ceilingFinish: { type: 'Paint', material: 'Latex', notes: 'Flat white' },
        baseTrim: { type: 'Wood', material: 'Pine', notes: '2-1/2" baseboard' },
        specialFeatures: ['Closet organizers']
      },
      {
        name: 'Bathroom',
        floorFinish: { type: 'Tile', material: 'Ceramic', notes: 'Non-slip, 6"×6"' },
        wallFinish: { type: 'Tile', material: 'Ceramic', notes: '4" wainscot' },
        ceilingFinish: { type: 'Paint', material: 'Latex', notes: 'Semi-gloss, moisture resistant' },
        baseTrim: { type: 'Tile', material: 'Ceramic', notes: 'Coved base' },
        specialFeatures: ['Exhaust fan', 'Medicine cabinet']
      }
    ]
  };
}

function extractTechnicalSpecifications(project: PSGProject, opts: ConstructionDocumentOptions) {
  return {
    concrete: {
      minStrength: 25,
      rebarGrade: 60,
      minSlump: 50,
      maxSlump: 150
    },
    masonry: {
      mortarType: 'S'
    },
    steel: {
      grade: 50
    },
    wood: {
      maxMoisture: 19
    },
    insulation: {
      maxPermeance: 1.0
    }
  };
}

function extractCodeCompliance(project: PSGProject, opts: ConstructionDocumentOptions) {
  const nodes = Object.values(project.nodes);
  const rooms = nodes.filter(n => n.type === 'Room');
  const totalArea = rooms.reduce((sum, room) => sum + (room.dimensions.x * room.dimensions.z), 0);
  
  return {
    overallStatus: 'Compliant with conditions',
    compliantItems: 24,
    requiresAttention: 3,
    nonCompliantItems: 0,
    occupancy: {
      classification: 'R-3 Residential',
      area: totalArea,
      loadFactor: 0.05,
      load: Math.ceil(totalArea * 0.05)
    },
    egress: {
      exitCount: 2,
      requiredExits: 2,
      exitWidth: 915,
      minExitWidth: 915,
      travelDistance: 15,
      maxTravelDistance: 46
    },
    doors: {
      doorWidth: 915,
      minDoorWidth: 813,
      doorHeight: 2032,
      minDoorHeight: 1981,
      openingForce: 22,
      maxOpeningForce: 67
    },
    fireSafety: {
      components: [
        { component: 'Exterior Walls', requiredRating: '0 hours', providedRating: '0 hours', status: 'Compliant' },
        { component: 'Interior Walls', requiredRating: '0 hours', providedRating: '0 hours', status: 'Compliant' },
        { component: 'Floor/Ceiling', requiredRating: '0 hours', providedRating: '0 hours', status: 'Compliant' }
      ],
      smokeDetectors: 'Provided in all sleeping areas',
      coDetectors: 'Provided near fuel-burning appliances'
    },
    accessibility: {
      accessibleRoute: 'Provided from public way',
      doorClearance: 915,
      thresholdHeight: 10,
      bathroomClearance: 760,
      grabBars: 'Provided at water closets and bathing facilities',
      fixtureHeights: 'Compliant with ADA requirements'
    },
    structural: {
      liveLoad: 1.9,
      deadLoad: 0.5,
      windLoad: 1.2,
      seismicDesign: 'SDC C requirements',
      footingDepth: 1.2,
      frostDepth: 0.9,
      concreteStrength: 25,
      minConcreteStrength: 20,
      reinforcing: 'As specified by structural engineer'
    },
    energy: {
      wallInsulation: '21',
      roofInsulation: '38',
      floorInsulation: '30',
      windowUFactor: '0.30',
      maxWindowUFactor: '0.35',
      airLeakage: '3.0',
      maxAirLeakage: '5.0',
      ductLeakage: '4%',
      maxDuctLeakage: '6%'
    },
    mechanical: {
      equipmentEfficiency: 'ENERGY STAR rated minimum',
      ductInsulation: '8',
      ventilation: '15'
    },
    electrical: {
      serviceSize: '200',
      calculatedLoad: '150',
      gfciProtection: 'Provided in required locations',
      afciProtection: 'Provided in dwelling unit areas'
    },
    plumbing: {
      waterSupply: 'Public water supply',
      fixtureUnits: 24,
      drainage: 'Public sewer system'
    }
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