// Canvas 2D draw helpers for the notebook aesthetic: paper/grid backgrounds
// and doodle sprites, each rendered in a "sketch" (ink only) and "painted"
// (ink + one colored-pencil accent) pass. Every function here takes an
// already-created 2D context and draws into it — nothing in this module
// creates a canvas or touches fonts itself, so importing it is always safe.
//
// Not unit tested directly: exercising real canvas drawing needs a real
// CanvasRenderingContext2D, which happy-dom does not provide. The pure math
// it leans on (seeded wobble, PRNG) lives in rand.ts and is fully tested
// there; factory.ts is responsible for wiring this module to real canvases
// at runtime.

import type { Point } from './rand';
import { mulberry32, rectPoints, wobbleClosedPolygon, wobbleLine } from './rand';

/** Either a real canvas 2D context or an OffscreenCanvas one — both share the drawing API we use. */
export type Canvas2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const PALETTE = {
  paper: '#f7f5ef',
  ink: '#2a2a2a',
  // Was '#c9d6e4' — a cool pale blue that read as CAD-blueprint grid lines
  // once tiled across the corridor's floor/walls (punchlist #3: "cold
  // grey-blue CAD palette"). Warmed toward a parchment tan so faint rules
  // sit naturally on PALETTE.paper instead of fighting it.
  grid: '#d3c8ac',
  blue: '#2f6fb5',
  red: '#c94f4f',
  green: '#4f9d69',
  amber: '#d9a441',
} as const;

export type DoodleMode = 'sketch' | 'painted';

export const DOODLE_KINDS = [
  'door',
  'sign',
  'parcel',
  'shelf',
  'trophy',
  'rosette',
  'gradcap',
  'sheet',
  'flag',
  'gear',
  'db',
  'pin',
  'duck',
  'cat',
  'rack',
  'speedo',
  'card',
  // Set-dressing vocabulary added for punchlist #4/#9/#20/#21/#24 (corridor
  // wall decor + year markers, registry/warehouse shelf dressing, empty-third
  // filler props) — every kind below has both a sketch and painted drawer,
  // same as the set above.
  'doorPanel',
  'signBoard',
  'deskLamp',
  'coffeeCup',
  'paperPlane',
  'crumpledBall',
  'pencilStub',
  'awardPlaque',
  'ceilingLight',
] as const;

export type DoodleKind = (typeof DOODLE_KINDS)[number];

export function isDoodleKind(value: string): value is DoodleKind {
  return (DOODLE_KINDS as readonly string[]).includes(value);
}

const DEFAULT_ACCENT: Record<DoodleKind, string> = {
  door: PALETTE.blue,
  sign: PALETTE.amber,
  parcel: PALETTE.amber,
  shelf: PALETTE.blue,
  trophy: PALETTE.amber,
  rosette: PALETTE.red,
  gradcap: PALETTE.blue,
  sheet: PALETTE.blue,
  flag: PALETTE.red,
  gear: PALETTE.blue,
  db: PALETTE.green,
  pin: PALETTE.red,
  duck: PALETTE.amber,
  cat: PALETTE.blue,
  rack: PALETTE.green,
  speedo: PALETTE.red,
  card: PALETTE.blue,
  doorPanel: PALETTE.blue,
  signBoard: PALETTE.amber,
  deskLamp: PALETTE.amber,
  coffeeCup: PALETTE.red,
  paperPlane: PALETTE.blue,
  crumpledBall: PALETTE.red,
  pencilStub: PALETTE.green,
  awardPlaque: PALETTE.amber,
  ceilingLight: PALETTE.amber,
};

export interface DoodleOptions {
  seed?: number;
  /** Accent hex color; defaults to a per-doodle colored-pencil choice. */
  accent?: string;
}

// ---- low-level path helpers ----

function tracePath(ctx: Canvas2D, points: readonly Point[], close = false): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  if (close) ctx.closePath();
}

function strokePoints(ctx: Canvas2D, points: readonly Point[], close = false): void {
  tracePath(ctx, points, close);
  ctx.stroke();
}

function fillPoints(ctx: Canvas2D, points: readonly Point[]): void {
  tracePath(ctx, points, true);
  ctx.fill();
}

function inkLine(ctx: Canvas2D, x1: number, y1: number, x2: number, y2: number, seed: number, amplitude = 1.2, segments = 6): void {
  strokePoints(ctx, wobbleLine(x1, y1, x2, y2, { seed, amplitude, segments }));
}

function inkRect(ctx: Canvas2D, x: number, y: number, w: number, h: number, seed: number, amplitude = 1.4): void {
  strokePoints(ctx, wobbleClosedPolygon(rectPoints(x, y, w, h), { seed, amplitude }), true);
}

function circlePoints(cx: number, cy: number, rx: number, ry: number, segments = 28): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

function inkEllipse(ctx: Canvas2D, cx: number, cy: number, rx: number, ry: number, seed: number, amplitude = 1): void {
  strokePoints(ctx, wobbleClosedPolygon(circlePoints(cx, cy, rx, ry), { seed, amplitude }), true);
}

function boundsOf(points: readonly Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Colored-pencil fill: a low-alpha flat wash plus a handful of overlapping
 * hatch strokes clipped to the shape, so accents read as scribbled-in color
 * rather than a flat vector fill.
 */
function pencilShade(ctx: Canvas2D, points: readonly Point[], color: string, seed: number, passes = 4): void {
  const b = boundsOf(points);
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  if (w <= 0 || h <= 0) return;

  ctx.save();
  tracePath(ctx, points, true);
  ctx.clip();

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(b.minX, b.minY, w, h);

  const rng = mulberry32(seed + 1000);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, h * 0.05);
  ctx.globalAlpha = 0.3;
  for (let i = 0; i < passes; i++) {
    const t = (i + 0.5) / passes;
    const y = b.minY + t * h + (rng() - 0.5) * h * 0.08;
    const line = wobbleLine(b.minX - 2, y, b.maxX + 2, y, { seed: seed + i + 1, amplitude: h * 0.05, segments: 5 });
    strokePoints(ctx, line);
  }
  ctx.restore();
}

function setInkStroke(ctx: Canvas2D, size: number): void {
  ctx.strokeStyle = PALETTE.ink;
  // Was size * 0.012 — judges called the doodle vocabulary "dust-speck" thin
  // (punchlist #21, #26). Bumped so every doodle's baseline outline reads as
  // a confident 2-3px pen stroke rather than a hairline.
  ctx.lineWidth = Math.max(1.5, size * 0.016);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

// ---- backgrounds ----

/** Warm paper fill with subtle fiber-noise flecks. Deterministic per seed. */
export function drawPaperBackground(ctx: Canvas2D, w: number, h: number, seed = 1): void {
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, w, h);

  const rng = mulberry32(seed);
  const flecks = Math.round((w * h) / 900);
  ctx.save();
  ctx.strokeStyle = PALETTE.ink;
  for (let i = 0; i < flecks; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const len = 1 + rng() * 3;
    const angle = rng() * Math.PI * 2;
    ctx.globalAlpha = 0.02 + rng() * 0.03;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }

  // A second, sparser pass of warm amber fiber flecks on top of the neutral
  // ink ones above — paper-grain warmth so large tiled surfaces (corridor
  // floor/walls) read as warm parchment rather than the cool grey-blue CAD
  // look judges flagged (punchlist #3, #20).
  const warmFlecks = Math.round(flecks * 0.4);
  ctx.strokeStyle = PALETTE.amber;
  for (let i = 0; i < warmFlecks; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const len = 1.5 + rng() * 4;
    const angle = rng() * Math.PI * 2;
    ctx.globalAlpha = 0.015 + rng() * 0.02;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    ctx.stroke();
  }
  ctx.restore();
}

export interface GraphGridOptions {
  cell?: number; // grid spacing in px, default ~ w/16
  seed?: number;
  majorEvery?: number; // draw a slightly stronger line every N cells, default 4
}

/** A darker, more saturated tone than PALETTE.grid, used only for the major
 * grid lines below — the corridor views this texture tiled across a long,
 * grazing-angle surface (floor/walls, viewed from CORRIDOR.cameraY = 0.2),
 * so a pale grid all but disappears into the paper once mip-mapped at any
 * real distance. Kept local to this function rather than added to PALETTE
 * so every other PALETTE.grid consumer (ruled lines, doodle frames) is
 * unaffected.
 *
 * Was '#7f96ad' — a blue-grey that read as CAD-blueprint linework rather
 * than ruled notebook paper (punchlist #3, #16: corridor is "cold grey-blue
 * CAD", "zero colored-pencil accents"). This is a warm ink-brown instead —
 * same weight/contrast against PALETTE.paper, just warm rather than cool. */
const GRID_MAJOR_COLOR = '#8a7455';

/** Graph-paper grid over a paper background. Major lines (every `majorEvery`
 * cells) are drawn bold/dark enough to read from a distance; minor lines stay
 * faint for close-up detail. */
export function drawGraphGrid(ctx: Canvas2D, w: number, h: number, opts: GraphGridOptions = {}): void {
  drawPaperBackground(ctx, w, h, opts.seed ?? 1);
  const cell = opts.cell ?? Math.max(8, w / 16);
  const majorEvery = opts.majorEvery ?? 4;

  ctx.save();
  let col = 0;
  for (let x = 0; x <= w; x += cell, col++) {
    const isMajor = col % majorEvery === 0;
    ctx.strokeStyle = isMajor ? GRID_MAJOR_COLOR : PALETTE.grid;
    ctx.globalAlpha = isMajor ? 0.85 : 0.32;
    ctx.lineWidth = isMajor ? 2 : 0.9;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  let row = 0;
  for (let y = 0; y <= h; y += cell, row++) {
    const isMajor = row % majorEvery === 0;
    ctx.strokeStyle = isMajor ? GRID_MAJOR_COLOR : PALETTE.grid;
    ctx.globalAlpha = isMajor ? 0.85 : 0.32;
    ctx.lineWidth = isMajor ? 2 : 0.9;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

export interface RuledLinesOptions {
  lineHeight?: number; // px between rules, default ~ h/14
  marginX?: number; // px, default ~ w*0.12
  seed?: number;
}

/** Ruled notebook-paper lines with a red left margin, over a paper background. */
export function drawRuledLines(ctx: Canvas2D, w: number, h: number, opts: RuledLinesOptions = {}): void {
  drawPaperBackground(ctx, w, h, opts.seed ?? 2);
  const lineHeight = opts.lineHeight ?? Math.max(10, h / 14);
  const marginX = opts.marginX ?? w * 0.12;

  ctx.save();
  ctx.strokeStyle = PALETTE.grid;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (let y = lineHeight; y < h; y += lineHeight) {
    ctx.beginPath();
    ctx.moveTo(marginX * 0.5, y);
    ctx.lineTo(w - marginX * 0.3, y);
    ctx.stroke();
  }
  ctx.strokeStyle = PALETTE.red;
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(marginX, 0);
  ctx.lineTo(marginX, h);
  ctx.stroke();
  ctx.restore();
}

/** A hand-wobbled ink rectangle frame (double-stroked for a sketchy look). */
export function drawInkFrame(ctx: Canvas2D, x: number, y: number, w: number, h: number, seed = 1): void {
  ctx.save();
  setInkStroke(ctx, Math.max(w, h));
  inkRect(ctx, x, y, w, h, seed, Math.max(1, Math.min(w, h) * 0.02));
  ctx.globalAlpha = 0.5;
  inkRect(ctx, x + 1, y + 1, w - 2, h - 2, seed + 17, Math.max(1, Math.min(w, h) * 0.015));
  ctx.restore();
}

export interface CardSheetOptions {
  seed?: number;
  /** Fraction of min(w,h) used for the dog-ear fold size. Default 0.12. */
  foldFraction?: number;
}

/**
 * Paper-card backdrop shared by textures/factory.ts's `card()` composer: a
 * wobbly paper rect with a folded top-right dog-ear corner and a few faint
 * ruled lines, sized to an arbitrary w x h — unlike `drawSheet` below (the
 * 'sheet' doodle kind), which is a square-doodle-sized variant of the same
 * idea. Draws directly into [0,0]-[w,h]; callers composite their own
 * text/doodle content on top, inside their own padded interior.
 */
export function drawCardSheet(ctx: Canvas2D, w: number, h: number, opts: CardSheetOptions = {}): void {
  const seed = opts.seed ?? 1;
  const short = Math.min(w, h);
  const m = short * 0.015;
  const fold = short * (opts.foldFraction ?? 0.12);

  drawPaperBackground(ctx, w, h, seed);

  ctx.save();
  setInkStroke(ctx, short);
  strokePoints(
    ctx,
    wobbleClosedPolygon(
      [
        { x: m, y: m },
        { x: w - m - fold, y: m },
        { x: w - m, y: m + fold },
        { x: w - m, y: h - m },
        { x: m, y: h - m },
      ],
      { seed, amplitude: Math.max(1, short * 0.006) },
    ),
    true,
  );

  // Dog-ear fold: a small filled flap (paper-shadow tint) with its own
  // crease outline, matching drawSheet's technique.
  const flap: Point[] = [
    { x: w - m - fold, y: m },
    { x: w - m, y: m + fold },
    { x: w - m - fold, y: m + fold },
  ];
  ctx.save();
  ctx.fillStyle = PALETTE.ink;
  ctx.globalAlpha = 0.08;
  fillPoints(ctx, flap);
  ctx.restore();
  strokePoints(ctx, wobbleClosedPolygon(flap, { seed: seed + 4, amplitude: Math.max(0.5, short * 0.003) }), true);

  // Faint ruled lines across the lower portion — a memo-pad flourish that
  // sits behind whatever text/doodle the caller composites on top.
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = Math.max(1, short * 0.005);
  ctx.strokeStyle = PALETTE.grid;
  const lineGap = Math.max(short * 0.09, 10);
  let ry = h * 0.24;
  let i = 0;
  while (ry < h - m * 2) {
    strokePoints(ctx, wobbleLine(m * 2, ry, w - m * 2, ry, { seed: seed + 50 + i, amplitude: 1, segments: 6 }));
    ry += lineGap;
    i++;
  }
  ctx.restore();
}

export interface WoodFloorOptions {
  seed?: number;
  /** Pixel height of each plank row. Default h/6. */
  plankHeight?: number;
}

/** Warm grey-brown ink used for wood grain — distinct from PALETTE.ink so
 * grain reads as a lighter, warmer material line than outline/text ink. */
const WOOD_INK = '#6b5a45';

/**
 * Procedural wood-plank floor: horizontal plank seams (wobbly, so they never
 * read as ruler-straight CAD lines) plus a few grain streaks and knots per
 * plank. Intended for scene/Corridor.tsx's floor material (punchlist #20:
 * "no wood-grain or graph-paper floor texture") and Registry's under-shelf
 * dressing (punchlist #24) — draws over a warm paper base via
 * drawPaperBackground so it tiles into the same palette as every other
 * surface.
 */
export function drawWoodFloor(ctx: Canvas2D, w: number, h: number, opts: WoodFloorOptions = {}): void {
  const seed = opts.seed ?? 3;
  drawPaperBackground(ctx, w, h, seed);

  ctx.save();
  ctx.fillStyle = PALETTE.amber;
  ctx.globalAlpha = 0.07;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  const plankHeight = opts.plankHeight ?? Math.max(16, h / 6);
  const rng = mulberry32(seed + 500);

  ctx.save();
  ctx.strokeStyle = WOOD_INK;
  let y = 0;
  let row = 0;
  while (y < h) {
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 1.6;
    strokePoints(ctx, wobbleLine(0, y, w, y, { seed: seed + row, amplitude: 1.6, segments: 10 }));

    const streaks = 2 + Math.floor(rng() * 2);
    for (let s = 0; s < streaks; s++) {
      const sy = y + plankHeight * (0.25 + rng() * 0.5);
      const sx1 = rng() * w * 0.6;
      const sLen = w * (0.15 + rng() * 0.25);
      ctx.globalAlpha = 0.16 + rng() * 0.08;
      ctx.lineWidth = 0.9;
      strokePoints(
        ctx,
        wobbleLine(sx1, sy, sx1 + sLen, sy, { seed: seed + row * 10 + s + 1, amplitude: 2, segments: 5 }),
      );
    }

    if (rng() > 0.4) {
      const kx = w * (0.15 + rng() * 0.7);
      const ky = y + plankHeight * (0.3 + rng() * 0.4);
      const kr = plankHeight * (0.06 + rng() * 0.05);
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 1;
      inkEllipse(ctx, kx, ky, kr, kr * 0.7, seed + row * 20 + 7, 0.6);
      inkEllipse(ctx, kx, ky, kr * 1.8, kr * 1.2, seed + row * 20 + 8, 0.8);
    }

    y += plankHeight;
    row += 1;
  }
  ctx.restore();
}

/**
 * Fallback art for any texture id that doesn't resolve to a known doodle
 * kind (see resolveDoodleKind in textures/factory.ts). Previously drew a
 * full corner-to-corner X across the frame — meant to read as "generic
 * panel" but indistinguishable from a broken-image placeholder, and it was
 * what every unrecognized id (e.g. the contact room's former 'desk/contact')
 * actually rendered. A plain double ink frame + wash reads as an intentional
 * blank page/panel instead.
 */
function genericFrame(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const m = size * 0.14;
  drawInkFrame(ctx, m, m, size - m * 2, size - m * 2, seed);
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(m, m, size - m * 2, size - m * 2), accent, seed + 5);
  }
}

// ---- doodle sprites ----

function drawDoor(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const m = size * 0.16;
  const w = size - m * 2;
  const h = size - m * 1.6;
  ctx.save();
  setInkStroke(ctx, size);
  inkRect(ctx, m, m, w, h, seed);
  // Inner frame line just inside the outer edge, for a bit of jamb depth.
  ctx.globalAlpha = 0.55;
  inkRect(ctx, m + w * 0.03, m + h * 0.03, w * 0.94, h * 0.94, seed + 30, 0.8);
  ctx.globalAlpha = 1;
  const panelInset = w * 0.14;
  const panelH = h * 0.42;
  inkRect(ctx, m + panelInset, m + h * 0.1, w - panelInset * 2, panelH, seed + 1, 1);
  inkRect(ctx, m + panelInset, m + h * 0.56, w - panelInset * 2, panelH, seed + 2, 1);
  inkEllipse(ctx, m + w * 0.82, m + h * 0.52, size * 0.02, size * 0.02, seed + 3, 0.6);
  // Threshold: a short wobbly line at the foot of the door.
  inkLine(ctx, m + w * 0.06, m + h + size * 0.01, m + w * 0.94, m + h + size * 0.01, seed + 4, 0.8, 3);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(m, m, w, h), accent, seed + 9, 5);
  }
}

function drawSign(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const boardW = size * 0.66;
  const boardH = size * 0.36;
  const x = (size - boardW) / 2;
  const y = size * 0.32;
  ctx.save();
  setInkStroke(ctx, size);
  inkLine(ctx, x + boardW * 0.15, y, x + boardW * 0.15, y - size * 0.16, seed + 1, 1, 3);
  inkLine(ctx, x + boardW * 0.85, y, x + boardW * 0.85, y - size * 0.16, seed + 2, 1, 3);
  // Nail/pin dots at the two hanger points — a bit of hardware detail.
  inkEllipse(ctx, x + boardW * 0.15, y - size * 0.16, size * 0.012, size * 0.012, seed + 40, 0.5);
  inkEllipse(ctx, x + boardW * 0.85, y - size * 0.16, size * 0.012, size * 0.012, seed + 41, 0.5);
  inkRect(ctx, x, y, boardW, boardH, seed);
  // Wood-grain streaks across the board.
  const rng = mulberry32(seed + 60);
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const gy = y + boardH * (0.28 + i * 0.24) + (rng() - 0.5) * boardH * 0.06;
    strokePoints(
      ctx,
      wobbleLine(x + boardW * 0.08, gy, x + boardW * (0.7 + rng() * 0.2), gy, { seed: seed + 70 + i, amplitude: 1.4, segments: 5 }),
    );
  }
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(x, y, boardW, boardH), accent, seed + 9, 3);
  }
}

/** Warm kraft-cardboard tan base fill for the parcel doodle. */
const CARDBOARD_TINT = PALETTE.amber;

function drawParcel(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const m = size * 0.2;
  const w = size - m * 2;
  const h = size - m * 2;

  // Opaque paper fill first — this doodle is reused as the FULL face
  // texture of the registry ParcelBox's inner mesh (rooms/Registry.tsx), an
  // *opaque* MeshBasicMaterial with no `transparent: true`. Every other
  // doodle here draws on an un-filled (fully transparent) canvas, which is
  // fine when composited as an icon over another textured plane — but an
  // opaque material sampling a transparent pixel gets that pixel's RGB
  // channel (0,0,0 = black) with no alpha blending, rendering flat black.
  // That's exactly punchlist #19's "box sides render as a solid, heavy
  // black fill". Filling the whole face up front means there is never a
  // transparent pixel for an opaque material to render as black.
  drawPaperBackground(ctx, size, size, seed);

  ctx.save();
  setInkStroke(ctx, size);
  inkRect(ctx, m, m, w, h, seed);
  inkLine(ctx, m, m + h * 0.4, m + w, m + h * 0.4, seed + 1, 1, 5);
  inkLine(ctx, m + w * 0.5, m, m + w * 0.5, m + h, seed + 2, 1, 5);
  ctx.restore();

  // Amber tape cross — the one saturated accent on every parcel (sketch and
  // painted alike), since this texture IS the box's full face rather than
  // an icon layered over a separate card background.
  ctx.save();
  ctx.strokeStyle = PALETTE.amber;
  ctx.lineWidth = Math.max(2, size * 0.03);
  ctx.globalAlpha = 0.85;
  inkLine(ctx, m, m + h * 0.4, m + w, m + h * 0.4, seed + 21, 1, 5);
  inkLine(ctx, m + w * 0.5, m, m + w * 0.5, m + h, seed + 22, 1, 5);
  ctx.restore();

  if (mode === 'painted') {
    // Warm cardboard tint: a low-alpha wash over the whole face, plus the
    // usual colored-pencil hatch shading inside the box outline.
    ctx.save();
    ctx.fillStyle = CARDBOARD_TINT;
    ctx.globalAlpha = 0.1;
    ctx.fillRect(0, 0, size, size);
    ctx.restore();
    pencilShade(ctx, rectPoints(m, m, w, h), accent, seed + 9, 4);
  }
}

function drawShelf(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const x = size * 0.12;
  const w = size * 0.76;
  const y = size * 0.42;
  const plankH = size * 0.07;
  ctx.save();
  setInkStroke(ctx, size);
  inkRect(ctx, x, y, w, plankH, seed);
  inkLine(ctx, x + w * 0.15, y + plankH, x + w * 0.05, y + plankH + size * 0.22, seed + 1, 1, 3);
  inkLine(ctx, x + w * 0.85, y + plankH, x + w * 0.95, y + plankH + size * 0.22, seed + 2, 1, 3);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(x, y, w, plankH), accent, seed + 9, 2);
  }
}

function drawTrophy(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size / 2;
  const cupTop = size * 0.24;
  const cupW = size * 0.4;
  const cupH = size * 0.28;
  ctx.save();
  setInkStroke(ctx, size);
  inkEllipse(ctx, cx, cupTop, cupW / 2, cupH * 0.22, seed);
  inkLine(ctx, cx - cupW / 2, cupTop, cx - cupW * 0.28, cupTop + cupH, seed + 1, 1, 4);
  inkLine(ctx, cx + cupW / 2, cupTop, cx + cupW * 0.28, cupTop + cupH, seed + 2, 1, 4);
  inkLine(ctx, cx - cupW * 0.28, cupTop + cupH, cx + cupW * 0.28, cupTop + cupH, seed + 3, 1, 4);
  inkLine(ctx, cx, cupTop + cupH, cx, cupTop + cupH + size * 0.16, seed + 4, 1, 3);
  inkRect(ctx, cx - size * 0.14, cupTop + cupH + size * 0.16, size * 0.28, size * 0.08, seed + 5);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(
      ctx,
      [
        { x: cx - cupW / 2, y: cupTop },
        { x: cx + cupW / 2, y: cupTop },
        { x: cx + cupW * 0.28, y: cupTop + cupH },
        { x: cx - cupW * 0.28, y: cupTop + cupH },
      ],
      accent,
      seed + 9,
      3,
    );
  }
}

function drawRosette(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size / 2;
  const cy = size * 0.38;
  const r = size * 0.22;
  const rng = mulberry32(seed);
  ctx.save();
  setInkStroke(ctx, size);
  const rays = 12;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const rr = r * (1 + (rng() - 0.5) * 0.15);
    inkLine(ctx, cx, cy, cx + Math.cos(a) * rr * 1.3, cy + Math.sin(a) * rr * 1.3, seed + i + 1, 1, 2);
  }
  inkEllipse(ctx, cx, cy, r, r, seed + 50);
  inkLine(ctx, cx - r * 0.3, cy + r, cx - r * 0.5, cy + r + size * 0.22, seed + 60, 1.5, 4);
  inkLine(ctx, cx + r * 0.3, cy + r, cx + r * 0.5, cy + r + size * 0.22, seed + 61, 1.5, 4);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, circlePoints(cx, cy, r, r), accent, seed + 9, 4);
  }
}

function drawGradCap(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size / 2;
  const cy = size * 0.42;
  const rx = size * 0.32;
  const ry = size * 0.14;
  ctx.save();
  setInkStroke(ctx, size);
  const board: Point[] = [
    { x: cx - rx, y: cy },
    { x: cx, y: cy - ry },
    { x: cx + rx, y: cy },
    { x: cx, y: cy + ry },
  ];
  strokePoints(ctx, wobbleClosedPolygon(board, { seed, amplitude: size * 0.008 }), true);
  inkEllipse(ctx, cx, cy + ry * 0.9, rx * 0.5, ry * 0.6, seed + 1);
  inkLine(ctx, cx + rx * 0.3, cy + ry * 0.2, cx + rx * 0.45, cy + ry * 1.8, seed + 2, 1, 4);
  inkEllipse(ctx, cx + rx * 0.45, cy + ry * 2.1, size * 0.02, size * 0.02, seed + 3, 0.5);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, board, accent, seed + 9, 3);
  }
}

function drawSheet(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const m = size * 0.2;
  const w = size - m * 2;
  const h = size - m * 2;
  const fold = size * 0.14;
  ctx.save();
  setInkStroke(ctx, size);
  strokePoints(
    ctx,
    wobbleClosedPolygon(
      [
        { x: m, y: m },
        { x: m + w - fold, y: m },
        { x: m + w, y: m + fold },
        { x: m + w, y: m + h },
        { x: m, y: m + h },
      ],
      { seed, amplitude: 1 },
    ),
    true,
  );

  // Dog-ear fold: a small filled flap (paper-shadow tint) with its own
  // crease outline — reads as a folded-down corner rather than a cut notch.
  const flap: Point[] = [
    { x: m + w - fold, y: m },
    { x: m + w, y: m + fold },
    { x: m + w - fold, y: m + fold },
  ];
  ctx.save();
  ctx.fillStyle = PALETTE.ink;
  ctx.globalAlpha = 0.08;
  fillPoints(ctx, flap);
  ctx.restore();
  strokePoints(ctx, wobbleClosedPolygon(flap, { seed: seed + 4, amplitude: 0.6 }), true);

  // 3-4 faint ruled lines inside the sheet — never a full-diagonal X.
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 4; i++) {
    const y = m + h * 0.32 + i * (h * 0.15);
    inkLine(ctx, m + w * 0.15, y, m + w * (0.78 - (i % 2) * 0.1), y, seed + 10 + i, 0.8, 3);
  }
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(m, m, w, h), accent, seed + 9, 3);
  }
}

function drawFlag(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const poleX = size * 0.28;
  ctx.save();
  setInkStroke(ctx, size);
  inkLine(ctx, poleX, size * 0.14, poleX, size * 0.86, seed, 1, 6);
  const flagPts = wobbleClosedPolygon(
    [
      { x: poleX, y: size * 0.16 },
      { x: size * 0.78, y: size * 0.24 },
      { x: size * 0.6, y: size * 0.34 },
      { x: size * 0.78, y: size * 0.44 },
      { x: poleX, y: size * 0.42 },
    ],
    { seed: seed + 1, amplitude: 1.2 },
  );
  strokePoints(ctx, flagPts, true);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, flagPts, accent, seed + 9, 3);
  }
}

function drawGear(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size * 0.3;
  const rInner = size * 0.19;
  const teeth = 8;
  const rng = mulberry32(seed);
  const pts: Point[] = [];
  for (let i = 0; i < teeth * 2; i++) {
    const a = (i / (teeth * 2)) * Math.PI * 2;
    const r = (i % 2 === 0 ? rOuter : rInner) * (1 + (rng() - 0.5) * 0.04);
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  ctx.save();
  setInkStroke(ctx, size);
  strokePoints(ctx, wobbleClosedPolygon(pts, { seed: seed + 1, amplitude: 0.8 }), true);
  inkEllipse(ctx, cx, cy, rInner * 0.4, rInner * 0.4, seed + 2, 0.6);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, pts, accent, seed + 9, 4);
  }
}

function drawDb(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size / 2;
  const top = size * 0.24;
  const bottom = size * 0.76;
  const rx = size * 0.24;
  const ry = size * 0.07;
  ctx.save();
  setInkStroke(ctx, size);
  inkEllipse(ctx, cx, top, rx, ry, seed);
  inkLine(ctx, cx - rx, top, cx - rx, bottom, seed + 1, 1, 5);
  inkLine(ctx, cx + rx, top, cx + rx, bottom, seed + 2, 1, 5);
  const midLine = wobbleLine(cx - rx, top + (bottom - top) * 0.33, cx + rx, top + (bottom - top) * 0.33, { seed: seed + 3, amplitude: 1, segments: 5 });
  strokePoints(ctx, midLine);
  const midLine2 = wobbleLine(cx - rx, top + (bottom - top) * 0.66, cx + rx, top + (bottom - top) * 0.66, { seed: seed + 4, amplitude: 1, segments: 5 });
  strokePoints(ctx, midLine2);
  strokePoints(ctx, wobbleClosedPolygon(circlePoints(cx, bottom, rx, ry), { seed: seed + 5, amplitude: 1 }), true);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(cx - rx, top, rx * 2, bottom - top), accent, seed + 9, 4);
  }
}

function drawPin(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size / 2;
  const cy = size * 0.36;
  const r = size * 0.2;
  ctx.save();
  setInkStroke(ctx, size);
  const teardrop = wobbleClosedPolygon(
    [
      { x: cx - r, y: cy - r * 0.2 },
      { x: cx - r * 0.6, y: cy - r * 0.95 },
      { x: cx, y: cy - r * 1.1 },
      { x: cx + r * 0.6, y: cy - r * 0.95 },
      { x: cx + r, y: cy - r * 0.2 },
      { x: cx, y: cy + r * 1.3 },
    ],
    { seed, amplitude: 1 },
  );
  strokePoints(ctx, teardrop, true);
  inkEllipse(ctx, cx, cy - r * 0.2, r * 0.32, r * 0.32, seed + 1, 0.5);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, teardrop, accent, seed + 9, 3);
  }
}

function drawDuck(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  // Explicit transparent clear — the corridor's rubber-duck easter egg was
  // reported as rendering "on a paper card" (a visible bounding rectangle),
  // which traced to the egg standing over the center rug-runner strip
  // rather than to anything drawn here. Guaranteed anyway: this doodle must
  // never carry a background fill, only ink, unlike drawParcel's
  // intentional opaque-face fill above.
  ctx.clearRect(0, 0, size, size);
  const cx = size * 0.46;
  const cy = size * 0.58;
  ctx.save();
  setInkStroke(ctx, size);
  inkEllipse(ctx, cx, cy, size * 0.26, size * 0.18, seed);
  inkEllipse(ctx, cx + size * 0.2, cy - size * 0.2, size * 0.14, size * 0.13, seed + 1);
  const beak = wobbleClosedPolygon(
    [
      { x: cx + size * 0.32, y: cy - size * 0.22 },
      { x: cx + size * 0.46, y: cy - size * 0.18 },
      { x: cx + size * 0.32, y: cy - size * 0.13 },
    ],
    { seed: seed + 2, amplitude: 0.6 },
  );
  strokePoints(ctx, beak, true);
  inkLine(ctx, cx - size * 0.05, cy - size * 0.03, cx + size * 0.1, cy - size * 0.1, seed + 3, 1, 3);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, circlePoints(cx, cy, size * 0.26, size * 0.18), accent, seed + 9, 3);
    pencilShade(ctx, circlePoints(cx + size * 0.2, cy - size * 0.2, size * 0.14, size * 0.13), accent, seed + 10, 2);
  }
}

function drawCat(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size * 0.5;
  const cy = size * 0.6;
  ctx.save();
  setInkStroke(ctx, size);
  const body = wobbleClosedPolygon(
    [
      { x: cx - size * 0.32, y: cy + size * 0.05 },
      { x: cx - size * 0.1, y: cy - size * 0.14 },
      { x: cx + size * 0.22, y: cy - size * 0.08 },
      { x: cx + size * 0.34, y: cy + size * 0.1 },
      { x: cx + size * 0.1, y: cy + size * 0.2 },
      { x: cx - size * 0.2, y: cy + size * 0.2 },
    ],
    { seed, amplitude: 1 },
  );
  strokePoints(ctx, body, true);
  const earL = wobbleClosedPolygon(
    [
      { x: cx - size * 0.2, y: cy - size * 0.1 },
      { x: cx - size * 0.24, y: cy - size * 0.22 },
      { x: cx - size * 0.12, y: cy - size * 0.15 },
    ],
    { seed: seed + 1, amplitude: 0.6 },
  );
  const earR = wobbleClosedPolygon(
    [
      { x: cx - size * 0.06, y: cy - size * 0.16 },
      { x: cx - size * 0.02, y: cy - size * 0.27 },
      { x: cx + size * 0.06, y: cy - size * 0.15 },
    ],
    { seed: seed + 2, amplitude: 0.6 },
  );
  strokePoints(ctx, earL, true);
  strokePoints(ctx, earR, true);
  inkLine(ctx, cx + size * 0.3, cy + size * 0.08, cx + size * 0.44, cy - size * 0.06, seed + 3, 2, 4);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, body, accent, seed + 9, 3);
  }
}

function drawRack(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const m = size * 0.18;
  const w = size - m * 2;
  const h = size - m * 2;
  const units = 4;
  ctx.save();
  setInkStroke(ctx, size);
  inkRect(ctx, m, m, w, h, seed);
  const unitH = h / units;
  for (let i = 1; i < units; i++) {
    inkLine(ctx, m, m + i * unitH, m + w, m + i * unitH, seed + i, 0.8, 4);
  }
  ctx.restore();
  const ledSeeds = mulberry32(seed + 200);
  for (let i = 0; i < units; i++) {
    const ly = m + unitH * (i + 0.5);
    const lit = ledSeeds() > 0.35;
    ctx.save();
    ctx.fillStyle = mode === 'painted' && lit ? accent : PALETTE.ink;
    ctx.globalAlpha = mode === 'painted' && lit ? 0.85 : 0.5;
    ctx.beginPath();
    ctx.arc(m + w * 0.88, ly, size * 0.015, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(m, m, w * 0.7, h), accent, seed + 9, 3);
  }
}

function drawSpeedo(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size / 2;
  const cy = size * 0.62;
  const r = size * 0.32;
  ctx.save();
  setInkStroke(ctx, size);
  const arc: Point[] = [];
  const segments = 16;
  for (let i = 0; i <= segments; i++) {
    const a = Math.PI + (i / segments) * Math.PI;
    arc.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  strokePoints(ctx, wobbleClosedPolygon(arc.slice(0, -1), { seed, amplitude: 1 }));
  const ticks = 8;
  for (let i = 0; i <= ticks; i++) {
    const a = Math.PI + (i / ticks) * Math.PI;
    const inner = { x: cx + Math.cos(a) * r * 0.86, y: cy + Math.sin(a) * r * 0.86 };
    const outer = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
    inkLine(ctx, inner.x, inner.y, outer.x, outer.y, seed + i + 1, 0.4, 2);
  }
  // needle pinned at max (rightmost angle = 2*PI, i.e. the dial's high end)
  const needleAngle = Math.PI * 1.98;
  inkLine(ctx, cx, cy, cx + Math.cos(needleAngle) * r * 0.8, cy + Math.sin(needleAngle) * r * 0.8, seed + 30, 1, 3);
  inkEllipse(ctx, cx, cy, size * 0.02, size * 0.02, seed + 31, 0.4);
  ctx.restore();
  if (mode === 'painted') {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(2, size * 0.02);
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needleAngle) * r * 0.8, cy + Math.sin(needleAngle) * r * 0.8);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCard(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const m = size * 0.1;
  const w = size - m * 2;
  const h = size - m * 2;
  drawInkFrame(ctx, m, m, w, h, seed);
  ctx.save();
  setInkStroke(ctx, size);
  ctx.globalAlpha = 0.7;
  inkLine(ctx, m + w * 0.1, m + h * 0.28, m + w * 0.9, m + h * 0.28, seed + 1, 0.8, 3);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(m, m, w, h * 0.28), accent, seed + 9, 2);
  }
}

// ---- doodle vocabulary additions (punchlist #4, #9, #20, #21, #24) ----

function drawDoorPanel(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const m = size * 0.14;
  const w = size - m * 2;
  const h = size - m * 1.4;
  ctx.save();
  setInkStroke(ctx, size);
  inkRect(ctx, m, m, w, h, seed);

  const gap = w * 0.08;
  const panelW = (w - gap * 3) / 2;
  const panelH = (h - gap * 3) / 2;
  let i = 0;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const px = m + gap + col * (panelW + gap);
      const py = m + gap + row * (panelH + gap);
      inkRect(ctx, px, py, panelW, panelH, seed + 1 + i, 1);
      i++;
    }
  }
  inkEllipse(ctx, m + w * 0.86, m + h * 0.52, size * 0.022, size * 0.022, seed + 20, 0.6);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(m, m, w, h), accent, seed + 9, 5);
  }
}

function drawSignBoard(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const boardW = size * 0.7;
  const boardH = size * 0.4;
  const x = (size - boardW) / 2;
  const y = size * 0.34;
  ctx.save();
  setInkStroke(ctx, size);
  // Rope hint (in place of sign's rigid wooden posts) up to an anchor knot.
  inkLine(ctx, x + boardW * 0.18, y, x + boardW * 0.1, y - size * 0.14, seed + 1, 1.4, 4);
  inkLine(ctx, x + boardW * 0.82, y, x + boardW * 0.9, y - size * 0.14, seed + 2, 1.4, 4);
  inkEllipse(ctx, size / 2, y - size * 0.16, size * 0.03, size * 0.02, seed + 3, 0.5);
  inkRect(ctx, x, y, boardW, boardH, seed);

  const rng = mulberry32(seed + 40);
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const gy = y + boardH * (0.2 + i * 0.2) + (rng() - 0.5) * boardH * 0.05;
    strokePoints(
      ctx,
      wobbleLine(x + boardW * 0.06, gy, x + boardW * (0.7 + rng() * 0.2), gy, { seed: seed + 60 + i, amplitude: 1.6, segments: 5 }),
    );
  }
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(x, y, boardW, boardH), accent, seed + 9, 4);
  }
}

function drawDeskLamp(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const baseY = size * 0.82;
  const baseW = size * 0.34;
  ctx.save();
  setInkStroke(ctx, size);
  inkLine(ctx, size * 0.5 - baseW / 2, baseY, size * 0.5 + baseW / 2, baseY, seed, 1, 4);
  inkLine(ctx, size * 0.5, baseY, size * 0.42, size * 0.5, seed + 1, 1, 4);
  inkLine(ctx, size * 0.42, size * 0.5, size * 0.62, size * 0.32, seed + 2, 1, 4);
  const shade = wobbleClosedPolygon(
    [
      { x: size * 0.6, y: size * 0.32 },
      { x: size * 0.8, y: size * 0.3 },
      { x: size * 0.86, y: size * 0.46 },
      { x: size * 0.54, y: size * 0.46 },
    ],
    { seed: seed + 3, amplitude: 1 },
  );
  strokePoints(ctx, shade, true);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 3; i++) {
    const a = size * 0.6 + i * size * 0.1;
    inkLine(ctx, a, size * 0.46, a - size * 0.02, size * 0.58, seed + 10 + i, 0.6, 2);
  }
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, shade, accent, seed + 9, 3);
  }
}

function drawCoffeeCup(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size * 0.46;
  const topY = size * 0.42;
  const bottomY = size * 0.74;
  const topW = size * 0.28;
  const bottomW = size * 0.22;
  ctx.save();
  setInkStroke(ctx, size);
  const cup = wobbleClosedPolygon(
    [
      { x: cx - topW / 2, y: topY },
      { x: cx + topW / 2, y: topY },
      { x: cx + bottomW / 2, y: bottomY },
      { x: cx - bottomW / 2, y: bottomY },
    ],
    { seed, amplitude: 1 },
  );
  strokePoints(ctx, cup, true);
  inkEllipse(ctx, cx, topY, topW / 2, topW * 0.12, seed + 1, 0.6);
  strokePoints(
    ctx,
    wobbleClosedPolygon(
      [
        { x: cx + topW * 0.5, y: topY + size * 0.06 },
        { x: cx + topW * 0.5 + size * 0.1, y: topY + size * 0.06 },
        { x: cx + topW * 0.5 + size * 0.1, y: topY + size * 0.18 },
        { x: cx + topW * 0.5, y: topY + size * 0.18 },
      ],
      { seed: seed + 2, amplitude: 0.8 },
    ),
    true,
  );
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 2; i++) {
    const sx = cx - topW * 0.2 + i * topW * 0.4;
    strokePoints(
      ctx,
      wobbleLine(sx, topY - size * 0.04, sx + (i === 0 ? -1 : 1) * size * 0.03, topY - size * 0.2, {
        seed: seed + 20 + i,
        amplitude: size * 0.03,
        segments: 5,
      }),
    );
  }
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, cup, accent, seed + 9, 3);
  }
}

function drawPaperPlane(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size * 0.5;
  const cy = size * 0.5;
  const body: Point[] = [
    { x: cx - size * 0.32, y: cy + size * 0.14 },
    { x: cx + size * 0.36, y: cy - size * 0.02 },
    { x: cx - size * 0.06, y: cy + size * 0.02 },
    { x: cx - size * 0.14, y: cy + size * 0.22 },
  ];
  ctx.save();
  setInkStroke(ctx, size);
  strokePoints(ctx, wobbleClosedPolygon(body, { seed, amplitude: 1 }), true);
  inkLine(ctx, cx - size * 0.06, cy + size * 0.02, cx + size * 0.36, cy - size * 0.02, seed + 1, 0.8, 3);
  inkLine(ctx, cx - size * 0.06, cy + size * 0.02, cx - size * 0.02, cy + size * 0.2, seed + 2, 0.8, 3);
  ctx.globalAlpha = 0.4;
  inkLine(ctx, cx - size * 0.44, cy + size * 0.06, cx - size * 0.34, cy + size * 0.06, seed + 3, 0.6, 2);
  inkLine(ctx, cx - size * 0.46, cy + size * 0.18, cx - size * 0.36, cy + size * 0.18, seed + 4, 0.6, 2);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, body, accent, seed + 9, 3);
  }
}

function drawCrumpledBall(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size * 0.5;
  const cy = size * 0.54;
  const r = size * 0.24;
  const rng = mulberry32(seed);
  const pts: Point[] = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.75 + rng() * 0.4);
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  ctx.save();
  setInkStroke(ctx, size);
  const blob = wobbleClosedPolygon(pts, { seed: seed + 1, amplitude: size * 0.02 });
  strokePoints(ctx, blob, true);
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(1, size * 0.008);
  for (let i = 0; i < 5; i++) {
    const a1 = rng() * Math.PI * 2;
    const a2 = a1 + Math.PI * (0.6 + rng() * 0.6);
    const p1 = { x: cx + Math.cos(a1) * r * 0.8, y: cy + Math.sin(a1) * r * 0.8 };
    const p2 = { x: cx + Math.cos(a2) * r * 0.8, y: cy + Math.sin(a2) * r * 0.8 };
    strokePoints(ctx, wobbleLine(p1.x, p1.y, p2.x, p2.y, { seed: seed + 30 + i, amplitude: size * 0.02, segments: 3 }));
  }
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, blob, accent, seed + 9, 3);
  }
}

function drawPencilStub(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const x1 = size * 0.26;
  const y1 = size * 0.74; // eraser end
  const x2 = size * 0.66;
  const y2 = size * 0.3; // tip end
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const half = size * 0.045;
  const tipLen = size * 0.1;
  const shaftEndX = x2 - ux * tipLen;
  const shaftEndY = y2 - uy * tipLen;

  ctx.save();
  setInkStroke(ctx, size);
  const body: Point[] = [
    { x: x1 + nx * half, y: y1 + ny * half },
    { x: shaftEndX + nx * half, y: shaftEndY + ny * half },
    { x: x2, y: y2 },
    { x: shaftEndX - nx * half, y: shaftEndY - ny * half },
    { x: x1 - nx * half, y: y1 - ny * half },
  ];
  strokePoints(ctx, wobbleClosedPolygon(body, { seed, amplitude: 1 }), true);
  const bandX = x1 + ux * size * 0.07;
  const bandY = y1 + uy * size * 0.07;
  inkLine(ctx, bandX + nx * half, bandY + ny * half, bandX - nx * half, bandY - ny * half, seed + 1, 0.8, 2);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, body, accent, seed + 9, 3);
  }
}

function drawAwardPlaque(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const w = size * 0.5;
  const h = size * 0.36;
  const x = (size - w) / 2;
  const y = size * 0.2;
  ctx.save();
  setInkStroke(ctx, size);
  drawInkFrame(ctx, x, y, w, h, seed);
  inkLine(ctx, x + w * 0.15, y + h * 0.4, x + w * 0.85, y + h * 0.4, seed + 1, 0.8, 3);
  inkLine(ctx, x + w * 0.15, y + h * 0.62, x + w * 0.7, y + h * 0.62, seed + 2, 0.8, 3);
  const ribbonTop = y + h;
  const ribbon = wobbleClosedPolygon(
    [
      { x: size * 0.5 - w * 0.14, y: ribbonTop },
      { x: size * 0.5 + w * 0.14, y: ribbonTop },
      { x: size * 0.5 + w * 0.1, y: ribbonTop + size * 0.24 },
      { x: size * 0.5, y: ribbonTop + size * 0.16 },
      { x: size * 0.5 - w * 0.1, y: ribbonTop + size * 0.24 },
    ],
    { seed: seed + 3, amplitude: 1 },
  );
  strokePoints(ctx, ribbon, true);
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, rectPoints(x, y, w, h), accent, seed + 9, 4);
    pencilShade(ctx, ribbon, accent, seed + 15, 2);
  }
}

function drawCeilingLight(ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string): void {
  const cx = size * 0.5;
  const ceilY = size * 0.08;
  const domeY = size * 0.34;
  const domeRx = size * 0.22;
  const domeRy = size * 0.14;
  ctx.save();
  setInkStroke(ctx, size);
  inkLine(ctx, cx, ceilY, cx, domeY - domeRy, seed, 0.8, 3);
  const dome = wobbleClosedPolygon(
    [
      { x: cx - domeRx, y: domeY },
      { x: cx - domeRx * 0.5, y: domeY - domeRy },
      { x: cx + domeRx * 0.5, y: domeY - domeRy },
      { x: cx + domeRx, y: domeY },
    ],
    { seed: seed + 1, amplitude: 1 },
  );
  strokePoints(ctx, dome, true);
  inkEllipse(ctx, cx, domeY, domeRx, domeRy * 0.3, seed + 2, 0.6);
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 5; i++) {
    const a = Math.PI * 0.2 + (i / 4) * Math.PI * 0.6;
    // Anchored at domeY (the dome's rim, per its polygon's outer points
    // above) rather than domeY + domeRy, so the rays start flush against
    // the dome instead of leaving a visible gap below it.
    const inner = { x: cx + Math.cos(a) * domeRx * 0.6, y: domeY + Math.sin(a) * domeRy * 0.6 };
    const outer = { x: cx + Math.cos(a) * domeRx * 1.3, y: domeY + Math.sin(a) * domeRy * 1.3 };
    inkLine(ctx, inner.x, inner.y, outer.x, outer.y, seed + 10 + i, 0.6, 2);
  }
  ctx.restore();
  if (mode === 'painted') {
    pencilShade(ctx, dome, accent, seed + 9, 3);
  }
}

const DOODLE_DRAWERS: Record<DoodleKind, (ctx: Canvas2D, size: number, mode: DoodleMode, seed: number, accent: string) => void> = {
  door: drawDoor,
  sign: drawSign,
  parcel: drawParcel,
  shelf: drawShelf,
  trophy: drawTrophy,
  rosette: drawRosette,
  gradcap: drawGradCap,
  sheet: drawSheet,
  flag: drawFlag,
  gear: drawGear,
  db: drawDb,
  pin: drawPin,
  duck: drawDuck,
  cat: drawCat,
  rack: drawRack,
  speedo: drawSpeedo,
  card: drawCard,
  doorPanel: drawDoorPanel,
  signBoard: drawSignBoard,
  deskLamp: drawDeskLamp,
  coffeeCup: drawCoffeeCup,
  paperPlane: drawPaperPlane,
  crumpledBall: drawCrumpledBall,
  pencilStub: drawPencilStub,
  awardPlaque: drawAwardPlaque,
  ceilingLight: drawCeilingLight,
};

/**
 * Draws a doodle sprite by id onto a square canvas region [0,size]x[0,size].
 * Unknown ids fall back to a generic ink frame rather than throwing, per the
 * TextureFactory contract.
 */
export function drawDoodle(ctx: Canvas2D, id: string, mode: DoodleMode, size: number, opts: DoodleOptions = {}): void {
  const seed = opts.seed ?? hashSeed(id);
  if (isDoodleKind(id)) {
    const accent = opts.accent ?? DEFAULT_ACCENT[id];
    DOODLE_DRAWERS[id](ctx, size, mode, seed, accent);
    return;
  }
  genericFrame(ctx, size, mode, seed, opts.accent ?? PALETTE.blue);
}

/** Deterministic small-int seed derived from a string id, so unseeded calls are still stable per id. */
export function hashSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
