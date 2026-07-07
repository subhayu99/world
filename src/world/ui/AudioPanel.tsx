// Music + SFX volume sliders and a mute toggle, wired straight into the
// AudioEngine contract. Note: AudioEngine only exposes isMuted() (no
// getMusicVolume/getSfxVolume getters), so the sliders seed their initial
// position from the documented defaults (contracts.ts AudioEngine:
// setMusicVolume 0.3, setSfxVolume 0.5) rather than any persisted value —
// that's a limitation of the frozen contract, not this component.

import { useEffect, useMemo, useRef, useState } from 'react';
import { BLUEPRINT } from '../blueprint/palette';
import { useAudio } from '../state/hooks';
import {
  PANEL_DROP_SHADOW,
  PANEL_PAPER_BACKGROUND,
  PANEL_TORN_CLIP,
  percentFromTrackOffset,
  seededRandom,
  wobblyCirclePath,
  wobblyLinePath,
} from './progress';

export interface AudioPanelProps {
  open: boolean;
  onClose: () => void;
}

// Pencil & pastel palette (BLUEPRINT, blueprint/palette.ts). Ink comes from
// BLUEPRINT so panel text/border match the 3D world's graphite line color.
const INK = BLUEPRINT.ink;
const ACCENT = BLUEPRINT.accentCool; // pastel blue — slider fill/thumb

const DEFAULT_MUSIC_PCT = 30;
const DEFAULT_SFX_PCT = 50;

const SLIDER_HEIGHT = 28;
const TRACK_Y = SLIDER_HEIGHT / 2;
const THUMB_RADIUS = 8;
const STEP = 2;
const BIG_STEP = 10;

/**
 * Hand-drawn replacement for a native `<input type="range">` (punchlist
 * #15: "single biggest native-control leak in the HUD" — a stock browser
 * slider with zero relation to the hand-inked aesthetic used everywhere
 * else). Track is a wobbly ink SVG line (progress.ts's `wobblyLinePath`,
 * already written and unit-tested for exactly this but never actually
 * wired into a component); the filled portion overlays it in the
 * colored-pencil accent blue, and the thumb is a wobbly hand-drawn circle
 * filled with the same blue. Fully operable by pointer (drag or
 * click-to-jump on the track) and keyboard (arrow keys +/-2, PageUp/
 * PageDown +/-10, Home/End to the ends) with real `role="slider"` +
 * `aria-value*`, so this is a strict a11y upgrade over the native input,
 * not a regression traded for aesthetics.
 */
function AudioSlider({
  value,
  onChange,
  label,
  ariaLabel,
  disabled,
  seed,
}: {
  value: number;
  onChange: (pct: number) => void;
  label: string;
  ariaLabel: string;
  disabled: boolean;
  seed: number;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  // Track/thumb wobble is generated once per mount (stable seed per slider
  // instance) rather than per render, so the hand-drawn line doesn't
  // re-jitter on every value change.
  const trackPath = useMemo(() => wobblyLinePath(200, 10, seededRandom(seed), 1.6), [seed]);
  const thumbPath = useMemo(() => wobblyCirclePath(THUMB_RADIUS, 14, seededRandom(seed + 1), 1.1), [seed]);

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onChange(percentFromTrackOffset(clientX - rect.left, rect.width));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    draggingRef.current = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setFromClientX(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || disabled) return;
    setFromClientX(e.clientX);
  };

  const stopDragging = () => {
    draggingRef.current = false;
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = value + STEP;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = value - STEP;
        break;
      case 'PageUp':
        next = value + BIG_STEP;
        break;
      case 'PageDown':
        next = value - BIG_STEP;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = 100;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(Math.min(100, Math.max(0, next)));
  };

  const filledWidthPct = Math.min(100, Math.max(0, value));

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      <span>{label}</span>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={ariaLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value}%`}
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onKeyDown={handleKeyDown}
        style={{
          position: 'relative',
          width: '100%',
          height: SLIDER_HEIGHT,
          cursor: disabled ? 'default' : 'pointer',
          touchAction: 'none',
        }}
      >
        {/* Track: a wobbly line stretched to the container's full width — a
            horizontally-stretched hand-drawn line still reads as hand-drawn,
            so preserveAspectRatio="none" is fine here. The thumb is a
            separate, fixed-aspect SVG below so its circle never stretches
            into an ellipse under that same non-uniform scale. */}
        <svg
          viewBox={`0 0 200 ${SLIDER_HEIGHT}`}
          preserveAspectRatio="none"
          width="100%"
          height={SLIDER_HEIGHT}
          style={{ display: 'block', overflow: 'visible' }}
          aria-hidden="true"
        >
          <g transform={`translate(0, ${TRACK_Y})`}>
            {/* full ink track */}
            <path d={trackPath} fill="none" stroke={INK} strokeWidth={2} strokeLinecap="round" opacity={disabled ? 0.35 : 0.55} />
          </g>
          {/* filled portion in accent blue, clipped to value% of the track width */}
          <clipPath id={`audio-slider-fill-${seed}`}>
            <rect x={0} y={0} width={(filledWidthPct / 100) * 200} height={SLIDER_HEIGHT} />
          </clipPath>
          <g transform={`translate(0, ${TRACK_Y})`} clipPath={`url(#audio-slider-fill-${seed})`}>
            <path d={trackPath} fill="none" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" opacity={disabled ? 0.4 : 1} />
          </g>
        </svg>
        {/* hand-drawn thumb: fixed-aspect SVG positioned by CSS percent, so
            its circle path is never non-uniformly stretched by the track's
            preserveAspectRatio="none" scaling above. */}
        <svg
          viewBox={`${-THUMB_RADIUS - 2} ${-THUMB_RADIUS - 2} ${(THUMB_RADIUS + 2) * 2} ${(THUMB_RADIUS + 2) * 2}`}
          width={(THUMB_RADIUS + 2) * 2}
          height={(THUMB_RADIUS + 2) * 2}
          style={{
            position: 'absolute',
            left: `${filledWidthPct}%`,
            top: TRACK_Y,
            transform: 'translate(-50%, -50%)',
            overflow: 'visible',
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        >
          <path d={thumbPath} fill={ACCENT} stroke={INK} strokeWidth={1.2} opacity={disabled ? 0.5 : 1} />
        </svg>
      </div>
    </label>
  );
}

export function AudioPanel({ open, onClose }: AudioPanelProps) {
  const audio = useAudio();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const [musicPct, setMusicPct] = useState(DEFAULT_MUSIC_PCT);
  const [sfxPct, setSfxPct] = useState(DEFAULT_SFX_PCT);
  const [muted, setMuted] = useState<boolean>(() => audio.isMuted());

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.inert = !open;
  }, [open]);

  const handleMusicChange = (pct: number) => {
    setMusicPct(pct);
    audio.setMusicVolume(pct / 100);
  };

  const handleSfxChange = (pct: number) => {
    setSfxPct(pct);
    audio.setSfxVolume(pct / 100);
  };

  const handleMuteToggle = () => {
    setMuted(audio.toggleMute());
  };

  return (
    <div
      id="hud-panel-audio"
      ref={rootRef}
      role="region"
      aria-label="Audio settings"
      aria-hidden={!open}
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: `translate(-50%, ${open ? '0%' : '-110%'})`,
        transition: 'transform 0.4s cubic-bezier(.16,1,.3,1)',
        pointerEvents: open ? 'auto' : 'none',
        width: 'min(92vw, 320px)',
        background: PANEL_PAPER_BACKGROUND,
        border: `1.5px solid ${INK}`,
        clipPath: PANEL_TORN_CLIP,
        filter: PANEL_DROP_SHADOW,
        padding: '1.25rem 1.25rem 2rem',
        color: INK,
        fontFamily: '"Patrick Hand", cursive',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      {/* Header drawn as a taped-on label strip (matches MapPanel/
          AchievementsPanel): tinted band bleeding to the torn edges, dashed
          rule underneath, tiny drawn speaker glyph. */}
      <div
        style={{
          position: 'relative',
          margin: '-1.25rem -1.25rem 0',
          // Generous top padding, matching MapPanel/AchievementsPanel — see
          // MapPanel.tsx's header comment for why 0.6rem clips under the
          // frozen PANEL_TORN_CLIP zigzag.
          padding: '3rem 1.25rem 0.65rem',
          background: `${ACCENT}1c`,
          borderBottom: `1.5px dashed ${INK}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M2 5v4h2.6l3.4 2.6V2.4L4.6 5H2z" fill={ACCENT} stroke={INK} strokeWidth={1} strokeLinejoin="round" />
            <path d="M11 4.5a3.3 3.3 0 010 5" stroke={INK} strokeWidth={1.1} strokeLinecap="round" fill="none" />
          </svg>
          sound
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close audio settings"
          tabIndex={open ? 0 : -1}
          style={{ background: 'transparent', border: 'none', color: INK, fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}
        >
          &times;
        </button>
      </div>

      <AudioSlider
        label="Music"
        ariaLabel="Music volume"
        value={musicPct}
        onChange={handleMusicChange}
        disabled={!open}
        seed={101}
      />

      <AudioSlider
        label="SFX"
        ariaLabel="Sound effects volume"
        value={sfxPct}
        onChange={handleSfxChange}
        disabled={!open}
        seed={202}
      />

      <button
        type="button"
        className="world-audio-mute-btn"
        onClick={handleMuteToggle}
        disabled={!open}
        style={{
          alignSelf: 'flex-start',
          background: 'transparent',
          border: `1.5px dashed ${INK}`,
          borderRadius: 4,
          padding: '0.4rem 0.9rem',
          color: INK,
          fontFamily: 'inherit',
          fontSize: '0.95rem',
          cursor: 'pointer',
          transition: 'background 0.15s ease, transform 0.15s ease',
        }}
      >
        {muted ? 'unmute' : 'mute'}
      </button>
      <style>{`
        .world-audio-mute-btn:hover:not(:disabled) { background: ${ACCENT}1a; }
        .world-audio-mute-btn:active:not(:disabled) { transform: scale(0.96); }
      `}</style>
    </div>
  );
}
