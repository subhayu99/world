// Pure-logic tests for corridor layout math. No THREE/R3F/canvas here by
// design (rule: never instantiate WebGL/canvas contexts in tests) — these
// exercise segment visibility, door placement, door->room assignment, and
// easter-egg texture id mapping only.

import { describe, expect, it } from 'vitest';
import { CORRIDOR } from '../contracts';
import type { EasterEgg, RoomCopy } from '../types';
import {
  CORRIDOR_HEIGHT,
  CORRIDOR_WIDTH,
  DOOR_ROOM_ORDER,
  DOORS_SEGMENT_INDEX,
  doorSide,
  doorWorldZ,
  eggTextureId,
  findEgg,
  repeatingZ,
  roomForDoorSlot,
  segmentCenterZ,
  segmentIndexAt,
  visibleSegments,
} from './segments';

describe('segmentIndexAt / visibleSegments', () => {
  it('matches the itomdev-derived floor((10 - z) / segmentLength) formula', () => {
    expect(segmentIndexAt(10, 80)).toBe(0);
    expect(segmentIndexAt(28, 80)).toBe(-1); // initial camera z from CANVAS_DEFAULTS
    expect(segmentIndexAt(-70, 80)).toBe(1);
  });

  it('floors toward negative infinity at segment boundaries', () => {
    expect(segmentIndexAt(-69.999, 80)).toBe(0);
    expect(segmentIndexAt(-70, 80)).toBe(1);
  });

  it('returns [i-1, i, i+1] centered on the current segment', () => {
    expect(visibleSegments(10, 80)).toEqual([-1, 0, 1]);
    expect(visibleSegments(28, 80)).toEqual([-2, -1, 0]);
    expect(visibleSegments(-70, 80)).toEqual([0, 1, 2]);
  });

  it('recycles seamlessly across a full segment length of walking', () => {
    // Walking exactly one segmentLength forward should shift the visible
    // window by exactly one segment index.
    const a = visibleSegments(10, CORRIDOR.segmentLength);
    const b = visibleSegments(10 - CORRIDOR.segmentLength, CORRIDOR.segmentLength);
    expect(b).toEqual(a.map((i) => i + 1));
  });
});

describe('segmentCenterZ', () => {
  it('centers each segment span for use with full-length floor/wall planes', () => {
    expect(segmentCenterZ(0, 80)).toBe(-30);
    expect(segmentCenterZ(1, 80)).toBe(-110);
    expect(segmentCenterZ(-1, 80)).toBe(50);
  });
});

describe('CORRIDOR_WIDTH / CORRIDOR_HEIGHT', () => {
  it('are the shared cross-section Corridor.tsx and Door.tsx both build against', () => {
    expect(CORRIDOR_WIDTH).toBe(6);
    expect(CORRIDOR_HEIGHT).toBe(3.6);
  });
});

describe('repeatingZ', () => {
  it('returns the local offset unshifted at segment 0', () => {
    expect(repeatingZ(0, -8, 80)).toBe(-8);
  });

  it('shifts the pattern back by one segmentLength per segment index', () => {
    expect(repeatingZ(1, -8, 80)).toBe(-88);
    expect(repeatingZ(2, -8, 80)).toBe(-168);
    expect(repeatingZ(-1, -8, 80)).toBe(72);
  });

  it('is the general form doorWorldZ specializes for door slots', () => {
    CORRIDOR.doorSlots.forEach((slot, i) => {
      expect(doorWorldZ(2, i, CORRIDOR)).toBe(repeatingZ(2, slot.z, CORRIDOR.segmentLength));
    });
  });
});

describe('doorWorldZ', () => {
  it('places segment-0 doors exactly at their configured slot z', () => {
    CORRIDOR.doorSlots.forEach((slot, i) => {
      expect(doorWorldZ(0, i, CORRIDOR)).toBe(slot.z);
    });
  });

  it('shifts the whole slot pattern back by one segmentLength per segment', () => {
    expect(doorWorldZ(1, 0, CORRIDOR)).toBe(CORRIDOR.doorSlots[0].z - CORRIDOR.segmentLength);
    expect(doorWorldZ(2, 0, CORRIDOR)).toBe(CORRIDOR.doorSlots[0].z - 2 * CORRIDOR.segmentLength);
    expect(doorWorldZ(-1, 0, CORRIDOR)).toBe(CORRIDOR.doorSlots[0].z + CORRIDOR.segmentLength);
  });

  it('throws for an out-of-range slot index', () => {
    expect(() => doorWorldZ(0, 4, CORRIDOR)).toThrow(RangeError);
    expect(() => doorWorldZ(0, -1, CORRIDOR)).toThrow(RangeError);
  });
});

describe('doorSide', () => {
  it('alternates left/right per the configured door slots', () => {
    expect(doorSide(0, CORRIDOR)).toBe('left');
    expect(doorSide(1, CORRIDOR)).toBe('right');
    expect(doorSide(2, CORRIDOR)).toBe('left');
    expect(doorSide(3, CORRIDOR)).toBe('right');
  });

  it('throws for an out-of-range slot index', () => {
    expect(() => doorSide(9, CORRIDOR)).toThrow(RangeError);
  });
});

describe('door -> room assignment (segment 0 only)', () => {
  const rooms: RoomCopy[] = [
    { id: 'contact', label: 'CONTACT', hint: 'Find a way to reach me' },
    { id: 'journey', label: 'JOURNEY', hint: 'Scroll to fly through the journey' },
    { id: 'registry', label: 'REGISTRY', hint: 'Pick up a package' },
    { id: 'warehouse', label: 'WAREHOUSE', hint: 'Click a card to inspect the work' },
  ];

  it('exposes the frozen journey/warehouse/registry/contact slot order', () => {
    expect(DOOR_ROOM_ORDER).toEqual(['journey', 'warehouse', 'registry', 'contact']);
  });

  it('is the only segment that carries real doors', () => {
    expect(DOORS_SEGMENT_INDEX).toBe(0);
  });

  it('looks rooms up by id, independent of their order in world data', () => {
    expect(roomForDoorSlot(rooms, 0)?.id).toBe('journey');
    expect(roomForDoorSlot(rooms, 1)?.id).toBe('warehouse');
    expect(roomForDoorSlot(rooms, 2)?.id).toBe('registry');
    expect(roomForDoorSlot(rooms, 3)?.id).toBe('contact');
  });

  it('returns undefined for an out-of-range slot or missing room data', () => {
    expect(roomForDoorSlot(rooms, 4)).toBeUndefined();
    expect(roomForDoorSlot([], 0)).toBeUndefined();
  });
});

describe('eggTextureId', () => {
  it('maps each egg data id to its short texture id', () => {
    expect(eggTextureId('rubberDuck')).toBe('duck');
    expect(eggTextureId('quantumCat')).toBe('cat');
    expect(eggTextureId('serverRack')).toBe('rack');
    expect(eggTextureId('speedometer')).toBe('speedo');
  });
});

describe('findEgg', () => {
  const eggs: EasterEgg[] = [
    { id: 'serverRack', lines: ['rack line'] },
    { id: 'speedometer', lines: ['speedo line'] },
    { id: 'quantumCat', lines: ['cat line 1', 'cat line 2'], link: 'https://doi.org/10.1049/qtc2.12058' },
    { id: 'rubberDuck', lines: ['quack.'] },
  ];

  it('finds an egg by its data id', () => {
    expect(findEgg(eggs, 'quantumCat')?.lines[0]).toBe('cat line 1');
    expect(findEgg(eggs, 'rubberDuck')?.lines[0]).toBe('quack.');
  });

  it('returns undefined when not present', () => {
    expect(findEgg([], 'rubberDuck')).toBeUndefined();
  });
});
