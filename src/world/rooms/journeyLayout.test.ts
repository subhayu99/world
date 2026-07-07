import { describe, expect, it } from 'vitest';
import {
  INITIAL_SCROLL_STATE,
  JOURNEY_TUNING,
  addScrollImpulse,
  awardsShelfPosition,
  beatPosition,
  cameraSway,
  clamp,
  clampScrollY,
  doodleForKind,
  enRouteMarkers,
  finaleNotePosition,
  hasUnlockedFlyJourney,
  maxScrollY,
  noteLayoutScale,
  progressForBeat,
  progressForY,
  seededRand,
  stepScroll,
  swayRampIn,
  type ScrollState,
} from './journeyLayout';

describe('clamp', () => {
  it('clamps below min and above max, passes through in range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe('seededRand', () => {
  it('is deterministic for the same seed and salt', () => {
    expect(seededRand(3, 'x')).toBe(seededRand(3, 'x'));
  });

  it('returns values in [0, 1)', () => {
    for (let i = 0; i < 50; i++) {
      const v = seededRand(i, 'salt');
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('differs across seeds (not a constant function)', () => {
    const values = new Set(Array.from({ length: 10 }, (_, i) => seededRand(i, 'journey-x')));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe('beatPosition', () => {
  it('places beat 0 on the left side (-6 + small jitter), y=0, z=-9', () => {
    const p = beatPosition(0);
    expect(p.y).toBe(0);
    expect(p.z).toBe(-9);
    expect(Math.abs(p.x - -6)).toBeLessThanOrEqual(JOURNEY_TUNING.jitterX);
  });

  it('places beat 1 on the right side (+6 + small jitter), y=6', () => {
    const p = beatPosition(1);
    expect(p.y).toBe(6);
    expect(p.z).toBe(-9);
    expect(Math.abs(p.x - 6)).toBeLessThanOrEqual(JOURNEY_TUNING.jitterX);
  });

  it('alternates sides and steps y by 6 for a run of beats', () => {
    for (let i = 0; i < 10; i++) {
      const p = beatPosition(i);
      expect(p.y).toBe(i * 6);
      const side = i % 2 === 0 ? -1 : 1;
      const jitter = p.x - side * 6;
      expect(Math.abs(jitter)).toBeLessThanOrEqual(JOURNEY_TUNING.jitterX);
    }
  });

  it('is deterministic (same index -> same position every call)', () => {
    expect(beatPosition(4)).toEqual(beatPosition(4));
  });

  it('jitter is not identical across every index', () => {
    const xs = new Set(Array.from({ length: 8 }, (_, i) => beatPosition(i).x - (i % 2 === 0 ? -6 : 6)));
    expect(xs.size).toBeGreaterThan(1);
  });

  it('scale shrinks the side offset and jitter but never y/z', () => {
    const full = beatPosition(3);
    const half = beatPosition(3, 0.5);
    expect(half.x).toBeCloseTo(full.x * 0.5, 10);
    expect(half.y).toBe(full.y);
    expect(half.z).toBe(full.z);
  });

  it('defaults scale to 1 (identical to calling without it)', () => {
    expect(beatPosition(5, 1)).toEqual(beatPosition(5));
  });
});

describe('noteLayoutScale', () => {
  // Analytically derived (see the function's own doc comment): scale is
  // clamped to 1 only once aspect*0.9*15*tan(30deg)/10.4 >= 1, i.e. aspect
  // gtrsim 1.334 — comfortably below any real desktop viewport (16:10 = 1.6,
  // 16:9 = 1.78) but *above* a plain square (aspect 1), unlike the old
  // hand-tuned "1 at aspect >= 1" rule this replaced (that rule is exactly
  // what still let a real phone-portrait capture, 390x844, clip a card off
  // the frustum edge — punchlist #1).
  it('is 1 at typical desktop-landscape aspects', () => {
    expect(noteLayoutScale(1.6)).toBe(1);
    expect(noteLayoutScale(3)).toBe(1);
  });

  it('is a fraction below 1 at a plain square aspect (not the old hard 1)', () => {
    const v = noteLayoutScale(1);
    expect(v).toBeGreaterThan(0.7);
    expect(v).toBeLessThan(1);
  });

  it('keeps a real phone-portrait card fully inside the frustum', () => {
    // 390x844 (the judge capture's mobile viewport) — the previous 0.5 floor
    // put this card's left edge at world-x -5.2 against a visible half-width
    // of ~-4.0. The corrected scale must leave real margin under that bound.
    const aspect = 390 / 844;
    const scale = noteLayoutScale(aspect);
    const sideOffset = 6;
    const jitterX = 1.2;
    const noteHalfWidth = 3.2;
    const cardLeftEdge = -(sideOffset + jitterX) * scale - noteHalfWidth * scale;
    const halfWidthVisible = 15 * Math.tan((60 / 2) * (Math.PI / 180)) * aspect;
    expect(cardLeftEdge).toBeGreaterThan(-halfWidthVisible);
  });

  it('floors at the absolute minimum for pathologically narrow aspects', () => {
    expect(noteLayoutScale(0.2)).toBeCloseTo(0.28, 5);
    expect(noteLayoutScale(0.05)).toBeCloseTo(0.28, 5);
  });

  it('interpolates strictly between the floor and 1 for in-between aspects', () => {
    const v = noteLayoutScale(0.7);
    expect(v).toBeGreaterThan(0.28);
    expect(v).toBeLessThan(1);
  });

  it('is monotonically non-decreasing as aspect widens', () => {
    const aspects = [0.1, 0.3, 0.45, 0.6, 0.75, 0.9, 1, 1.5];
    let prev = 0;
    for (const a of aspects) {
      const v = noteLayoutScale(a);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('treats non-finite or non-positive input as the wide-aspect default of 1', () => {
    expect(noteLayoutScale(NaN)).toBe(1);
    expect(noteLayoutScale(0)).toBe(1);
    expect(noteLayoutScale(-1)).toBe(1);
  });
});

describe('maxScrollY', () => {
  it('is 0 for zero beats', () => {
    expect(maxScrollY(0)).toBe(0);
  });

  it('is (n-1)*6 + shelfOffset + finaleOffset for n beats', () => {
    expect(maxScrollY(1)).toBe(JOURNEY_TUNING.shelfOffset + JOURNEY_TUNING.finaleOffset);
    expect(maxScrollY(11)).toBe(10 * 6 + JOURNEY_TUNING.shelfOffset + JOURNEY_TUNING.finaleOffset);
  });

  it('sits finaleOffset past the awards shelf', () => {
    expect(maxScrollY(11)).toBeCloseTo(awardsShelfPosition(11).y + JOURNEY_TUNING.finaleOffset, 10);
  });
});

describe('clampScrollY', () => {
  it('clamps to [0, maxScrollY(beatCount)]', () => {
    expect(clampScrollY(-100, 11)).toBe(0);
    expect(clampScrollY(1000, 11)).toBe(maxScrollY(11));
    expect(clampScrollY(30, 11)).toBe(30);
  });
});

describe('awardsShelfPosition', () => {
  it('sits centered (x=0) at the last beat plus shelfOffset — before the finale, not at scrollY-max', () => {
    const p = awardsShelfPosition(11);
    expect(p.x).toBe(0);
    expect(p.y).toBe(10 * JOURNEY_TUNING.beatSpacing + JOURNEY_TUNING.shelfOffset);
    expect(p.y).toBeLessThan(maxScrollY(11));
    expect(p.z).toBe(-9);
  });
});

describe('finaleNotePosition', () => {
  it('sits centered (x=0) at scrollY-max, at beat depth z, past the shelf', () => {
    const p = finaleNotePosition(11);
    expect(p.x).toBe(0);
    expect(p.y).toBe(maxScrollY(11));
    expect(p.z).toBe(-9);
    expect(p.y).toBeGreaterThan(awardsShelfPosition(11).y);
  });

  it('is exactly shelfOffset+finaleOffset past the last beat', () => {
    const p = finaleNotePosition(5);
    expect(p.y).toBe(4 * JOURNEY_TUNING.beatSpacing + JOURNEY_TUNING.shelfOffset + JOURNEY_TUNING.finaleOffset);
  });
});

describe('progressForBeat', () => {
  it('is 1 exactly at the beat position', () => {
    expect(progressForBeat(18, 3)).toBeCloseTo(1, 10);
  });

  it('is 0 at or beyond the 8-unit fade window', () => {
    expect(progressForBeat(18 + 8, 3)).toBe(0);
    expect(progressForBeat(18 - 8, 3)).toBe(0);
    expect(progressForBeat(18 + 20, 3)).toBe(0);
  });

  it('applies the x*(2-x) ease at the half-window point', () => {
    // distance 4 of 8 -> raw 0.5 -> 0.5*(2-0.5) = 0.75
    expect(progressForBeat(18 + 4, 3)).toBeCloseTo(0.75, 10);
  });

  it('is symmetric around the beat position', () => {
    expect(progressForBeat(18 + 3, 3)).toBeCloseTo(progressForBeat(18 - 3, 3), 10);
  });

  it('decreases monotonically as distance grows from 0 to 8', () => {
    const beatY = 24;
    let prev = progressForBeat(beatY, 4);
    for (let d = 1; d <= 8; d++) {
      const next = progressForBeat(beatY + d, 4);
      expect(next).toBeLessThanOrEqual(prev);
      prev = next;
    }
  });

  it('delegates to progressForY at the beat\'s own y with the default fadeWindow', () => {
    expect(progressForBeat(50, 7)).toBe(progressForY(50, 7 * JOURNEY_TUNING.beatSpacing));
  });
});

describe('progressForY', () => {
  it('is 1 exactly at y, 0 at/beyond the default fadeWindow', () => {
    expect(progressForY(10, 10)).toBeCloseTo(1, 10);
    expect(progressForY(10 + JOURNEY_TUNING.fadeWindow, 10)).toBe(0);
    expect(progressForY(10 - JOURNEY_TUNING.fadeWindow, 10)).toBe(0);
  });

  it('accepts a custom fadeWindow', () => {
    expect(progressForY(10 + 2, 10, 2)).toBe(0);
    expect(progressForY(10 + 1, 10, 2)).toBeGreaterThan(0);
  });
});

describe('enRouteMarkers', () => {
  it('is empty for fewer than 2 beats', () => {
    expect(enRouteMarkers(0)).toEqual([]);
    expect(enRouteMarkers(1)).toEqual([]);
  });

  it('has beatCount-1 markers, one per gap between consecutive beats', () => {
    expect(enRouteMarkers(11)).toHaveLength(10);
    expect(enRouteMarkers(2)).toHaveLength(1);
  });

  it('sits at the midpoint (y) of the two neighboring beats it bridges', () => {
    const markers = enRouteMarkers(11);
    const a = beatPosition(0);
    const b = beatPosition(1);
    expect(markers[0]!.y).toBeCloseTo((a.y + b.y) / 2, 10);
  });

  it('scale grows from ~0.5 toward 1 across the run (climax build-up)', () => {
    const markers = enRouteMarkers(11);
    expect(markers[0]!.scale).toBeCloseTo(0.5, 10);
    expect(markers[markers.length - 1]!.scale).toBeCloseTo(1, 10);
    for (let i = 1; i < markers.length; i++) {
      expect(markers[i]!.scale).toBeGreaterThanOrEqual(markers[i - 1]!.scale);
    }
  });

  it('is deterministic', () => {
    expect(enRouteMarkers(11)).toEqual(enRouteMarkers(11));
  });

  it('layoutScale scales x the same way beatPosition does', () => {
    const full = enRouteMarkers(11);
    const half = enRouteMarkers(11, 0.5);
    expect(half[0]!.x).toBeCloseTo(full[0]!.x * 0.5, 10);
  });
});

describe('scroll momentum model', () => {
  it('addScrollImpulse scales wheel delta by wheelFactor and leaves position/accumulated untouched', () => {
    const s = addScrollImpulse(INITIAL_SCROLL_STATE, 100, 'wheel');
    expect(s.velocity).toBeCloseTo(100 * JOURNEY_TUNING.wheelFactor, 10);
    expect(s.scrollY).toBe(0);
    expect(s.accumulated).toBe(0);
  });

  it('addScrollImpulse scales touch delta by touchFactor', () => {
    const s = addScrollImpulse(INITIAL_SCROLL_STATE, 10, 'touch');
    expect(s.velocity).toBeCloseTo(10 * JOURNEY_TUNING.touchFactor, 10);
  });

  it('defaults to wheel input when kind is omitted', () => {
    const a = addScrollImpulse(INITIAL_SCROLL_STATE, 50);
    const b = addScrollImpulse(INITIAL_SCROLL_STATE, 50, 'wheel');
    expect(a.velocity).toBe(b.velocity);
  });

  it('stepScroll damps velocity by exactly 0.95/frame away from any wall', () => {
    let s: ScrollState = { scrollY: 40, velocity: 1, accumulated: 0 };
    s = stepScroll(s, 100); // huge beat count so the wall is far away
    expect(s.velocity).toBeCloseTo(0.95, 10);
    expect(s.scrollY).toBeCloseTo(40.95, 10);
    expect(s.accumulated).toBeCloseTo(0.95, 10);
  });

  it('velocity decays geometrically over several frames', () => {
    let s: ScrollState = { scrollY: 40, velocity: 10, accumulated: 0 };
    for (let i = 0; i < 5; i++) s = stepScroll(s, 1000);
    expect(s.velocity).toBeCloseTo(10 * Math.pow(0.95, 5), 6);
  });

  it('snaps velocity to 0 once it decays below the epsilon, freezing scrollY/accumulated', () => {
    let s: ScrollState = { scrollY: 40, velocity: JOURNEY_TUNING.velocityEpsilon * 1.01, accumulated: 5 };
    s = stepScroll(s, 1000);
    expect(s.velocity).toBe(0);
    const before = s;
    const after = stepScroll(before, 1000);
    expect(after).toEqual(before);
  });

  it('clamps scrollY at 0 and zeroes velocity so it does not overshoot the wall', () => {
    let s: ScrollState = { scrollY: 2, velocity: -50, accumulated: 0 };
    s = stepScroll(s, 11);
    expect(s.scrollY).toBe(0);
    expect(s.velocity).toBe(0);
    expect(s.accumulated).toBeCloseTo(2, 10); // only the actual distance travelled (2 -> 0)
  });

  it('clamps scrollY at the max and zeroes velocity so it does not overshoot the wall', () => {
    const max = maxScrollY(11);
    let s: ScrollState = { scrollY: max - 1, velocity: 50, accumulated: 0 };
    s = stepScroll(s, 11);
    expect(s.scrollY).toBe(max);
    expect(s.velocity).toBe(0);
    expect(s.accumulated).toBeCloseTo(1, 10);
  });

  it('accumulated only ever grows (never decreases) across frames', () => {
    let s: ScrollState = INITIAL_SCROLL_STATE;
    s = addScrollImpulse(s, 300, 'wheel');
    let last = 0;
    for (let i = 0; i < 40; i++) {
      s = stepScroll(s, 11);
      expect(s.accumulated).toBeGreaterThanOrEqual(last);
      last = s.accumulated;
    }
  });
});

describe('hasUnlockedFlyJourney', () => {
  it('is false at or below the threshold, true beyond it', () => {
    expect(hasUnlockedFlyJourney({ scrollY: 0, velocity: 0, accumulated: 15 })).toBe(false);
    expect(hasUnlockedFlyJourney({ scrollY: 0, velocity: 0, accumulated: 15.0001 })).toBe(true);
    expect(hasUnlockedFlyJourney({ scrollY: 0, velocity: 0, accumulated: 0 })).toBe(false);
  });

  it('flips true once repeated scroll impulses accumulate past 15', () => {
    let s: ScrollState = INITIAL_SCROLL_STATE;
    expect(hasUnlockedFlyJourney(s)).toBe(false);
    for (let i = 0; i < 200 && !hasUnlockedFlyJourney(s); i++) {
      s = addScrollImpulse(s, 40, 'wheel');
      s = stepScroll(s, 11);
    }
    expect(hasUnlockedFlyJourney(s)).toBe(true);
  });
});

describe('swayRampIn', () => {
  it('is 0 at 0 accumulated, 1 at or beyond swayRampDistance, clamped outside', () => {
    expect(swayRampIn(0)).toBe(0);
    expect(swayRampIn(JOURNEY_TUNING.swayRampDistance)).toBe(1);
    expect(swayRampIn(JOURNEY_TUNING.swayRampDistance * 10)).toBe(1);
    expect(swayRampIn(-5)).toBe(0);
  });

  it('is 0.5 at half the ramp distance', () => {
    expect(swayRampIn(JOURNEY_TUNING.swayRampDistance / 2)).toBeCloseTo(0.5, 10);
  });
});

describe('cameraSway', () => {
  it('is fully damped to zero when rampIn is 0', () => {
    const sway = cameraSway(20, 11, 0);
    expect(sway.pitch).toBe(0);
    expect(sway.roll).toBe(0);
  });

  it('pitch=0, roll=amplitude at the start of the path (t=0)', () => {
    const sway = cameraSway(0, 11, 1);
    expect(sway.pitch).toBeCloseTo(0, 10);
    expect(sway.roll).toBeCloseTo(0.05, 10);
  });

  it('pitch peaks and roll crosses zero a quarter of the way through the path', () => {
    const max = maxScrollY(11);
    const sway = cameraSway(max / 4, 11, 1);
    expect(sway.pitch).toBeCloseTo(0.12, 10);
    expect(sway.roll).toBeCloseTo(0, 10);
  });

  it('pitch returns to zero and roll is negative halfway through the path', () => {
    const max = maxScrollY(11);
    const sway = cameraSway(max / 2, 11, 1);
    expect(sway.pitch).toBeCloseTo(0, 10);
    expect(sway.roll).toBeCloseTo(-0.05, 10);
  });

  it('scales linearly with rampIn and clamps rampIn to [0, 1]', () => {
    const max = maxScrollY(11);
    const half = cameraSway(max / 4, 11, 0.5);
    const full = cameraSway(max / 4, 11, 1);
    expect(half.pitch).toBeCloseTo(full.pitch / 2, 10);
    const over = cameraSway(max / 4, 11, 5);
    expect(over.pitch).toBeCloseTo(full.pitch, 10);
  });

  it('does not divide by zero when there are no beats', () => {
    const sway = cameraSway(0, 0, 1);
    expect(Number.isFinite(sway.pitch)).toBe(true);
    expect(Number.isFinite(sway.roll)).toBe(true);
  });
});

describe('doodleForKind', () => {
  it('maps every beat kind to its notebook doodle', () => {
    expect(doodleForKind('education')).toBe('gradcap');
    expect(doodleForKind('community')).toBe('flag');
    expect(doodleForKind('work')).toBe('gear');
    expect(doodleForKind('publication')).toBe('sheet');
    expect(doodleForKind('award')).toBe('rosette');
    expect(doodleForKind('now')).toBe('pin');
  });
});
