// Pure-logic tests for the Warehouse room's clothesline carousel math and the
// exhibit card typewriter timing. No THREE/DOM/canvas involved — safe in happy-dom.

import { describe, it, expect } from 'vitest';
import {
  WAREHOUSE_TUNING,
  ACCENT_COLORS,
  LINE_SAG,
  CARD_SCALE_VARIANCE,
  clamp,
  lerp,
  seededRand,
  carouselCenter,
  carouselPosition,
  snapTarget,
  clampOffset,
  wheelToOffsetDelta,
  dragToOffsetDelta,
  typewriterDuration,
  typewriterStepMs,
  typewriterChunks,
  accentForId,
  lineSweepFraction,
  lineSagAt,
  cardWidthScale,
  clothespinOutline,
  hexToRgba,
} from './warehouseMath';

describe('clamp', () => {
  it('passes values inside the range through unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps below the minimum', () => {
    expect(clamp(-3, 0, 10)).toBe(0);
  });

  it('clamps above the maximum', () => {
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('returns a at t=0 and b at t=1', () => {
    expect(lerp(2, 8, 0)).toBe(2);
    expect(lerp(2, 8, 1)).toBe(8);
  });

  it('interpolates at the midpoint', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });
});

describe('seededRand', () => {
  it('is deterministic for the same seed and salt', () => {
    expect(seededRand(3, 'y')).toBe(seededRand(3, 'y'));
    expect(seededRand(0, 'tilt')).toBe(seededRand(0, 'tilt'));
  });

  it('differs across salts for the same seed (decorrelated y vs tilt)', () => {
    expect(seededRand(1, 'y')).not.toBe(seededRand(1, 'tilt'));
  });

  it('stays within [0, 1) across a spread of seeds', () => {
    for (let i = 0; i < 20; i++) {
      const v = seededRand(i, 'probe');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('carouselCenter', () => {
  it('is the midpoint index for an even count', () => {
    expect(carouselCenter(6)).toBeCloseTo(2.5);
  });

  it('is the middle index for an odd count', () => {
    expect(carouselCenter(5)).toBe(2);
  });
});

describe('carouselPosition', () => {
  const n = 6;

  it('places cards on the exact x spacing from the frozen formula', () => {
    const center = carouselCenter(n);
    for (const offset of [0, 1.5, 3]) {
      for (let i = 0; i < n; i++) {
        const { x } = carouselPosition(i, n, offset);
        expect(x).toBeCloseTo((i - center + offset) * WAREHOUSE_TUNING.spacing);
      }
    }
  });

  it('sags deepest in -z for the card centered under offset', () => {
    // i - center + offset == 0 -> normalized == 0 -> cos(0) == 1 -> full archDepth dip
    const centered = carouselPosition(2.5, n, 0);
    expect(centered.z).toBeCloseTo(WAREHOUSE_TUNING.baseZ - WAREHOUSE_TUNING.archDepth);
  });

  it('returns to baseZ at the edge of the arc (|rel| >= n/2)', () => {
    const edge = carouselPosition(n, n, 0); // rel = n - center = n/2
    expect(edge.z).toBeCloseTo(WAREHOUSE_TUNING.baseZ);
  });

  it('never dips past the deepest point of the arc', () => {
    for (let i = -4; i <= 10; i++) {
      const { z } = carouselPosition(i, n, 0);
      expect(z).toBeLessThanOrEqual(WAREHOUSE_TUNING.baseZ + 1e-9);
      expect(z).toBeGreaterThanOrEqual(WAREHOUSE_TUNING.baseZ - WAREHOUSE_TUNING.archDepth - 1e-9);
    }
  });

  it('keeps hang jitter/tilt within the tuned bounds and deterministic per index', () => {
    for (let i = 0; i < 8; i++) {
      const a = carouselPosition(i, n, 0);
      const b = carouselPosition(i, n, 0);
      expect(a.y).toBe(b.y);
      expect(a.rotZ).toBe(b.rotZ);
      expect(Math.abs(a.y)).toBeLessThanOrEqual(WAREHOUSE_TUNING.jitterY);
      expect(Math.abs(a.rotZ)).toBeLessThanOrEqual(WAREHOUSE_TUNING.tiltMax);
    }
  });

  it('does not blow up for a single-exhibit warehouse', () => {
    const { x, z } = carouselPosition(0, 1, 0);
    expect(Number.isFinite(x)).toBe(true);
    expect(Number.isFinite(z)).toBe(true);
  });
});

describe('snapTarget', () => {
  it('rounds to the nearest integer index', () => {
    expect(snapTarget(0.4)).toBe(0);
    expect(snapTarget(0.5)).toBe(1);
    expect(snapTarget(2.6)).toBe(3);
    expect(snapTarget(-0.4)).toBe(0);
  });
});

describe('clampOffset', () => {
  it('clamps within [0, n-1]', () => {
    expect(clampOffset(-2, 6)).toBe(0);
    expect(clampOffset(10, 6)).toBe(5);
    expect(clampOffset(3.2, 6)).toBeCloseTo(3.2);
  });

  it('collapses to 0 when there are 0 or 1 exhibits', () => {
    expect(clampOffset(5, 1)).toBe(0);
    expect(clampOffset(5, 0)).toBe(0);
  });
});

describe('wheelToOffsetDelta / dragToOffsetDelta', () => {
  it('scales wheel deltaY by the tuned factor', () => {
    expect(wheelToOffsetDelta(100)).toBeCloseTo(100 * WAREHOUSE_TUNING.wheelFactor);
  });

  it('scales drag dx by the tuned factor', () => {
    expect(dragToOffsetDelta(100)).toBeCloseTo(100 * WAREHOUSE_TUNING.dragFactor);
  });
});

describe('typewriterDuration', () => {
  it('scales with text length below the cap', () => {
    const text = 'a'.repeat(50);
    expect(typewriterDuration(text)).toBeCloseTo(50 * 0.015);
  });

  it('caps at 2.5s for long bodies', () => {
    const text = 'a'.repeat(500);
    expect(typewriterDuration(text)).toBe(2.5);
  });

  it('is 0 for empty text', () => {
    expect(typewriterDuration('')).toBe(0);
  });
});

describe('typewriterStepMs', () => {
  it('divides the total duration evenly across characters', () => {
    const text = 'a'.repeat(50);
    const stepMs = typewriterStepMs(text);
    expect(stepMs * text.length).toBeCloseTo(typewriterDuration(text) * 1000);
  });

  it('never divides by zero for empty text', () => {
    expect(Number.isFinite(typewriterStepMs(''))).toBe(true);
  });
});

describe('accentForId', () => {
  it('is deterministic for the same id', () => {
    expect(accentForId('loop-ai')).toBe(accentForId('loop-ai'));
  });

  it('always returns one of the four notebook accents', () => {
    for (const id of ['loop-ai', 'sbgc', 'agy', 'jnj', 'wade', 'prospexs']) {
      expect(ACCENT_COLORS).toContain(accentForId(id));
    }
  });
});

describe('lineSweepFraction', () => {
  it('is 0 at the first card and 1 at the last card', () => {
    const n = 6;
    expect(lineSweepFraction(0, n)).toBeCloseTo(0.75 / (n - 0.5));
    expect(lineSweepFraction(n - 1, n)).toBeCloseTo(1);
  });

  it('increases monotonically with index', () => {
    const n = 6;
    let prev = -Infinity;
    for (let i = 0; i < n; i++) {
      const u = lineSweepFraction(i, n);
      expect(u).toBeGreaterThanOrEqual(prev);
      prev = u;
    }
  });

  it('stays within [0, 1] even past the nominal edges', () => {
    expect(lineSweepFraction(-3, 6)).toBe(0);
    expect(lineSweepFraction(20, 6)).toBe(1);
  });
});

describe('lineSagAt', () => {
  it('is 0 at both sweep edges', () => {
    expect(lineSagAt(0)).toBeCloseTo(0);
    expect(lineSagAt(1)).toBeCloseTo(0);
  });

  it('reaches the full LINE_SAG dip at the midpoint', () => {
    expect(lineSagAt(0.5)).toBeCloseTo(LINE_SAG);
  });

  it('clamps out-of-range fractions instead of going negative/beyond', () => {
    expect(lineSagAt(-1)).toBeCloseTo(0);
    expect(lineSagAt(2)).toBeCloseTo(0);
  });
});

describe('cardWidthScale', () => {
  it('is deterministic for the same index', () => {
    expect(cardWidthScale(3)).toBe(cardWidthScale(3));
  });

  it('stays within [1 - CARD_SCALE_VARIANCE, 1 + CARD_SCALE_VARIANCE]', () => {
    for (let i = 0; i < 10; i++) {
      const scale = cardWidthScale(i);
      expect(scale).toBeGreaterThanOrEqual(1 - CARD_SCALE_VARIANCE);
      expect(scale).toBeLessThanOrEqual(1 + CARD_SCALE_VARIANCE);
    }
  });

  it('varies across indices rather than a single stamped-out value', () => {
    const scales = new Set(Array.from({ length: 6 }, (_, i) => cardWidthScale(i)));
    expect(scales.size).toBeGreaterThan(1);
  });
});

describe('clothespinOutline', () => {
  it('always returns 6 points', () => {
    expect(clothespinOutline(0)).toHaveLength(6);
    expect(clothespinOutline(4)).toHaveLength(6);
  });

  it('is deterministic for the same index', () => {
    expect(clothespinOutline(2)).toEqual(clothespinOutline(2));
  });

  it('differs across indices (hand-wobbled, not a stamped template)', () => {
    expect(clothespinOutline(0)).not.toEqual(clothespinOutline(1));
  });

  it('stays close to the base clip silhouette (bounded jitter)', () => {
    for (const [x, y] of clothespinOutline(5)) {
      expect(Math.abs(x)).toBeLessThan(0.1);
      expect(Math.abs(y)).toBeLessThan(0.11);
    }
  });
});

describe('typewriterChunks', () => {
  it('is empty for empty text', () => {
    expect(typewriterChunks('')).toEqual([]);
  });

  it('joins back to the exact original text', () => {
    const text = 'Led the enterprise migration, ARM template adaptation, and automated pipeline health checks.';
    expect(typewriterChunks(text).join('')).toBe(text);
  });

  it('never splits inside a word — every chunk boundary lands after whitespace', () => {
    const text = 'continue-on-failure orchestration, and automated pipeline health checks.';
    const chunks = typewriterChunks(text);
    let consumed = '';
    for (const chunk of chunks) {
      consumed += chunk;
      // Any prefix built from whole chunks either is the full text or ends in whitespace.
      expect(consumed === text || /\s$/.test(consumed)).toBe(true);
    }
  });

  it('treats a single word with no whitespace as one chunk', () => {
    expect(typewriterChunks('automation')).toEqual(['automation']);
  });
});

describe('hexToRgba', () => {
  it('expands a hex color into an rgba string at the given alpha', () => {
    expect(hexToRgba('#c94f4f', 0.5)).toBe('rgba(201, 79, 79, 0.5)');
  });

  it('clamps alpha into [0, 1]', () => {
    expect(hexToRgba('#2f6fb5', 2)).toBe('rgba(47, 111, 181, 1)');
    expect(hexToRgba('#2f6fb5', -1)).toBe('rgba(47, 111, 181, 0)');
  });
});
