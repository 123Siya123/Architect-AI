/**
 * =============================================================================
 * LIB/EXPORT/PLAN-GENERATOR.TS — Architect Document Generation
 * =============================================================================
 *
 * Generates professional architectural documents from the PSG project:
 * - Floor plans (scaled 1:50 / 1:100)
 * - Elevations (front, side, rear views)
 * - Cross-sections
 * - Material schedules (Bill of Quantities)
 * - Electrical and plumbing layouts
 *
 * HOW IT WORKS:
 * 1. Projects the 3D PSG data onto 2D planes (plan = XZ, elevation = XY)
 * 2. Draws lines, dimensions, and annotations using Canvas 2D API
 * 3. Exports as high-resolution images or PDF
 *
 * WHY CANVAS 2D (not Three.js)?
 * Floor plans don't need 3D rendering. Canvas 2D gives us:
 * - Precise line widths (architect standard: 0.25mm, 0.35mm, 0.5mm)
 * - Clean vector-like output (no anti-aliasing artifacts)
 * - Easy text/dimension annotation
 * - Direct PDF export via canvas-to-PDF libraries
 *
 * DRAWING STANDARDS:
 * - Walls: thick lines (0.5mm at 1:50 scale)
 * - Windows: thin lines with break indication
 * - Doors: arc sweep showing opening direction
 * - Dimensions: outside the floor plan with extension lines
 * - Room labels: centered in each room with area
 *
 * TODO (Phase 6): Implement full PDF generation with pdf-lib
 * TODO (Phase 6): Add proper architectural line weights
 * TODO (Phase 6): Add title blocks and drawing numbers
 * =============================================================================
 */

import type { PSGProject, PSGNode, Material, MaterialSummaryItem } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

/** Drawing scale options */
export type DrawingScale = '1:50' | '1:100' | '1:200';

/** Paper sizes in mm */
export const PAPER_SIZES = {
  A4: { width: 297, height: 210 },   // Landscape A4
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
  A1: { width: 841, height: 594 },
} as const;

/** Export format options */
export interface ExportOptions {
  scale: DrawingScale;
  paper: keyof typeof PAPER_SIZES;
  include_dimensions: boolean;
  include_room_labels: boolean;
  include_furniture: boolean;        // Future: furniture layout
  title: string;
  drawn_by: string;
  date: string;
  project_number: string;
}

/** A generated drawing ready for export */
export interface GeneratedDrawing {
  type: 'floor_plan' | 'elevation' | 'section' | 'electrical' | 'plumbing';
  title: string;
  canvas_data_url: string;          // Base64 PNG from canvas.toDataURL()
  width_px: number;
  height_px: number;
}

// =============================================================================
// FLOOR PLAN GENERATION
// =============================================================================

/**
 * Generates a 2D floor plan from the PSG project.
 *
 * HOW IT WORKS:
 * 1. Filter nodes to a specific floor level
 * 2. Project all walls, windows, doors onto the XZ plane (top-down)
 * 3. Draw walls as filled rectangles
 * 4. Draw windows as thin lines with breaks
 * 5. Draw doors as arcs
 * 6. Add dimensions outside the plan
 * 7. Add room labels with areas
 *
 * COORDINATE MAPPING:
 * PSG (meters) → Drawing (mm at scale) → Canvas (pixels)
 * Example at 1:50: 1m → 20mm → 20 * DPI/25.4 pixels
 *
 * @param project - The PSG project
 * @param floorLevel - Which floor to draw (0 = ground, 1 = first, etc.)
 * @param options - Drawing options (scale, paper, annotations)
 * @returns GeneratedDrawing with canvas data URL
 */
/**
 * Generates a 2D floor plan from the PSG project as an SVG string.
 *
 * PSG (meters) → SVG (points/mm)
 */
export function generateFloorPlanSVG(
  project: PSGProject,
  floorLevel: number = 0,
  options: Partial<ExportOptions> = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const paper = PAPER_SIZES[opts.paper];
  const padding = 20; // mm padding from paper edge

  // 1. Filter nodes for the current floor
  const minY = floorLevel * 3;
  const maxY = (floorLevel + 1) * 3;
  const floorNodes = Object.values(project.nodes).filter(n =>
    n.position.y >= minY && n.position.y < maxY
  );

  if (floorNodes.length === 0) return '<svg xmlns="http://www.w3.org/2000/svg"><text y="20">No data found for this floor</text></svg>';

  // 2. Calculate Bounding Box in meters
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  floorNodes.forEach(n => {
    const hw = n.dimensions.x / 2;
    const hd = n.dimensions.z / 2;
    minX = Math.min(minX, n.position.x - hw);
    minZ = Math.min(minZ, n.position.z - hd);
    maxX = Math.max(maxX, n.position.x + hw);
    maxZ = Math.max(maxZ, n.position.z + hd);
  });

  const houseWidthM = maxX - minX;
  const houseDepthM = maxZ - minZ;

  // 3. Determine Scale & Offset
  const scaleRatio = getScaleRatio(opts.scale);
  const mmPerMeter = 1000 / scaleRatio;

  // Center the house on the paper
  const offsetX = (paper.width - houseWidthM * mmPerMeter) / 2 - (minX * mmPerMeter);
  const offsetZ = (paper.height - houseDepthM * mmPerMeter) / 2 - (minZ * mmPerMeter);

  // 4. Build SVG
  let svg = `<svg viewBox="0 0 ${paper.width} ${paper.height}" xmlns="http://www.w3.org/2000/svg" style="background:#fafafa; font-family:sans-serif;">
        <style>
            .wall { fill: #333; stroke: #000; stroke-width: 0.5px; }
            .window { fill: #fff; stroke: #000; stroke-width: 0.2px; }
            .door-leaf { stroke: #000; stroke-width: 0.3px; fill: none; }
            .door-swing { stroke: #666; stroke-width: 0.1px; fill: none; stroke-dasharray: 1 1; }
            .label { font-size: 3px; font-weight: 600; fill: #000; text-anchor: middle; }
            .area { font-size: 2px; fill: #666; text-anchor: middle; }
            .title-block { font-size: 4px; font-weight: 800; }
        </style>
        
        <!-- Background -->
        <rect width="100%" height="100%" fill="#fafafa" />
        
        <!-- Legend / Info -->
        <g transform="translate(${paper.width - 70}, ${paper.height - 25})">
            <text class="title-block" y="0">${opts.title}</text>
            <text x="0" y="5" font-size="2.5px" font-weight="bold">Drawn by: ${opts.drawn_by}</text>
            <text x="0" y="9" font-size="2.5px">Date: ${opts.date}</text>
            <text x="0" y="13" font-size="2.5px">Scale: ${opts.scale} @ ${opts.paper}</text>
        </g>
    `;

  // 5. Draw Walls
  floorNodes.filter(n => n.type === 'Wall' || n.type === 'Slab').forEach(n => {
    const x = n.position.x * mmPerMeter + offsetX;
    const z = n.position.z * mmPerMeter + offsetZ;
    const w = n.dimensions.x * mmPerMeter;
    const d = n.dimensions.z * mmPerMeter;
    const angle = n.rotation.yaw || 0;

    svg += `
        <rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" class="wall" 
              transform="translate(${x}, ${z}) rotate(${angle})" />`;
  });

  // 6. Draw Windows
  floorNodes.filter(n => n.type === 'Window').forEach(n => {
    const x = n.position.x * mmPerMeter + offsetX;
    const z = n.position.z * mmPerMeter + offsetZ;
    const w = n.dimensions.x * mmPerMeter;
    const d = n.dimensions.z * mmPerMeter;
    const angle = n.rotation.yaw || 0;

    svg += `
        <g transform="translate(${x}, ${z}) rotate(${angle})">
            <rect x="${-w / 2}" y="${-d / 2}" width="${w}" height="${d}" class="window" />
            <line x1="${-w / 2}" y1="0" x2="${w / 2}" y2="0" stroke="#000" stroke-width="0.1" />
        </g>`;
  });

  // 7. Draw Doors
  floorNodes.filter(n => n.type === 'Door').forEach(n => {
    const x = n.position.x * mmPerMeter + offsetX;
    const z = n.position.z * mmPerMeter + offsetZ;
    const w = n.dimensions.x * mmPerMeter; // Frame width
    const angle = n.rotation.yaw || 0;

    svg += `
        <g transform="translate(${x}, ${z}) rotate(${angle})">
            <line x1="${-w / 2}" y1="0" x2="${w / 2}" y2="0" stroke="#fff" stroke-width="0.6" />
            <line x1="${-w / 2}" y1="0" x2="${-w / 2 + w}" y2="${-w}" class="door-leaf" />
            <path d="M ${-w / 2 + w} 0 A ${w} ${w} 0 0 1 ${-w / 2 + w} ${-w}" class="door-swing" />
        </g>`;
  });

  // 8. Room Labels
  if (opts.include_room_labels) {
    floorNodes.filter(n => n.type === 'Room').forEach(n => {
      const x = n.position.x * mmPerMeter + offsetX;
      const z = n.position.z * mmPerMeter + offsetZ;
      const area = n.dimensions.x * n.dimensions.z;

      svg += `
            <text x="${x}" y="${z}" class="label">${n.name || 'Room'}</text>
            <text x="${x}" y="${z + 4}" class="area">${area.toFixed(1)}m²</text>`;
    });
  }

  svg += `</svg>`;
  return svg;
}


// =============================================================================
// MATERIAL SCHEDULE GENERATION
// =============================================================================

/**
 * Generates a material schedule (Bill of Quantities) as HTML table.
 *
 * COLUMNS:
 * | # | Material | Category | Volume (m³) | Weight (kg) | Unit Price | Total |
 *
 * This can be converted to CSV/XLSX or rendered as PDF.
 *
 * @param items - Material summary items from cost-calculator
 * @param currency - Currency symbol
 * @returns HTML string for the material schedule table
 */
export function generateMaterialScheduleHTML(
  items: MaterialSummaryItem[],
  currency: string = 'EUR'
): string {
  const currencySymbol = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;

  let html = `<table>
    <thead>
      <tr>
        <th>#</th>
        <th>Material</th>
        <th>Category</th>
        <th>Volume (m³)</th>
        <th>Weight (kg)</th>
        <th>Price/kg</th>
        <th>Total Cost</th>
        <th>Used In</th>
      </tr>
    </thead>
    <tbody>`;

  let totalCost = 0;

  items.forEach((item, index) => {
    totalCost += item.cost;
    html += `
      <tr>
        <td>${index + 1}</td>
        <td>${item.material.name}</td>
        <td>${item.material.category}</td>
        <td>${item.volume_m3.toFixed(3)}</td>
        <td>${item.weight_kg.toFixed(1)}</td>
        <td>${currencySymbol}${item.material.price_per_kg.toFixed(2)}</td>
        <td>${currencySymbol}${item.cost.toFixed(2)}</td>
        <td>${item.used_in.length} elements</td>
      </tr>`;
  });

  html += `
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6"><strong>TOTAL</strong></td>
        <td><strong>${currencySymbol}${totalCost.toFixed(2)}</strong></td>
        <td></td>
      </tr>
    </tfoot>
  </table>`;

  return html;
}

// =============================================================================
// HELPERS
// =============================================================================

const DEFAULT_OPTIONS: ExportOptions = {
  scale: '1:100',
  paper: 'A3',
  include_dimensions: true,
  include_room_labels: true,
  include_furniture: false,
  title: 'Floor Plan',
  drawn_by: 'AI Architect',
  date: new Date().toISOString().slice(0, 10),
  project_number: '001',
};

/** Converts a scale string to a numeric ratio */
function getScaleRatio(scale: DrawingScale): number {
  switch (scale) {
    case '1:50': return 50;
    case '1:100': return 100;
    case '1:200': return 200;
    default: return 100;
  }
}
