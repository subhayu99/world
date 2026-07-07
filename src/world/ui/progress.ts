// Pure preloader/cover math + geometry helpers (REPORT.md §4). No DOM, no
// canvas, no gsap side effects here — Preloader.tsx / Cover.tsx consume these
// and own all effectful rendering. Keep every export pure so progress.test.ts
// can exercise it directly in happy-dom without touching WebGL/canvas 2D.

/** Rescale raw THREE.DefaultLoadingManager progress (0..1) into the
 * displayed 0-100 band: 0-85 while loading, parked at 90 once raw completes
 * but the R3F scene hasn't signalled ready, snapped to 100 once it has. */
export function displayTarget(raw: number, sceneReady: boolean): number {
  if (sceneReady) return 100;
  const clamped = Math.min(Math.max(raw, 0), 1);
  if (clamped >= 1) return 90;
  return clamped * 85;
}

/** Monotonic clamp so the displayed percent never runs backwards frame to
 * frame (raw progress from the loading manager can jitter down slightly). */
export function maxSoFar(prev: number, next: number): number {
  return Math.max(prev, next);
}

/** Adaptive GSAP tween duration (seconds) for a jump in displayed percent. */
export function tweenDuration(delta: number): number {
  const jump = Math.abs(delta);
  if (jump > 60) return 1.5;
  if (jump > 30) return 1.0;
  if (jump > 10) return 0.6;
  return 0.4;
}

// ---- Jagged tear-line + wobble geometry (shared by Preloader split + Cover button) ----

export interface TearPoint {
  x: number; // 0..100, percent across width
  y: number; // 0..100, percent down height
}

/** Deterministic PRNG (mulberry32). Same seed -> same sequence, so tests can
 * assert exact geometry; components call it with `Math.random` as the
 * source and only need the seed for reproducible unit tests. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 13-point jagged vertical tear line: x = 50 +/- 3 jitter, y spread evenly
 * 0..100. Meant to be generated once per mount (memoize the rng call). */
export function generateTearPoints(rng: () => number = Math.random, count = 13): TearPoint[] {
  const points: TearPoint[] = [];
  const last = count - 1;
  for (let i = 0; i < count; i++) {
    const y = last === 0 ? 0 : (i / last) * 100;
    const jitter = (rng() * 2 - 1) * 3; // +/- 3
    points.push({ x: 50 + jitter, y });
  }
  return points;
}

/** Clip-path polygon for one half of the preloader, anchored to its outer
 * edge (x=0 for 'left', x=100 for 'right') and tracing the shared tear line
 * down the middle. */
export function tearPointsToClipPath(points: TearPoint[], side: 'left' | 'right'): string {
  const edgeX = side === 'left' ? 0 : 100;
  const tear = points.map((p) => `${p.x}% ${p.y}%`).join(', ');
  return `polygon(${edgeX}% 0%, ${tear}, ${edgeX}% 100%)`;
}

/** SVG path `d` tracing the same tear points as a polyline. */
export function tearPointsToSvgPath(points: TearPoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const segments = [`M ${first.x} ${first.y}`, ...rest.map((p) => `L ${p.x} ${p.y}`)];
  return segments.join(' ');
}

/** "Constant dash length" trick: pick a fixed strokeDasharray big enough to
 * cover the tear path, then offset it down to 0 as displayed % climbs to 100. */
export const TEAR_DASH_LENGTH = 120;

export function tearDashOffset(displayedPercent: number, dashLength: number = TEAR_DASH_LENGTH): number {
  const clamped = Math.min(Math.max(displayedPercent, 0), 100);
  return dashLength * (1 - clamped / 100);
}

/** Hand-dashed wobble border for the Cover "open the notebook" button: walks
 * the rectangle perimeter (corners + edge midpoints) and jitters each vertex
 * so the outline reads as hand-drawn rather than ruler-perfect. */
export function wobblyRectPath(width: number, height: number, rng: () => number = Math.random, jitter = 3): string {
  const j = () => (rng() * 2 - 1) * jitter;
  const corners: TearPoint[] = [
    { x: 0, y: 0 },
    { x: width / 2, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height / 2 },
    { x: width, y: height },
    { x: width / 2, y: height },
    { x: 0, y: height },
    { x: 0, y: height / 2 },
  ];
  const wobbled = corners.map((p) => ({ x: p.x + j(), y: p.y + j() }));
  const [first, ...rest] = wobbled;
  const segments = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`, ...rest.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)];
  return `${segments.join(' ')} Z`;
}

// ---- Shared notebook-paper background (no external assets, CSS only) ----

export const PAPER_COLORS = {
  paper: '#f7f5ef',
  ink: '#2a2a2a',
  grid: '#c9d6e4',
} as const;

/** Faint graph-grid over paper, built entirely from repeating-linear-gradient
 * so no texture asset is needed (CSP: no external URLs at runtime). Alpha
 * tuned a touch stronger than the original `4d` so the grid reads reliably
 * regardless of viewport size (punch-list #28: grid looked mobile-only). */
export const PAPER_GRID_BACKGROUND =
  `repeating-linear-gradient(0deg, transparent, transparent 27px, ${PAPER_COLORS.grid}5c 28px), ` +
  `repeating-linear-gradient(90deg, transparent, transparent 27px, ${PAPER_COLORS.grid}5c 28px), ` +
  `${PAPER_COLORS.paper}`;

// ---- Hand-drawn circle + line wobble (rings, slider tracks/thumbs, underlines) ----

/** Closed SVG path approximating a circle of `radius` centered at (0,0),
 * every vertex jittered so the outline reads as hand-drawn rather than a
 * mechanically perfect circle. Shared by the preloader's two loading rings,
 * the audio slider's thumb, and Cover's small doodles. */
export function wobblyCirclePath(radius: number, points = 16, rng: () => number = Math.random, jitter = 2): string {
  const coords: TearPoint[] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * Math.PI * 2;
    const r = radius + (rng() * 2 - 1) * jitter;
    coords.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
  }
  const [first, ...rest] = coords;
  const segments = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`, ...rest.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)];
  return `${segments.join(' ')} Z`;
}

/** Rounded 0-100 percent for a pointer/touch x position `offsetX` (already
 * relative to the track's own left edge) over a track of `width` px — the
 * pure hit-test math behind AudioPanel's hand-drawn slider (punchlist #15),
 * split out so it's testable without a DOM pointer event. Guards
 * `width <= 0` (still measuring / detached) by returning 0 rather than
 * NaN/Infinity. */
export function percentFromTrackOffset(offsetX: number, width: number): number {
  if (!(width > 0)) return 0;
  return Math.round(clampPercent((offsetX / width) * 100));
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/** Open SVG path for a horizontal hand-wobbled line from x=0 to x=width,
 * vertically jittered around y=0 (slider tracks, hand-drawn underlines). */
export function wobblyLinePath(width: number, segments = 8, rng: () => number = Math.random, jitter = 2): string {
  const points: TearPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const x = (i / segments) * width;
    const y = (rng() * 2 - 1) * jitter;
    points.push({ x, y });
  }
  const [first, ...rest] = points;
  const path = [`M ${first.x.toFixed(2)} ${first.y.toFixed(2)}`, ...rest.map((p) => `L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)];
  return path.join(' ');
}

// ---- Shared HUD panel chrome (torn-all-sides clip-path, paper grain, wobble filter) ----

/** Torn-notebook-page silhouette with zigzag/deckle teeth on all four edges.
 * The three drop-down panels previously only tore the bottom edge, leaving
 * three ruler-straight 90-degree corners (punch-list #14) — this replaces
 * that shape everywhere. Percentage-based so it holds up across each
 * panel's actual rendered width/height. */
export const PANEL_TORN_CLIP =
  'polygon(' +
  '0% 8%, 6% 0%, 16% 9%, 28% 0%, 40% 10%, 52% 0%, 64% 9%, 76% 0%, 86% 10%, 94% 0%, ' +
  '100% 4%, 96% 14%, 100% 26%, 96% 38%, 100% 50%, 96% 62%, 100% 74%, 96% 86%, 100% 96%, ' +
  '94% 100%, 86% 90%, 76% 100%, 64% 91%, 52% 100%, 40% 90%, 28% 100%, 16% 91%, 6% 100%, 0% 92%, ' +
  '4% 82%, 0% 70%, 4% 58%, 0% 46%, 4% 34%, 0% 22%, 4% 10%' +
  ')';

/** Soft, warm elevation shadow for the torn panels. `box-shadow` follows an
 * element's rectangular border-box even when `clip-path` carves it into a
 * torn silhouette (the shadow would show through the teeth as a rectangle),
 * so panels use `filter: drop-shadow()` instead — it respects the clipped
 * alpha shape. Two stacked passes give a soft/near + tight/close falloff. */
export const PANEL_DROP_SHADOW = 'drop-shadow(0 14px 22px rgba(60,42,20,0.24)) drop-shadow(0 3px 6px rgba(60,42,20,0.16))';

/** Shared id for the SVG turbulence+displacement filter that roughens small
 * HUD glyphs (nav triggers, checkboxes, slider thumb, mute icon) into a
 * jittered ink-stroke look instead of a clean vector line (punch-list #26).
 * Hud.tsx mounts the single `<filter>` definition once, synchronously with
 * every consumer below it in the same tree — MapPanel/AudioPanel/
 * AchievementsPanel/QuestToast just reference `filter: url(#<id>)`. Not used
 * by Preloader/Cover, which mount independently of Hud and hand-jitter their
 * own path data instead (no risk of the filter def not existing yet). */
export const ROUGHEN_FILTER_ID = 'world-hud-roughen';

/**
 * Procedural paper-grain layer stacked over the faint graph-grid so HUD
 * panels + the preloader read as textured paper instead of a flat tint
 * (punch-list #17, #26).
 *
 * This used to be a `feTurbulence` + `feColorMatrix` SVG filter embedded as
 * a `data:` URI `background-image`. That rendered correctly as a standalone
 * `<img>`/inline-SVG, but as a *background-image* on a real HUD panel
 * (MapPanel, the only real consumer) it painted the entire tile fully
 * opaque black instead of a faint 6%-alpha texture — reproduced live (not
 * just read from code): the map panel's torn-paper card was solid black
 * with only the pin icons readable, independent of that panel's `filter`
 * (CSS drop-shadow) or `clip-path`, which were ruled out individually by
 * toggling each off live and still seeing solid black; removing only the
 * background image chain (swapping in a plain solid color) was what fixed
 * it. Root cause not fully isolated (likely a color-interpolation-filters /
 * rasterized-background-image edge case for `feColorMatrix`-derived alpha
 * in this engine), but the whole class of risk is avoidable: this replaces
 * it with a handful of tiny tiled `radial-gradient` specks — no SVG, no
 * filter primitives, no data: URI — which cannot exhibit that failure mode
 * and is exactly as CSP-safe (zero network requests either way). Each
 * gradient layer carries its own `<position> / <size>` so it tiles as a
 * small repeating speck pattern instead of stretching to the element's full
 * size (the `background-image` default for a plain gradient).
 */
export const PAPER_GRAIN_LAYER =
  `radial-gradient(circle, ${PAPER_COLORS.ink}14 0.5px, transparent 1.1px) 2px 4px / 17px 19px, ` +
  `radial-gradient(circle, ${PAPER_COLORS.ink}11 0.5px, transparent 1px) 11px 13px / 23px 21px, ` +
  `radial-gradient(circle, ${PAPER_COLORS.ink}14 0.6px, transparent 1.2px) 6px 16px / 20px 17px, ` +
  `radial-gradient(circle, ${PAPER_COLORS.ink}0f 0.5px, transparent 1px) 15px 6px / 15px 25px`;

/** Grain + grid + paper, for the three drop-down panels and the quest toast. */
export const PANEL_PAPER_BACKGROUND = `${PAPER_GRAIN_LAYER}, ${PAPER_GRID_BACKGROUND}`;

/** Grain + a few soft directional shadow gradients (simulated crumple) + grid
 * + paper, for the full-screen preloader (punch-list #17: "no crumple
 * creases ... directional shadow gradients"). */
export const PRELOADER_PAPER_BACKGROUND =
  `${PAPER_GRAIN_LAYER}, ` +
  `radial-gradient(ellipse 60% 45% at 12% 15%, ${PAPER_COLORS.ink}26, transparent 70%), ` +
  `radial-gradient(ellipse 55% 60% at 88% 80%, ${PAPER_COLORS.ink}22, transparent 70%), ` +
  `radial-gradient(ellipse 70% 50% at 50% 100%, ${PAPER_COLORS.ink}1c, transparent 70%), ` +
  `${PAPER_GRID_BACKGROUND}`;
