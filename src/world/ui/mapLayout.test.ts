import { describe, expect, it } from 'vitest';
import type { RoomId } from '../types';
import {
  MAP_PINS,
  MAP_VIEWBOX_HEIGHT,
  MAP_VIEWBOX_WIDTH,
  getMapPin,
  getPinStatus,
  getPinsWithStatus,
} from './mapLayout';

const ALL_ROOMS: RoomId[] = ['journey', 'warehouse', 'registry', 'contact'];

describe('MAP_PINS', () => {
  it('has exactly one pin per room', () => {
    expect(MAP_PINS).toHaveLength(4);
    const rooms = MAP_PINS.map((p) => p.room).sort();
    expect(rooms).toEqual([...ALL_ROOMS].sort());
  });

  it('assigns a distinct icon per room, matching the door-sign metaphor', () => {
    const iconByRoom = Object.fromEntries(MAP_PINS.map((p) => [p.room, p.icon]));
    expect(iconByRoom.journey).toBe('trophy');
    expect(iconByRoom.warehouse).toBe('box');
    expect(iconByRoom.registry).toBe('parcel-stack');
    expect(iconByRoom.contact).toBe('envelope');
  });

  it('keeps every pin within the declared viewBox bounds', () => {
    for (const pin of MAP_PINS) {
      expect(pin.x).toBeGreaterThanOrEqual(0);
      expect(pin.x).toBeLessThanOrEqual(MAP_VIEWBOX_WIDTH);
      expect(pin.y).toBeGreaterThanOrEqual(0);
      expect(pin.y).toBeLessThanOrEqual(MAP_VIEWBOX_HEIGHT);
    }
  });

  it('alternates side left/right down the corridor spine, mirroring CORRIDOR.doorSlots', () => {
    const sides = MAP_PINS.map((p) => p.side);
    expect(sides).toEqual(['left', 'right', 'left', 'right']);
  });

  it('orders pins by increasing y (corridor depth), matching room declaration order', () => {
    for (let i = 1; i < MAP_PINS.length; i++) {
      expect(MAP_PINS[i].y).toBeGreaterThan(MAP_PINS[i - 1].y);
    }
  });
});

describe('getMapPin', () => {
  it('returns the pin for a given room', () => {
    expect(getMapPin('warehouse').room).toBe('warehouse');
    expect(getMapPin('warehouse').icon).toBe('box');
  });

  it('throws for a room with no pin (defensive: catches future MAP_PINS edits)', () => {
    // @ts-expect-error deliberately invalid RoomId to exercise the guard
    expect(() => getMapPin('nonexistent')).toThrow();
  });
});

describe('getPinStatus', () => {
  it('marks the current room as "current" even if also in visited', () => {
    expect(getPinStatus('journey', ['journey'], 'journey')).toBe('current');
  });

  it('marks a visited-but-not-current room as "visited"', () => {
    expect(getPinStatus('journey', ['journey', 'warehouse'], 'warehouse')).toBe('visited');
  });

  it('marks a never-visited room as "unvisited"', () => {
    expect(getPinStatus('contact', ['journey'], 'journey')).toBe('unvisited');
  });

  it('treats a null currentRoom (corridor / cover stage) as no current pin', () => {
    expect(getPinStatus('journey', ['journey'], null)).toBe('visited');
    expect(getPinStatus('contact', [], null)).toBe('unvisited');
  });

  it('current outranks visited even when the array also contains it', () => {
    for (const room of ALL_ROOMS) {
      expect(getPinStatus(room, [...ALL_ROOMS], room)).toBe('current');
    }
  });
});

describe('getPinsWithStatus', () => {
  it('returns all four pins annotated with status, preserving MAP_PINS order', () => {
    const result = getPinsWithStatus(['journey'], 'warehouse');
    expect(result.map((p) => p.room)).toEqual(MAP_PINS.map((p) => p.room));
    expect(result.find((p) => p.room === 'journey')?.status).toBe('visited');
    expect(result.find((p) => p.room === 'warehouse')?.status).toBe('current');
    expect(result.find((p) => p.room === 'registry')?.status).toBe('unvisited');
    expect(result.find((p) => p.room === 'contact')?.status).toBe('unvisited');
  });

  it('marks every pin unvisited when nothing has been visited and no current room', () => {
    const result = getPinsWithStatus([], null);
    expect(result.every((p) => p.status === 'unvisited')).toBe(true);
  });
});
