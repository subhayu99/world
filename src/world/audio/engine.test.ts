// Tests for the synthesized audio engine. Uses a minimal fake AudioContext —
// happy-dom has no real Web Audio API, and we don't want one: this module must
// stay pure/testable without a real audio backend. See contracts.ts AudioEngine.
//
// localStorage note: this sandbox's Node runtime (22+) preregisters a global
// `localStorage` that throws without a `--localstorage-file` flag, and it
// shadows happy-dom's implementation. We stub a real in-memory Storage over
// it per test so engine.ts's persistence code (which just calls the ambient
// `localStorage`) exercises real get/set/clear semantics.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SoundName } from '../types';
import { createAudioEngine } from './engine';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

type ParamCall = {
  method:
    | 'setValueAtTime'
    | 'linearRampToValueAtTime'
    | 'exponentialRampToValueAtTime'
    | 'setTargetAtTime'
    | 'cancelScheduledValues';
  value: number;
  time: number;
};

type FakeConnectable = FakeAudioNode | FakeAudioParam;

class FakeAudioParam {
  value: number;
  calls: ParamCall[] = [];

  constructor(initial = 0) {
    this.value = initial;
  }

  setValueAtTime(value: number, time: number): FakeAudioParam {
    this.value = value;
    this.calls.push({ method: 'setValueAtTime', value, time });
    return this;
  }

  linearRampToValueAtTime(value: number, time: number): FakeAudioParam {
    this.value = value;
    this.calls.push({ method: 'linearRampToValueAtTime', value, time });
    return this;
  }

  exponentialRampToValueAtTime(value: number, time: number): FakeAudioParam {
    this.value = value;
    this.calls.push({ method: 'exponentialRampToValueAtTime', value, time });
    return this;
  }

  setTargetAtTime(value: number, time: number, _timeConstant: number): FakeAudioParam {
    this.value = value;
    this.calls.push({ method: 'setTargetAtTime', value, time });
    return this;
  }

  cancelScheduledValues(time: number): FakeAudioParam {
    this.calls.push({ method: 'cancelScheduledValues', value: this.value, time });
    return this;
  }
}

class FakeAudioNode {
  connections: FakeConnectable[] = [];
  disconnected = false;

  connect(destination: FakeConnectable): FakeConnectable {
    this.connections.push(destination);
    return destination;
  }

  disconnect(): void {
    this.disconnected = true;
    this.connections = [];
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam(1);
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type = 'lowpass';
  frequency = new FakeAudioParam(350);
  Q = new FakeAudioParam(1);
}

class FakeOscillatorNode extends FakeAudioNode {
  type = 'sine';
  frequency = new FakeAudioParam(440);
  detune = new FakeAudioParam(0);
  started = false;
  startTime = 0;
  // Every .stop(time) call is recorded — a builder scheduling its own
  // natural-decay stop is a real, legitimate call distinct from a later
  // explicit teardown, so "was stop() ever called" isn't precise enough.
  stopCalls: number[] = [];
  get stopped(): boolean {
    return this.stopCalls.length > 0;
  }

  start(time = 0): void {
    this.started = true;
    this.startTime = time;
  }

  stop(time = 0): void {
    this.stopCalls.push(time);
  }
}

class FakeAudioBuffer {
  private readonly channels: Float32Array[];

  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  started = false;
  startTime = 0;
  stopCalls: number[] = [];
  get stopped(): boolean {
    return this.stopCalls.length > 0;
  }

  start(time = 0): void {
    this.started = true;
    this.startTime = time;
  }

  stop(time = 0): void {
    this.stopCalls.push(time);
  }
}

class FakeDelayNode extends FakeAudioNode {
  delayTime = new FakeAudioParam(0);
}

class FakeAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = new FakeAudioNode();
  gains: FakeGainNode[] = [];
  oscillators: FakeOscillatorNode[] = [];
  filters: FakeBiquadFilterNode[] = [];
  bufferSources: FakeBufferSourceNode[] = [];
  delays: FakeDelayNode[] = [];
  resumeCalls = 0;

  createGain(): FakeGainNode {
    const node = new FakeGainNode();
    this.gains.push(node);
    return node;
  }

  createOscillator(): FakeOscillatorNode {
    const node = new FakeOscillatorNode();
    this.oscillators.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode();
    this.filters.push(node);
    return node;
  }

  createBufferSource(): FakeBufferSourceNode {
    const node = new FakeBufferSourceNode();
    this.bufferSources.push(node);
    return node;
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeAudioBuffer {
    return new FakeAudioBuffer(numberOfChannels, length, sampleRate);
  }

  createDelay(_maxDelay = 1): FakeDelayNode {
    const node = new FakeDelayNode();
    this.delays.push(node);
    return node;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.state = 'running';
    return Promise.resolve();
  }
}

// The engine's public factory type is `() => AudioContext` (the real DOM lib
// type). The fake only implements the subset of the surface our synth code
// actually calls; this cast is the one sanctioned seam between the two.
function toAudioContext(fake: FakeAudioContext): AudioContext {
  return fake as unknown as AudioContext;
}

const ALL_SOUNDS: SoundName[] = [
  'pencil',
  'tear',
  'pageFlip',
  'doorCreak',
  'thud',
  'pop',
  'chime',
  'ambience',
];

const MUTE_KEY = 'world-audio-muted';
const VOLUME_KEY = 'world-audio-volumes';

describe('createAudioEngine', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('never touches AudioContext before unlock()', () => {
    const fake = new FakeAudioContext();
    const factory = vi.fn(() => toAudioContext(fake));
    const engine = createAudioEngine(factory);

    engine.play('pop');
    expect(factory).not.toHaveBeenCalled();
    expect(fake.gains).toHaveLength(0);
    expect(fake.oscillators).toHaveLength(0);
  });

  it('creates the context and master gain chain on unlock(), only once', () => {
    const fake = new FakeAudioContext();
    const factory = vi.fn(() => toAudioContext(fake));
    const engine = createAudioEngine(factory);

    engine.unlock();
    expect(factory).toHaveBeenCalledTimes(1);
    expect(fake.gains).toHaveLength(2); // musicGain, sfxGain
    expect(fake.gains[0].connections).toContain(fake.destination);
    expect(fake.gains[1].connections).toContain(fake.destination);
    expect(fake.gains[0].gain.value).toBeCloseTo(0.3); // default music volume
    expect(fake.gains[1].gain.value).toBeCloseTo(0.5); // default sfx volume

    engine.unlock();
    expect(factory).toHaveBeenCalledTimes(1); // idempotent
  });

  it('resumes a suspended context on unlock()', () => {
    const fake = new FakeAudioContext();
    fake.state = 'suspended';
    const engine = createAudioEngine(() => toAudioContext(fake));

    engine.unlock();
    expect(fake.resumeCalls).toBe(1);
  });

  it('builds a node graph on play() after unlock and lets stop() tear it down', () => {
    const fake = new FakeAudioContext();
    const engine = createAudioEngine(() => toAudioContext(fake));
    engine.unlock();

    engine.play('thud');
    expect(fake.oscillators).toHaveLength(1);
    const osc = fake.oscillators[0];
    expect(osc.started).toBe(true);
    // thud schedules its own natural-decay stop as part of construction.
    expect(osc.stopCalls).toHaveLength(1);

    engine.stop('thud');
    // engine.stop() reaches the handle and forces an additional, immediate
    // stop on top of the sound's own scheduled decay.
    expect(osc.stopCalls).toHaveLength(2);
  });

  it('replaces an existing node graph when the same sound is played again (loop replacement)', () => {
    const fake = new FakeAudioContext();
    const engine = createAudioEngine(() => toAudioContext(fake));
    engine.unlock();

    engine.play('pencil', { loop: true });
    expect(fake.bufferSources.length).toBeGreaterThan(0);
    const firstVoiceSources = [...fake.bufferSources];
    firstVoiceSources.forEach((s) => expect(s.stopped).toBe(false));

    engine.play('pencil', { loop: true });
    firstVoiceSources.forEach((s) => expect(s.stopped).toBe(true));

    const newSources = fake.bufferSources.slice(firstVoiceSources.length);
    expect(newSources.length).toBeGreaterThan(0);
    newSources.forEach((s) => expect(s.stopped).toBe(false));
  });

  it('clamps setMusicVolume and setSfxVolume to the 0..1 range', () => {
    const fake = new FakeAudioContext();
    const engine = createAudioEngine(() => toAudioContext(fake));
    engine.unlock();
    const [musicGain, sfxGain] = fake.gains;

    engine.setMusicVolume(-5);
    expect(musicGain.gain.value).toBe(0);
    engine.setMusicVolume(5);
    expect(musicGain.gain.value).toBe(1);

    engine.setSfxVolume(-1);
    expect(sfxGain.gain.value).toBe(0);
    engine.setSfxVolume(2);
    expect(sfxGain.gain.value).toBe(1);
  });

  it('persists volumes to localStorage, clamped', () => {
    const fake = new FakeAudioContext();
    const engine = createAudioEngine(() => toAudioContext(fake));
    engine.unlock();

    engine.setMusicVolume(0.7);
    engine.setSfxVolume(1.4);

    const stored = JSON.parse(localStorage.getItem(VOLUME_KEY) ?? '{}') as {
      music: number;
      sfx: number;
    };
    expect(stored.music).toBeCloseTo(0.7);
    expect(stored.sfx).toBe(1);
  });

  it('mute silences the master buses and new plays stay silent until unmuted', () => {
    const fake = new FakeAudioContext();
    const engine = createAudioEngine(() => toAudioContext(fake));
    engine.unlock();
    const [musicGain, sfxGain] = fake.gains;

    expect(engine.isMuted()).toBe(false);
    const muted = engine.toggleMute();
    expect(muted).toBe(true);
    expect(engine.isMuted()).toBe(true);
    expect(musicGain.gain.value).toBe(0);
    expect(sfxGain.gain.value).toBe(0);
    expect(localStorage.getItem(MUTE_KEY)).toBe('true');

    // Playing after mute must not revive the shared bus gain.
    engine.play('pop');
    expect(sfxGain.gain.value).toBe(0);

    const unmuted = engine.toggleMute();
    expect(unmuted).toBe(false);
    expect(sfxGain.gain.value).toBeCloseTo(0.5);
  });

  it('restores muted + volume state from localStorage on construction', () => {
    localStorage.setItem(MUTE_KEY, 'true');
    localStorage.setItem(VOLUME_KEY, JSON.stringify({ music: 0.9, sfx: 0.1 }));

    const fake = new FakeAudioContext();
    const engine = createAudioEngine(() => toAudioContext(fake));
    expect(engine.isMuted()).toBe(true);

    engine.unlock();
    const [musicGain, sfxGain] = fake.gains;
    // Muted at construction time, so the buses come up silent even though
    // stored volumes are nonzero.
    expect(musicGain.gain.value).toBe(0);
    expect(sfxGain.gain.value).toBe(0);
  });

  it('builds the chime as a two-tone sine (440 -> 659.25 at +0.15s) with the documented gain envelope', () => {
    const fake = new FakeAudioContext();
    fake.currentTime = 10; // nonzero, to prove scheduling is relative to currentTime
    const engine = createAudioEngine(() => toAudioContext(fake));
    engine.unlock();

    engine.play('chime');
    expect(fake.oscillators).toHaveLength(1);
    const osc = fake.oscillators[0];
    expect(osc.type).toBe('sine');

    const freqCalls = osc.frequency.calls;
    expect(freqCalls[0]).toMatchObject({ value: 440, time: 10 });
    const secondNote = freqCalls.find((c) => c.value === 659.25);
    expect(secondNote).toBeDefined();
    expect(secondNote?.time).toBeCloseTo(10.15);

    // Gain: ramps up towards ~0.3, then exponential decay to ~0.001 by +0.5s.
    expect(fake.gains.length).toBeGreaterThanOrEqual(3); // music + sfx + voice
    const voiceGain = fake.gains[fake.gains.length - 1];
    const peak = voiceGain.gain.calls.find((c) => Math.abs(c.value - 0.3) < 1e-6);
    expect(peak).toBeDefined();
    const decay = voiceGain.gain.calls.find((c) => c.method === 'exponentialRampToValueAtTime');
    expect(decay).toBeDefined();
    expect(decay?.value).toBeCloseTo(0.001);
    expect(decay?.time).toBeCloseTo(10.5);
  });

  it('builds every SoundName without throwing and each can be stopped', () => {
    const fake = new FakeAudioContext();
    const engine = createAudioEngine(() => toAudioContext(fake));
    engine.unlock();

    for (const name of ALL_SOUNDS) {
      expect(() => engine.play(name)).not.toThrow();
      expect(() => engine.stop(name)).not.toThrow();
    }
  });

  it('ambience and pencil default to looping node graphs', () => {
    const fake = new FakeAudioContext();
    const engine = createAudioEngine(() => toAudioContext(fake));
    engine.unlock();

    engine.play('ambience');
    expect(fake.bufferSources.some((s) => s.loop)).toBe(true);
  });
});
