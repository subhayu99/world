// Achievements provider: unlock tracking, localStorage persistence, toast
// timing, and the "current tutorial hint" the quest banner reads.
//
// The render-less logic (persistence, idempotence, toast lifecycle) lives in
// createAchievementsController() below and is fully unit-testable without
// touching React. AchievementsProvider is a thin useSyncExternalStore wrapper
// around it, per the "keep the provider thin" rule.

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { ACHIEVEMENTS, ACHIEVEMENTS_STORAGE_KEY } from '../contracts';
import type { AchievementsApi, AudioEngine } from '../contracts';
import type { AchievementDef, AchievementId, RoomId } from '../types';
import { AchievementsCtx } from './hooks';

const TOAST_DURATION_MS = 3000;

/** Which room each achievement's tutorial hint applies to, kept local to
 * this controller rather than on the shared AchievementDef contract (only
 * this hint-selection logic needs it). Achievements with no entry here
 * (open_notebook, walk_corridor) aren't tied to a specific room — they
 * apply during the entrance/corridor stages instead. */
const HINT_ROOM: Partial<Record<AchievementId, RoomId>> = {
  fly_journey: 'journey',
  inspect_exhibit: 'warehouse',
  open_parcel: 'registry',
  reach_out: 'contact',
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
type AudioLike = Pick<AudioEngine, 'play'>;

/** Reads and validates the persisted unlocked-id array; never throws. */
export function loadUnlocked(storage: StorageLike): AchievementId[] {
  try {
    const raw = storage.getItem(ACHIEVEMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const knownIds = new Set<string>(ACHIEVEMENTS.map((def) => def.id));
    return parsed.filter((id): id is AchievementId => typeof id === 'string' && knownIds.has(id));
  } catch {
    return [];
  }
}

/** Persists the unlocked-id array; swallows storage failures (private mode, quota). */
export function saveUnlocked(unlocked: AchievementId[], storage: StorageLike): void {
  try {
    storage.setItem(ACHIEVEMENTS_STORAGE_KEY, JSON.stringify(unlocked));
  } catch {
    // in-memory state still works even if persistence is unavailable
  }
}

/** The quest-banner content: prefers the first not-yet-unlocked achievement
 * whose hint applies to `currentRoom` (e.g. don't show "Open a project
 * card" while standing in Contact), falling back to the first not-yet-
 * unlocked achievement in global order when no room-specific hint remains
 * (or no room is given). Returns null once everything is unlocked. */
export function nextTutorialHint(unlocked: AchievementId[], currentRoom?: RoomId | null): AchievementDef | null {
  if (currentRoom) {
    const roomMatch = ACHIEVEMENTS.find((def) => !unlocked.includes(def.id) && HINT_ROOM[def.id] === currentRoom);
    if (roomMatch) return roomMatch;
  }
  return ACHIEVEMENTS.find((def) => !unlocked.includes(def.id)) ?? null;
}

/** Idempotent add: returns the same array reference (changed: false) if id is already present. */
export function addUnlocked(
  unlocked: AchievementId[],
  id: AchievementId,
): { next: AchievementId[]; changed: boolean } {
  if (unlocked.includes(id)) return { next: unlocked, changed: false };
  return { next: [...unlocked, id], changed: true };
}

export interface AchievementsSnapshot {
  unlocked: AchievementId[];
  current: AchievementDef | null;
}

export interface AchievementsControllerDeps {
  audio: AudioLike;
  storage?: StorageLike;
  toastDurationMs?: number;
}

export interface AchievementsController {
  getSnapshot(): AchievementsSnapshot;
  subscribe(listener: () => void): () => void;
  unlock(id: AchievementId): void;
  /** Updates which room's hint is preferred by nextTutorialHint (see
   * HINT_ROOM); pass null outside a room (entrance/corridor). No-ops (and
   * skips the refresh/notify) if the room hasn't actually changed. */
  setRoom(room: RoomId | null): void;
  dispose(): void;
}

/** Render-less controller: all the logic, none of the React. */
export function createAchievementsController(deps: AchievementsControllerDeps): AchievementsController {
  const { audio, storage } = deps;
  const duration = deps.toastDurationMs ?? TOAST_DURATION_MS;

  let unlocked: AchievementId[] = storage ? loadUnlocked(storage) : [];
  let toast: AchievementDef | null = null;
  let room: RoomId | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let snapshot: AchievementsSnapshot = { unlocked, current: nextTutorialHint(unlocked, room) };
  const listeners = new Set<() => void>();

  function refresh(): void {
    snapshot = { unlocked, current: toast ?? nextTutorialHint(unlocked, room) };
  }

  function emit(): void {
    listeners.forEach((listener) => listener());
  }

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  return {
    getSnapshot: () => snapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    unlock(id) {
      const { next, changed } = addUnlocked(unlocked, id);
      if (!changed) return;

      unlocked = next;
      if (storage) saveUnlocked(unlocked, storage);

      toast = ACHIEVEMENTS.find((def) => def.id === id) ?? null;
      audio.play('chime');

      clearTimer();
      timer = setTimeout(() => {
        toast = null;
        timer = null;
        refresh();
        emit();
      }, duration);

      refresh();
      emit();
    },

    setRoom(next) {
      if (room === next) return;
      room = next;
      refresh();
      emit();
    },

    dispose() {
      clearTimer();
      listeners.clear();
    },
  };
}

export interface AchievementsProviderProps {
  audio: AudioLike;
  /** Current room id (null outside a room), threaded into nextTutorialHint
   * so the toast doesn't show another room's hint (e.g. "Open a project
   * card" while standing in Contact). */
  currentRoom?: RoomId | null;
  children: ReactNode;
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    // localStorage can throw in locked-down environments (private mode, etc.)
    return undefined;
  }
}

/** Thin React wiring around createAchievementsController — no logic lives here. */
export function AchievementsProvider({ audio, currentRoom = null, children }: AchievementsProviderProps): JSX.Element {
  const controller = useMemo(() => createAchievementsController({ audio, storage: browserStorage() }), [audio]);

  useEffect(() => () => controller.dispose(), [controller]);
  useEffect(() => controller.setRoom(currentRoom), [controller, currentRoom]);

  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  const value = useMemo<AchievementsApi>(
    () => ({ unlock: controller.unlock, unlocked: snapshot.unlocked, current: snapshot.current }),
    [controller, snapshot],
  );

  return <AchievementsCtx.Provider value={value}>{children}</AchievementsCtx.Provider>;
}
