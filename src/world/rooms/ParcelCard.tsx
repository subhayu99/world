// DOM "paper card" modal for an opened parcel (REPORT.md §9's project-detail
// modal family: backdrop blur + a card with name / big stat / body / link
// buttons). The Registry room owns this copy independently — it deliberately
// does not import anything from room-warehouse's inspect card.

import { useEffect } from 'react';
import { FONTS } from '../contracts';
import type { Parcel } from '../types';

export interface ParcelCardProps {
  parcel: Parcel;
  /** Pre-formatted download count (formatDownloads() output or the fallback string). */
  downloads: string;
  onClose: () => void;
}

const BASE_URL = import.meta.env.BASE_URL || '/';

const COLORS = {
  paper: '#f7f5ef',
  ink: '#2a2a2a',
  grid: '#c9d6e4',
  blue: '#2f6fb5',
  green: '#4f9d69',
} as const;

// A hand-torn paper edge, traced once and reused for every card — same
// "paper treatment" family as the Warehouse inspect card (jagged edges all
// around via clip-path + a drop-shadow filter that follows the clipped
// silhouette, since box-shadow/border both ignore clip-path and would draw
// a straight rectangle around the jagged card). Registry keeps its own copy
// per this file's independence note above rather than importing Warehouse's.
const CARD_CLIP_PATH =
  'polygon(1% 3%, 9% 0%, 20% 4%, 33% 1%, 48% 3%, 61% 0%, 76% 4%, 89% 1%, 99% 4%, ' +
  '100% 14%, 96% 28%, 100% 42%, 97% 58%, 100% 72%, 96% 86%, 100% 97%, 87% 100%, ' +
  '73% 96%, 58% 100%, 44% 97%, 29% 100%, 14% 96%, 2% 100%, 0% 87%, 4% 73%, 0% 58%, ' +
  '3% 44%, 0% 29%, 4% 14%, 0% 4%)';

/** Deterministic small per-button wobble so the "hand-dashed" link boxes
 * don't all sit at an identical, mechanically flat rotation. */
function buttonWobble(index: number): number {
  const t = Math.sin(index * 12.9898) * 43758.5453;
  return (t - Math.floor(t)) * 4 - 2; // -2..2 degrees
}

export function ParcelCard({ parcel, downloads, onClose }: ParcelCardProps) {
  // Escape closes the card, matching the "proper dialog" a11y note in REPORT.md §9.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={parcel.name}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Warm-ink scrim (punchlist #29). An umber rgb (R>G>B) rather than
        // PALETTE.ink's #2a2a2a, which is itself R=G=B — a true neutral gray
        // that still reads as flat gray once composited over the scene.
        background: 'rgba(48, 38, 30, 0.55)',
        backdropFilter: 'blur(8px)',
        padding: '1.5rem',
      }}
    >
      <style>{`
        @font-face {
          font-family: 'Registry Card Caveat';
          src: url('${BASE_URL}${FONTS.caveat}') format('truetype');
          font-weight: 400 700;
          font-display: swap;
        }
        @font-face {
          font-family: 'Registry Card Hand';
          src: url('${BASE_URL}${FONTS.hand}') format('truetype');
          font-weight: 400;
          font-display: swap;
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: 'min(92vw, 440px)',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: COLORS.paper,
          color: COLORS.ink,
          clipPath: CARD_CLIP_PATH,
          filter: 'drop-shadow(0 20px 40px rgba(0, 0, 0, 0.32))',
          padding: '2.4rem 2rem 2rem',
          backgroundImage:
            `repeating-linear-gradient(0deg, transparent, transparent 26px, ${COLORS.grid}4d 27px)`,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            background: 'transparent',
            border: 'none',
            fontSize: '1.75rem',
            lineHeight: 1,
            cursor: 'pointer',
            color: COLORS.ink,
          }}
        >
          &times;
        </button>

        <h2
          style={{
            margin: '0 0 0.35rem',
            fontFamily: "'Registry Card Caveat', cursive",
            fontSize: 'clamp(1.75rem, 5vw, 2.25rem)',
            lineHeight: 1.1,
          }}
        >
          {parcel.name}
        </h2>

        <p
          style={{
            margin: '0 0 1.1rem',
            fontFamily: "'Registry Card Hand', cursive",
            fontSize: 'clamp(2.5rem, 9vw, 3.4rem)',
            fontWeight: 700,
            lineHeight: 1,
            color: '#c96f5f',
          }}
        >
          {downloads}
          <span style={{ fontSize: '0.95rem', marginLeft: '0.5rem', color: COLORS.ink, opacity: 0.7 }}>
            downloads
          </span>
        </p>

        <p
          style={{
            margin: '0 0 1.5rem',
            fontFamily: "'Registry Card Hand', cursive",
            fontSize: '1.05rem',
            lineHeight: 1.5,
          }}
        >
          {parcel.body}
        </p>

        <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
          {parcel.links.map((link, i) => (
            <button
              key={link.url}
              type="button"
              onClick={() => window.open(link.url, '_blank', 'noopener')}
              style={{
                background: 'transparent',
                border: `2px dashed ${COLORS.ink}`,
                borderRadius: '7px 9px 6px 8px',
                padding: '0.5rem 1.1rem',
                fontFamily: "'Registry Card Hand', cursive",
                fontSize: '1rem',
                cursor: 'pointer',
                color: COLORS.ink,
                transform: `rotate(${buttonWobble(i)}deg)`,
                transition: 'transform 0.15s ease, background 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(201, 111, 95, 0.12)';
                e.currentTarget.style.borderColor = '#c96f5f';
                e.currentTarget.style.transform = `rotate(${buttonWobble(i)}deg) translateY(-2px)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = COLORS.ink;
                e.currentTarget.style.transform = `rotate(${buttonWobble(i)}deg)`;
              }}
            >
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
