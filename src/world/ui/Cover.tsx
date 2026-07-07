// Title-page gate: the notebook's cover. Click (or Enter on the button)
// unlocks audio on this first user gesture and hands off to onOpen(), which
// the parent uses to advance WorldStage 'cover' -> 'corridor' (REPORT.md §4/§9).

import { useMemo } from 'react';
import { BLUEPRINT } from '../blueprint/palette';
import { FONTS } from '../contracts';
import { useAudio, useWorldData } from '../state/hooks';
import { PAPER_COLORS, PAPER_GRID_BACKGROUND, seededRandom, wobblyCirclePath, wobblyLinePath, wobblyRectPath } from './progress';

export interface CoverProps {
  onOpen: () => void;
}

const BASE_URL = import.meta.env.BASE_URL || '/';
const BUTTON_WIDTH = 280;
const BUTTON_HEIGHT = 68;
const UNDERLINE_WIDTH = 260;

export function Cover({ onOpen }: CoverProps) {
  const audio = useAudio();
  const { meta } = useWorldData();

  // Generated once per mount, same "hand-drawn, never ruler-perfect" rule as
  // the preloader tear line.
  const buttonWobble = useMemo(() => wobblyRectPath(BUTTON_WIDTH, BUTTON_HEIGHT), []);
  // Small pastel doodle accents — a hand-drawn underline beneath the name,
  // and a two-ring coffee stain tucked in a corner. Purely decorative
  // (aria-hidden), seeded so they're stable across re-renders of this mount.
  const nameUnderline = useMemo(() => wobblyLinePath(UNDERLINE_WIDTH, 7, seededRandom(41), 2.6), []);
  const coffeeRingOuter = useMemo(() => wobblyCirclePath(34, 18, seededRandom(5), 2.2), []);
  const coffeeRingInner = useMemo(() => wobblyCirclePath(26, 16, seededRandom(9), 1.8), []);

  const handleOpen = () => {
    try {
      audio.unlock();
    } catch {
      // audio locked pre-gesture; ignore — this click IS the gesture, but
      // some browsers still throw until the resulting promise settles
    }
    onOpen();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.25rem',
        background: PAPER_GRID_BACKGROUND,
        color: PAPER_COLORS.ink,
        textAlign: 'center',
        padding: '2rem',
      }}
    >
      <style>{`
        @font-face {
          font-family: 'World Caveat';
          src: url('${BASE_URL}${FONTS.caveat}') format('truetype');
          font-weight: 400 700;
          font-display: swap;
        }
        @font-face {
          font-family: 'World Patrick Hand';
          src: url('${BASE_URL}${FONTS.hand}') format('truetype');
          font-weight: 400;
          font-display: swap;
        }
        .world-cover-open-btn { transition: transform 0.18s ease; }
        .world-cover-open-btn:hover { transform: translateY(-3px); }
        .world-cover-open-btn:active { transform: translateY(-1px) scale(0.98); }
        .world-cover-open-btn .cover-btn-wash { transition: opacity 0.18s ease; opacity: 0; }
        .world-cover-open-btn:hover .cover-btn-wash { opacity: 1; }
        .world-cover-open-btn .cover-btn-outline { transition: stroke 0.18s ease, stroke-width 0.18s ease; }
        .world-cover-open-btn:hover .cover-btn-outline { stroke: ${BLUEPRINT.accent}; stroke-width: 2.4; }
      `}</style>

      {/* Coffee-ring doodle — a faint two-pass stain tucked in a corner,
          purely decorative (aria-hidden). */}
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', bottom: '9%', left: '7%', opacity: 0.4 }}
        width={80}
        height={80}
        viewBox="-40 -40 80 80"
      >
        <path d={coffeeRingOuter} fill="none" stroke={BLUEPRINT.accentWarm} strokeWidth={1.4} />
        <path d={coffeeRingInner} fill="none" stroke={BLUEPRINT.accentWarm} strokeWidth={1.1} opacity={0.7} />
      </svg>

      {/* Tiny paper-plane doodle beside the tagline — echoes the "notebook"
          motif without pulling in any new asset. */}
      <svg
        aria-hidden="true"
        style={{ position: 'absolute', top: '30%', right: '14%', opacity: 0.55, transform: 'rotate(8deg)' }}
        width={44}
        height={36}
        viewBox="0 0 44 36"
      >
        <path
          d="M2 29 L41 4 L23 33 L18 20 L2 29 Z"
          fill="none"
          stroke={BLUEPRINT.accentCool}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <path d="M23 33 L18 20 L41 4" fill="none" stroke={BLUEPRINT.accentCool} strokeWidth={1.1} />
      </svg>

      <h1
        style={{
          position: 'relative',
          fontFamily: "'World Caveat', cursive",
          fontSize: 'clamp(3rem, 9vw, 6rem)',
          lineHeight: 1.1,
          margin: 0,
        }}
      >
        {meta.name}
        {/* Hand-drawn underline stroke, hugging the name's baseline. */}
        <svg
          aria-hidden="true"
          viewBox={`0 -6 ${UNDERLINE_WIDTH} 12`}
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '0.02em',
            transform: 'translateX(-50%)',
            width: 'min(70%, 320px)',
            height: 'auto',
            overflow: 'visible',
          }}
        >
          <path d={nameUnderline} fill="none" stroke={BLUEPRINT.accent} strokeWidth={3} strokeLinecap="round" />
        </svg>
      </h1>

      <p
        style={{
          fontFamily: "'World Patrick Hand', cursive",
          fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)',
          margin: 0,
          opacity: 0.85,
        }}
      >
        {meta.tagline}
      </p>

      <button
        type="button"
        className="world-cover-open-btn"
        onClick={handleOpen}
        style={{
          position: 'relative',
          width: BUTTON_WIDTH,
          height: BUTTON_HEIGHT,
          marginTop: '1rem',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: "'World Patrick Hand', cursive",
          fontSize: '1.25rem',
          color: PAPER_COLORS.ink,
        }}
      >
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${BUTTON_WIDTH} ${BUTTON_HEIGHT}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        >
          {/* Alpha is baked into the fill color, not a separate `opacity`
              attribute: the hover CSS rule below sets this path's `opacity`
              to 1 (from 0), and a stylesheet `opacity` always overrides an
              SVG presentation attribute of the same name — using the attr
              for a "resting" alpha would just get clobbered to fully solid
              on hover instead of fading in as a subtle wash. */}
          <path className="cover-btn-wash" d={buttonWobble} fill={`${BLUEPRINT.accent}29`} />
          <path
            className="cover-btn-outline"
            d={buttonWobble}
            fill="none"
            stroke={PAPER_COLORS.ink}
            strokeWidth={2}
            strokeDasharray="6 5"
            strokeLinecap="round"
          />
        </svg>
        <span style={{ position: 'relative' }}>open the notebook &rarr;</span>
      </button>

      <p
        aria-hidden="true"
        style={{
          fontFamily: "'World Patrick Hand', cursive",
          fontSize: '0.9rem',
          opacity: 0.6,
          marginTop: '0.5rem',
        }}
      >
        sound on
      </p>
    </div>
  );
}
