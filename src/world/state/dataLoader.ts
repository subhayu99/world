// Loads and structurally validates world.json (generated from world.yaml +
// resume.json). Mirrors the fetch pattern used by client/src/lib/pypiStats.ts
// and client/src/config/api.config.ts.

import { WORLD_DATA_URL } from '../contracts';
import type { WorldData } from '../types';

function baseUrl(): string {
  return import.meta.env.BASE_URL || '/';
}

/** Structurally validates an unknown payload against the shape leaf modules rely on. */
export function validateWorldData(data: unknown): asserts data is WorldData {
  if (data === null || typeof data !== 'object') {
    throw new Error('World data must be an object');
  }

  const candidate = data as Partial<WorldData>;

  if (!Array.isArray(candidate.rooms) || candidate.rooms.length !== 4) {
    const got = Array.isArray(candidate.rooms) ? candidate.rooms.length : typeof candidate.rooms;
    throw new Error(`World data must have exactly 4 rooms, got ${got}`);
  }

  if (
    candidate.journey === undefined ||
    candidate.journey === null ||
    !Array.isArray(candidate.journey.beats) ||
    candidate.journey.beats.length === 0
  ) {
    throw new Error('World data journey.beats must be a non-empty array');
  }
}

/**
 * Fetches world.json relative to BASE_URL, parses it, and structurally
 * validates it before handing it back. Throws a descriptive Error on any
 * failure (network, HTTP status, malformed JSON, or failed validation) —
 * callers can surface the message directly.
 */
export async function loadWorldData(): Promise<WorldData> {
  const url = `${baseUrl()}${WORLD_DATA_URL}`;

  let response: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    response = await fetch(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to fetch world data from ${url}: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch world data from ${url}: HTTP ${response.status}`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`World data at ${url} is not valid JSON: ${message}`);
  }

  validateWorldData(data);
  return data;
}
