// Pure-logic tests for the Registry room's shelf layout, download-count
// formatting, and defensive PyPI stats lookup. No THREE/DOM/canvas involved —
// safe in happy-dom.

import { describe, it, expect } from 'vitest';
import {
  SHELF_TUNING,
  shelfPosition,
  shelfLayout,
  formatDownloads,
  pickStats,
  boxJitter,
  JITTER_MAX_ROTATION,
  JITTER_SCALE_RANGE,
} from './registryMath';

describe('shelfPosition', () => {
  it('places the first parcel at the leftmost column of row 0', () => {
    const p = shelfPosition(0);
    expect(p.row).toBe(0);
    expect(p.col).toBe(0);
    expect(p.x).toBeCloseTo((0 - 1.5) * SHELF_TUNING.colSpacing);
    expect(p.y).toBeCloseTo(SHELF_TUNING.baseY);
    expect(p.z).toBe(SHELF_TUNING.z);
  });

  it('follows the frozen x = (col-1.5)*3.2 formula across a row of 4', () => {
    for (let col = 0; col < 4; col++) {
      const p = shelfPosition(col);
      expect(p.x).toBeCloseTo((col - 1.5) * 3.2);
    }
  });

  it('follows the frozen y = 1 + row*2.6 formula across rows', () => {
    // index 4 wraps to row 1, col 0 in a 4-wide grid
    const row1 = shelfPosition(4);
    expect(row1.row).toBe(1);
    expect(row1.col).toBe(0);
    expect(row1.y).toBeCloseTo(1 + 1 * 2.6);

    const row2 = shelfPosition(9);
    expect(row2.row).toBe(2);
    expect(row2.col).toBe(1);
    expect(row2.y).toBeCloseTo(1 + 2 * 2.6);
  });

  it('keeps every parcel on the same shelf-wall z', () => {
    for (let i = 0; i < 12; i++) {
      expect(shelfPosition(i).z).toBe(-16);
    }
  });

  it('is symmetric around x=0 for a 4-column row', () => {
    const left = shelfPosition(0);
    const right = shelfPosition(3);
    expect(left.x).toBeCloseTo(-right.x);
  });

  it('respects a custom column count', () => {
    const p = shelfPosition(2, 2); // col 0 of row 1 in a 2-wide grid
    expect(p.row).toBe(1);
    expect(p.col).toBe(0);
  });
});

describe('shelfLayout', () => {
  it('returns one position per parcel, in order', () => {
    const layout = shelfLayout(8);
    expect(layout).toHaveLength(8);
    layout.forEach((pos, i) => {
      expect(pos).toEqual(shelfPosition(i));
    });
  });

  it('wraps into a second row of 4 once n exceeds the row width', () => {
    const layout = shelfLayout(5);
    expect(layout).toHaveLength(5);
    expect(layout[4].row).toBe(1);
    expect(layout[4].col).toBe(0);
  });

  it('returns an empty array for n=0', () => {
    expect(shelfLayout(0)).toEqual([]);
  });

  it('never throws or returns negative-length output for a negative n', () => {
    expect(shelfLayout(-3)).toEqual([]);
  });

  it('floors a fractional n', () => {
    expect(shelfLayout(3.7)).toHaveLength(3);
  });
});

describe('formatDownloads', () => {
  it('groups thousands with commas', () => {
    expect(formatDownloads(12345, '11.1k+')).toBe('12,345');
  });

  it('groups millions with two comma separators', () => {
    expect(formatDownloads(1234567, 'x')).toBe('1,234,567');
  });

  it('does not add a separator below 1000', () => {
    expect(formatDownloads(999, 'x')).toBe('999');
  });

  it('renders exactly 0 as "0", not the fallback', () => {
    expect(formatDownloads(0, '11.1k+')).toBe('0');
  });

  it('rounds fractional counts to the nearest integer', () => {
    expect(formatDownloads(12345.6, 'x')).toBe('12,346');
  });

  it('falls back when n is undefined', () => {
    expect(formatDownloads(undefined, '11.1k+')).toBe('11.1k+');
  });

  it('falls back when n is NaN', () => {
    expect(formatDownloads(NaN, '11.1k+')).toBe('11.1k+');
  });

  it('falls back when n is negative (defensive against bad data)', () => {
    expect(formatDownloads(-5, '11.1k+')).toBe('11.1k+');
  });

  it('falls back when n is Infinity', () => {
    expect(formatDownloads(Infinity, '11.1k+')).toBe('11.1k+');
  });
});

describe('pickStats', () => {
  const validPayload = {
    fetched_at: '2026-07-06T00:00:00Z',
    total_downloads: 56000,
    packages: {
      datasetpipeline: { total_all_time: 11123, total_180d: 4000, last_day: 10, last_week: 70, last_month: 300, daily: [], weekly: [] },
    },
  };

  it('resolves total_all_time for a known package', () => {
    expect(pickStats(validPayload, 'datasetpipeline')).toBe(11123);
  });

  it('returns 0 as a valid count, not undefined', () => {
    const zeroPayload = { packages: { foo: { total_all_time: 0 } } };
    expect(pickStats(zeroPayload, 'foo')).toBe(0);
  });

  it('returns undefined when pypiPackage is undefined', () => {
    expect(pickStats(validPayload, undefined)).toBeUndefined();
  });

  it('returns undefined when pypiPackage is an empty string', () => {
    expect(pickStats(validPayload, '')).toBeUndefined();
  });

  it('returns undefined when statsJson is null (failed fetch)', () => {
    expect(pickStats(null, 'datasetpipeline')).toBeUndefined();
  });

  it('returns undefined when statsJson is not an object', () => {
    expect(pickStats('not-json', 'datasetpipeline')).toBeUndefined();
    expect(pickStats(42, 'datasetpipeline')).toBeUndefined();
  });

  it('returns undefined when packages is missing', () => {
    expect(pickStats({}, 'datasetpipeline')).toBeUndefined();
  });

  it('returns undefined when packages is malformed (not an object)', () => {
    expect(pickStats({ packages: 'nope' }, 'datasetpipeline')).toBeUndefined();
  });

  it('returns undefined when the requested package key is absent', () => {
    expect(pickStats(validPayload, 'unknown-package')).toBeUndefined();
  });

  it('returns undefined when the package entry is not an object', () => {
    expect(pickStats({ packages: { foo: 'nope' } }, 'foo')).toBeUndefined();
  });

  it('returns undefined when total_all_time is missing or non-numeric', () => {
    expect(pickStats({ packages: { foo: {} } }, 'foo')).toBeUndefined();
    expect(pickStats({ packages: { foo: { total_all_time: 'lots' } } }, 'foo')).toBeUndefined();
    expect(pickStats({ packages: { foo: { total_all_time: NaN } } }, 'foo')).toBeUndefined();
  });
});

describe('boxJitter', () => {
  it('is deterministic for the same index', () => {
    expect(boxJitter(3)).toEqual(boxJitter(3));
    expect(boxJitter(0)).toEqual(boxJitter(0));
  });

  it('keeps rotationZ within +/- JITTER_MAX_ROTATION', () => {
    for (let i = 0; i < 20; i++) {
      const { rotationZ } = boxJitter(i);
      expect(rotationZ).toBeGreaterThanOrEqual(-JITTER_MAX_ROTATION);
      expect(rotationZ).toBeLessThanOrEqual(JITTER_MAX_ROTATION);
    }
  });

  it('keeps scale within 1 +/- JITTER_SCALE_RANGE', () => {
    for (let i = 0; i < 20; i++) {
      const { scale } = boxJitter(i);
      expect(scale).toBeGreaterThanOrEqual(1 - JITTER_SCALE_RANGE);
      expect(scale).toBeLessThanOrEqual(1 + JITTER_SCALE_RANGE);
    }
  });

  it('varies across indices rather than returning one constant jitter', () => {
    const samples = Array.from({ length: 8 }, (_, i) => boxJitter(i));
    const distinctRotations = new Set(samples.map((s) => s.rotationZ));
    expect(distinctRotations.size).toBeGreaterThan(1);
  });

  it('never throws and floors/clamps non-integer or negative indices', () => {
    expect(() => boxJitter(-5)).not.toThrow();
    expect(() => boxJitter(2.7)).not.toThrow();
    expect(() => boxJitter(NaN)).not.toThrow();
    expect(boxJitter(2.7)).toEqual(boxJitter(2));
  });
});
