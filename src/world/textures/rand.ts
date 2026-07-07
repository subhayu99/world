// Seeded PRNG + hand-drawn wobble helpers. Pure math only — no canvas/DOM
// access here, so this module is safe to import and unit test anywhere.

/** A deterministic 0..1 random number generator. */
export type RNG = () => number;

export interface Point {
  x: number;
  y: number;
}

export interface WobbleOptions {
  /** Number of interior points along the line (excludes the two endpoints). Default 6. */
  segments?: number;
  /** Max perpendicular displacement applied to interior points. Default 1.5. */
  amplitude?: number;
  /** Seed driving the deterministic jitter. Default 1. */
  seed?: number;
}

/**
 * mulberry32 seeded PRNG. Same seed always produces the same sequence.
 * https://github.com/bryc/code/blob/master/jshash/PRNGs.md
 */
export function mulberry32(seed: number): RNG {
  let a = seed >>> 0;
  return function rng(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds a hand-drawn wobbly polyline between two points. Endpoints are
 * anchored exactly at (x1,y1)/(x2,y2); interior points are displaced along
 * the line's normal by a seeded random amount, so the same seed always
 * yields the same points (deterministic — required for stable renders and
 * for testing without a canvas).
 */
export function wobbleLine(x1: number, y1: number, x2: number, y2: number, opts: WobbleOptions = {}): Point[] {
  const { segments = 6, amplitude = 1.5, seed = 1 } = opts;
  const rng = mulberry32(seed);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  // unit normal to the line direction
  const nx = -dy / len;
  const ny = dx / len;

  const points: Point[] = [];
  const steps = Math.max(1, segments + 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bx = x1 + dx * t;
    const by = y1 + dy * t;
    if (i === 0 || i === steps) {
      points.push({ x: bx, y: by });
      continue;
    }
    const offset = (rng() * 2 - 1) * amplitude;
    points.push({ x: bx + nx * offset, y: by + ny * offset });
  }
  return points;
}

/**
 * Wobbles the interior vertices of an open polyline (first/last vertex stay
 * put), displacing each along the local normal formed by its neighbors.
 * Useful for jittering hand-authored shapes (e.g. a doodle's outline points)
 * without disturbing where the path starts/ends.
 */
export function wobblePolyline(points: readonly Point[], opts: WobbleOptions = {}): Point[] {
  const { amplitude = 1.5, seed = 1 } = opts;
  const rng = mulberry32(seed);
  const n = points.length;
  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    if (i === 0 || i === n - 1) {
      result.push({ x: p.x, y: p.y });
      continue;
    }
    const prev = points[i - 1];
    const next = points[i + 1];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = (rng() * 2 - 1) * amplitude;
    result.push({ x: p.x + nx * offset, y: p.y + ny * offset });
  }
  return result;
}

/**
 * Wobbles every vertex of a closed polygon (e.g. a rect's 4 corners),
 * wrapping neighbors around so there's no "anchored" seam.
 */
export function wobbleClosedPolygon(points: readonly Point[], opts: WobbleOptions = {}): Point[] {
  const { amplitude = 1.5, seed = 1 } = opts;
  const rng = mulberry32(seed);
  const n = points.length;
  if (n === 0) return [];
  const result: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const offset = (rng() * 2 - 1) * amplitude;
    result.push({ x: p.x + nx * offset, y: p.y + ny * offset });
  }
  return result;
}

/** Builds an axis-aligned rect's 4 corners, clockwise from top-left. */
export function rectPoints(x: number, y: number, w: number, h: number): Point[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
}
