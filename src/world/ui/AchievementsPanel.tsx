// Lists every ACHIEVEMENTS def with a locked/unlocked visual state plus an
// "n / N EXPLORED" footer. All unlock tracking lives in the achievements
// controller (state/achievements.tsx) — this file only renders it.

import { useEffect, useRef } from 'react';
import { BLUEPRINT } from '../blueprint/palette';
import { ACHIEVEMENTS } from '../contracts';
import { useAchievements } from '../state/hooks';
import { PANEL_DROP_SHADOW, PANEL_PAPER_BACKGROUND, PANEL_TORN_CLIP } from './progress';

export interface AchievementsPanelProps {
  open: boolean;
  onClose: () => void;
}

// Pencil & pastel palette (BLUEPRINT, blueprint/palette.ts).
const INK = BLUEPRINT.ink;
const ACCENT = BLUEPRINT.accentWarm; // muted amber — "awards, counts" per palette.ts

export function AchievementsPanel({ open, onClose }: AchievementsPanelProps) {
  const { unlocked } = useAchievements();
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.inert = !open;
  }, [open]);

  return (
    <div
      id="hud-panel-achievements"
      ref={rootRef}
      role="region"
      aria-label="Achievements"
      aria-hidden={!open}
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: `translate(-50%, ${open ? '0%' : '-110%'})`,
        transition: 'transform 0.4s cubic-bezier(.16,1,.3,1)',
        pointerEvents: open ? 'auto' : 'none',
        width: 'min(92vw, 340px)',
        background: PANEL_PAPER_BACKGROUND,
        border: `1.5px solid ${INK}`,
        clipPath: PANEL_TORN_CLIP,
        filter: PANEL_DROP_SHADOW,
        padding: '1.25rem 1.25rem 2rem',
        color: INK,
        fontFamily: '"Patrick Hand", cursive',
      }}
    >
      {/* Header drawn as a taped-on label strip (matches MapPanel/
          AudioPanel): tinted band bleeding to the torn edges, dashed rule
          underneath, tiny drawn trophy glyph. */}
      <div
        style={{
          position: 'relative',
          margin: '-1.25rem -1.25rem 0.9rem',
          // Generous top padding — see MapPanel.tsx's header comment for why
          // 0.6rem clips under the frozen PANEL_TORN_CLIP zigzag.
          padding: '3rem 1.25rem 0.65rem',
          background: `${ACCENT}1c`,
          borderBottom: `1.5px dashed ${INK}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {/* Same trophy glyph as the Journey map pin (mapLayout 'trophy'
              icon), rescaled — keeps one drawn trophy vocabulary across the
              HUD instead of inventing a second one just for this header. */}
          <svg width="15" height="17" viewBox="-8 -9 16 19" aria-hidden="true" style={{ flexShrink: 0 }} fill="none">
            <path d="M-6 -8h12v6a6 6 0 01-12 0v-6z" stroke={INK} strokeWidth={1.1} strokeLinejoin="round" />
            <path d="M-6 -6h-3v3a3 3 0 003 3 M6 -6h3v3a3 3 0 01-3 3" stroke={INK} strokeWidth={1} />
            <path d="M0 4v4 M-4 10h8" stroke={INK} strokeWidth={1} />
          </svg>
          achievements
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close achievements"
          tabIndex={open ? 0 : -1}
          style={{ background: 'transparent', border: 'none', color: INK, fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}
        >
          &times;
        </button>
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {ACHIEVEMENTS.map((def, i) => {
          const isUnlocked = unlocked.includes(def.id);
          return (
            <li
              key={def.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.7rem',
                padding: '0.5rem 0',
                borderBottom: i < ACHIEVEMENTS.length - 1 ? `1px dashed ${INK}33` : 'none',
                opacity: isUnlocked ? 1 : 0.5,
              }}
            >
              {/* Stamp/badge: a drawn ink ring (dashed "perforated" outer
                  ring, like a torn ticket stub) with a wax-seal-style filled
                  center once unlocked, check mark inside — a small trophy
                  medal rather than a plain checkbox row. */}
              <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true" style={{ flexShrink: 0 }}>
                <circle
                  cx={15}
                  cy={15}
                  r={13}
                  fill="none"
                  stroke={INK}
                  strokeWidth={1}
                  strokeDasharray={isUnlocked ? undefined : '1.6 2.4'}
                  opacity={isUnlocked ? 0.4 : 0.55}
                />
                <circle cx={15} cy={15} r={10} fill={isUnlocked ? `${ACCENT}2e` : 'none'} stroke={INK} strokeWidth={1.4} />
                {isUnlocked && (
                  <path
                    d="M9.5 15.2l3.6 3.6L20.5 10.8"
                    fill="none"
                    stroke={ACCENT}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
              </svg>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                <strong>{def.title}</strong>
                <span style={{ fontSize: '0.85rem', opacity: 0.75 }}>{def.label}</span>
              </span>
            </li>
          );
        })}
      </ul>

      <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', opacity: 0.75 }}>
        {unlocked.length} / {ACHIEVEMENTS.length} EXPLORED
      </p>
    </div>
  );
}
