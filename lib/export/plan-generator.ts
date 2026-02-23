/**
 * =============================================================================
 * LIB/EXPORT/PLAN-GENERATOR.TS — Professional Architectural Drawing Generator
 * =============================================================================
 *
 * Generates standards-compliant architectural drawings from PSG data:
 *
 *  FLOOR PLANS
 *   - Scaled orthographic projection (top-down, 1:50 / 1:100 / 1:200)
 *   - Walls rendered as filled double-line sections (hatched section fill)
 *   - Windows: wall break with three-line convention (glass + frame lines)
 *   - Doors: open-arc swing + door leaf line
 *   - Room labels centered with area in m²
 *   - Dimension chains: overall + room-level dimensions with extension lines
 *   - Title block: project name, scale, north arrow, drawn-by, date
 *   - North arrow (simple arrow + N label)
 *
 *  ARCHITECTURAL LINE STANDARDS (ISO 128 / BS 1192):
 *   - Heavy (0.7pt)  — wall section cut outline
 *   - Medium (0.35pt) — door/window frames
 *   - Light (0.18pt)  — dimension lines, hatching
 *   - Fine (0.1pt)    — grid lines
 *
 *  COORDINATE MAPPING:
 *   PSG world (meters) → SVG (mm at chosen scale)
 *   At 1:50: 1m = 20mm. At 1:100: 1m = 10mm. At 1:200: 1m = 5mm
 *   SVG viewBox uses MM so that 1 SVG unit = 1mm on paper.
 * =============================================================================
 */

import type { PSGProject, PSGNode, Material, MaterialSummaryItem } from '@/types';

// =============================================================================
// TYPES
// =============================================================================

export type DrawingScale = '1:50' | '1:100' | '1:200';

export const PAPER_SIZES = {
  A4: { width: 297, height: 210 },
  A3: { width: 420, height: 297 },
  A2: { width: 594, height: 420 },
  A1: { width: 841, height: 594 },
} as const;

export interface ExportOptions {
  scale: DrawingScale;
  paper: keyof typeof PAPER_SIZES;
  include_dimensions: boolean;
  include_room_labels: boolean;
  include_furniture: boolean;
  include_grid: boolean;
  include_north_arrow: boolean;
  title: string;
  drawn_by: string;
  date: string;
  project_number: string;
  revision: string;
}

export interface GeneratedDrawing {
  type: 'floor_plan' | 'elevation' | 'section' | 'electrical' | 'plumbing';
  title: string;
  canvas_data_url: string;
  width_px: number;
  height_px: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_OPTIONS: ExportOptions = {
  scale: '1:100',
  paper: 'A3',
  include_dimensions: true,
  include_room_labels: true,
  include_furniture: false,
  include_grid: false,
  include_north_arrow: true,
  title: 'Floor Plan',
  drawn_by: 'AI Architect',
  date: new Date().toISOString().slice(0, 10),
  project_number: '001',
  revision: 'A',
};

/** Line weight definitions in mm (SVG stroke-width) */
const LW = {
  WALL_CUT: 0.7,     // Wall section outline (heaviest)
  OPENING: 0.35,    // Window / door frames
  DIM: 0.18,    // Dimension lines
  TEXT: 0,       // (handled by font-size)
  HATCH: 0.12,    // Wall hatch lines
  GRID: 0.08,    // Background grid
} as const;

/** Hatch spacing for wall section fill (mm at drawing scale) */
const HATCH_SPACING_MM = 1.5;

// =============================================================================
// FLOOR PLAN SVG GENERATOR
// =============================================================================

/**
 * Generates a complete architectural floor plan as an SVG string.
 *
 * @param project - The PSG project
 * @param floorLevel - Which floor (0 = ground, 1 = first, etc.)
 * @param options - Drawing options
 * @returns SVG string
 */
export function generateFloorPlanSVG(
  project: PSGProject,
  floorLevel: number = 0,
  options: Partial<ExportOptions> = {}
): string {
  const opts: ExportOptions = { ...DEFAULT_OPTIONS, ...options };
  const paper = PAPER_SIZES[opts.paper];
  const MARGIN = 20; // mm around the drawing area
  const TITLE_HEIGHT = 30; // mm for title block at bottom
  const DIM_LEADER = 8; // mm for dimension chain offset
  const DIM_OFFSET = 6; // mm for secondary dimension chain

  // ─── 1. Scale factor ────────────────────────────────────────────────────
  const scaleRatio = getScaleRatio(opts.scale);
  const mmPerMeter = 1000 / scaleRatio; // e.g., 1:100 → 10mm/m

  // ─── 2. Filter nodes for this floor ─────────────────────────────────────
  // A floor's nodes span from y = floorLevel*H to y = (floorLevel+1)*H
  // We identify the floor nodes by their Y position range
  const floorMin = floorLevel * 2.5;   // Conservative lower bound
  const floorMax = (floorLevel + 1) * 3.5; // Conservative upper bound

  const floorNodes = Object.values(project.nodes).filter(n => {
    if (n.type === 'House' || n.type === 'Floor' || n.type === 'Room') return false;
    return n.position.y >= floorMin && n.position.y <= floorMax;
  });

  // Include Room nodes explicitly for labels
  const roomNodes = Object.values(project.nodes).filter(n =>
    n.type === 'Room' && n.position.y >= floorMin && n.position.y <= floorMax
  );

  const wallNodes = floorNodes.filter(n => n.type === 'Wall' || n.type === 'Partition');
  const windowNodes = floorNodes.filter(n => n.type === 'Window');
  const doorNodes = floorNodes.filter(n => n.type === 'Door');
  const slabNodes = floorNodes.filter(n => n.type === 'Slab');

  if (wallNodes.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${paper.width} ${paper.height}"><text y="20" font-family="sans-serif" font-size="5">No wall data found for floor ${floorLevel}</text></svg>`;
  }

  // ─── 3. Compute bounding box (meters) ───────────────────────────────────
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  [...wallNodes, ...slabNodes].forEach(n => {
    const hw = n.dimensions.x / 2;
    const hd = n.dimensions.z / 2;
    minX = Math.min(minX, n.position.x - hw);
    minZ = Math.min(minZ, n.position.z - hd);
    maxX = Math.max(maxX, n.position.x + hw);
    maxZ = Math.max(maxZ, n.position.z + hd);
  });

  const houseW = maxX - minX;   // meters
  const houseD = maxZ - minZ;   // meters

  // Available drawing area (mm)
  const drawW = paper.width - 2 * MARGIN;
  const drawH = paper.height - MARGIN - TITLE_HEIGHT - MARGIN;

  // Auto-fit: if house doesn't fit at chosen scale, note it but keep scale
  const houseMmW = houseW * mmPerMeter;
  const houseMmH = houseD * mmPerMeter;

  // Center house within drawing area
  const offsetX = MARGIN + (drawW - houseMmW) / 2 - minX * mmPerMeter;
  const offsetZ = MARGIN + (drawH - houseMmH) / 2 - minZ * mmPerMeter;

  // Helper: world meters → SVG mm
  function toSvgX(worldX: number) { return worldX * mmPerMeter + offsetX; }
  function toSvgZ(worldZ: number) { return worldZ * mmPerMeter + offsetZ; }
  function toMm(meters: number) { return meters * mmPerMeter; }

  // ─── 4. Build SVG ────────────────────────────────────────────────────────
  let svg = `<svg
  viewBox="0 0 ${paper.width} ${paper.height}"
  xmlns="http://www.w3.org/2000/svg"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  width="${paper.width}mm" height="${paper.height}mm"
  style="background:#fff; font-family:'Arial',sans-serif;"
>
<defs>
  <!-- Wall hatch pattern (45° diagonal lines) -->
  <pattern id="wallHatch" x="0" y="0" width="${HATCH_SPACING_MM}" height="${HATCH_SPACING_MM}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <line x1="0" y1="0" x2="0" y2="${HATCH_SPACING_MM}" stroke="#555" stroke-width="${LW.HATCH}"/>
  </pattern>
  <!-- Concrete hatch (dots) -->
  <pattern id="concreteHatch" x="0" y="0" width="2" height="2" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="0.25" fill="#888"/>
  </pattern>
  <!-- Arrow marker for dimensions -->
  <marker id="arrowHead" viewBox="0 0 6 6" refX="6" refY="3"
    markerWidth="3" markerHeight="3" orient="auto">
    <path d="M 0 0 L 6 3 L 0 6 z" fill="#000"/>
  </marker>
  <marker id="arrowTail" viewBox="0 0 6 6" refX="0" refY="3"
    markerWidth="3" markerHeight="3" orient="auto-start-reverse">
    <path d="M 0 0 L 6 3 L 0 6 z" fill="#000"/>
  </marker>
</defs>

<!-- Paper border -->
<rect x="5" y="5" width="${paper.width - 10}" height="${paper.height - 10}"
  fill="none" stroke="#000" stroke-width="0.5"/>

<!-- Drawing area border -->
<rect x="${MARGIN}" y="${MARGIN}" width="${drawW}" height="${drawH}"
  fill="none" stroke="#999" stroke-width="0.2" stroke-dasharray="2 1"/>
`;

  // ─── 5. Background grid (optional) ───────────────────────────────────────
  if (opts.include_grid) {
    svg += `<!-- Grid -->\n<g id="grid" opacity="0.3">`;
    const gridStep = mmPerMeter; // 1m grid
    for (let gx = toSvgX(minX); gx <= toSvgX(maxX) + 1; gx += gridStep) {
      svg += `<line x1="${gx.toFixed(2)}" y1="${MARGIN}" x2="${gx.toFixed(2)}" y2="${MARGIN + drawH}" stroke="#aaa" stroke-width="${LW.GRID}"/>`;
    }
    for (let gz = toSvgZ(minZ); gz <= toSvgZ(maxZ) + 1; gz += gridStep) {
      svg += `<line x1="${MARGIN}" y1="${gz.toFixed(2)}" x2="${MARGIN + drawW}" y2="${gz.toFixed(2)}" stroke="#aaa" stroke-width="${LW.GRID}"/>`;
    }
    svg += `</g>\n`;
  }

  // ─── 6. Draw Slabs (faint floor fill) ────────────────────────────────────
  svg += `<!-- Slabs -->\n<g id="slabs">`;
  slabNodes.forEach(n => {
    // Slabs are just faint rects — they show the floor extent
    if (n.type !== 'Slab') return;
    const sx = toSvgX(n.position.x - n.dimensions.x / 2);
    const sz = toSvgZ(n.position.z - n.dimensions.z / 2);
    const sw = toMm(n.dimensions.x);
    const sh = toMm(n.dimensions.z);
    svg += `\n  <rect x="${sx.toFixed(3)}" y="${sz.toFixed(3)}" width="${sw.toFixed(3)}" height="${sh.toFixed(3)}"
    fill="#f5f5f0" stroke="none"/>`;
  });
  svg += `\n</g>\n`;

  // ─── 7. Draw Walls ────────────────────────────────────────────────────────
  svg += `<!-- Walls -->\n<g id="walls">`;
  wallNodes.forEach(n => {
    const wallSvg = drawWallSection(n, toSvgX, toSvgZ, toMm, project.nodes, LW);
    svg += wallSvg;
  });
  svg += `\n</g>\n`;

  // ─── 8. Draw Windows ──────────────────────────────────────────────────────
  svg += `<!-- Windows -->\n<g id="windows">`;
  windowNodes.forEach(n => {
    const parent = n.parent_id ? project.nodes[n.parent_id] : null;
    const winSvg = drawWindowSymbol(n, parent, toSvgX, toSvgZ, toMm, LW);
    svg += winSvg;
  });
  svg += `\n</g>\n`;

  // ─── 9. Draw Doors ────────────────────────────────────────────────────────
  svg += `<!-- Doors -->\n<g id="doors">`;
  doorNodes.forEach(n => {
    const parent = n.parent_id ? project.nodes[n.parent_id] : null;
    const doorSvg = drawDoorSymbol(n, parent, toSvgX, toSvgZ, toMm, LW);
    svg += doorSvg;
  });
  svg += `\n</g>\n`;

  // ─── 10. Room Labels ─────────────────────────────────────────────────────
  if (opts.include_room_labels) {
    svg += `<!-- Room Labels -->\n<g id="room-labels">`;
    roomNodes.forEach(n => {
      const cx = toSvgX(n.position.x);
      const cz = toSvgZ(n.position.z);
      const area = (n.dimensions.x * n.dimensions.z).toFixed(1);
      // Adaptive font size: bigger rooms get bigger text
      const maxDim = Math.min(n.dimensions.x, n.dimensions.z);
      const fontSize = Math.max(2, Math.min(4, maxDim * mmPerMeter / 5));
      svg += `
  <text x="${cx.toFixed(2)}" y="${(cz - fontSize * 0.6).toFixed(2)}"
    text-anchor="middle" font-size="${fontSize.toFixed(2)}px" font-weight="600" fill="#222">
    ${escapeXml(n.name || 'Room')}
  </text>
  <text x="${cx.toFixed(2)}" y="${(cz + fontSize * 0.8).toFixed(2)}"
    text-anchor="middle" font-size="${(fontSize * 0.8).toFixed(2)}px" fill="#666">
    ${area} m²
  </text>`;
    });
    svg += `\n</g>\n`;
  }

  // ─── 11. Dimension chains ─────────────────────────────────────────────────
  if (opts.include_dimensions) {
    svg += generateDimensionChains(
      wallNodes, toSvgX, toSvgZ, toMm, minX, maxX, minZ, maxZ,
      houseW, houseD, DIM_LEADER, DIM_OFFSET, LW.DIM
    );
  }

  // ─── 12. North Arrow ─────────────────────────────────────────────────────
  if (opts.include_north_arrow) {
    const nax = MARGIN + drawW - 15;
    const nay = MARGIN + 15;
    svg += `<!-- North Arrow -->
<g id="north-arrow" transform="translate(${nax}, ${nay})">
  <circle cx="0" cy="0" r="8" fill="white" stroke="#000" stroke-width="0.4"/>
  <path d="M 0,-7 L 3,3 L 0,1 L -3,3 Z" fill="#000"/>
  <path d="M 0,-7 L -3,3 L 0,1 L 3,3 Z" fill="white" stroke="#000" stroke-width="0.2"/>
  <text x="0" y="-9" text-anchor="middle" font-size="3.5" font-weight="bold" fill="#000">N</text>
</g>
`;
  }

  // ─── 13. Title Block ─────────────────────────────────────────────────────
  const tbY = paper.height - TITLE_HEIGHT;
  svg += `<!-- Title Block -->
<g id="title-block">
  <line x1="${MARGIN}" y1="${tbY}" x2="${paper.width - MARGIN}" y2="${tbY}" stroke="#000" stroke-width="0.5"/>
  
  <!-- Project info -->
  <text x="${MARGIN + 3}" y="${tbY + 6}" font-size="5" font-weight="800" fill="#000">${escapeXml(opts.title)}</text>
  <text x="${MARGIN + 3}" y="${tbY + 12}" font-size="3.5" fill="#333">${escapeXml(project.name)}</text>
  <text x="${MARGIN + 3}" y="${tbY + 18}" font-size="3" fill="#666">Floor ${floorLevel} — Total area: ${(houseW * houseD).toFixed(1)} m²</text>

  <!-- Drawing info box -->
  <line x1="${paper.width - 80}" y1="${tbY}" x2="${paper.width - 80}" y2="${paper.height - MARGIN}" stroke="#000" stroke-width="0.3"/>
  <text x="${paper.width - 40}" y="${tbY + 5}" text-anchor="middle" font-size="2.5" fill="#666">Drawn by:</text>
  <text x="${paper.width - 40}" y="${tbY + 10}" text-anchor="middle" font-size="3" font-weight="600" fill="#000">${escapeXml(opts.drawn_by)}</text>
  <line x1="${paper.width - 80}" y1="${tbY + 13}" x2="${paper.width - MARGIN}" y2="${tbY + 13}" stroke="#000" stroke-width="0.2"/>
  <text x="${paper.width - 40}" y="${tbY + 17}" text-anchor="middle" font-size="2.5" fill="#666">Scale:</text>
  <text x="${paper.width - 40}" y="${tbY + 22}" text-anchor="middle" font-size="3" font-weight="600" fill="#000">${opts.scale}  ${opts.paper}</text>
  <line x1="${paper.width - 80}" y1="${tbY + 24}" x2="${paper.width - MARGIN}" y2="${tbY + 24}" stroke="#000" stroke-width="0.2"/>
  <text x="${paper.width - 75}" y="${tbY + 28}" font-size="2.5" fill="#666">Date: ${opts.date}   Rev: ${opts.revision}   Dwg: ${opts.project_number}</text>
</g>
`;

  svg += `</svg>`;
  return svg;
}

// =============================================================================
// WALL SECTION DRAWING
// =============================================================================

/**
 * Draws a wall as a filled+hatched rectangle with openings cut out.
 *
 * For each Window/Door child of the wall:
 *  - The wall fill is interrupted at the opening
 *  - The opening is left white (void)
 *
 * ARCHITECTURAL CONVENTION:
 *  Walls at plan cut level (typically 1m above floor) are shown as:
 *  - Filled with hatch (cut section)
 *  - Thick outline
 *  - Openings shown as clean breaks
 */
function drawWallSection(
  wall: PSGNode,
  toSvgX: (x: number) => number,
  toSvgZ: (z: number) => number,
  toMm: (m: number) => number,
  allNodes: Record<string, PSGNode>,
  lw: typeof LW
): string {
  const W = wall.dimensions.x;
  const T = wall.dimensions.z;
  const yaw = Math.round(wall.rotation.yaw) % 180;
  const isNS = (yaw === 90 || yaw === -90);

  // World-space bounding box of the wall
  let wLeft: number, wRight: number, wTop: number, wBottom: number;

  if (isNS) {
    // Wall runs North-South (along Z)
    wLeft = wall.position.x - T / 2;
    wRight = wall.position.x + T / 2;
    wTop = wall.position.z - W / 2;
    wBottom = wall.position.z + W / 2;
  } else {
    // Wall runs East-West (along X)
    wLeft = wall.position.x - W / 2;
    wRight = wall.position.x + W / 2;
    wTop = wall.position.z - T / 2;
    wBottom = wall.position.z + T / 2;
  }

  // SVG coordinates
  const svgX = toSvgX(wLeft);
  const svgY = toSvgZ(wTop);
  const svgW = toMm(wRight - wLeft);
  const svgH = toMm(wBottom - wTop);

  const hatch = wall.type === 'Partition' ? 'url(#concreteHatch)' : 'url(#wallHatch)';
  const strokeW = wall.type === 'Partition' ? lw.WALL_CUT * 0.6 : lw.WALL_CUT;

  // Collect opening segments to clip out
  const children = wall.children_ids.map(id => allNodes[id]).filter(n => n && (n.type === 'Window' || n.type === 'Door'));

  if (children.length === 0) {
    // Simple filled rect
    return `
  <g class="wall">
    <rect x="${svgX.toFixed(3)}" y="${svgY.toFixed(3)}" width="${svgW.toFixed(3)}" height="${svgH.toFixed(3)}"
      fill="${hatch}" stroke="#000" stroke-width="${strokeW}" stroke-linejoin="miter"/>
  </g>`;
  }

  // Wall with openings — use SVG clip path or manual segment drawing
  // We draw the wall as SEGMENTS (rectangles) on either side of each opening
  let wallSvg = `\n  <g class="wall" data-id="${wall.id}">`;

  // Sort openings by their position along the wall's primary axis
  const sortedOpenings = [...children].sort((a, b) => {
    return isNS
      ? a.position.z - b.position.z
      : a.position.x - b.position.x;
  });

  // Build list of wall segments (start, end) in world meters along primary axis
  let segStart = isNS ? wTop : wLeft;
  const segEnd = isNS ? wBottom : wRight;
  const wallMin = segStart;
  const wallMax = segEnd;
  const segments: Array<{ start: number; end: number }> = [];

  for (const child of sortedOpenings) {
    const ow = child.opening_width ?? child.dimensions.x;
    let openStart: number, openEnd: number;

    if (isNS) {
      openStart = child.position.z - ow / 2;
      openEnd = child.position.z + ow / 2;
    } else {
      openStart = child.position.x - ow / 2;
      openEnd = child.position.x + ow / 2;
    }

    openStart = Math.max(wallMin, openStart);
    openEnd = Math.min(wallMax, openEnd);

    if (segStart < openStart) {
      segments.push({ start: segStart, end: openStart });
    }
    segStart = openEnd;
  }
  if (segStart < segEnd) {
    segments.push({ start: segStart, end: segEnd });
  }

  // Draw each wall segment
  for (const seg of segments) {
    let rx: number, ry: number, rw: number, rh: number;

    if (isNS) {
      rx = toSvgX(wLeft);
      ry = toSvgZ(seg.start);
      rw = toMm(wRight - wLeft);
      rh = toMm(seg.end - seg.start);
    } else {
      rx = toSvgX(seg.start);
      ry = toSvgZ(wTop);
      rw = toMm(seg.end - seg.start);
      rh = toMm(wBottom - wTop);
    }

    wallSvg += `
    <rect x="${rx.toFixed(3)}" y="${ry.toFixed(3)}" width="${rw.toFixed(3)}" height="${rh.toFixed(3)}"
      fill="${hatch}" stroke="#000" stroke-width="${strokeW}" stroke-linejoin="miter"/>`;
  }

  wallSvg += `\n  </g>`;
  return wallSvg;
}

// =============================================================================
// WINDOW SYMBOL
// =============================================================================

/**
 * Draws a window in the architectural floor plan convention:
 *  - The wall opening is clear (white void — drawn by wall seg gaps)
 *  - Inside the opening: three parallel lines (frame + glass)
 *    outer line = frame edge, middle line = glass pane, inner line = frame edge
 *
 * @param window - The Window node
 * @param parent - The parent Wall node
 */
function drawWindowSymbol(
  window: PSGNode,
  parent: PSGNode | null,
  toSvgX: (x: number) => number,
  toSvgZ: (z: number) => number,
  toMm: (m: number) => number,
  lw: typeof LW
): string {
  if (!parent) return '';

  const ow = window.opening_width ?? window.dimensions.x;
  const T = parent.dimensions.z;
  const yaw = Math.round(parent.rotation.yaw) % 180;
  const isNS = (yaw === 90 || yaw === -90);

  // Center of the opening
  const cx = window.position.x;
  const cz = window.position.z;

  let sx1: number, sy1: number, sx2: number, sy2: number; // opening extents

  if (isNS) {
    // Window span along Z (primary), wall thickness along X
    sx1 = toSvgX(parent.position.x - T / 2);
    sx2 = toSvgX(parent.position.x + T / 2);
    sy1 = toSvgZ(cz - ow / 2);
    sy2 = toSvgZ(cz + ow / 2);
  } else {
    // Window span along X, wall thickness along Z
    sx1 = toSvgX(cx - ow / 2);
    sx2 = toSvgX(cx + ow / 2);
    sy1 = toSvgZ(parent.position.z - T / 2);
    sy2 = toSvgZ(parent.position.z + T / 2);
  }

  const thick = toMm(T);
  const t3 = thick / 3; // divide into thirds

  if (isNS) {
    // Three horizontal lines across the opening (spanning X, within Z range)
    return `
  <g class="window" data-id="${window.id}">
    <line x1="${sx1.toFixed(2)}" y1="${sy1.toFixed(2)}" x2="${sx1.toFixed(2)}" y2="${sy2.toFixed(2)}" stroke="#000" stroke-width="${lw.OPENING}"/>
    <line x1="${(sx1 + t3).toFixed(2)}" y1="${sy1.toFixed(2)}" x2="${(sx1 + t3).toFixed(2)}" y2="${sy2.toFixed(2)}" stroke="#88aabb" stroke-width="${lw.OPENING * 0.7}"/>
    <line x1="${(sx2 - t3).toFixed(2)}" y1="${sy1.toFixed(2)}" x2="${(sx2 - t3).toFixed(2)}" y2="${sy2.toFixed(2)}" stroke="#88aabb" stroke-width="${lw.OPENING * 0.7}"/>
    <line x1="${sx2.toFixed(2)}" y1="${sy1.toFixed(2)}" x2="${sx2.toFixed(2)}" y2="${sy2.toFixed(2)}" stroke="#000" stroke-width="${lw.OPENING}"/>
    <!-- white void background -->
    <rect x="${sx1.toFixed(2)}" y="${sy1.toFixed(2)}" width="${(sx2 - sx1).toFixed(2)}" height="${(sy2 - sy1).toFixed(2)}" fill="white" stroke="none" z="-1"/>
  </g>`;
  } else {
    return `
  <g class="window" data-id="${window.id}">
    <line x1="${sx1.toFixed(2)}" y1="${sy1.toFixed(2)}" x2="${sx2.toFixed(2)}" y2="${sy1.toFixed(2)}" stroke="#000" stroke-width="${lw.OPENING}"/>
    <line x1="${sx1.toFixed(2)}" y1="${(sy1 + t3).toFixed(2)}" x2="${sx2.toFixed(2)}" y2="${(sy1 + t3).toFixed(2)}" stroke="#88aabb" stroke-width="${lw.OPENING * 0.7}"/>
    <line x1="${sx1.toFixed(2)}" y1="${(sy2 - t3).toFixed(2)}" x2="${sx2.toFixed(2)}" y2="${(sy2 - t3).toFixed(2)}" stroke="#88aabb" stroke-width="${lw.OPENING * 0.7}"/>
    <line x1="${sx1.toFixed(2)}" y1="${sy2.toFixed(2)}" x2="${sx2.toFixed(2)}" y2="${sy2.toFixed(2)}" stroke="#000" stroke-width="${lw.OPENING}"/>
    <!-- white void background -->
    <rect x="${sx1.toFixed(2)}" y="${sy1.toFixed(2)}" width="${(sx2 - sx1).toFixed(2)}" height="${(sy2 - sy1).toFixed(2)}" fill="white" stroke="none" z="-1"/>
  </g>`;
  }
}

// =============================================================================
// DOOR SYMBOL
// =============================================================================

/**
 * Draws a door in the architectural floor plan convention:
 *  - A thin line representing the door leaf (in open position, 90°)
 *  - An arc showing the swing path
 *
 * The door is shown swinging inward (into the room).
 */
function drawDoorSymbol(
  door: PSGNode,
  parent: PSGNode | null,
  toSvgX: (x: number) => number,
  toSvgZ: (z: number) => number,
  toMm: (m: number) => number,
  lw: typeof LW
): string {
  if (!parent) return '';

  const ow = door.opening_width ?? door.dimensions.x;
  const T = parent.dimensions.z;
  const yaw = Math.round(parent.rotation.yaw) % 180;
  const isNS = (yaw === 90 || yaw === -90);

  const cx = door.position.x;
  const cz = door.position.z;
  const r = toMm(ow); // door leaf radius in SVG mm

  // Hinge point = one end of the opening; swing toward interior
  let hx: number, hz: number; // hinge point (SVG coords)
  let ex: number, ez: number; // open position of leaf tip

  if (isNS) {
    // Door opening along Z, wall along X
    hx = toSvgX(parent.position.x - T / 2); // interior face
    hz = toSvgZ(cz - ow / 2);
    ex = hx + r;  // leaf swings to the interior (positive X in SVG = East)
    ez = hz;

    // White void
    const vx = toSvgX(parent.position.x - T / 2);
    const vy = toSvgZ(cz - ow / 2);
    const vw = toMm(T);
    const vh = toMm(ow);
    return `
  <g class="door" data-id="${door.id}">
    <rect x="${vx.toFixed(2)}" y="${vy.toFixed(2)}" width="${vw.toFixed(2)}" height="${vh.toFixed(2)}" fill="white" stroke="none"/>
    <!-- door leaf (hinge at top, swings right) -->
    <line x1="${hx.toFixed(2)}" y1="${hz.toFixed(2)}" x2="${ex.toFixed(2)}" y2="${(hz + r).toFixed(2)}" stroke="#000" stroke-width="${lw.OPENING}"/>
    <!-- swing arc (quarter circle) -->
    <path d="M ${hx.toFixed(2)} ${(hz + r).toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${ex.toFixed(2)} ${hz.toFixed(2)}"
      fill="none" stroke="#666" stroke-width="${lw.DIM}" stroke-dasharray="1.5 1"/>
    <!-- door frame lines -->
    <line x1="${vx.toFixed(2)}" y1="${vy.toFixed(2)}" x2="${(vx + vw).toFixed(2)}" y2="${vy.toFixed(2)}" stroke="#000" stroke-width="${lw.WALL_CUT}"/>
    <line x1="${vx.toFixed(2)}" y1="${(vy + vh).toFixed(2)}" x2="${(vx + vw).toFixed(2)}" y2="${(vy + vh).toFixed(2)}" stroke="#000" stroke-width="${lw.WALL_CUT}"/>
  </g>`;
  } else {
    // Door opening along X, wall along Z
    hx = toSvgX(cx - ow / 2);
    hz = toSvgZ(parent.position.z - T / 2);
    ex = hx;
    ez = hz + r;

    const vx = toSvgX(cx - ow / 2);
    const vy = toSvgZ(parent.position.z - T / 2);
    const vw = toMm(ow);
    const vh = toMm(T);

    return `
  <g class="door" data-id="${door.id}">
    <rect x="${vx.toFixed(2)}" y="${vy.toFixed(2)}" width="${vw.toFixed(2)}" height="${vh.toFixed(2)}" fill="white" stroke="none"/>
    <!-- door leaf -->
    <line x1="${hx.toFixed(2)}" y1="${hz.toFixed(2)}" x2="${(hx + r).toFixed(2)}" y2="${ez.toFixed(2)}" stroke="#000" stroke-width="${lw.OPENING}"/>
    <!-- swing arc -->
    <path d="M ${(hx + r).toFixed(2)} ${hz.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${hx.toFixed(2)} ${ez.toFixed(2)}"
      fill="none" stroke="#666" stroke-width="${lw.DIM}" stroke-dasharray="1.5 1"/>
    <!-- door frame -->
    <line x1="${vx.toFixed(2)}" y1="${vy.toFixed(2)}" x2="${vx.toFixed(2)}" y2="${(vy + vh).toFixed(2)}" stroke="#000" stroke-width="${lw.WALL_CUT}"/>
    <line x1="${(vx + vw).toFixed(2)}" y1="${vy.toFixed(2)}" x2="${(vx + vw).toFixed(2)}" y2="${(vy + vh).toFixed(2)}" stroke="#000" stroke-width="${lw.WALL_CUT}"/>
  </g>`;
  }
}

// =============================================================================
// DIMENSION CHAINS
// =============================================================================

/**
 * Generates horizontal and vertical dimension chain annotations.
 *
 * Produces:
 *  - Outer overall dimension (total house width and depth)
 *  - Inner room-level dimensions for each wall span
 *
 * CONVENTION:
 *  - Extension line from building edge, offset by DIM_LEADER
 *  - Dimensioned value in mm with arrow heads
 *  - Text centered on dimension line
 */
function generateDimensionChains(
  wallNodes: PSGNode[],
  toSvgX: (x: number) => number,
  toSvgZ: (z: number) => number,
  toMm: (m: number) => number,
  minX: number, maxX: number, minZ: number, maxZ: number,
  houseW: number, houseD: number,
  dimLeader: number, dimOffset: number,
  dimStroke: number
): string {
  let svg = `\n<!-- Dimension Chains -->\n<g id="dimensions">`;

  // Find wall faces to dimension
  // Collect unique X positions of EW walls and unique Z positions of NS walls
  const ewWallsX = new Set<number>();
  const nsWallsZ = new Set<number>();

  wallNodes.forEach(n => {
    const yaw = Math.round(n.rotation.yaw) % 180;
    if (yaw === 0) {
      // EW wall — contributes to Z (depth) dimensions
      nsWallsZ.add(parseFloat(n.position.z.toFixed(3)));
    } else {
      // NS wall — contributes to X (width) dimensions
      ewWallsX.add(parseFloat(n.position.x.toFixed(3)));
    }
  });

  // Ensure we include the house extremes
  ewWallsX.add(parseFloat(minX.toFixed(3)));
  ewWallsX.add(parseFloat(maxX.toFixed(3)));
  nsWallsZ.add(parseFloat(minZ.toFixed(3)));
  nsWallsZ.add(parseFloat(maxZ.toFixed(3)));

  const sortedX = [...ewWallsX].sort((a, b) => a - b);
  const sortedZ = [...nsWallsZ].sort((a, b) => a - b);

  const dimY_top = toSvgZ(minZ) - dimLeader;         // Horizontal dim chain above house
  const dimY_overall = dimY_top - dimOffset - 4;      // Second chain further above
  const dimX_left = toSvgX(minX) - dimLeader;        // Vertical dim chain left of house
  const dimX_overall = dimX_left - dimOffset - 4;     // Second chain further left

  // ── Horizontal dim chains (along X axis = width) ──────────────────────
  // Individual spans
  for (let i = 0; i < sortedX.length - 1; i++) {
    const x0 = sortedX[i];
    const x1 = sortedX[i + 1];
    const span = x1 - x0;
    if (span < 0.1) continue; // Skip tiny segments

    const sx0 = toSvgX(x0);
    const sx1 = toSvgX(x1);
    const midX = (sx0 + sx1) / 2;

    svg += dimLine(sx0, dimY_top, sx1, dimY_top, midX, dimY_top - 2.5, formatDim(span), dimStroke, false);
  }

  // Overall horizontal
  {
    const sx0 = toSvgX(minX);
    const sx1 = toSvgX(maxX);
    const midX = (sx0 + sx1) / 2;
    svg += dimLine(sx0, dimY_overall, sx1, dimY_overall, midX, dimY_overall - 2.5, formatDim(houseW) + ' TOTAL', dimStroke * 1.2, false);
  }

  // ── Vertical dim chains (along Z axis = depth) ────────────────────────
  for (let i = 0; i < sortedZ.length - 1; i++) {
    const z0 = sortedZ[i];
    const z1 = sortedZ[i + 1];
    const span = z1 - z0;
    if (span < 0.1) continue;

    const sz0 = toSvgZ(z0);
    const sz1 = toSvgZ(z1);
    const midZ = (sz0 + sz1) / 2;

    svg += dimLine(dimX_left, sz0, dimX_left, sz1, dimX_left - 3, midZ, formatDim(span), dimStroke, true);
  }

  // Overall vertical
  {
    const sz0 = toSvgZ(minZ);
    const sz1 = toSvgZ(maxZ);
    const midZ = (sz0 + sz1) / 2;
    svg += dimLine(dimX_overall, sz0, dimX_overall, sz1, dimX_overall - 3, midZ, formatDim(houseD) + ' TOTAL', dimStroke * 1.2, true);
  }

  svg += `\n</g>`;
  return svg;
}

/**
 * Creates a single dimension line SVG snippet with extension lines and text.
 */
function dimLine(
  x1: number, y1: number, x2: number, y2: number,
  textX: number, textY: number,
  label: string,
  strokeW: number,
  vertical: boolean
): string {
  const TICK = 1.5; // Extension line tick length

  if (vertical) {
    return `
  <!-- dim vertical ${label} -->
  <line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"
    stroke="#000" stroke-width="${strokeW}" marker-start="url(#arrowTail)" marker-end="url(#arrowHead)"/>
  <line x1="${(x1 + TICK).toFixed(2)}" y1="${y1.toFixed(2)}" x2="${(x1 - TICK * 2).toFixed(2)}" y2="${y1.toFixed(2)}" stroke="#000" stroke-width="${strokeW * 0.7}"/>
  <line x1="${(x2 + TICK).toFixed(2)}" y1="${y2.toFixed(2)}" x2="${(x2 - TICK * 2).toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#000" stroke-width="${strokeW * 0.7}"/>
  <text x="${textX.toFixed(2)}" y="${textY.toFixed(2)}" text-anchor="middle"
    font-size="2.8" fill="#000" transform="rotate(-90, ${textX.toFixed(2)}, ${textY.toFixed(2)})">${escapeXml(label)}</text>`;
  } else {
    return `
  <!-- dim horizontal ${label} -->
  <line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"
    stroke="#000" stroke-width="${strokeW}" marker-start="url(#arrowTail)" marker-end="url(#arrowHead)"/>
  <line x1="${x1.toFixed(2)}" y1="${(y1 + TICK).toFixed(2)}" x2="${x1.toFixed(2)}" y2="${(y1 - TICK * 2).toFixed(2)}" stroke="#000" stroke-width="${strokeW * 0.7}"/>
  <line x1="${x2.toFixed(2)}" y1="${(y2 + TICK).toFixed(2)}" x2="${x2.toFixed(2)}" y2="${(y2 - TICK * 2).toFixed(2)}" stroke="#000" stroke-width="${strokeW * 0.7}"/>
  <text x="${textX.toFixed(2)}" y="${textY.toFixed(2)}" text-anchor="middle"
    font-size="2.8" fill="#000">${escapeXml(label)}</text>`;
  }
}

// =============================================================================
// MATERIAL SCHEDULE
// =============================================================================

export function generateMaterialScheduleHTML(
  items: MaterialSummaryItem[],
  currency: string = 'EUR'
): string {
  const sym = currency === 'EUR' ? '€' : currency === 'USD' ? '$' : currency;
  let total = 0;

  let html = `<table style="width:100%;border-collapse:collapse;font-size:0.85rem">
  <thead style="background:#1e2a3a;color:#fff">
    <tr>
      <th style="padding:6px 8px;text-align:left">#</th>
      <th style="padding:6px 8px;text-align:left">Material</th>
      <th style="padding:6px 8px;text-align:left">Category</th>
      <th style="padding:6px 8px;text-align:right">Volume (m³)</th>
      <th style="padding:6px 8px;text-align:right">Weight (kg)</th>
      <th style="padding:6px 8px;text-align:right">Price/kg</th>
      <th style="padding:6px 8px;text-align:right">Total</th>
      <th style="padding:6px 8px;text-align:left">Used In</th>
    </tr>
  </thead>
  <tbody>`;

  items.forEach((item, i) => {
    total += item.cost;
    const bg = i % 2 === 0 ? '#ffffff' : '#f8f9fa';
    html += `
  <tr style="background:${bg}">
    <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb">${i + 1}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;font-weight:600">${item.material.name}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb">${item.material.category}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${item.volume_m3.toFixed(3)}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${item.weight_kg.toFixed(1)}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${sym}${item.material.price_per_kg.toFixed(2)}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:600">${sym}${item.cost.toFixed(2)}</td>
    <td style="padding:5px 8px;border-bottom:1px solid #e5e7eb">${item.used_in.length} elements</td>
  </tr>`;
  });

  html += `
  </tbody>
  <tfoot>
    <tr style="background:#f0f4f8;font-weight:800">
      <td colspan="6" style="padding:8px">TOTAL MATERIAL COST</td>
      <td style="padding:8px;text-align:right">${sym}${total.toFixed(2)}</td>
      <td></td>
    </tr>
  </tfoot>
</table>`;

  return html;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Converts a scale string to a numeric ratio (denominator) */
function getScaleRatio(scale: DrawingScale): number {
  switch (scale) {
    case '1:50': return 50;
    case '1:100': return 100;
    case '1:200': return 200;
    default: return 100;
  }
}

/**
 * Formats a dimension value in meters for display on drawings.
 * Uses mm for values < 1m, meters for larger.
 * e.g., 0.25 → "250", 4.5 → "4500", 12 → "12000"
 * Convention: show in mm (standard UK/EU architectural drawings)
 */
function formatDim(meters: number): string {
  const mm = Math.round(meters * 1000);
  return `${mm}`;
}

/** Escapes XML special characters for SVG text elements */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
