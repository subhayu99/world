// Pure math helpers for the corridor camera rig (no DOM/WebGL access here —
// see useCorridorCamera.ts for the R3F side-effectful half). Everything in
// this file is a plain function of numbers/plain objects so it can be
// unit-tested without instantiating a canvas or AudioContext.

import { CORRIDOR } from '../contracts';

export interface DoorSlot {
  z: number;
  side: 'left' | 'right';
}

export interface GlanceZone {
  start: number;
  peak: number;
  end: number;
}

/** Clamp v into [min, max]. */
export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Linear interpolation from a to b by t (unclamped, matches gsap-style usage). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** power2-ish ease used for the glance ramp/fade curve. */
function ease(x: number): number {
  return x * (2 - x);
}

/**
 * Wrap `value` into (-segmentLength/2, segmentLength/2]. Used to compare a
 * camera z position against door slots that repeat every segmentLength units
 * (the corridor recycles segments as you walk), so a door's *nearest*
 * recurrence is always the one considered.
 */
function wrapToSegment(value: number, segmentLength: number): number {
  const half = segmentLength / 2;
  let wrapped = ((value % segmentLength) + segmentLength) % segmentLength; // [0, segmentLength)
  if (wrapped > half) wrapped -= segmentLength; // (-half, half]
  return wrapped;
}

/**
 * Single-door influence curve: ramps 0->1 (eased) as `distance` runs from
 * zone.start down to zone.peak (door still ahead), then fades 1->0 (eased)
 * as `distance` continues from zone.peak down to zone.end (door now behind).
 * Zero outside [zone.end, zone.start].
 */
function doorInfluence(distance: number, zone: GlanceZone): number {
  const { start, peak, end } = zone;
  if (distance <= start && distance >= peak) {
    const span = start - peak;
    const t = span === 0 ? 1 : (start - distance) / span;
    return ease(clamp(t, 0, 1));
  }
  if (distance < peak && distance >= end) {
    const span = peak - end;
    const t = span === 0 ? 1 : (distance - end) / span;
    return ease(clamp(t, 0, 1));
  }
  return 0;
}

/**
 * Camera "glance" bias toward the nearest door(s): for each door slot,
 * computes the segment-wrapped distance ahead of/behind the camera, applies
 * the ramp/fade influence curve, signs it by door side (right = +, left = -),
 * scales by 3.5*intensity, and sums across all door slots (adjacent doors'
 * zones don't overlap in practice, so at most one is ever non-zero).
 *
 * `z` is the camera's raw/current z position. Door positions repeat every
 * CORRIDOR.segmentLength units as the corridor recycles segments.
 */
export function glanceAmount(
  z: number,
  doorSlots: readonly DoorSlot[],
  zone: GlanceZone,
  intensity: number,
): number {
  let total = 0;
  for (const door of doorSlots) {
    const distance = wrapToSegment(z - door.z, CORRIDOR.segmentLength);
    const influence = doorInfluence(distance, zone);
    if (influence === 0) continue;
    const sign = door.side === 'right' ? 1 : -1;
    total += influence * sign * 3.5 * intensity;
  }
  return total;
}

// ---- Keyboard impulse tables ----
// Both tables return a *signed* impulse (direction baked in) that the caller
// multiplies by CORRIDOR.scrollSpeed (walk) or clamps into CORRIDOR.rollClamp
// (roll) before applying — see useCorridorCamera.ts. `null` means "this key
// isn't mapped for this axis".

/** Walk impulse (pre scrollSpeed multiply) for a KeyboardEvent.key. */
export function keyWalkImpulse(key: string): number | null {
  switch (key) {
    case 'ArrowUp':
      return -CORRIDOR.keyImpulse.arrow;
    case 'ArrowDown':
      return CORRIDOR.keyImpulse.arrow;
    case 'PageUp':
      return -CORRIDOR.keyImpulse.page;
    case 'PageDown':
      return CORRIDOR.keyImpulse.page;
    case ' ':
    case 'Spacebar': // legacy Safari/older browser value for the space key
      return -CORRIDOR.keyImpulse.space;
    default:
      return null;
  }
}

/** Roll-step impulse for a KeyboardEvent.key (before clamping to rollClamp). */
export function keyRollImpulse(key: string): number | null {
  switch (key) {
    case 'ArrowLeft':
      return -CORRIDOR.rollStep;
    case 'ArrowRight':
      return CORRIDOR.rollStep;
    default:
      return null;
  }
}

// ---- Input guard ----

const FORM_TAG_NAMES = new Set(['INPUT', 'TEXTAREA']);

/** True when an event target's tag name is a form field we must not hijack. */
export function isFormTagName(tagName: string | null | undefined): boolean {
  return !!tagName && FORM_TAG_NAMES.has(tagName.toUpperCase());
}
