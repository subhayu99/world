// Pure math for the Registry room: parcel-shelf layout, live-download-count
// formatting, and a defensive lookup into the pypi-stats.json shape. No
// THREE/DOM/canvas imports here on purpose — this file must stay importable
// and unit-testable under happy-dom with zero side effects.

import { mulberry32 } from '../textures/rand';

export const SHELF_TUNING = {
  /** Parcels per shelf row before wrapping to the next row. */
  cols: 4,
  /** x distance between adjacent columns. */
  colSpacing: 3.2,
  /** y distance between adjacent rows. */
  rowHeight: 2.6,
  /** y of row 0. */
  baseY: 1,
  /** Shared shelf-wall depth for every parcel. */
  z: -16,
} as const;

/** World-space shelf slot for one parcel box. */
export interface ShelfPosition {
  x: number;
  y: number;
  z: number;
  row: number;
  col: number;
}

/**
 * Column/row/world-space transform for parcel `index` in a `cols`-wide shelf
 * grid. Follows the frozen formulas x = (col-1.5)*3.2, y = 1 + row*2.6 for
 * the default 4-column layout; `cols` is generalized as
 * `(col - (cols-1)/2) * colSpacing` so the row stays centered on x=0 for any
 * width.
 */
export function shelfPosition(index: number, cols: number = SHELF_TUNING.cols): ShelfPosition {
  const safeCols = Math.max(1, Math.floor(cols));
  const col = index % safeCols;
  const row = Math.floor(index / safeCols);
  const centerOffset = (safeCols - 1) / 2;
  const x = (col - centerOffset) * SHELF_TUNING.colSpacing;
  const y = SHELF_TUNING.baseY + row * SHELF_TUNING.rowHeight;
  return { x, y, z: SHELF_TUNING.z, row, col };
}

/** Shelf transforms for all `n` parcels, in registry order. Never throws for bad input. */
export function shelfLayout(n: number, cols: number = SHELF_TUNING.cols): ShelfPosition[] {
  const count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  return Array.from({ length: count }, (_, i) => shelfPosition(i, cols));
}

/**
 * Formats a live download count with thousands separators (e.g. 12345 ->
 * "12,345"). Falls back to the data-authored string (e.g. "11.1k+") whenever
 * `n` is missing or isn't a sane non-negative finite number — 0 is a valid
 * count and is rendered as "0", not the fallback.
 */
export function formatDownloads(n: number | undefined, fallback: string): string {
  if (n === undefined || !Number.isFinite(n) || n < 0) return fallback;
  const rounded = Math.round(n);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Defensively resolves `packages[pypiPackage].total_all_time` out of a
 * pypi-stats.json-shaped payload (see `@/lib/pypiStats`'s `PyPIStatsData`).
 * Never throws: a `null` payload (loadPyPIStats() failed), a missing
 * `pypiPackage`, a malformed `packages` map, an absent package key, or a
 * non-numeric `total_all_time` all resolve to `undefined` so callers can
 * fall through to `Parcel.fallbackDownloads`.
 */
export function pickStats(statsJson: unknown, pypiPackage: string | undefined): number | undefined {
  if (!pypiPackage) return undefined;
  if (statsJson === null || typeof statsJson !== 'object') return undefined;

  const packages = (statsJson as { packages?: unknown }).packages;
  if (packages === null || typeof packages !== 'object') return undefined;

  const pkg = (packages as Record<string, unknown>)[pypiPackage];
  if (pkg === null || typeof pkg !== 'object') return undefined;

  const total = (pkg as { total_all_time?: unknown }).total_all_time;
  return typeof total === 'number' && Number.isFinite(total) ? total : undefined;
}

/** Small deterministic per-box tilt/scale so repeated parcels read as
 * hand-placed rather than mechanically identical (punchlist #24). */
export interface BoxJitter {
  /** Z-axis tilt in radians, capped small enough every row still reads as aligned. */
  rotationZ: number;
  /** Uniform scale multiplier. */
  scale: number;
}

/** Max +/- tilt in radians (~2.9deg) — enough to read as "placed by hand", not enough to break row alignment. */
export const JITTER_MAX_ROTATION = 0.05;
/** Max +/- fractional scale variance. */
export const JITTER_SCALE_RANGE = 0.06;

/**
 * Deterministic hand-placed jitter for shelf slot `index`: same index always
 * yields the same rotation/scale (stable across re-renders and tests), so
 * the variance reads as a deliberate hand-drawn choice rather than layout
 * noise. Magnitude is capped by JITTER_MAX_ROTATION/JITTER_SCALE_RANGE so
 * every shelf row still reads as one aligned row rather than a jumbled pile.
 */
export function boxJitter(index: number): BoxJitter {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.floor(index)) : 0;
  const rng = mulberry32(safeIndex * 2654435761 + 1);
  const rotationZ = (rng() * 2 - 1) * JITTER_MAX_ROTATION;
  const scale = 1 + (rng() * 2 - 1) * JITTER_SCALE_RANGE;
  return { rotationZ, scale };
}
