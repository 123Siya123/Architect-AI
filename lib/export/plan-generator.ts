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
export function generateFloorPlan(
    project: PSGProject,
    floorLevel: number = 0,
    options: Partial<ExportOptions> = {}
): GeneratedDrawing {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const scaleRatio = getScaleRatio(opts.scale);
    const paper = PAPER_SIZES[opts.paper];

    // Canvas resolution (150 DPI for screen, 300 for print)
    const dpi = 150;
    const canvasWidth = Math.round((paper.width / 25.4) * dpi);
    const canvasHeight = Math.round((paper.height / 25.4) * dpi);

    // TODO (Phase 6): Implement actual canvas drawing
    // For now, return a placeholder
    return {
        type: 'floor_plan',
        title: `Floor Plan — Level ${floorLevel} (${opts.scale})`,
        canvas_data_url: '', // Will be populated by canvas drawing
        width_px: canvasWidth,
        height_px: canvasHeight,
    };
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
