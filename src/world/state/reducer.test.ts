import { describe, expect, it } from 'vitest';
import {
  bindWorldActions,
  initialWorldState,
  isValidStageTransition,
  worldReducer,
  type WorldAction,
} from './reducer';
import type { WorldState } from '../types';

describe('initialWorldState', () => {
  it('starts loading, no room, no teleport, empty visited', () => {
    expect(initialWorldState).toEqual({
      stage: 'loading',
      currentRoom: null,
      teleport: { phase: null, target: null },
      visited: [],
    });
  });
});

describe('isValidStageTransition', () => {
  it('allows the canonical loading -> cover -> corridor -> room chain', () => {
    expect(isValidStageTransition('loading', 'cover', false)).toBe(true);
    expect(isValidStageTransition('cover', 'corridor', false)).toBe(true);
    expect(isValidStageTransition('corridor', 'room', false)).toBe(true);
  });

  it('allows room while a teleport is active regardless of prior stage', () => {
    expect(isValidStageTransition('corridor', 'room', true)).toBe(true);
    // even a stage that would normally be invalid becomes valid mid-teleport
    expect(isValidStageTransition('cover', 'room', true)).toBe(true);
  });

  it('rejects room from corridor-less, teleport-less states', () => {
    expect(isValidStageTransition('loading', 'room', false)).toBe(false);
    expect(isValidStageTransition('cover', 'room', false)).toBe(false);
  });

  it('rejects skipping ahead (loading -> corridor, loading -> room)', () => {
    expect(isValidStageTransition('loading', 'corridor', false)).toBe(false);
    expect(isValidStageTransition('loading', 'room', false)).toBe(false);
  });

  it('rejects ever returning to loading', () => {
    expect(isValidStageTransition('cover', 'loading', false)).toBe(false);
    expect(isValidStageTransition('room', 'loading', true)).toBe(false);
  });

  it('allows room -> corridor (exiting a room back into the corridor)', () => {
    expect(isValidStageTransition('room', 'corridor', false)).toBe(true);
  });

  it('treats same-stage as a no-op-valid transition', () => {
    expect(isValidStageTransition('corridor', 'corridor', false)).toBe(true);
    expect(isValidStageTransition('room', 'room', false)).toBe(true);
  });
});

describe('worldReducer: SET_STAGE', () => {
  it('advances through the canonical chain', () => {
    let state = initialWorldState;
    state = worldReducer(state, { type: 'SET_STAGE', stage: 'cover' });
    expect(state.stage).toBe('cover');
    state = worldReducer(state, { type: 'SET_STAGE', stage: 'corridor' });
    expect(state.stage).toBe('corridor');
    state = worldReducer(state, { type: 'SET_STAGE', stage: 'room' });
    expect(state.stage).toBe('room');
  });

  it('rejects an invalid jump and returns the same state reference', () => {
    const state = initialWorldState; // stage: loading
    const next = worldReducer(state, { type: 'SET_STAGE', stage: 'room' });
    expect(next).toBe(state);
    expect(next.stage).toBe('loading');
  });

  it('rejects loading -> corridor (skipping cover)', () => {
    const next = worldReducer(initialWorldState, { type: 'SET_STAGE', stage: 'corridor' });
    expect(next.stage).toBe('loading');
  });

  it('allows setStage("room") while mid-teleport even if bookkeeping stage is not corridor', () => {
    const midTeleport: WorldState = {
      stage: 'room',
      currentRoom: 'journey',
      teleport: { phase: 'teleporting', target: 'warehouse' },
      visited: ['journey'],
    };
    // stage is already 'room' so this is a no-op, but exercised via the reducer
    // path (not just the pure guard) to prove SET_STAGE handles it without
    // rejecting.
    const next = worldReducer(midTeleport, { type: 'SET_STAGE', stage: 'room' });
    expect(next).toBe(midTeleport);
  });
});

describe('worldReducer: ENTER_ROOM', () => {
  it('sets currentRoom, flips stage to room, and records visited', () => {
    const corridor: WorldState = { ...initialWorldState, stage: 'corridor' };
    const next = worldReducer(corridor, { type: 'ENTER_ROOM', room: 'journey' });
    expect(next.stage).toBe('room');
    expect(next.currentRoom).toBe('journey');
    expect(next.visited).toEqual(['journey']);
  });

  it('does not duplicate an already-visited room', () => {
    const state: WorldState = { ...initialWorldState, stage: 'corridor', visited: ['journey'] };
    const next = worldReducer(state, { type: 'ENTER_ROOM', room: 'journey' });
    expect(next.visited).toEqual(['journey']);
  });

  it('appends distinct rooms in visitation order', () => {
    let state: WorldState = { ...initialWorldState, stage: 'corridor' };
    state = worldReducer(state, { type: 'ENTER_ROOM', room: 'journey' });
    state = worldReducer({ ...state, stage: 'corridor' }, { type: 'ENTER_ROOM', room: 'warehouse' });
    expect(state.visited).toEqual(['journey', 'warehouse']);
  });
});

describe('worldReducer: EXIT_ROOM', () => {
  it('clears currentRoom, returns stage to corridor, but keeps visited', () => {
    const inRoom: WorldState = {
      stage: 'room',
      currentRoom: 'journey',
      teleport: { phase: null, target: null },
      visited: ['journey'],
    };
    const next = worldReducer(inRoom, { type: 'EXIT_ROOM' });
    expect(next.currentRoom).toBeNull();
    expect(next.stage).toBe('corridor');
    expect(next.visited).toEqual(['journey']);
  });

  it('clears any dangling teleport state on exit', () => {
    const inRoom: WorldState = {
      stage: 'room',
      currentRoom: 'journey',
      teleport: { phase: 'opening', target: 'warehouse' },
      visited: ['journey'],
    };
    const next = worldReducer(inRoom, { type: 'EXIT_ROOM' });
    expect(next.teleport).toEqual({ phase: null, target: null });
  });

  it('is a same-reference no-op if already in the corridor with no room', () => {
    const state: WorldState = { ...initialWorldState, stage: 'corridor' };
    const next = worldReducer(state, { type: 'EXIT_ROOM' });
    expect(next).toBe(state);
  });
});

describe('worldReducer: teleport cycle', () => {
  const inJourney: WorldState = {
    stage: 'room',
    currentRoom: 'journey',
    teleport: { phase: null, target: null },
    visited: ['journey'],
  };

  it('runs the full closing -> teleporting -> opening -> null cycle', () => {
    let state = worldReducer(inJourney, { type: 'TELEPORT_TO', room: 'warehouse' });
    expect(state.teleport).toEqual({ phase: 'closing', target: 'warehouse' });
    // room switch has not happened yet
    expect(state.currentRoom).toBe('journey');

    state = worldReducer(state, { type: 'ADVANCE_TELEPORT' });
    expect(state.teleport.phase).toBe('teleporting');
    expect(state.currentRoom).toBe('journey'); // still mid-flight

    state = worldReducer(state, { type: 'ADVANCE_TELEPORT' });
    expect(state.teleport.phase).toBe('opening');
    expect(state.currentRoom).toBe('warehouse'); // arrived
    expect(state.visited).toEqual(['journey', 'warehouse']);

    state = worldReducer(state, { type: 'ADVANCE_TELEPORT' });
    expect(state.teleport).toEqual({ phase: null, target: null });
    expect(state.currentRoom).toBe('warehouse');
  });

  it('does not duplicate visited when teleporting to an already-visited room', () => {
    const state: WorldState = {
      stage: 'room',
      currentRoom: 'journey',
      teleport: { phase: 'teleporting', target: 'journey' },
      visited: ['journey', 'warehouse'],
    };
    const next = worldReducer(state, { type: 'ADVANCE_TELEPORT' });
    expect(next.visited).toEqual(['journey', 'warehouse']);
  });

  it('allows TELEPORT_TO from the corridor (map / a11y nav)', () => {
    const corridor: WorldState = { ...initialWorldState, stage: 'corridor' };
    const next = worldReducer(corridor, { type: 'TELEPORT_TO', room: 'warehouse' });
    expect(next.teleport).toEqual({ phase: 'closing', target: 'warehouse' });
  });

  it('ignores TELEPORT_TO from pre-corridor stages', () => {
    const cover: WorldState = { ...initialWorldState, stage: 'cover' };
    const next = worldReducer(cover, { type: 'TELEPORT_TO', room: 'warehouse' });
    expect(next).toBe(cover);
  });

  it('ignores TELEPORT_TO targeting the current room', () => {
    const next = worldReducer(inJourney, { type: 'TELEPORT_TO', room: 'journey' });
    expect(next).toBe(inJourney);
  });

  it('ignores ADVANCE_TELEPORT when no teleport is in-flight', () => {
    const next = worldReducer(inJourney, { type: 'ADVANCE_TELEPORT' });
    expect(next).toBe(inJourney);
  });
});

describe('bindWorldActions', () => {
  it('dispatches the matching action for each WorldActions method', () => {
    const dispatched: WorldAction[] = [];
    const dispatch = (action: WorldAction) => {
      dispatched.push(action);
    };
    const actions = bindWorldActions(dispatch);

    actions.setStage('cover');
    actions.enterRoom('registry');
    actions.exitRoom();
    actions.teleportTo('contact');
    actions.advanceTeleport();

    expect(dispatched).toEqual([
      { type: 'SET_STAGE', stage: 'cover' },
      { type: 'ENTER_ROOM', room: 'registry' },
      { type: 'EXIT_ROOM' },
      { type: 'TELEPORT_TO', room: 'contact' },
      { type: 'ADVANCE_TELEPORT' },
    ]);
  });
});
