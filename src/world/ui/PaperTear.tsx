// Teleport overlay: two jagged notebook-paper halves that close together to
// cover the screen, wait out the instant room-swap, then tear apart again
// to reveal the destination room. Driven entirely by
// useWorldStore().teleport.phase; this component's only job is the
// choreography + calling advanceTeleport() at each step.
//
// Visual recipe (paper halves split by a jagged vertical clip-path line) is
// the same one Preloader.tsx uses, but this is its own implementation —
// PaperTear does not import from ./progress.ts, which this module does not
// own.

import { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { useAudio, useWorldStore } from '../state/hooks';

const INK = '#2a2a2a';
const PAPER = '#f7f5ef';
const GRID = '#c9d6e4';
const PAPER_GRID_BACKGROUND =
  `repeating-linear-gradient(0deg, transparent, transparent 27px, ${GRID}4d 28px), ` +
  `repeating-linear-gradient(90deg, transparent, transparent 27px, ${GRID}4d 28px), ` +
  `${PAPER}`;

interface TearPoint {
  x: number;
  y: number;
}

/** Deterministic PRNG (mulberry32) — a private copy, not imported from
 * ../textures/rand.ts or ./progress.ts (neither is owned by this module). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateTearLine(rng: () => number, count = 11): TearPoint[] {
  const points: TearPoint[] = [];
  const last = count - 1;
  for (let i = 0; i < count; i++) {
    const y = last === 0 ? 0 : (i / last) * 100;
    const jitter = (rng() * 2 - 1) * 3;
    points.push({ x: 50 + jitter, y });
  }
  return points;
}

function clipPathFor(points: TearPoint[], side: 'left' | 'right'): string {
  const edgeX = side === 'left' ? 0 : 100;
  const tear = points.map((p) => `${p.x}% ${p.y}%`).join(', ');
  return `polygon(${edgeX}% 0%, ${tear}, ${edgeX}% 100%)`;
}

const CLOSE_DURATION = 0.8;
const OPEN_DURATION = 1.2;
const OPEN_FADE_DURATION = 0.3;
const CLOSE_TEAR_VOLUME = 0.6;
const OPEN_TEAR_VOLUME = 0.8;

export function PaperTear() {
  const { teleport, advanceTeleport } = useWorldStore();
  const audio = useAudio();

  const points = useMemo(() => generateTearLine(mulberry32(1337)), []);
  const leftClip = useMemo(() => clipPathFor(points, 'left'), [points]);
  const rightClip = useMemo(() => clipPathFor(points, 'right'), [points]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const left = leftRef.current;
    const right = rightRef.current;
    if (!root || !left || !right) return undefined;

    if (teleport.phase === 'closing') {
      try {
        audio.play('tear', { volume: CLOSE_TEAR_VOLUME });
      } catch {
        // audio may still be locked pre-gesture; ignore
      }
      gsap.set(root, { opacity: 1 });
      const tl = gsap.timeline({ onComplete: () => advanceTeleport() });
      tl.fromTo(left, { xPercent: -100 }, { xPercent: 0, duration: CLOSE_DURATION, ease: 'power2.inOut' }, 0);
      tl.fromTo(right, { xPercent: 100 }, { xPercent: 0, duration: CLOSE_DURATION, ease: 'power2.inOut' }, 0);
      return () => {
        tl.kill();
      };
    }

    if (teleport.phase === 'teleporting') {
      // Fully covered: the room swap (currentRoom update) happens on this
      // very transition in the reducer. Nothing to animate — advance to
      // 'opening' on the next frame so any freshly-mounted room content
      // gets a beat to commit before the reveal starts.
      const raf = requestAnimationFrame(() => advanceTeleport());
      return () => cancelAnimationFrame(raf);
    }

    if (teleport.phase === 'opening') {
      try {
        audio.play('tear', { volume: OPEN_TEAR_VOLUME });
      } catch {
        // ignore
      }
      const tl = gsap.timeline({ onComplete: () => advanceTeleport() });
      tl.to(left, { xPercent: -100, duration: OPEN_DURATION, ease: 'power3.inOut' }, 0);
      tl.to(right, { xPercent: 100, duration: OPEN_DURATION, ease: 'power3.inOut' }, 0);
      tl.to(root, { opacity: 0, duration: OPEN_FADE_DURATION }, `-=${OPEN_FADE_DURATION}`);
      return () => {
        tl.kill();
      };
    }

    // phase === null: park off-screen, ready for the next teleport.
    gsap.set(left, { xPercent: -100 });
    gsap.set(right, { xPercent: 100 });
    gsap.set(root, { opacity: 0 });
    return undefined;
  }, [teleport.phase, advanceTeleport, audio]);

  return (
    <div
      ref={rootRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 700, pointerEvents: 'none', opacity: 0 }}
    >
      <div
        ref={leftRef}
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: leftClip,
          background: PAPER_GRID_BACKGROUND,
          transform: 'translateX(-100%)',
          borderRight: `1.5px solid ${INK}`,
        }}
      />
      <div
        ref={rightRef}
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: rightClip,
          background: PAPER_GRID_BACKGROUND,
          transform: 'translateX(100%)',
          borderLeft: `1.5px solid ${INK}`,
        }}
      />
    </div>
  );
}
