// The single fixed-inset HUD root. Everything the player sees on top of the
// 3D scene mounts here: the back button, the three paper-scrap panel
// triggers (map / audio / achievements) and their drop-down panels, the
// quest toast, the teleport paper-tear overlay, and the Konami-code easter
// egg. The root itself is pointer-events: none — every interactive child
// opts back in with its own `pointerEvents: 'auto'`, so the 3D canvas
// underneath keeps receiving input everywhere the HUD doesn't draw chrome.
//
// No framer-motion here (world-mode rule): CSS transitions handle the panel
// drop-down, gsap owns PaperTear's teleport choreography.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { BLUEPRINT } from '../blueprint/palette';
import { useAudio, useWorldStore } from '../state/hooks';
import { AchievementsPanel } from './AchievementsPanel';
import { AudioPanel } from './AudioPanel';
import { MapPanel } from './MapPanel';
import { PaperTear } from './PaperTear';
import { PANEL_DROP_SHADOW, ROUGHEN_FILTER_ID } from './progress';
import { QuestToast } from './QuestToast';
import { useKonami } from './useKonami';

type PanelId = 'map' | 'audio' | 'achievements';

// Pencil & pastel palette (BLUEPRINT is the single source of truth — see
// blueprint/palette.ts). PAPER stays a hair off BLUEPRINT.paper on purpose:
// this 2D chrome layer reads as a separate sheet laid over the warmer 3D
// paper world, so it keeps progress.ts's own PAPER_COLORS.paper value
// ('#f7f5ef') rather than importing the 3D ground tone.
const INK = BLUEPRINT.ink;
const PAPER = '#f7f5ef';

// One fixed accent per HUD trigger (punch-list #16: "assign one fixed accent
// color per section and apply it consistently"), reused as that trigger's
// active-state tint. Matches each panel's own dominant accent (MapPanel's
// visited-fill blue, AudioPanel's slider blue, AchievementsPanel's amber
// award check) so the HUD trigger previews the color story inside its panel.
const PANEL_ACCENT: Record<PanelId, string> = {
  map: BLUEPRINT.accentCool,
  audio: BLUEPRINT.accentCool,
  achievements: BLUEPRINT.accentWarm,
};

// Hover/press drop-shadow variants for the torn-paper trigger chips — same
// warm-shadow recipe as PANEL_DROP_SHADOW (progress.ts, frozen), just
// stronger on hover (lift) and flatter on press (contact), so the buttons
// read as physical paper scraps rather than flat icons.
const SCRAP_DROP_SHADOW_HOVER =
  'drop-shadow(0 18px 26px rgba(60,42,20,0.30)) drop-shadow(0 6px 10px rgba(60,42,20,0.20))';
const SCRAP_DROP_SHADOW_ACTIVE =
  'drop-shadow(0 6px 10px rgba(60,42,20,0.22)) drop-shadow(0 2px 3px rgba(60,42,20,0.16))';

// Hand-tuned jagged heptagon — the "torn paper scrap" silhouette shared by
// all three top-right trigger buttons and the back button.
const SCRAP_CLIP = 'polygon(6% 0%, 94% 4%, 100% 38%, 96% 100%, 42% 96%, 2% 100%, 0% 32%)';

/** SVG turbulence+displacement filter, mounted once here and referenced by
 * id from every icon glyph in this HUD subtree (this file's own scrap
 * buttons, plus MapPanel/AudioPanel/AchievementsPanel/QuestToast — all
 * mounted as children below, in the same commit, so the def always exists
 * before any consumer paints). Turns clean vector strokes into jittered
 * hand-inked lines (punch-list #26). */
function RoughenFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        <filter id={ROUGHEN_FILTER_ID} x="-30%" y="-30%" width="160%" height="160%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
    </svg>
  );
}

/**
 * Shared hover/press physicality for every torn-paper trigger chip (the back
 * button + the three top-right ScrapButtons). Rotation is applied on an
 * outer wrapper span (see ScrapButtonFrame below) so this class only ever
 * has to animate translateY/scale/filter — no CSS custom-property plumbing
 * needed to combine a per-button static rotation with a shared hover lift.
 */
function ScrapChipStyles() {
  return (
    <style>{`
      .hud-scrap-chip {
        filter: ${PANEL_DROP_SHADOW};
        transition: transform 0.15s ease, filter 0.15s ease;
      }
      .hud-scrap-chip:hover {
        transform: translateY(-2px);
        filter: ${SCRAP_DROP_SHADOW_HOVER};
      }
      .hud-scrap-chip:active {
        transform: translateY(1px) scale(0.96);
        filter: ${SCRAP_DROP_SHADOW_ACTIVE};
      }
    `}</style>
  );
}

/** Rotation wrapper: keeps each trigger's fixed hand-placed tilt on an outer
 * element so the inner button (className="hud-scrap-chip") is free to
 * animate translateY/scale for hover/press without fighting the rotation. */
function ScrapButtonFrame({ rotate, children }: { rotate: number; children: ReactNode }) {
  return <span style={{ display: 'inline-flex', transform: `rotate(${rotate}deg)` }}>{children}</span>;
}

const KONAMI_RAIN_MS = 6000;
const KONAMI_GLYPHS = ['☆', '✦', '♪', '∞', '✎', '✓', '△', '○'];
// Colored-pencil accent quartet: the three BLUEPRINT accents plus graphite
// ink, so the rain reads as this world's own palette rather than borrowed
// Matrix green or off-palette hues.
const KONAMI_COLORS = [BLUEPRINT.accentCool, BLUEPRINT.accent, BLUEPRINT.accentWarm, BLUEPRINT.ink];

function ScrapButton({
  label,
  rotate,
  active,
  panelId,
  onToggle,
  children,
}: {
  label: string;
  rotate: number;
  active: boolean;
  panelId: PanelId;
  onToggle: (id: PanelId) => void;
  children: ReactNode;
}) {
  const accent = PANEL_ACCENT[panelId];
  return (
    <ScrapButtonFrame rotate={rotate}>
      <button
        type="button"
        className="hud-scrap-chip"
        aria-label={label}
        aria-expanded={active}
        aria-controls={`hud-panel-${panelId}`}
        onClick={() => onToggle(panelId)}
        style={{
          pointerEvents: 'auto',
          width: 52,
          height: 52,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: active ? `${accent}22` : PAPER,
          border: `1.5px solid ${active ? accent : INK}`,
          clipPath: SCRAP_CLIP,
          color: INK,
          cursor: 'pointer',
          // box-shadow would draw a rectangular halo through the clip-path's
          // notches; filter: drop-shadow() respects the clipped silhouette
          // (base/hover/active filter values live in the .hud-scrap-chip
          // stylesheet rule above, not here, so :hover/:active can override).
        }}
      >
        <span style={{ filter: `url(#${ROUGHEN_FILTER_ID})`, display: 'flex' }}>{children}</span>
      </button>
    </ScrapButtonFrame>
  );
}

/** Own minimal falling-glyph canvas for the Konami easter egg.
 *
 * `@/components/gui/MatrixRain` was read before writing this: it takes no
 * props at all and only fades itself in after 8s of *its own* idle
 * detection (mouse/scroll/keydown reset that timer) — the very keydown
 * events that complete the Konami code would keep resetting it, so it
 * structurally cannot show "now, for ~6s" on demand. Rendering our own tiny
 * canvas here instead, in the notebook's ink/accent palette rather than
 * Matrix green, so it reads as part of this world rather than a reused TUI
 * easter egg. */
function KonamiRain({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const doneTimer = setTimeout(onDone, KONAMI_RAIN_MS);

    const canvas = canvasRef.current;
    if (!canvas) return () => clearTimeout(doneTimer);
    const ctx = canvas.getContext('2d');
    if (!ctx) return () => clearTimeout(doneTimer);

    let width = 0;
    let height = 0;
    let rafId = 0;
    let columns: { x: number; y: number; speed: number; glyph: string; color: string }[] = [];

    const COL_GAP = 34;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.width = `${width}px`;
      canvas!.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = Math.max(1, Math.floor(width / COL_GAP));
      columns = Array.from({ length: count }, (_, i) => ({
        x: i * COL_GAP + COL_GAP / 2,
        y: Math.random() * -height,
        speed: 60 + Math.random() * 90,
        glyph: KONAMI_GLYPHS[Math.floor(Math.random() * KONAMI_GLYPHS.length)],
        color: KONAMI_COLORS[Math.floor(Math.random() * KONAMI_COLORS.length)],
      }));
    }

    let last = 0;
    function draw(now: number) {
      const dt = last ? (now - last) / 1000 : 0.016;
      last = now;
      ctx!.clearRect(0, 0, width, height);
      ctx!.font = '20px "Patrick Hand", cursive';
      ctx!.textAlign = 'center';
      for (const col of columns) {
        col.y += col.speed * dt;
        if (col.y > height + 20) {
          col.y = -20;
          col.glyph = KONAMI_GLYPHS[Math.floor(Math.random() * KONAMI_GLYPHS.length)];
          col.color = KONAMI_COLORS[Math.floor(Math.random() * KONAMI_COLORS.length)];
        }
        ctx!.fillStyle = col.color;
        ctx!.globalAlpha = 0.75;
        ctx!.fillText(col.glyph, col.x, col.y);
      }
      ctx!.globalAlpha = 1;
      rafId = requestAnimationFrame(draw);
    }

    resize();
    window.addEventListener('resize', resize);
    rafId = requestAnimationFrame(draw);

    return () => {
      clearTimeout(doneTimer);
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
    };
  }, [onDone]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, zIndex: 900, pointerEvents: 'none' }}
    />
  );
}

export function Hud() {
  const store = useWorldStore();
  const audio = useAudio();
  const [openPanel, setOpenPanel] = useState<PanelId | null>(null);
  const [showKonamiRain, setShowKonamiRain] = useState(false);

  const closePanel = useCallback(() => setOpenPanel(null), []);
  const togglePanel = useCallback((id: PanelId) => {
    setOpenPanel((current) => (current === id ? null : id));
  }, []);

  const handleKonamiUnlock = useCallback(() => setShowKonamiRain(true), []);
  useKonami(handleKonamiUnlock);

  const handleKonamiDone = useCallback(() => setShowKonamiRain(false), []);

  const handleBack = useCallback(() => {
    store.exitRoom();
    try {
      audio.play('thud');
    } catch {
      // audio may still be locked pre-gesture; ignore
    }
  }, [store, audio]);

  // Escape closes whichever panel is open. A single top-level listener
  // (rather than one per panel) since Hud already owns openPanel state.
  useEffect(() => {
    if (!openPanel) return;
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKeydown);
    return () => window.removeEventListener('keydown', onKeydown);
  }, [openPanel, closePanel]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, pointerEvents: 'none' }}>
      <RoughenFilterDefs />
      <ScrapChipStyles />
      {store.stage === 'room' && (
        <div style={{ position: 'absolute', top: 20, left: 20 }}>
          <ScrapButtonFrame rotate={-4}>
            <button
              type="button"
              className="hud-scrap-chip"
              aria-label="Back to corridor"
              onClick={handleBack}
              style={{
                pointerEvents: 'auto',
                width: 52,
                height: 52,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: PAPER,
                border: `1.5px solid ${INK}`,
                clipPath: SCRAP_CLIP,
                color: INK,
                cursor: 'pointer',
                fontSize: '1.4rem',
              }}
            >
              &larr;
            </button>
          </ScrapButtonFrame>
        </div>
      )}

      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          display: 'flex',
          gap: 12,
        }}
      >
        <ScrapButton label="Site map" rotate={-3} active={openPanel === 'map'} panelId="map" onToggle={togglePanel}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 5l6-2 6 2 4-2v16l-4 2-6-2-6 2V5z" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M10 3v16M16 5v16" stroke={INK} strokeWidth="1.2" />
          </svg>
        </ScrapButton>
        <ScrapButton label="Audio settings" rotate={2} active={openPanel === 'audio'} panelId="audio" onToggle={togglePanel}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9H4z" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M16 8.5a5 5 0 010 7" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </ScrapButton>
        <ScrapButton
          label="Achievements"
          rotate={-2}
          active={openPanel === 'achievements'}
          panelId="achievements"
          onToggle={togglePanel}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M8 4h8v4a4 4 0 01-8 0V4z M8 5H5v2a3 3 0 003 3 M16 5h3v2a3 3 0 01-3 3 M11 12v3h2v-3 M9 19h6l-1-2H10l-1 2z"
              stroke={INK}
              strokeWidth="1.3"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </ScrapButton>
      </div>

      <MapPanel open={openPanel === 'map'} onClose={closePanel} />
      <AudioPanel open={openPanel === 'audio'} onClose={closePanel} />
      <AchievementsPanel open={openPanel === 'achievements'} onClose={closePanel} />

      <QuestToast />
      <PaperTear />

      {showKonamiRain && <KonamiRain onDone={handleKonamiDone} />}
    </div>
  );
}
