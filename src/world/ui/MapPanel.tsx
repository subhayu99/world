// Hand-drawn site map: a corridor spine with four room vignettes (trophy =
// journey, box = warehouse, parcel-stack = registry, envelope = contact).
// Pin geometry + visited/current classification comes from mapLayout.ts
// (pure, unit-tested); this file owns only the SVG markup.

import { useEffect, useRef } from 'react';
import { BLUEPRINT } from '../blueprint/palette';
import { useWorldStore } from '../state/hooks';
import { MAP_VIEWBOX_HEIGHT, MAP_VIEWBOX_WIDTH, getPinsWithStatus } from './mapLayout';
import type { PinIcon, PinStatus } from './mapLayout';
import { PANEL_DROP_SHADOW, PANEL_PAPER_BACKGROUND, PANEL_TORN_CLIP, PAPER_COLORS, ROUGHEN_FILTER_ID } from './progress';

export interface MapPanelProps {
  open: boolean;
  onClose: () => void;
}

// Pencil & pastel palette (BLUEPRINT, blueprint/palette.ts — the single
// source of truth). PAPER keeps progress.ts's PAPER_COLORS.paper value
// rather than BLUEPRINT.paper: this 2D panel is a sheet laid over the 3D
// paper world and reads better a hair cooler/lighter than the 3D ground.
const INK = BLUEPRINT.ink;
const PAPER = PAPER_COLORS.paper;
const ACCENT_VISITED = BLUEPRINT.accentCool; // pastel blue — "already been here"
const ACCENT_CURRENT = BLUEPRINT.accent; // pastel coral — "active room"
// "You are here" pushpin — a distinct marker layered on top of the current
// room's icon, separate from the visited/current fill logic below
// (punch-list #13's literal ask: "a pushpin/marker (red) showing the
// visitor's current location"). Amber so it pops against the coral
// current-room fill instead of blending into it.
const ACCENT_HERE_PIN = BLUEPRINT.accentWarm;

function pinIconPath(icon: PinIcon): React.ReactNode {
  switch (icon) {
    case 'trophy':
      return (
        <>
          <path d="M-6 -8h12v6a6 6 0 01-12 0v-6z" />
          <path d="M-6 -6h-3v3a3 3 0 003 3 M6 -6h3v3a3 3 0 01-3 3" />
          <path d="M0 4v4 M-4 10h8" />
        </>
      );
    case 'box':
      return (
        <>
          <path d="M-8 -4l8-4 8 4-8 4-8-4z" />
          <path d="M-8 -4v8l8 4 8-4v-8" />
          <path d="M0 0v8" />
        </>
      );
    case 'parcel-stack':
      return (
        <>
          <rect x={-7} y={2} width={14} height={6} />
          <rect x={-5} y={-4} width={10} height={6} />
          <rect x={-3} y={-9} width={6} height={5} />
        </>
      );
    case 'envelope':
      return (
        <>
          <rect x={-9} y={-6} width={18} height={12} />
          <path d="M-9 -6l9 7 9-7" />
        </>
      );
    default:
      return null;
  }
}

function fillFor(status: PinStatus): string {
  if (status === 'current') return ACCENT_CURRENT;
  if (status === 'visited') return ACCENT_VISITED;
  return 'none';
}

/** Small hand-drawn "here" flag: a teardrop pin + dot, distinct from the
 * room's own icon glyph so the current-location marker reads unambiguously
 * as a landmark rather than just a recolored icon. */
function PushpinMarker() {
  return (
    <g transform="translate(0, -20)" aria-hidden="true">
      <path
        d="M0 13 L-4.5 2.5 A4.5 4.5 0 1 1 4.5 2.5 Z"
        fill={ACCENT_HERE_PIN}
        stroke={INK}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <circle cx={0} cy={0} r={1.5} fill={INK} />
    </g>
  );
}

export function MapPanel({ open, onClose }: MapPanelProps) {
  const { visited, currentRoom, teleportTo } = useWorldStore();
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Keep the collapsed panel out of the tab order / a11y tree, in addition
  // to it being visually off-screen. `inert` isn't in the stable @types/react
  // JSX typings yet (only experimental.d.ts) even though it's a real DOM
  // property (lib.dom.d.ts has HTMLElement.inert) — set it imperatively.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    el.inert = !open;
  }, [open]);

  const pins = getPinsWithStatus(visited, currentRoom);

  const handlePinClick = (room: (typeof pins)[number]['room']) => {
    teleportTo(room);
    onClose();
  };

  return (
    <div
      id="hud-panel-map"
      ref={rootRef}
      role="region"
      aria-label="Site map"
      aria-hidden={!open}
      style={{
        position: 'absolute',
        top: 0,
        left: '50%',
        transform: `translate(-50%, ${open ? '0%' : '-110%'})`,
        transition: 'transform 0.4s cubic-bezier(.16,1,.3,1)',
        pointerEvents: open ? 'auto' : 'none',
        width: 'min(92vw, 360px)',
        background: PANEL_PAPER_BACKGROUND,
        border: `1.5px solid ${INK}`,
        clipPath: PANEL_TORN_CLIP,
        filter: PANEL_DROP_SHADOW,
        padding: '1.25rem 1.25rem 2rem',
        color: INK,
        fontFamily: '"Patrick Hand", cursive',
      }}
    >
      {/* Header drawn as a taped-on label strip: a tinted band bleeding to
          the panel's torn edges (negative margin = padding) with a dashed
          ink rule underneath, plus a tiny drawn pushpin glyph — reads as a
          sticker labelling the sheet rather than a plain toolbar row.
          Padding-top is deliberately generous (not the usual ~0.6rem): the
          frozen PANEL_TORN_CLIP zigzags up to ~10% of the panel's own
          height at the top edge, so the bled band's *content* needs real
          clearance below that or the label text gets torn-clipped along
          with the paper (reproduced live at the original 0.6rem — the
          pre-pastel screenshots at world-judge/16-map.png show the same cut
          text, so this was a pre-existing bug, not introduced here). */}
      <div
        style={{
          position: 'relative',
          margin: '-1.25rem -1.25rem 0.9rem',
          padding: '3rem 1.25rem 0.65rem',
          background: `${ACCENT_VISITED}1c`,
          borderBottom: `1.5px dashed ${INK}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <p style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true" style={{ flexShrink: 0 }}>
            <circle cx={7} cy={6} r={4.5} fill={ACCENT_VISITED} stroke={INK} strokeWidth={1.1} />
            <line x1={7} y1={10.2} x2={7} y2={15} stroke={INK} strokeWidth={1.1} strokeLinecap="round" />
          </svg>
          the notebook, mapped
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close map"
          tabIndex={open ? 0 : -1}
          style={{ background: 'transparent', border: 'none', color: INK, fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 }}
        >
          &times;
        </button>
      </div>
      <svg
        viewBox={`0 0 ${MAP_VIEWBOX_WIDTH} ${MAP_VIEWBOX_HEIGHT}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        role="img"
        aria-label="Map of the four rooms along the corridor"
      >
        {/* corridor spine: a soft accent underlay pass plus a thicker ink
            line on top (punch-list #13: "bolder illustration ... thicker
            corridor spine"), both hand-jittered rather than ruler-straight */}
        <path
          d={`M 50 0 L 47 30 L 52 60 L 48 90 L 51 120 L 49 ${MAP_VIEWBOX_HEIGHT}`}
          fill="none"
          stroke={ACCENT_VISITED}
          strokeOpacity={0.25}
          strokeWidth={5.5}
          strokeLinecap="round"
        />
        <path
          d={`M 50 0 L 47 30 L 52 60 L 48 90 L 51 120 L 49 ${MAP_VIEWBOX_HEIGHT}`}
          fill="none"
          stroke={INK}
          strokeWidth={2.4}
          strokeLinecap="round"
        />

        {pins.map((pin) => (
          <g key={pin.room} transform={`translate(${pin.x}, ${pin.y})`}>
            {/* room vignette: a soft landmark halo behind every pin, tinted
                by status, so the map reads as illustrated terrain rather
                than a bare icon list */}
            <ellipse
              cx={0}
              cy={2}
              rx={17}
              ry={15}
              fill={pin.status === 'unvisited' ? INK : fillFor(pin.status)}
              fillOpacity={pin.status === 'unvisited' ? 0.05 : 0.16}
              stroke="none"
            />
            <line x1={pin.side === 'left' ? 10 : -10} y1={0} x2={0} y2={0} stroke={INK} strokeWidth={1} />
            {/* Small hand-placed "photo" card behind each room's icon — a
                sticker/thumbnail frame rather than a bare glyph, tilted
                opposite the pin's side for a scrapbook feel. Purely
                decorative (pointerEvents: none) — the real hit target stays
                the transparent rect inside the onClick group below. */}
            <rect
              x={-12.5}
              y={-12.5}
              width={25}
              height={21}
              rx={2.5}
              transform={`rotate(${pin.side === 'left' ? -4 : 4} 0 -2)`}
              fill={PAPER}
              stroke={INK}
              strokeWidth={1}
              strokeOpacity={pin.status === 'unvisited' ? 0.45 : 0.85}
              style={{ pointerEvents: 'none' }}
            />
            <g
              onClick={() => handlePinClick(pin.room)}
              style={{ cursor: 'pointer' }}
              stroke={INK}
              strokeWidth={1.3}
              fill={fillFor(pin.status)}
              fillOpacity={pin.status === 'unvisited' ? 0 : 0.85}
              role="button"
              tabIndex={open ? 0 : -1}
              aria-label={`Teleport to ${pin.label}${pin.status === 'current' ? ' (you are here)' : ''}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handlePinClick(pin.room);
                }
              }}
            >
              {/* SVG hit-test only counts painted areas; fill is transparent
                  here, so without this rect only the 1.3px strokes would be
                  clickable. Covers icon + label. */}
              <rect x={-14} y={-14} width={28} height={40} fill="transparent" stroke="none" style={{ pointerEvents: 'all' }} />
              <g style={{ filter: `url(#${ROUGHEN_FILTER_ID})` }}>{pinIconPath(pin.icon)}</g>
            </g>
            {pin.status === 'current' && <PushpinMarker />}
            <text
              x={0}
              y={20}
              textAnchor="middle"
              fontSize={7}
              fill={INK}
              style={{ fontFamily: '"Patrick Hand", cursive', pointerEvents: 'none' }}
            >
              {pin.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
