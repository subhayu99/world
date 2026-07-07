// Konami-code easter egg detector. The matcher logic (normalizeKonamiKey /
// pushKonamiKey / matchesKonami / createKonamiMatcher) is pure and fully
// unit-tested with synthetic KeyboardEvents — useKonami() is a thin
// useEffect wrapper that feeds real window keydown events into it. Guarded:
// importing this module never touches window (only the hook's effect does,
// and only once mounted in a browser).

import { useEffect, useRef } from 'react';

export const KONAMI_SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'b', 'a',
] as const;

/** KeyboardEvent.key for letter keys carries the Shift-state case ('B' vs
 * 'b'); the Konami code doesn't care, so fold single-character keys to
 * lowercase. Named keys (ArrowUp, etc.) pass through unchanged. */
export function normalizeKonamiKey(key: string): string {
  return key.length === 1 ? key.toLowerCase() : key;
}

/** Pushes a normalized key onto the rolling buffer, capped at the sequence
 * length (oldest entries drop off the front) so the buffer never grows
 * unbounded across a long, keyboard-heavy session. */
export function pushKonamiKey(buffer: readonly string[], key: string): string[] {
  const next = [...buffer, normalizeKonamiKey(key)];
  const max = KONAMI_SEQUENCE.length;
  return next.length > max ? next.slice(next.length - max) : next;
}

/** True once the buffer's trailing window equals the full Konami sequence.
 * Tolerant of noise before the real sequence — no need to get every key
 * perfectly right on the first try, only the last 10 matter. */
export function matchesKonami(buffer: readonly string[]): boolean {
  if (buffer.length < KONAMI_SEQUENCE.length) return false;
  const tail = buffer.slice(buffer.length - KONAMI_SEQUENCE.length);
  return tail.every((key, i) => key === KONAMI_SEQUENCE[i]);
}

export interface KonamiMatcher {
  /** Feed one key (raw KeyboardEvent.key); fires onComplete + resets when the sequence completes. */
  handleKey: (key: string) => void;
  /** Clears the buffer without firing onComplete. */
  reset: () => void;
}

/** Stateful convenience wrapper around the pure buffer/match functions
 * above — still no DOM access, so it stays trivially testable. */
export function createKonamiMatcher(onComplete: () => void): KonamiMatcher {
  let buffer: string[] = [];
  return {
    handleKey(key) {
      buffer = pushKonamiKey(buffer, key);
      if (matchesKonami(buffer)) {
        buffer = [];
        onComplete();
      }
    },
    reset() {
      buffer = [];
    },
  };
}

/** Mounts a window keydown listener that watches for the Konami code and
 * invokes onUnlock() once per completed sequence. `onUnlock` may change
 * identity across renders; the effect always calls the latest one. */
export function useKonami(onUnlock: () => void): void {
  const onUnlockRef = useRef(onUnlock);
  onUnlockRef.current = onUnlock;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const matcher = createKonamiMatcher(() => onUnlockRef.current());
    const handleKeydown = (event: KeyboardEvent) => {
      matcher.handleKey(event.key);
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, []);
}
