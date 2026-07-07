import { describe, expect, it } from 'vitest';
import { mulberry32, rectPoints, wobbleClosedPolygon, wobbleLine, wobblePolyline } from './rand';

describe('mulberry32', () => {
  it('produces a deterministic sequence for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect(a()).not.toBe(b());
  });

  it('stays within [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('normalizes negative and fractional seeds via >>> 0 coercion', () => {
    const a = mulberry32(-5);
    const b = mulberry32(-5);
    expect(a()).toBe(b());
  });
});

describe('wobbleLine', () => {
  it('is deterministic: same seed => same points', () => {
    const p1 = wobbleLine(0, 0, 100, 0, { seed: 5, segments: 8, amplitude: 3 });
    const p2 = wobbleLine(0, 0, 100, 0, { seed: 5, segments: 8, amplitude: 3 });
    expect(p1).toEqual(p2);
  });

  it('produces different interior points for different seeds', () => {
    const p1 = wobbleLine(0, 0, 100, 0, { seed: 1, segments: 8, amplitude: 3 });
    const p2 = wobbleLine(0, 0, 100, 0, { seed: 2, segments: 8, amplitude: 3 });
    // interior points should differ (endpoints will still match)
    const interior1 = p1.slice(1, -1);
    const interior2 = p2.slice(1, -1);
    expect(interior1).not.toEqual(interior2);
  });

  it('anchors the first and last point exactly at the given endpoints regardless of seed', () => {
    for (const seed of [1, 2, 3, 99]) {
      const points = wobbleLine(10, 20, 130, 55, { seed, segments: 5, amplitude: 10 });
      expect(points[0]).toEqual({ x: 10, y: 20 });
      expect(points[points.length - 1]).toEqual({ x: 130, y: 55 });
    }
  });

  it('returns segments + 2 points (two endpoints + interior)', () => {
    const points = wobbleLine(0, 0, 10, 10, { segments: 4 });
    expect(points).toHaveLength(6);
  });

  it('collapses to the straight line when amplitude is 0', () => {
    const points = wobbleLine(0, 0, 10, 0, { segments: 4, amplitude: 0, seed: 3 });
    const steps = points.length - 1;
    points.forEach((p, i) => {
      expect(p.y).toBeCloseTo(0);
      expect(p.x).toBeCloseTo((10 * i) / steps);
    });
  });

  it('defaults to a reasonable segment count when opts are omitted', () => {
    const points = wobbleLine(0, 0, 1, 1);
    expect(points.length).toBeGreaterThanOrEqual(3);
  });
});

describe('wobblePolyline', () => {
  it('is deterministic for a given seed', () => {
    const base = rectPoints(0, 0, 10, 10);
    const a = wobblePolyline(base, { seed: 4, amplitude: 2 });
    const b = wobblePolyline(base, { seed: 4, amplitude: 2 });
    expect(a).toEqual(b);
  });

  it('keeps the first and last vertex fixed', () => {
    const base = rectPoints(0, 0, 10, 10);
    const wobbled = wobblePolyline(base, { seed: 9, amplitude: 5 });
    expect(wobbled[0]).toEqual(base[0]);
    expect(wobbled[wobbled.length - 1]).toEqual(base[base.length - 1]);
  });

  it('displaces interior vertices when amplitude > 0', () => {
    const base = rectPoints(0, 0, 10, 10);
    const wobbled = wobblePolyline(base, { seed: 9, amplitude: 5 });
    const interiorChanged = wobbled.slice(1, -1).some((p, i) => p.x !== base[i + 1].x || p.y !== base[i + 1].y);
    expect(interiorChanged).toBe(true);
  });

  it('handles empty and single-point input without throwing', () => {
    expect(wobblePolyline([])).toEqual([]);
    expect(wobblePolyline([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });
});

describe('wobbleClosedPolygon', () => {
  it('is deterministic for a given seed', () => {
    const base = rectPoints(0, 0, 20, 12);
    const a = wobbleClosedPolygon(base, { seed: 11, amplitude: 2 });
    const b = wobbleClosedPolygon(base, { seed: 11, amplitude: 2 });
    expect(a).toEqual(b);
  });

  it('wobbles every vertex, including the first/last (no anchored seam)', () => {
    const base = rectPoints(0, 0, 20, 12);
    const wobbled = wobbleClosedPolygon(base, { seed: 11, amplitude: 5 });
    expect(wobbled).toHaveLength(base.length);
    const anyChanged = wobbled.some((p, i) => p.x !== base[i].x || p.y !== base[i].y);
    expect(anyChanged).toBe(true);
  });

  it('returns an empty array for empty input', () => {
    expect(wobbleClosedPolygon([])).toEqual([]);
  });
});

describe('rectPoints', () => {
  it('returns 4 corners clockwise from top-left', () => {
    expect(rectPoints(1, 2, 10, 20)).toEqual([
      { x: 1, y: 2 },
      { x: 11, y: 2 },
      { x: 11, y: 22 },
      { x: 1, y: 22 },
    ]);
  });
});
