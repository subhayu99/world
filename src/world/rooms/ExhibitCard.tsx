// DOM overlay modal for an inspected warehouse exhibit. Rendered by Warehouse.tsx
// into its own imperative ReactDOM root (see useDomOverlay in Warehouse.tsx) so it
// never has to live inside the react-three-fiber scene graph.
//
// Notebook aesthetic: paper card (CSS-gradient grain, no image assets) with a
// jagged, hand-torn clip-path on all four edges + drop shadow, slides in from
// the right (15deg -> 1deg) over a warm-ink scrim. Body text reveals with a
// manual-interval typewriter (no gsap TextPlugin) that steps by whole word —
// never mid-word — so a screenshot taken between steps can't read as
// truncated inside a word (punchlist #8).

import { useEffect, useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Exhibit } from '../types';
import { accentForId, hexToRgba, seededRand, typewriterChunks, typewriterDuration } from './warehouseMath';

export interface ExhibitCardProps {
  exhibit: Exhibit;
  onClose: () => void;
}

const PAPER = '#f7f5ef';
const INK = '#2a2a2a';
// Warm-ink scrim (punchlist #29: "off-palette neutral gray ... clashing with
// the warm cream/ink palette") instead of a neutral rgba(0,0,0,*) black.
// PALETTE.ink (#2a2a2a) is itself R=G=B — a true neutral gray — so tinting
// with it alone still reads as flat gray once composited (confirmed by
// sampling the rendered screenshot: ~149,147,144, only a 1-2% warm bias from
// the cream scene bleeding through). This umber instead has a real R>G>B
// bias at the same darkness/alpha, so the scrim itself carries the warmth.
const SCRIM = 'rgba(48, 38, 30, 0.45)';
// CSS-only paper grain: a few soft, off-center tinted blooms standing in for
// fiber/crumple texture without a raster asset (CSP: zero external URLs).
const PAPER_GRAIN =
  'radial-gradient(circle at 18% 24%, rgba(42,42,42,0.045) 0%, transparent 42%),' +
  'radial-gradient(circle at 82% 12%, rgba(42,42,42,0.03) 0%, transparent 38%),' +
  'radial-gradient(circle at 70% 70%, rgba(42,42,42,0.035) 0%, transparent 50%),' +
  'radial-gradient(circle at 12% 82%, rgba(217,164,65,0.04) 0%, transparent 46%)';

// A rough hand-torn paper edge, traced once and reused for every card.
const CARD_CLIP_PATH =
  'polygon(2% 4%, 10% 0%, 22% 3%, 35% 0%, 50% 2%, 63% 0%, 78% 3%, 90% 0%, 98% 5%, ' +
  '100% 15%, 97% 30%, 100% 45%, 98% 60%, 100% 75%, 97% 88%, 100% 96%, 88% 100%, ' +
  '75% 97%, 60% 100%, 45% 98%, 30% 100%, 15% 97%, 3% 100%, 0% 88%, 3% 75%, 0% 60%, ' +
  '2% 45%, 0% 30%, 3% 15%, 0% 5%)';

export default function ExhibitCard({ exhibit, onClose }: ExhibitCardProps) {
  const [entered, setEntered] = useState(false);
  const [revealedChunks, setRevealedChunks] = useState(0);
  const accent = accentForId(exhibit.id);
  // Reveal by whole word (punchlist #8), not by character — chunks.join('')
  // always reproduces exhibit.body exactly, so nothing is ever lost, only
  // revealed progressively at word boundaries.
  const chunks = useMemo(() => typewriterChunks(exhibit.body), [exhibit.body]);
  const typed = chunks.slice(0, revealedChunks).join('');

  // Slide-in: flip to the "entered" transform on the next animation frame so the
  // browser actually transitions from the off-screen/rotated start state.
  useEffect(() => {
    setEntered(false);
    let raf2 = 0;
    const raf1 = window.requestAnimationFrame(() => {
      raf2 = window.requestAnimationFrame(() => setEntered(true));
    });
    return () => {
      window.cancelAnimationFrame(raf1);
      if (raf2) window.cancelAnimationFrame(raf2);
    };
  }, [exhibit]);

  // Typewriter reveal of the body copy, driven by a plain setInterval (no gsap
  // TextPlugin), timed by the shared min(2.5s, len*.015) duration function but
  // stepping through word-boundary chunks (see `chunks` above) instead of raw
  // characters, so the visible string can only ever end after a whole word.
  useEffect(() => {
    setRevealedChunks(0);
    const body = exhibit.body;
    const wordChunks = typewriterChunks(body);
    if (wordChunks.length === 0) return undefined;

    const totalMs = typewriterDuration(body) * 1000;
    const stepMs = Math.max(totalMs / wordChunks.length, 1);
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setRevealedChunks(i);
      if (i >= wordChunks.length) window.clearInterval(id);
    }, stepMs);

    return () => window.clearInterval(id);
  }, [exhibit]);

  // Close on Escape.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleBackdropClick = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '5vh 6vw',
        background: SCRIM,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        opacity: entered ? 1 : 0,
        transition: 'opacity 0.5s ease',
      }}
    >
      <style>{`
        @keyframes exhibit-cursor-blink { 0%, 45% { opacity: 1; } 50%, 100% { opacity: 0; } }
        .exhibit-card-close:hover { transform: rotate(90deg); }
        .exhibit-card-tag { transition: transform 0.15s ease; }
        .exhibit-card-tag:hover { transform: translateY(-2px) scale(1.04); }
      `}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${exhibit.client} exhibit details`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(440px, 90vw)',
          maxHeight: '86vh',
          overflowY: 'auto',
          backgroundColor: PAPER,
          backgroundImage: PAPER_GRAIN,
          color: INK,
          clipPath: CARD_CLIP_PATH,
          filter: 'drop-shadow(0 22px 34px rgba(0,0,0,0.38))',
          padding: '3rem 2.4rem 2.6rem',
          fontFamily: '"Patrick Hand", "Caveat", cursive, sans-serif',
          transform: entered ? 'translateX(0) rotate(1deg)' : 'translateX(480px) rotate(15deg)',
          transition: 'transform 0.8s cubic-bezier(.34,1.56,.64,1)',
        }}
      >
        <button
          type="button"
          className="exhibit-card-close"
          onClick={onClose}
          aria-label="Close exhibit card"
          style={{
            position: 'absolute',
            top: '0.9rem',
            right: '1.1rem',
            width: '2rem',
            height: '2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `2px solid ${INK}`,
            borderRadius: '50%',
            background: 'transparent',
            color: INK,
            cursor: 'pointer',
            transition: 'transform 0.2s ease',
          }}
        >
          {/* A drawn X (two crossing strokes) rather than a font glyph — reads
              as hand-inked, consistent with the rest of the torn-paper card. */}
          <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
            <line x1="2" y1="2" x2="11" y2="11" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
            <line x1="11" y1="2" x2="2" y2="11" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>

        {/* Hand-drawn "stamp": a rotated, double-ringed badge in the exhibit's
            own accent color, replacing the flat inline date text
            (punchlist brief: "date as a hand-drawn stamp"). */}
        <span
          style={{
            display: 'inline-block',
            margin: '0 0 0.6rem',
            padding: '0.15rem 0.7rem',
            fontSize: '0.85rem',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: accent,
            border: `2px solid ${accent}`,
            borderRadius: '3px',
            boxShadow: `0 0 0 2px ${hexToRgba(accent, 0.35)}`,
            transform: 'rotate(-4deg)',
          }}
        >
          {exhibit.date}
        </span>
        {/* Rhythm: client + title sit close (one unit, the byline), then a
            deliberately wider gap opens before the metric — the hero number
            gets room to breathe instead of crowding straight in under the
            title (punchlist: "tighten typography rhythm"). */}
        <h2 style={{ margin: '0.15rem 0 0.15rem', fontSize: '2.2rem', lineHeight: 1.1 }}>{exhibit.client}</h2>
        <h3 style={{ margin: '0 0 1.3rem', fontSize: '1.15rem', fontWeight: 400, opacity: 0.85, lineHeight: 1.3 }}>
          {exhibit.title}
        </h3>

        <p
          style={{
            margin: '0 0 1.3rem',
            fontSize: '2rem',
            fontWeight: 700,
            lineHeight: 1.05,
            color: accent,
          }}
        >
          {exhibit.metric}
        </p>

        <p style={{ margin: '0 0 1.2rem', fontSize: '1.05rem', lineHeight: 1.5, minHeight: '4.5em' }}>
          {typed}
          {typed.length < exhibit.body.length && (
            <span
              aria-hidden="true"
              style={{
                display: 'inline-block',
                width: '0.55ch',
                borderRight: `2px solid ${INK}`,
                marginLeft: '1px',
                animation: 'exhibit-cursor-blink 0.85s step-end infinite',
              }}
            />
          )}
        </p>

        <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', margin: 0, padding: 0, listStyle: 'none' }}>
          {exhibit.tags.map((tag, i) => {
            const wobble = (seededRand(i, `${exhibit.id}-chip`) * 2 - 1) * 3;
            return (
              <li
                key={tag}
                className="exhibit-card-tag"
                style={{
                  border: `1.5px solid ${accent}`,
                  borderRadius: '999px 999px 995px 999px / 999px 995px 999px 999px',
                  padding: '0.25rem 0.75rem',
                  fontSize: '0.85rem',
                  color: INK,
                  background: hexToRgba(accent, 0.12),
                  transform: `rotate(${wobble}deg)`,
                }}
              >
                {tag}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
