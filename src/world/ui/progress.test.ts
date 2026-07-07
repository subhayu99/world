// Tests for the pure preloader/cover math + geometry helpers. No DOM/canvas —
// see progress.ts for the guarded rule: this module must stay side-effect free.

import { describe, expect, it } from 'vitest';
import {
  PANEL_PAPER_BACKGROUND,
  PANEL_TORN_CLIP,
  PAPER_GRAIN_LAYER,
  PAPER_GRID_BACKGROUND,
  PRELOADER_PAPER_BACKGROUND,
  ROUGHEN_FILTER_ID,
  TEAR_DASH_LENGTH,
  displayTarget,
  generateTearPoints,
  maxSoFar,
  percentFromTrackOffset,
  seededRandom,
  tearDashOffset,
  tearPointsToClipPath,
  tearPointsToSvgPath,
  tweenDuration,
  wobblyCirclePath,
  wobblyLinePath,
  wobblyRectPath,
} from './progress';

describe('displayTarget', () => {
  it('rescales raw progress into the 0-85 loading band while not ready', () => {
    expect(displayTarget(0, false)).toBe(0);
    expect(displayTarget(0.5, false)).toBeCloseTo(42.5, 5);
    expect(displayTarget(1, false)).not.toBe(85);
  });

  it('parks at 90 once raw hits 1 but the scene is not ready yet', () => {
    expect(displayTarget(1, false)).toBe(90);
  });

  it('snaps to 100 once the scene reports ready, regardless of raw', () => {
    expect(displayTarget(1, true)).toBe(100);
    expect(displayTarget(0.2, true)).toBe(100);
    expect(displayTarget(0, true)).toBe(100);
  });

  it('clamps out-of-range raw input into 0..1 before scaling', () => {
    expect(displayTarget(-0.5, false)).toBe(0);
    expect(displayTarget(1.5, false)).toBe(90);
  });
});

describe('maxSoFar', () => {
  it('never runs the displayed value backwards', () => {
    expect(maxSoFar(40, 60)).toBe(60);
    expect(maxSoFar(60, 40)).toBe(60);
    expect(maxSoFar(0, 0)).toBe(0);
  });

  it('is idempotent when called repeatedly with the same next value', () => {
    let acc = 0;
    acc = maxSoFar(acc, 10);
    acc = maxSoFar(acc, 10);
    acc = maxSoFar(acc, 5);
    expect(acc).toBe(10);
  });
});

describe('tweenDuration', () => {
  it('picks the slowest bucket for jumps over 60', () => {
    expect(tweenDuration(61)).toBe(1.5);
    expect(tweenDuration(100)).toBe(1.5);
  });

  it('picks 1.0s for jumps over 30 up to 60', () => {
    expect(tweenDuration(31)).toBe(1.0);
    expect(tweenDuration(60)).toBe(1.0);
  });

  it('picks 0.6s for jumps over 10 up to 30', () => {
    expect(tweenDuration(11)).toBe(0.6);
    expect(tweenDuration(30)).toBe(0.6);
  });

  it('picks 0.4s for jumps of 10 or fewer', () => {
    expect(tweenDuration(10)).toBe(0.4);
    expect(tweenDuration(1)).toBe(0.4);
    expect(tweenDuration(0)).toBe(0.4);
  });

  it('is symmetric for negative deltas (magnitude only)', () => {
    expect(tweenDuration(-61)).toBe(1.5);
    expect(tweenDuration(-11)).toBe(0.6);
    expect(tweenDuration(-2)).toBe(0.4);
  });
});

describe('seededRandom', () => {
  it('is deterministic for a given seed', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = seededRandom(1);
    const b = seededRandom(2);
    expect(a()).not.toBe(b());
  });

  it('stays within [0, 1)', () => {
    const rng = seededRandom(7);
    for (let i = 0; i < 50; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateTearPoints', () => {
  it('produces 13 points by default, spanning y 0..100 evenly', () => {
    const points = generateTearPoints(seededRandom(1));
    expect(points).toHaveLength(13);
    expect(points[0].y).toBe(0);
    expect(points[points.length - 1].y).toBe(100);
  });

  it('jitters x around 50 within +/-3', () => {
    const points = generateTearPoints(seededRandom(1));
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(47);
      expect(p.x).toBeLessThanOrEqual(53);
    }
  });

  it('is deterministic given the same rng seed', () => {
    const a = generateTearPoints(seededRandom(99));
    const b = generateTearPoints(seededRandom(99));
    expect(a).toEqual(b);
  });

  it('honors a custom point count', () => {
    const points = generateTearPoints(seededRandom(3), 5);
    expect(points).toHaveLength(5);
  });
});

describe('tearPointsToClipPath', () => {
  const points = generateTearPoints(seededRandom(5));

  it('anchors the left half polygon to the x=0 edge', () => {
    const clip = tearPointsToClipPath(points, 'left');
    expect(clip.startsWith('polygon(0% 0%,')).toBe(true);
    expect(clip.endsWith('0% 100%)')).toBe(true);
  });

  it('anchors the right half polygon to the x=100 edge', () => {
    const clip = tearPointsToClipPath(points, 'right');
    expect(clip.startsWith('polygon(100% 0%,')).toBe(true);
    expect(clip.endsWith('100% 100%)')).toBe(true);
  });

  it('includes every tear point in the polygon', () => {
    const clip = tearPointsToClipPath(points, 'left');
    for (const p of points) {
      expect(clip).toContain(`${p.x}% ${p.y}%`);
    }
  });
});

describe('tearPointsToSvgPath', () => {
  it('starts with an absolute move and draws a line per remaining point', () => {
    const points = generateTearPoints(seededRandom(2));
    const d = tearPointsToSvgPath(points);
    expect(d.startsWith(`M ${points[0].x} ${points[0].y}`)).toBe(true);
    expect(d.match(/L /g)).toHaveLength(points.length - 1);
  });

  it('returns an empty string for no points', () => {
    expect(tearPointsToSvgPath([])).toBe('');
  });
});

describe('tearDashOffset', () => {
  it('is fully offset (undrawn) at 0%', () => {
    expect(tearDashOffset(0)).toBe(TEAR_DASH_LENGTH);
  });

  it('is fully drawn (zero offset) at 100%', () => {
    expect(tearDashOffset(100)).toBe(0);
  });

  it('is halfway drawn at 50%', () => {
    expect(tearDashOffset(50)).toBeCloseTo(TEAR_DASH_LENGTH / 2, 5);
  });

  it('clamps out-of-range percentages', () => {
    expect(tearDashOffset(-10)).toBe(TEAR_DASH_LENGTH);
    expect(tearDashOffset(150)).toBe(0);
  });

  it('honors a custom dash length', () => {
    expect(tearDashOffset(0, 200)).toBe(200);
    expect(tearDashOffset(100, 200)).toBe(0);
  });
});

describe('wobblyRectPath', () => {
  it('starts and closes the path', () => {
    const d = wobblyRectPath(100, 40, seededRandom(11));
    expect(d.startsWith('M ')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('is deterministic given the same rng seed', () => {
    const a = wobblyRectPath(100, 40, seededRandom(11));
    const b = wobblyRectPath(100, 40, seededRandom(11));
    expect(a).toEqual(b);
  });

  it('keeps jittered points near the rectangle edges (within jitter bound)', () => {
    const jitter = 3;
    const d = wobblyRectPath(100, 40, seededRandom(4), jitter);
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    // every coordinate pair should be within [ -jitter, 100+jitter ] / [ -jitter, 40+jitter ]
    for (let i = 0; i < nums.length; i += 2) {
      const x = nums[i];
      const y = nums[i + 1];
      expect(x).toBeGreaterThanOrEqual(-jitter - 0.001);
      expect(x).toBeLessThanOrEqual(100 + jitter + 0.001);
      expect(y).toBeGreaterThanOrEqual(-jitter - 0.001);
      expect(y).toBeLessThanOrEqual(40 + jitter + 0.001);
    }
  });
});

describe('PAPER_GRID_BACKGROUND', () => {
  it('is a non-empty CSS background value referencing the paper + grid tokens', () => {
    expect(PAPER_GRID_BACKGROUND).toContain('#f7f5ef');
    expect(PAPER_GRID_BACKGROUND.toLowerCase()).toContain('repeating-linear-gradient');
  });
});

describe('wobblyCirclePath', () => {
  it('starts and closes the path', () => {
    const d = wobblyCirclePath(20, 12, seededRandom(1));
    expect(d.startsWith('M ')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('is deterministic given the same rng seed', () => {
    const a = wobblyCirclePath(20, 12, seededRandom(9));
    const b = wobblyCirclePath(20, 12, seededRandom(9));
    expect(a).toEqual(b);
  });

  it('emits one M/L command per requested point', () => {
    const d = wobblyCirclePath(10, 8, seededRandom(2));
    expect(d.match(/[ML] /g)).toHaveLength(8);
  });

  it('keeps every vertex within [radius - jitter, radius + jitter] of the origin', () => {
    const radius = 30;
    const jitter = 4;
    const d = wobblyCirclePath(radius, 20, seededRandom(3), jitter);
    const nums = d
      .replace('Z', '')
      .match(/-?\d+(\.\d+)?/g)!
      .map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      const dist = Math.hypot(nums[i], nums[i + 1]);
      expect(dist).toBeGreaterThanOrEqual(radius - jitter - 0.01);
      expect(dist).toBeLessThanOrEqual(radius + jitter + 0.01);
    }
  });
});

describe('wobblyLinePath', () => {
  it('starts at x=0 and ends at x=width', () => {
    const d = wobblyLinePath(100, 6, seededRandom(5));
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(nums[0]).toBe(0);
    expect(nums[nums.length - 2]).toBe(100);
  });

  it('is deterministic given the same rng seed', () => {
    const a = wobblyLinePath(100, 6, seededRandom(5));
    const b = wobblyLinePath(100, 6, seededRandom(5));
    expect(a).toEqual(b);
  });

  it('emits segments + 1 vertices for the requested segment count', () => {
    const d = wobblyLinePath(100, 5, seededRandom(4));
    expect(d.match(/[ML] /g)).toHaveLength(6);
  });

  it('keeps every y within the jitter bound', () => {
    const jitter = 3;
    const d = wobblyLinePath(100, 6, seededRandom(6), jitter);
    const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i + 1]).toBeGreaterThanOrEqual(-jitter - 0.01);
      expect(nums[i + 1]).toBeLessThanOrEqual(jitter + 0.01);
    }
  });
});

describe('percentFromTrackOffset', () => {
  it('maps 0/width and full-width offsets to 0 and 100', () => {
    expect(percentFromTrackOffset(0, 200)).toBe(0);
    expect(percentFromTrackOffset(200, 200)).toBe(100);
  });

  it('rounds to the nearest integer percent', () => {
    expect(percentFromTrackOffset(100, 300)).toBe(33);
    expect(percentFromTrackOffset(150, 200)).toBe(75);
  });

  it('clamps offsets past either end of the track', () => {
    expect(percentFromTrackOffset(-50, 200)).toBe(0);
    expect(percentFromTrackOffset(250, 200)).toBe(100);
  });

  it('returns 0 for a zero or negative track width instead of NaN/Infinity', () => {
    expect(percentFromTrackOffset(50, 0)).toBe(0);
    expect(percentFromTrackOffset(50, -10)).toBe(0);
  });
});

describe('PANEL_TORN_CLIP', () => {
  it('is a polygon() clip-path with teeth on all four edges (both 0% and 100% on each axis)', () => {
    expect(PANEL_TORN_CLIP.startsWith('polygon(')).toBe(true);
    expect(PANEL_TORN_CLIP).toContain('0%');
    expect(PANEL_TORN_CLIP).toContain('100%');
  });
});

describe('ROUGHEN_FILTER_ID', () => {
  it('is a non-empty, CSS-id-safe string', () => {
    expect(ROUGHEN_FILTER_ID.length).toBeGreaterThan(0);
    expect(ROUGHEN_FILTER_ID).toMatch(/^[a-zA-Z][\w-]*$/);
  });
});

describe('PAPER_GRAIN_LAYER', () => {
  // Was a feTurbulence/feColorMatrix SVG data: URI; replaced after it was
  // reproduced live rendering fully opaque black as a real background-image
  // (see progress.ts's doc comment on PAPER_GRAIN_LAYER) with a pure-CSS
  // tiled radial-gradient speck pattern — no SVG, no filter primitives, no
  // data: URI, so this whole failure class can't recur.
  it('is built from plain tiled radial-gradients (no SVG filter, self-contained either way)', () => {
    expect(PAPER_GRAIN_LAYER.toLowerCase()).toContain('radial-gradient');
    expect(PAPER_GRAIN_LAYER).not.toContain('data:image/svg+xml');
    expect(PAPER_GRAIN_LAYER).not.toContain('feTurbulence');
    expect(PAPER_GRAIN_LAYER).not.toContain('http://');
    expect(PAPER_GRAIN_LAYER).not.toContain('https://');
  });

  it('each gradient layer carries its own tile size so it repeats as small specks, not a full-size stretch', () => {
    // Every comma-separated layer should have a `/ <size>` after its
    // position; a plain gradient with no size defaults to stretching to
    // 100% of the element, which would look like a single soft blob rather
    // than paper grain.
    const layers = PAPER_GRAIN_LAYER.split(/,(?![^(]*\))/); // split on top-level commas only
    expect(layers.length).toBeGreaterThan(1);
    for (const layer of layers) {
      expect(layer).toMatch(/\/\s*\d/);
    }
  });
});

describe('PANEL_PAPER_BACKGROUND / PRELOADER_PAPER_BACKGROUND', () => {
  it('both layer the grain texture over the existing grid + paper background', () => {
    expect(PANEL_PAPER_BACKGROUND).toContain(PAPER_GRAIN_LAYER);
    expect(PANEL_PAPER_BACKGROUND).toContain(PAPER_GRID_BACKGROUND);
    expect(PRELOADER_PAPER_BACKGROUND).toContain(PAPER_GRAIN_LAYER);
    expect(PRELOADER_PAPER_BACKGROUND).toContain(PAPER_GRID_BACKGROUND);
  });

  it('preloader background additionally carries soft directional shadow gradients', () => {
    expect(PRELOADER_PAPER_BACKGROUND.toLowerCase()).toContain('radial-gradient');
  });
});
