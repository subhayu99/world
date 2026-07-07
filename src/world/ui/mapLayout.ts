// Pure map-panel layout: pin positions along the corridor spine + status
// classification (current / visited / unvisited). No DOM, no SVG string
// building here — MapPanel.tsx owns all markup and consumes this data.

import type { RoomId } from '../types';

export type PinIcon = 'trophy' | 'box' | 'parcel-stack' | 'envelope';

export interface MapPin {
  room: RoomId;
  icon: PinIcon;
  label: string;
  /** ViewBox coordinates: 0..MAP_VIEWBOX_WIDTH wide, 0..MAP_VIEWBOX_HEIGHT tall. */
  x: number;
  y: number;
  side: 'left' | 'right';
}

export const MAP_VIEWBOX_WIDTH = 100;
export const MAP_VIEWBOX_HEIGHT = 160;

/**
 * One pin per room, ordered by corridor depth (journey nearest the cover,
 * contact deepest) and alternating left/right the same way the corridor's
 * door slots do (contracts.ts CORRIDOR.doorSlots) — the map is a stylized
 * diagram, not a to-scale reproduction of corridor z-depths.
 */
export const MAP_PINS: readonly MapPin[] = [
  { room: 'journey', icon: 'trophy', label: 'Journey', x: 32, y: 20, side: 'left' },
  { room: 'warehouse', icon: 'box', label: 'Warehouse', x: 68, y: 58, side: 'right' },
  { room: 'registry', icon: 'parcel-stack', label: 'Registry', x: 32, y: 96, side: 'left' },
  { room: 'contact', icon: 'envelope', label: 'Contact', x: 68, y: 134, side: 'right' },
] as const;

/** Looks up a single pin by room id. Throws if MAP_PINS is ever edited to
 * drop a room — a loud failure beats a silently-missing map marker. */
export function getMapPin(room: RoomId): MapPin {
  const pin = MAP_PINS.find((p) => p.room === room);
  if (!pin) throw new Error(`mapLayout: no pin defined for room "${room}"`);
  return pin;
}

export type PinStatus = 'current' | 'visited' | 'unvisited';

/**
 * Classifies a pin for rendering. The room the player currently occupies
 * ('current') outranks having merely visited it before; a room never
 * entered stays 'unvisited' (ink-only, per the sketch/painted rule — visited
 * and current pins get the accent-color fill, unvisited pins don't).
 */
export function getPinStatus(
  room: RoomId,
  visited: readonly RoomId[],
  currentRoom: RoomId | null,
): PinStatus {
  if (room === currentRoom) return 'current';
  if (visited.includes(room)) return 'visited';
  return 'unvisited';
}

/** Convenience: every pin plus its computed status, in MAP_PINS order. */
export function getPinsWithStatus(
  visited: readonly RoomId[],
  currentRoom: RoomId | null,
): (MapPin & { status: PinStatus })[] {
  return MAP_PINS.map((pin) => ({ ...pin, status: getPinStatus(pin.room, visited, currentRoom) }));
}
