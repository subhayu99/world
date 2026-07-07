import { describe, expect, it, vi } from 'vitest';
import {
  KONAMI_SEQUENCE,
  createKonamiMatcher,
  matchesKonami,
  normalizeKonamiKey,
  pushKonamiKey,
} from './useKonami';

const FULL_SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
];

/** Builds a buffer the way the real keydown listener would: push each key
 * from a list of synthetic KeyboardEvents, one at a time. */
function bufferFromEvents(keys: string[]): string[] {
  let buffer: string[] = [];
  for (const key of keys) {
    const event = new KeyboardEvent('keydown', { key });
    buffer = pushKonamiKey(buffer, event.key);
  }
  return buffer;
}

describe('KONAMI_SEQUENCE', () => {
  it('is the classic 10-key cheat code', () => {
    expect(KONAMI_SEQUENCE).toEqual(FULL_SEQUENCE);
  });
});

describe('normalizeKonamiKey', () => {
  it('lowercases single-character keys (b/a) but leaves named keys untouched', () => {
    expect(normalizeKonamiKey('B')).toBe('b');
    expect(normalizeKonamiKey('A')).toBe('a');
    expect(normalizeKonamiKey('ArrowUp')).toBe('ArrowUp');
    expect(normalizeKonamiKey('ArrowDown')).toBe('ArrowDown');
  });
});

describe('pushKonamiKey', () => {
  it('appends a normalized key to the buffer', () => {
    expect(pushKonamiKey([], 'B')).toEqual(['b']);
    expect(pushKonamiKey(['ArrowUp'], 'ArrowDown')).toEqual(['ArrowUp', 'ArrowDown']);
  });

  it('caps the buffer length at the sequence length (drops oldest first)', () => {
    let buf: string[] = [];
    for (let i = 0; i < KONAMI_SEQUENCE.length + 3; i++) {
      buf = pushKonamiKey(buf, 'x');
    }
    expect(buf).toHaveLength(KONAMI_SEQUENCE.length);
  });
});

describe('matchesKonami', () => {
  it('is false for an empty or too-short buffer', () => {
    expect(matchesKonami([])).toBe(false);
    expect(matchesKonami(['ArrowUp', 'ArrowUp'])).toBe(false);
  });

  it('is true once the buffer (built from synthetic KeyboardEvents) matches the full sequence', () => {
    const buffer = bufferFromEvents(FULL_SEQUENCE);
    expect(matchesKonami(buffer)).toBe(true);
  });

  it('is false when the same keys arrive in the wrong order', () => {
    const wrong = ['ArrowDown', 'ArrowUp', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    expect(matchesKonami(bufferFromEvents(wrong))).toBe(false);
  });

  it('recovers after noise: unrelated keys before the real sequence do not block a later match', () => {
    const noisy = ['q', 'w', 'z', ...FULL_SEQUENCE];
    expect(matchesKonami(bufferFromEvents(noisy))).toBe(true);
  });

  it('is case-insensitive for the trailing b/a letters', () => {
    const upper = [...FULL_SEQUENCE.slice(0, 8), 'B', 'A'];
    expect(matchesKonami(bufferFromEvents(upper))).toBe(true);
  });

  it('only matches on the trailing window, ignoring an earlier partial attempt', () => {
    const almostThenReal = ['ArrowUp', 'ArrowUp', 'ArrowDown', ...FULL_SEQUENCE];
    expect(matchesKonami(bufferFromEvents(almostThenReal))).toBe(true);
  });
});

describe('createKonamiMatcher', () => {
  it('calls onComplete exactly once when the sequence completes', () => {
    const onComplete = vi.fn();
    const matcher = createKonamiMatcher(onComplete);
    for (const key of FULL_SEQUENCE) matcher.handleKey(key);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not fire on an incomplete sequence', () => {
    const onComplete = vi.fn();
    const matcher = createKonamiMatcher(onComplete);
    for (const key of FULL_SEQUENCE.slice(0, 4)) matcher.handleKey(key);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('resets its internal buffer after completing, so the tail alone does not immediately re-fire', () => {
    const onComplete = vi.fn();
    const matcher = createKonamiMatcher(onComplete);
    for (const key of FULL_SEQUENCE) matcher.handleKey(key);
    expect(onComplete).toHaveBeenCalledTimes(1);

    matcher.handleKey('a');
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('can complete the sequence again after a previous completion', () => {
    const onComplete = vi.fn();
    const matcher = createKonamiMatcher(onComplete);
    for (const key of FULL_SEQUENCE) matcher.handleKey(key);
    for (const key of FULL_SEQUENCE) matcher.handleKey(key);
    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('reset() clears the buffer so a partial match is discarded', () => {
    const onComplete = vi.fn();
    const matcher = createKonamiMatcher(onComplete);
    for (const key of FULL_SEQUENCE.slice(0, 7)) matcher.handleKey(key);
    matcher.reset();
    for (const key of FULL_SEQUENCE.slice(7)) matcher.handleKey(key);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
