// Pure-logic tests for the corridor camera math. No DOM/WebGL involved —
// see CLAUDE.md hard rule 1 (guard canvas/AudioContext access; test pure fns).

import { describe, expect, it } from 'vitest';
import { CORRIDOR } from '../contracts';
import { clamp, glanceAmount, isFormTagName, keyRollImpulse, keyWalkImpulse, lerp } from './math';

describe('clamp', () => {
  it('passes values inside the range through unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps values below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps values above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('interpolates at t=0 -> a', () => {
    expect(lerp(2, 8, 0)).toBe(2);
  });

  it('interpolates at t=1 -> b', () => {
    expect(lerp(2, 8, 1)).toBe(8);
  });

  it('interpolates at t=0.5 -> midpoint', () => {
    expect(lerp(2, 8, 0.5)).toBe(5);
  });
});

describe('glanceAmount', () => {
  const { start, peak, end } = CORRIDOR.glanceZone;

  it('is zero far ahead of a door (distance > zone.start)', () => {
    const doorSlots = [{ z: 0, side: 'right' as const }];
    const z = start + 10; // well beyond the ramp start
    expect(glanceAmount(z, doorSlots, CORRIDOR.glanceZone, 1)).toBe(0);
  });

  it('peaks at full magnitude when distance === zone.peak (right door, positive sign)', () => {
    const doorSlots = [{ z: 0, side: 'right' as const }];
    const z = peak; // distance = z - doorZ = peak
    expect(glanceAmount(z, doorSlots, CORRIDOR.glanceZone, 1)).toBeCloseTo(3.5, 10);
  });

  it('peaks at full negative magnitude for a left door (sign flips)', () => {
    const doorSlots = [{ z: 0, side: 'left' as const }];
    const z = peak;
    expect(glanceAmount(z, doorSlots, CORRIDOR.glanceZone, 1)).toBeCloseTo(-3.5, 10);
  });

  it('ramps smoothly (0->1 eased) between zone.start and zone.peak, ahead of the door', () => {
    const doorSlots = [{ z: 0, side: 'right' as const }];
    const z = (start + peak) / 2; // halfway through the ramp, t=0.5
    const eased = 0.5 * (2 - 0.5); // ease(x) = x*(2-x)
    expect(glanceAmount(z, doorSlots, CORRIDOR.glanceZone, 1)).toBeCloseTo(eased * 3.5, 10);
  });

  it('fades smoothly (1->0 eased) between zone.peak and zone.end, behind the door', () => {
    const doorSlots = [{ z: 0, side: 'right' as const }];
    const z = (peak + end) / 2; // halfway through the fade
    const t = 0.5;
    const eased = t * (2 - t);
    expect(glanceAmount(z, doorSlots, CORRIDOR.glanceZone, 1)).toBeCloseTo(eased * 3.5, 10);
  });

  it('is zero well behind a door (distance < zone.end)', () => {
    const doorSlots = [{ z: 0, side: 'right' as const }];
    const z = end - 10;
    expect(glanceAmount(z, doorSlots, CORRIDOR.glanceZone, 1)).toBe(0);
  });

  it('scales linearly with intensity', () => {
    const doorSlots = [{ z: 0, side: 'right' as const }];
    expect(glanceAmount(peak, doorSlots, CORRIDOR.glanceZone, 0.5)).toBeCloseTo(1.75, 10);
  });

  it('is segment-relative: wraps distance by CORRIDOR.segmentLength across multiple recurrences', () => {
    const doorSlots = [{ z: -18, side: 'left' as const }];
    // Two full segments further back than the base slot, then +peak units
    // ahead of that recurrence: nearest occurrence is at -18 - 2*segmentLength,
    // and z sits exactly `peak` units ahead of it.
    const z = -18 - 2 * CORRIDOR.segmentLength + peak;
    expect(glanceAmount(z, doorSlots, CORRIDOR.glanceZone, 1)).toBeCloseTo(-3.5, 10);
  });

  it('sums contributions from multiple doors when both are in a zone', () => {
    const doorSlots = [
      { z: 0, side: 'right' as const },
      { z: 0, side: 'left' as const },
    ];
    // right (+3.5) + left (-3.5) at the same position cancel out
    expect(glanceAmount(peak, doorSlots, CORRIDOR.glanceZone, 1)).toBeCloseTo(0, 10);
  });
});

describe('keyWalkImpulse', () => {
  it('maps ArrowUp/ArrowDown to +/- CORRIDOR.keyImpulse.arrow', () => {
    expect(keyWalkImpulse('ArrowUp')).toBe(-CORRIDOR.keyImpulse.arrow);
    expect(keyWalkImpulse('ArrowDown')).toBe(CORRIDOR.keyImpulse.arrow);
  });

  it('maps PageUp/PageDown to +/- CORRIDOR.keyImpulse.page', () => {
    expect(keyWalkImpulse('PageUp')).toBe(-CORRIDOR.keyImpulse.page);
    expect(keyWalkImpulse('PageDown')).toBe(CORRIDOR.keyImpulse.page);
  });

  it('maps Space (key === " ") to -CORRIDOR.keyImpulse.space', () => {
    expect(keyWalkImpulse(' ')).toBe(-CORRIDOR.keyImpulse.space);
  });

  it('returns null for keys with no walk mapping', () => {
    expect(keyWalkImpulse('ArrowLeft')).toBeNull();
    expect(keyWalkImpulse('ArrowRight')).toBeNull();
    expect(keyWalkImpulse('a')).toBeNull();
    expect(keyWalkImpulse('Enter')).toBeNull();
  });
});

describe('keyRollImpulse', () => {
  it('maps ArrowLeft/ArrowRight to +/- CORRIDOR.rollStep', () => {
    expect(keyRollImpulse('ArrowLeft')).toBe(-CORRIDOR.rollStep);
    expect(keyRollImpulse('ArrowRight')).toBe(CORRIDOR.rollStep);
  });

  it('returns null for keys with no roll mapping', () => {
    expect(keyRollImpulse('ArrowUp')).toBeNull();
    expect(keyRollImpulse(' ')).toBeNull();
  });
});

describe('isFormTagName', () => {
  it('is true for INPUT and TEXTAREA', () => {
    expect(isFormTagName('INPUT')).toBe(true);
    expect(isFormTagName('TEXTAREA')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isFormTagName('input')).toBe(true);
  });

  it('is false for other tags, null, or undefined', () => {
    expect(isFormTagName('DIV')).toBe(false);
    expect(isFormTagName(null)).toBe(false);
    expect(isFormTagName(undefined)).toBe(false);
  });
});
