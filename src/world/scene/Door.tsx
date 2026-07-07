// A single room door in the corridor: door plane (sketch/painted reveal
// pair, drawn from the bigger 2x2-panel 'doorPanel' doodle), a hand-lettered
// sign board hanging above it, a hover-state accent glow, and an invisible
// hit plane that owns hover/click choreography. Interaction is disabled
// outside the 'corridor' stage.

import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import gsap from 'gsap';
import type { RoomCopy } from '../types';
import { DOOR_TIMING } from '../contracts';
import { useAudio, useWorldStore } from '../state/hooks';
import { PALETTE } from '../textures/notebook';
import { BLUEPRINT } from '../blueprint/palette';
import { Edges } from '../blueprint/primitives';
import { doorTexture, signTexture } from '../blueprint/sketch';
import { CORRIDOR_HEIGHT } from './segments';

export interface DoorProps {
  room: RoomCopy;
  position: [number, number, number];
  side: 'left' | 'right';
}

const DOOR_WIDTH = 2.2;
// Was 3.2 — left only 0.4 world units of headroom under CORRIDOR_HEIGHT
// (3.6), not enough for a legible sign board above the frame. That's why
// punchlist #5's sign board was invisible: it was positioned at
// DOOR_HEIGHT + 0.5 = 3.7, ABOVE the ceiling plane at y=3.6, clipped
// through/behind it from every camera angle. Shrinking the door itself
// opens headroom for the sign without touching CORRIDOR_HEIGHT.
const DOOR_HEIGHT = 2.3;

const SIGN_GAP = 0.3;
// Wooden sign board over the door — wide and legible from the walk line.
const SIGN_W = 2.1;
const SIGN_H = 0.62;

const signCenterY = DOOR_HEIGHT + SIGN_GAP + SIGN_H / 2;
// The sign must stay under CORRIDOR_HEIGHT (3.6) — asserted at module load
// so a future edit to the constants above fails loudly instead of silently
// reintroducing the ceiling-clip bug (punchlist #5).
if (signCenterY + SIGN_H / 2 > CORRIDOR_HEIGHT) {
  throw new Error('Door: sign board no longer fits under CORRIDOR_HEIGHT — recheck DOOR_HEIGHT/SIGN_GAP/SIGN_H');
}

/** Top of the invisible hit plane — the sign's top edge plus a small
 * margin, so hovering anywhere over the sign (not just the door itself)
 * reads as a door hover. */
const HIT_PLANE_TOP = signCenterY + SIGN_H / 2 + 0.1;

/** Doors swing away from the corridor centerline, so the sign of the swing
 * depends on which wall the door is set into. */
function swingSign(side: 'left' | 'right'): 1 | -1 {
  return side === 'left' ? 1 : -1;
}

export function Door({ room, position, side }: DoorProps): JSX.Element {
  const audio = useAudio();
  const store = useWorldStore();

  // Wooden panelled door: grey pencil wood with a colored-pencil brown
  // variant that fades in on hover — itomdev's "hovering a door colours
  // only that door's wood".
  const doorGrey = useMemo(() => doorTexture(false), []);
  const doorBrown = useMemo(() => doorTexture(true), []);
  const signGrey = useMemo(() => signTexture(room.label, { colored: false }), [room.label]);
  const signBrown = useMemo(() => signTexture(room.label, { colored: true }), [room.label]);
  const brownMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: doorBrown, transparent: true, opacity: 0 }),
    [doorBrown],
  );
  const signBrownMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: signBrown, transparent: true, opacity: 0 }),
    [signBrown],
  );

  const doorRef = useRef<THREE.Group>(null);
  const glowMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: PALETTE.red, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }),
    [],
  );

  useEffect(() => {
    return () => {
      if (doorRef.current) gsap.killTweensOf(doorRef.current.rotation);
      gsap.killTweensOf(glowMaterial);
      gsap.killTweensOf(brownMaterial);
      gsap.killTweensOf(signBrownMaterial);
      glowMaterial.dispose();
      brownMaterial.dispose();
      signBrownMaterial.dispose();
    };
  }, [glowMaterial, brownMaterial, signBrownMaterial]);

  const handlePointerOver = (e: ThreeEvent<PointerEvent>): void => {
    if (store.stage !== 'corridor') return;
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    audio.play('doorCreak', { volume: 0.8 });
    if (doorRef.current) {
      // Auto-open wide on hover so the room invites you in; the camera
      // simultaneously turns to face the door (CameraRig listens below).
      gsap.to(doorRef.current.rotation, {
        y: swingSign(side) * 1.1,
        duration: 0.55,
        ease: 'power2.out',
      });
    }
    // Hover only opens/colours the door — the camera never moves on hover
    // (a hover-driven head turn shifts the pointer ray off the door, which
    // blurs it, which turns the head back: a jitter feedback loop).
    gsap.to(glowMaterial, { opacity: 0.22, duration: DOOR_TIMING.hoverAjar, ease: 'power2.out' });
    gsap.to(brownMaterial, { opacity: 1, duration: DOOR_TIMING.hoverReveal, ease: 'power2.out' });
    gsap.to(signBrownMaterial, { opacity: 1, duration: DOOR_TIMING.hoverReveal, ease: 'power2.out' });
  };

  const handlePointerOut = (e: ThreeEvent<PointerEvent>): void => {
    if (store.stage !== 'corridor') return;
    e.stopPropagation();
    document.body.style.cursor = 'auto';
    if (doorRef.current) {
      gsap.to(doorRef.current.rotation, {
        y: 0,
        duration: 0.4,
        ease: 'power2.out',
      });
    }
    gsap.to(glowMaterial, { opacity: 0, duration: DOOR_TIMING.unhoverReveal, ease: 'power2.out' });
    gsap.to(brownMaterial, { opacity: 0, duration: DOOR_TIMING.unhoverReveal, ease: 'power2.out' });
    gsap.to(signBrownMaterial, { opacity: 0, duration: DOOR_TIMING.unhoverReveal, ease: 'power2.out' });
  };

  const handleClick = (e: ThreeEvent<MouseEvent>): void => {
    if (store.stage !== 'corridor') return;
    e.stopPropagation();

    // NOW the camera turns to face the door — a deliberate move on click,
    // while the door swings wide and the room entry begins.
    window.dispatchEvent(new CustomEvent('world:door-focus', { detail: { x: position[0], z: position[2] } }));
    audio.play('pageFlip');
    if (doorRef.current) {
      gsap.to(doorRef.current.rotation, {
        y: swingSign(side) * Math.PI * 0.6,
        duration: DOOR_TIMING.swing,
        ease: 'power2.out',
        onComplete: () => {
          gsap.delayedCall(DOOR_TIMING.enterDelay, () => store.enterRoom(room.id));
        },
      });
    } else {
      store.enterRoom(room.id);
    }
  };

  const doorGeom = useMemo(() => new THREE.BoxGeometry(DOOR_WIDTH, DOOR_HEIGHT, 0.09), []);
  const signGeom = useMemo(() => new THREE.BoxGeometry(SIGN_W, SIGN_H, 0.07), []);

  return (
    <group position={position} rotation={[0, side === 'left' ? Math.PI / 2 : -Math.PI / 2, 0]}>
      {/* hover accent glow — a soft warm wash behind the door */}
      <mesh position={[0, DOOR_HEIGHT / 2, -0.05]}>
        <planeGeometry args={[DOOR_WIDTH + 0.5, DOOR_HEIGHT + 0.5]} />
        <primitive object={glowMaterial} attach="material" />
      </mesh>

      {/* hinged wooden door: grey pencil wood + colored-pencil brown layer
          that fades in on hover */}
      <group ref={doorRef} position={[-DOOR_WIDTH / 2, 0, 0]}>
        <group position={[DOOR_WIDTH / 2, DOOR_HEIGHT / 2, 0]}>
          <mesh geometry={doorGeom}>
            <meshBasicMaterial attach="material-0" color="#d8d5cc" />
            <meshBasicMaterial attach="material-1" color="#d8d5cc" />
            <meshBasicMaterial attach="material-2" color="#d8d5cc" />
            <meshBasicMaterial attach="material-3" color="#d8d5cc" />
            <meshBasicMaterial attach="material-4" map={doorGrey} />
            <meshBasicMaterial attach="material-5" map={doorGrey} />
          </mesh>
          <mesh position={[0, 0, 0.051]}>
            <planeGeometry args={[DOOR_WIDTH, DOOR_HEIGHT]} />
            <primitive object={brownMaterial} attach="material" />
          </mesh>
          <Edges geometry={doorGeom} color={BLUEPRINT.line} opacity={0.8} />
        </group>
      </group>

      {/* wooden sign hanging over the door, engraved with the room label;
          its colored layer fades in with the door's */}
      <group position={[0, signCenterY, 0.05]}>
        {/* hanging chains */}
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * SIGN_W * 0.36, SIGN_H / 2 + 0.09, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.18, 6]} />
            <meshBasicMaterial color="#8a8a88" />
          </mesh>
        ))}
        <mesh geometry={signGeom}>
          <meshBasicMaterial attach="material-0" color="#e0ded6" />
          <meshBasicMaterial attach="material-1" color="#e0ded6" />
          <meshBasicMaterial attach="material-2" color="#e0ded6" />
          <meshBasicMaterial attach="material-3" color="#e0ded6" />
          <meshBasicMaterial attach="material-4" map={signGrey} />
          <meshBasicMaterial attach="material-5" map={signGrey} />
        </mesh>
        <mesh position={[0, 0, 0.037]}>
          <planeGeometry args={[SIGN_W, SIGN_H]} />
          <primitive object={signBrownMaterial} attach="material" />
        </mesh>
        <Edges geometry={signGeom} color={BLUEPRINT.line} opacity={0.75} />
      </group>

      {/* invisible hit plane owning pointer/click handlers — tall enough to
          cover the door AND the sign board above it (up to signCenterY +
          half the sign plane), so hovering the sign also triggers the door's
          hover choreography. */}
      <mesh
        position={[0, HIT_PLANE_TOP / 2, 0.15]}
        visible={false}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
      >
        <planeGeometry args={[DOOR_WIDTH + 0.4, HIT_PLANE_TOP]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}
