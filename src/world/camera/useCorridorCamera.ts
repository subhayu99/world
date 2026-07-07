// Corridor camera rig: scroll/keyboard/pointer/touch-driven walk through the
// endless corridor, with door "glance" bias and a parallax/roll/glance
// overlay on top of straight-line z travel. See math.ts for the pure math
// this hook is built on, and itomdev-research/REPORT.md §6 for the source
// mechanic. This file is R3F/DOM side-effectful and is intentionally not
// unit-tested (no WebGL/canvas in happy-dom) — the pure logic it calls is.

import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CANVAS_DEFAULTS, CORRIDOR } from '../contracts';
import { clamp, glanceAmount, isFormTagName, keyRollImpulse, keyWalkImpulse, lerp } from './math';

export interface CorridorCameraOptions {
  /** Attach/detach the window input listeners and drive the per-frame rig. */
  enabled: boolean;
  /** Unused since the corridor became an endless loop (kept so callers
   * don't churn); walking is unbounded in both directions. */
  zMin?: number;
  /** Fires once, the first time cumulative |wheel/touch/key delta| exceeds 50. */
  onWalk?: () => void;
}

export interface CorridorCameraApi {
  /**
   * Imperative pause/resume, independent of the `enabled` prop — used when
   * another system (teleport) needs to own the camera temporarily. On
   * re-enable, refs are resynced from the live camera and rotation is
   * blended over 30 frames to avoid a visible snap.
   */
  setOverride(on: boolean): void;
  /**
   * Soft look focus (door hover): while set, the rig keeps full walk
   * control but blends its look target toward this world point — a head
   * turn, not a camera hijack. Pass null to release; the look eases back.
   */
  setFocus(point: [number, number, number] | null): void;
}

const Z_MAX = CANVAS_DEFAULTS.camera.position[2];
const WALK_ACHIEVEMENT_THRESHOLD = 50;
const ROTATION_BLEND_FRAMES = 30;

interface Vec2 {
  x: number;
  y: number;
}

export function useCorridorCamera({ enabled, zMin, onWalk }: CorridorCameraOptions): CorridorCameraApi {
  const { camera } = useThree();

  const targetZ = useRef(camera.position.z);
  const currentZ = useRef(camera.position.z);
  const parallax = useRef<{ cur: Vec2; tgt: Vec2 }>({ cur: { x: 0, y: 0 }, tgt: { x: 0, y: 0 } });
  const roll = useRef({ cur: 0, tgt: 0 });
  const glance = useRef(0);

  const cumulativeWalk = useRef(0);
  const walkFired = useRef(false);

  const active = useRef(enabled);
  const blendFramesLeft = useRef(0);
  const blendStartQuaternion = useRef(new THREE.Quaternion());
  const scratchObject = useRef(new THREE.Object3D());
  const focus = useRef({ target: new THREE.Vector3(), active: false, weight: 0 });

  // Latest option values, read inside stable listener closures.
  void zMin; // looping corridor: no clamp
  const onWalkRef = useRef(onWalk);
  onWalkRef.current = onWalk;

  const registerWalk = (delta: number) => {
    cumulativeWalk.current += Math.abs(delta);
    if (!walkFired.current && cumulativeWalk.current > WALK_ACHIEVEMENT_THRESHOLD) {
      walkFired.current = true;
      onWalkRef.current?.();
    }
  };

  const applyWalk = (delta: number) => {
    // Endless loop: no clamp in either direction — the corridor's segment
    // content repeats every segmentLength, so any z is "the same" hallway.
    targetZ.current += delta;
    registerWalk(delta);
  };

  const applyRoll = (delta: number) => {
    roll.current.tgt = clamp(roll.current.tgt + delta, -CORRIDOR.rollClamp, CORRIDOR.rollClamp);
  };

  useEffect(() => {
    active.current = enabled;
    if (!enabled) return;

    const handleWheel = (event: WheelEvent) => {
      applyWalk(-event.deltaY * CORRIDOR.scrollSpeed);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (isFormTagName(target?.tagName)) return;

      const walkImpulse = keyWalkImpulse(event.key);
      if (walkImpulse !== null) {
        applyWalk(walkImpulse * CORRIDOR.scrollSpeed);
        return;
      }

      const rollImpulse = keyRollImpulse(event.key);
      if (rollImpulse !== null) {
        applyRoll(rollImpulse);
      }
    };

    const handlePointerMove = (event: PointerEvent) => {
      const ndcX = (event.clientX / window.innerWidth) * 2 - 1;
      const ndcY = (event.clientY / window.innerHeight) * 2 - 1;
      parallax.current.tgt.x = ndcX * CORRIDOR.parallaxIntensity;
      parallax.current.tgt.y = -ndcY * CORRIDOR.parallaxIntensity * 0.5;
    };

    let touching = false;
    let lastTouchX = 0;
    let lastTouchY = 0;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      touching = true;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touching || !touch) return;
      const dx = touch.clientX - lastTouchX;
      const dy = touch.clientY - lastTouchY;
      lastTouchX = touch.clientX;
      lastTouchY = touch.clientY;

      applyWalk(-dy * CORRIDOR.scrollSpeed * CORRIDOR.touchwalkFactor);
      applyRoll(-dx * CORRIDOR.touchLookFactor);
    };

    const handleTouchEnd = () => {
      touching = false;
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useFrame(() => {
    if (!active.current) return;

    currentZ.current = lerp(currentZ.current, targetZ.current, CORRIDOR.smoothing);

    // Door glance works on segment-local z (door slots are defined for
    // segment 0; the pattern repeats every segmentLength as the loop walks).
    const L = CORRIDOR.segmentLength;
    const localZ = currentZ.current + Math.floor((10 - currentZ.current) / L) * L;
    const targetGlance = glanceAmount(localZ, CORRIDOR.doorSlots, CORRIDOR.glanceZone, CORRIDOR.glanceIntensity);
    const easingIn = Math.abs(targetGlance) > Math.abs(glance.current);
    glance.current = lerp(glance.current, targetGlance, easingIn ? 0.03 : 0.08);

    parallax.current.cur.x = lerp(parallax.current.cur.x, parallax.current.tgt.x, 0.048);
    parallax.current.cur.y = lerp(parallax.current.cur.y, parallax.current.tgt.y, 0.048);
    roll.current.cur = lerp(roll.current.cur, roll.current.tgt, 0.08);

    camera.position.set(parallax.current.cur.x, CORRIDOR.cameraY + parallax.current.cur.y, currentZ.current);

    // Door-hover focus: ease the head turn in/out and blend the look
    // target toward the focused point. Weight caps below 1 so a sliver of
    // hallway context always remains and the turn never feels locked.
    const f = focus.current;
    f.weight = lerp(f.weight, f.active ? 1 : 0, f.active ? 0.07 : 0.09);

    let lookX = parallax.current.cur.x * 0.3 + glance.current * 3 + roll.current.cur * 4;
    let lookY = 1.35 + parallax.current.cur.y;
    let lookZ = currentZ.current - CORRIDOR.lookAhead;
    if (f.weight > 0.001) {
      const w = f.weight * 0.85;
      lookX = lerp(lookX, f.target.x, w);
      lookY = lerp(lookY, f.target.y, w);
      lookZ = lerp(lookZ, f.target.z, w);
    }

    if (blendFramesLeft.current > 0) {
      // Blend rotation in over ROTATION_BLEND_FRAMES instead of snapping,
      // so resuming control after an external override (door/teleport) is
      // seamless (research: 30-frame rotation blend on re-enable).
      scratchObject.current.position.copy(camera.position);
      scratchObject.current.lookAt(lookX, lookY, lookZ);
      const t = 1 - (blendFramesLeft.current - 1) / ROTATION_BLEND_FRAMES;
      camera.quaternion.copy(blendStartQuaternion.current).slerp(scratchObject.current.quaternion, clamp(t, 0, 1));
      blendFramesLeft.current -= 1;
    } else {
      camera.lookAt(lookX, lookY, lookZ);
    }
  });

  return {
    setFocus(point: [number, number, number] | null) {
      if (point) {
        focus.current.target.set(...point);
        focus.current.active = true;
      } else {
        focus.current.active = false;
      }
    },
    setOverride(on: boolean) {
      active.current = on;
      if (!on) return;

      // Resync refs from the live camera before resuming control.
      currentZ.current = camera.position.z;
      targetZ.current = camera.position.z;
      parallax.current.cur = { x: camera.position.x, y: camera.position.y - CORRIDOR.cameraY };
      parallax.current.tgt = { ...parallax.current.cur };
      roll.current.cur = 0;
      roll.current.tgt = 0;
      glance.current = 0;

      blendStartQuaternion.current.copy(camera.quaternion);
      blendFramesLeft.current = ROTATION_BLEND_FRAMES;
    },
  };
}
