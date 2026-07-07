// Full-screen DOM preloader: two notebook-paper halves split by a jagged
// tear line, an animated percent counter, and a "paper rips apart" exit once
// loading settles. Pure geometry/timing math lives in progress.ts; this file
// owns only the effectful gsap/audio wiring (REPORT.md §4).

import { useEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { DRAFT_FONT_FAMILY } from '../blueprint/palette';
import { ensureDraftFont } from '../blueprint/sketch';
import { useAudio } from '../state/hooks';
import {
  PAPER_COLORS,
  PAPER_GRID_BACKGROUND,
  TEAR_DASH_LENGTH,
  displayTarget,
  generateTearPoints,
  maxSoFar,
  tearDashOffset,
  tearPointsToClipPath,
  tearPointsToSvgPath,
  tweenDuration,
} from './progress';

export interface PreloaderProps {
  /** Raw THREE.DefaultLoadingManager progress, 0..1. */
  progress: number;
  /** True once the R3F scene has signalled it is ready to show. */
  ready: boolean;
  /** Called after the paper finishes tearing apart. */
  onDone: () => void;
}

const TEAR_THRESHOLD = 99.5;
const PENCIL_STOP_THRESHOLD = 99;

export function Preloader({ progress, ready, onDone }: PreloaderProps) {
  const audio = useAudio();

  // Generated once per mount — REPORT.md §4: "13 points ... generated once per mount".
  const points = useMemo(() => generateTearPoints(), []);
  const leftClip = useMemo(() => tearPointsToClipPath(points, 'left'), [points]);
  const rightClip = useMemo(() => tearPointsToClipPath(points, 'right'), [points]);
  const svgPath = useMemo(() => tearPointsToSvgPath(points), [points]);

  const [displayed, setDisplayed] = useState(0);
  const displayedRef = useRef(0);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const pencilPlayingRef = useRef(false);
  const tornRef = useRef(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  // Requests the drafting-lettering FontFace as early as this component's
  // lifetime allows, so the percent counter below has the best chance of
  // painting in it rather than falling back to Patrick Hand. A wholly
  // separate effect from the tear-timeline one further down — this one
  // fires once on mount and never touches `displayed`/`tornRef`, so it
  // can't perturb that effect's re-entrancy guard.
  useEffect(() => {
    // ensureDraftFont() already swallows its own load failures internally
    // (blueprint/sketch.ts) and keeps the cursive/Patrick Hand fallback
    // rendering either way — nothing to await or catch here.
    void ensureDraftFont();
  }, []);

  // Adaptive number tween toward the current target, never running backwards.
  useEffect(() => {
    const target = maxSoFar(displayedRef.current, displayTarget(progress, ready));
    const delta = target - displayedRef.current;
    if (delta === 0) return;
    const duration = tweenDuration(delta);
    const proxy = { value: displayedRef.current };
    tweenRef.current?.kill();
    tweenRef.current = gsap.to(proxy, {
      value: target,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        displayedRef.current = proxy.value;
        setDisplayed(proxy.value);
      },
    });
    return () => {
      tweenRef.current?.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, ready]);

  // Looped pencil scribble while below the "settling" threshold. Audio may
  // still be locked pre-gesture (no click has happened yet) — guard it.
  useEffect(() => {
    if (displayed < PENCIL_STOP_THRESHOLD) {
      if (!pencilPlayingRef.current) {
        pencilPlayingRef.current = true;
        try {
          audio.play('pencil', { loop: true, volume: 0.5 });
        } catch {
          // audio locked pre-gesture; ignore
        }
      }
    } else if (pencilPlayingRef.current) {
      pencilPlayingRef.current = false;
      try {
        audio.stop('pencil');
      } catch {
        // ignore
      }
    }
  }, [displayed, audio]);

  // Once fully settled: tear the page apart and hand off to the caller.
  useEffect(() => {
    if (tornRef.current) return;
    if (displayed < TEAR_THRESHOLD || !ready) return;
    tornRef.current = true;

    if (pencilPlayingRef.current) {
      pencilPlayingRef.current = false;
      try {
        audio.stop('pencil');
      } catch {
        // ignore
      }
    }
    try {
      audio.play('tear', { volume: 0.8 });
    } catch {
      // audio locked pre-gesture; ignore
    }

    // Deliberately NOT killed in this effect's cleanup: `displayed` keeps
    // ticking while the 1.8s tear runs, which would re-run the effect and a
    // cleanup would kill the timeline before onComplete ever fires. tornRef
    // guards re-entry; the component only unmounts after onDone fires.
    const tl = gsap.timeline({ onComplete: onDone });
    tl.to(leftRef.current, { xPercent: -100, rotation: -2, duration: 1.8, ease: 'power3.inOut' }, 0);
    tl.to(rightRef.current, { xPercent: 100, rotation: 2, duration: 1.8, ease: 'power3.inOut' }, 0);
    tl.to(rootRef.current, { opacity: 0, duration: 0.5 }, '-=0.5');
  }, [displayed, ready, audio, onDone]);

  const dashOffset = tearDashOffset(displayed, TEAR_DASH_LENGTH);
  const roundedDisplayed = Math.round(displayed);

  return (
    <div
      ref={rootRef}
      role="progressbar"
      aria-valuenow={roundedDisplayed}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading the notebook"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'auto',
        overflow: 'hidden',
        background: PAPER_COLORS.paper,
        color: PAPER_COLORS.ink,
        fontFamily: '"Patrick Hand", cursive',
      }}
    >
      <div
        ref={leftRef}
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: leftClip,
          background: PAPER_GRID_BACKGROUND,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '3.5rem', fontFamily: `"${DRAFT_FONT_FAMILY}", "Patrick Hand", cursive` }}>
          {roundedDisplayed}%
        </span>
      </div>
      <div
        ref={rightRef}
        style={{
          position: 'absolute',
          inset: 0,
          clipPath: rightClip,
          background: PAPER_GRID_BACKGROUND,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span style={{ fontSize: '3.5rem', fontFamily: `"${DRAFT_FONT_FAMILY}", "Patrick Hand", cursive` }}>
          {roundedDisplayed}%
        </span>
      </div>

      <svg
        aria-hidden="true"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <path
          d={svgPath}
          fill="none"
          stroke={PAPER_COLORS.ink}
          strokeWidth={0.4}
          vectorEffect="non-scaling-stroke"
          strokeDasharray={TEAR_DASH_LENGTH}
          strokeDashoffset={dashOffset}
        />
      </svg>

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 220,
          height: 220,
          marginLeft: -110,
          marginTop: -110,
          borderRadius: '50%',
          border: `2px dashed ${PAPER_COLORS.ink}55`,
          animation: 'world-preloader-spin 10s linear infinite',
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 170,
          height: 170,
          marginLeft: -85,
          marginTop: -85,
          borderRadius: '50%',
          border: `2px dashed ${PAPER_COLORS.ink}33`,
          animation: 'world-preloader-spin-reverse 4s linear infinite',
        }}
      />

      {/* Faint sheet-corner doodle: a dog-eared page corner peeling up from
          the bottom-right, rendered as a sibling of the two tear-halves (not
          inside leftRef/rightRef) so it sits on top of the seam undivided,
          same trick the tear-line svg and loading rings above already use. */}
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', bottom: 0, right: 0, opacity: 0.28 }}
        width={72}
        height={72}
        viewBox="0 0 72 72"
      >
        <path
          d="M72 72 L72 24 Q 46 26 24 48 Q 46 56 72 72 Z"
          fill={PAPER_COLORS.paper}
          stroke={PAPER_COLORS.ink}
          strokeWidth={1}
        />
        <path d="M72 24 Q46 26 24 48" fill="none" stroke={PAPER_COLORS.ink} strokeWidth={0.8} strokeDasharray="3 3" />
      </svg>

      <style>{`
        @keyframes world-preloader-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes world-preloader-spin-reverse {
          from { transform: rotate(0deg); }
          to { transform: rotate(-360deg); }
        }
      `}</style>
    </div>
  );
}
