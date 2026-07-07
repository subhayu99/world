import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addUnlocked,
  createAchievementsController,
  loadUnlocked,
  nextTutorialHint,
  saveUnlocked,
} from './achievements';
import { ACHIEVEMENTS } from '../contracts';
import type { AchievementId } from '../types';

function createFakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    raw: data,
  };
}

function createFakeAudio() {
  return { play: vi.fn() };
}

describe('loadUnlocked', () => {
  it('returns an empty array when nothing is stored', () => {
    expect(loadUnlocked(createFakeStorage())).toEqual([]);
  });

  it('parses a previously persisted array', () => {
    const storage = createFakeStorage();
    storage.setItem('world-achievements', JSON.stringify(['open_notebook', 'walk_corridor']));
    expect(loadUnlocked(storage)).toEqual(['open_notebook', 'walk_corridor']);
  });

  it('ignores malformed JSON and returns an empty array', () => {
    const storage = createFakeStorage();
    storage.setItem('world-achievements', '{not json');
    expect(loadUnlocked(storage)).toEqual([]);
  });

  it('filters out unknown achievement ids', () => {
    const storage = createFakeStorage();
    storage.setItem('world-achievements', JSON.stringify(['open_notebook', 'not_a_real_id', 42]));
    expect(loadUnlocked(storage)).toEqual(['open_notebook']);
  });

  it('treats a non-array payload as empty', () => {
    const storage = createFakeStorage();
    storage.setItem('world-achievements', JSON.stringify({ foo: 'bar' }));
    expect(loadUnlocked(storage)).toEqual([]);
  });
});

describe('saveUnlocked', () => {
  it('persists the array as JSON under the achievements key', () => {
    const storage = createFakeStorage();
    saveUnlocked(['open_notebook'], storage);
    expect(storage.getItem('world-achievements')).toBe(JSON.stringify(['open_notebook']));
  });

  it('swallows storage errors (private mode / quota) without throwing', () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    expect(() => saveUnlocked(['open_notebook'], storage)).not.toThrow();
  });
});

describe('addUnlocked', () => {
  it('adds a new id and reports changed: true', () => {
    const { next, changed } = addUnlocked([], 'open_notebook');
    expect(next).toEqual(['open_notebook']);
    expect(changed).toBe(true);
  });

  it('is idempotent: re-adding an existing id reports changed: false and returns the same reference', () => {
    const prev: AchievementId[] = ['open_notebook'];
    const { next, changed } = addUnlocked(prev, 'open_notebook');
    expect(changed).toBe(false);
    expect(next).toBe(prev);
  });
});

describe('nextTutorialHint', () => {
  it('returns the first ACHIEVEMENTS def not yet unlocked', () => {
    expect(nextTutorialHint([])).toEqual(ACHIEVEMENTS[0]);
    expect(nextTutorialHint(['open_notebook'])).toEqual(ACHIEVEMENTS[1]);
  });

  it('returns null once every achievement is unlocked', () => {
    const all = ACHIEVEMENTS.map((a) => a.id);
    expect(nextTutorialHint(all)).toBeNull();
  });

  it('skips unlocked ids out of order', () => {
    expect(nextTutorialHint(['fly_journey', 'open_notebook'])).toEqual(ACHIEVEMENTS[1]); // walk_corridor
  });

  it('prefers a pending hint tagged for the current room over global order', () => {
    // globally the next pending hint is inspect_exhibit (warehouse), but
    // standing in contact should surface reach_out instead.
    const unlocked = ACHIEVEMENTS.map((a) => a.id).filter((id) => id !== 'inspect_exhibit' && id !== 'reach_out');
    expect(nextTutorialHint(unlocked, 'contact')).toEqual(ACHIEVEMENTS.find((a) => a.id === 'reach_out'));
  });

  it('falls back to global order when no pending hint matches the current room', () => {
    const unlocked = ACHIEVEMENTS.map((a) => a.id).filter((id) => id !== 'inspect_exhibit');
    // nothing pending is tagged 'registry', so this falls back globally
    expect(nextTutorialHint(unlocked, 'registry')).toEqual(ACHIEVEMENTS.find((a) => a.id === 'inspect_exhibit'));
  });

  it('behaves exactly as the room-agnostic global order when no room is given', () => {
    expect(nextTutorialHint([], null)).toEqual(ACHIEVEMENTS[0]);
    expect(nextTutorialHint([])).toEqual(nextTutorialHint([], null));
  });
});

describe('createAchievementsController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with no unlocked achievements and current = the first tutorial hint', () => {
    const controller = createAchievementsController({ audio: createFakeAudio(), storage: createFakeStorage() });
    const snap = controller.getSnapshot();
    expect(snap.unlocked).toEqual([]);
    expect(snap.current).toEqual(ACHIEVEMENTS[0]);
  });

  it('hydrates unlocked from storage on creation', () => {
    const storage = createFakeStorage();
    storage.setItem('world-achievements', JSON.stringify(['open_notebook']));
    const controller = createAchievementsController({ audio: createFakeAudio(), storage });
    expect(controller.getSnapshot().unlocked).toEqual(['open_notebook']);
  });

  it('unlock() adds the id, persists it, plays chime, and shows a toast', () => {
    const storage = createFakeStorage();
    const audio = createFakeAudio();
    const controller = createAchievementsController({ audio, storage });

    controller.unlock('open_notebook');

    const snap = controller.getSnapshot();
    expect(snap.unlocked).toEqual(['open_notebook']);
    expect(snap.current).toEqual(ACHIEVEMENTS[0]); // toast = the unlocked def
    expect(audio.play).toHaveBeenCalledWith('chime');
    expect(JSON.parse(storage.getItem('world-achievements') as string)).toEqual(['open_notebook']);
  });

  it('auto-clears the toast after 3000ms, reverting current to the next tutorial hint', () => {
    const controller = createAchievementsController({ audio: createFakeAudio(), storage: createFakeStorage() });
    controller.unlock('open_notebook');
    expect(controller.getSnapshot().current).toEqual(ACHIEVEMENTS[0]);

    vi.advanceTimersByTime(3000);

    expect(controller.getSnapshot().current).toEqual(ACHIEVEMENTS[1]); // walk_corridor
  });

  it('unlock() is idempotent: a second call for the same id is a no-op', () => {
    const storage = createFakeStorage();
    const audio = createFakeAudio();
    const controller = createAchievementsController({ audio, storage });

    controller.unlock('open_notebook');
    audio.play.mockClear();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.unlock('open_notebook');

    expect(controller.getSnapshot().unlocked).toEqual(['open_notebook']);
    expect(audio.play).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies subscribers on unlock and lets them unsubscribe', () => {
    const controller = createAchievementsController({ audio: createFakeAudio(), storage: createFakeStorage() });
    const listener = vi.fn();
    const unsubscribe = controller.subscribe(listener);

    controller.unlock('open_notebook');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    controller.unlock('walk_corridor');
    expect(listener).toHaveBeenCalledTimes(1); // no further calls after unsubscribe
  });

  it('dispose() clears the pending toast timer so it never fires afterward', () => {
    const controller = createAchievementsController({ audio: createFakeAudio(), storage: createFakeStorage() });
    const listener = vi.fn();
    controller.subscribe(listener);
    controller.unlock('open_notebook');
    listener.mockClear();

    controller.dispose();
    vi.advanceTimersByTime(5000);

    expect(listener).not.toHaveBeenCalled();
  });

  it('works without a storage backend (in-memory only), never throwing', () => {
    const audio = createFakeAudio();
    const controller = createAchievementsController({ audio });
    expect(() => controller.unlock('open_notebook')).not.toThrow();
    expect(controller.getSnapshot().unlocked).toEqual(['open_notebook']);
  });

  it('setRoom() re-derives current toward that room\'s pending hint and notifies subscribers', () => {
    const storage = createFakeStorage();
    const allButLast = ACHIEVEMENTS.map((a) => a.id).filter((id) => id !== 'reach_out' && id !== 'inspect_exhibit');
    storage.setItem('world-achievements', JSON.stringify(allButLast));
    const controller = createAchievementsController({ audio: createFakeAudio(), storage });
    // global order surfaces inspect_exhibit (warehouse) first
    expect(controller.getSnapshot().current?.id).toBe('inspect_exhibit');

    const listener = vi.fn();
    controller.subscribe(listener);
    controller.setRoom('contact');

    expect(controller.getSnapshot().current?.id).toBe('reach_out');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setRoom() is a no-op (no notify) when the room has not changed', () => {
    const controller = createAchievementsController({ audio: createFakeAudio(), storage: createFakeStorage() });
    controller.setRoom('journey');
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.setRoom('journey');

    expect(listener).not.toHaveBeenCalled();
  });
});
