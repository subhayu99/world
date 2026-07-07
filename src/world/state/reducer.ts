// Pure reducer for WorldState. Never import React here — keep this file
// trivially unit-testable. store.tsx wires this into useReducer + context.

import type { Dispatch } from 'react';
import type { RoomId, WorldStage, WorldState } from '../types';
import type { WorldActions } from '../contracts';

export type WorldAction =
  | { type: 'SET_STAGE'; stage: WorldStage }
  | { type: 'ENTER_ROOM'; room: RoomId }
  | { type: 'EXIT_ROOM' }
  | { type: 'TELEPORT_TO'; room: RoomId }
  | { type: 'ADVANCE_TELEPORT' };

export const initialWorldState: WorldState = {
  stage: 'loading',
  currentRoom: null,
  teleport: { phase: null, target: null },
  visited: [],
};

/**
 * Stage transition guard.
 * Valid graph: loading -> cover -> corridor -> room.
 * `room` is additionally reachable while a teleport is in-flight (teleport
 * cycles room -> room without ever visiting `corridor`).
 * Same-stage "transitions" are always allowed (no-op).
 */
export function isValidStageTransition(from: WorldStage, to: WorldStage, teleportActive: boolean): boolean {
  if (from === to) return true;
  switch (to) {
    case 'loading':
      return false;
    case 'cover':
      return from === 'loading';
    case 'corridor':
      return from === 'cover' || from === 'room';
    case 'room':
      return from === 'corridor' || teleportActive;
    default:
      return false;
  }
}

function addVisited(visited: RoomId[], room: RoomId): RoomId[] {
  return visited.includes(room) ? visited : [...visited, room];
}

export function worldReducer(state: WorldState, action: WorldAction): WorldState {
  switch (action.type) {
    case 'SET_STAGE': {
      const teleportActive = state.teleport.phase !== null;
      if (!isValidStageTransition(state.stage, action.stage, teleportActive)) return state;
      if (state.stage === action.stage) return state;
      return { ...state, stage: action.stage };
    }

    case 'ENTER_ROOM': {
      return {
        ...state,
        stage: 'room',
        currentRoom: action.room,
        visited: addVisited(state.visited, action.room),
      };
    }

    case 'EXIT_ROOM': {
      if (state.currentRoom === null && state.stage === 'corridor') return state;
      return {
        ...state,
        stage: 'corridor',
        currentRoom: null,
        teleport: { phase: null, target: null },
      };
    }

    case 'TELEPORT_TO': {
      // Teleporting works from the corridor (map/a11y nav) or from inside
      // another room — never to the room you are already in.
      if (state.stage !== 'room' && state.stage !== 'corridor') return state;
      if (action.room === state.currentRoom) return state;
      return { ...state, teleport: { phase: 'closing', target: action.room } };
    }

    case 'ADVANCE_TELEPORT': {
      const { phase, target } = state.teleport;
      if (phase === null || target === null) return state;

      if (phase === 'closing') {
        return { ...state, teleport: { phase: 'teleporting', target } };
      }

      if (phase === 'teleporting') {
        return {
          ...state,
          stage: 'room',
          currentRoom: target,
          visited: addVisited(state.visited, target),
          teleport: { phase: 'opening', target },
        };
      }

      // phase === 'opening' -> cycle complete
      return { ...state, teleport: { phase: null, target: null } };
    }

    default:
      return state;
  }
}

/** Binds the pure reducer's dispatch to the WorldActions surface leaf modules consume. */
export function bindWorldActions(dispatch: Dispatch<WorldAction>): WorldActions {
  return {
    setStage: (stage) => dispatch({ type: 'SET_STAGE', stage }),
    enterRoom: (room) => dispatch({ type: 'ENTER_ROOM', room }),
    exitRoom: () => dispatch({ type: 'EXIT_ROOM' }),
    teleportTo: (room) => dispatch({ type: 'TELEPORT_TO', room }),
    advanceTeleport: () => dispatch({ type: 'ADVANCE_TELEPORT' }),
  };
}
