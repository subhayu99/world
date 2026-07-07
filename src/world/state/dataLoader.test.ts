import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWorldData, validateWorldData } from './dataLoader';

function jsonResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

function minimalValidWorldData() {
  return {
    meta: { name: 'Subhayu', tagline: 'Data & Infrastructure Engineer', generatedAt: '2026-07-06' },
    rooms: [
      { id: 'journey', label: 'JOURNEY', hint: 'a' },
      { id: 'warehouse', label: 'WAREHOUSE', hint: 'b' },
      { id: 'registry', label: 'REGISTRY', hint: 'c' },
      { id: 'contact', label: 'CONTACT', hint: 'd' },
    ],
    journey: { beats: [{ id: 'college', date: '2018', title: 'x', body: 'y', kind: 'education' }], awards: [] },
    warehouse: { exhibits: [] },
    registry: { headline: 'h', parcels: [] },
    contact: { links: [], form: { endpoint: '', accessKey: '', mailto: '' } },
    easterEggs: [],
  };
}

describe('validateWorldData', () => {
  it('accepts well-formed data', () => {
    expect(() => validateWorldData(minimalValidWorldData())).not.toThrow();
  });

  it('rejects non-object input', () => {
    expect(() => validateWorldData(null)).toThrow(/object/i);
    expect(() => validateWorldData('nope')).toThrow();
  });

  it('rejects when rooms is missing or not length 4', () => {
    const data = minimalValidWorldData();
    expect(() => validateWorldData({ ...data, rooms: data.rooms.slice(0, 3) })).toThrow(/4 rooms/i);
    expect(() => validateWorldData({ ...data, rooms: undefined })).toThrow(/4 rooms/i);
  });

  it('rejects when journey.beats is missing or empty', () => {
    const data = minimalValidWorldData();
    expect(() => validateWorldData({ ...data, journey: { beats: [], awards: [] } })).toThrow(/beats/i);
    expect(() => validateWorldData({ ...data, journey: undefined })).toThrow(/beats/i);
  });
});

describe('loadWorldData', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches from BASE_URL + WORLD_DATA_URL and resolves with valid data', async () => {
    const fetchMock = vi.fn(async (url: string) => jsonResponse(minimalValidWorldData(), true, 200));
    vi.stubGlobal('fetch', fetchMock);

    const data = await loadWorldData();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/data\/world\.json$/);
    expect(data.rooms).toHaveLength(4);
  });

  it('throws a descriptive error on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({}, false, 404)));
    await expect(loadWorldData()).rejects.toThrow(/404/);
  });

  it('throws a descriptive error when fetch itself rejects (network failure)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(loadWorldData()).rejects.toThrow(/network down/);
  });

  it('throws a descriptive error when the response body is not valid JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token');
        },
      })),
    );
    await expect(loadWorldData()).rejects.toThrow(/json/i);
  });

  it('throws a descriptive error when the payload fails structural validation', async () => {
    const bad = minimalValidWorldData();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ...bad, rooms: [] })));
    await expect(loadWorldData()).rejects.toThrow(/4 rooms/i);
  });
});
