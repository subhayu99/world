// Synthesized audio engine (contracts.ts AudioEngine). Zero audio files —
// every SoundName is procedurally assembled in synth.ts. Lazy: the
// AudioContext (and the master gain chain) is only created on unlock(),
// which callers invoke from the first user gesture (the cover click), since
// browsers block audio before that anyway.
import type { AudioEngine } from '../contracts';
import type { SoundName } from '../types';
import { buildSound, type SoundHandle } from './synth';

const MUTE_KEY = 'world-audio-muted';
const VOLUME_KEY = 'world-audio-volumes';

/** Real recorded assets (extracted from the reference site's HAR at the
 * owner's direction — see client/public/sounds/README.md for provenance;
 * the music is Pixabay-licensed). Loaded lazily after unlock(); any sound
 * without a loaded sample falls back to its synth builder, so tests and
 * failed fetches never break playback. */
const SAMPLE_FILES: Partial<Record<SoundName, string>> = {
  ambience: 'sounds/music.ogg',
  pageFlip: 'sounds/page.mp3',
  pop: 'sounds/pop.mp3',
  doorCreak: 'sounds/door-ajar.mp3',
  thud: 'sounds/door-close.mp3',
};

const DEFAULT_MUSIC_VOLUME = 0.3;
const DEFAULT_SFX_VOLUME = 0.5;

interface StoredVolumes {
  music: number;
  sfx: number;
}

function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, String(muted));
  } catch {
    // storage unavailable (private mode, SSR) — mute state just won't persist
  }
}

function readVolumes(): StoredVolumes {
  const fallback: StoredVolumes = { music: DEFAULT_MUSIC_VOLUME, sfx: DEFAULT_SFX_VOLUME };
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredVolumes>;
    return {
      music: clamp01(typeof parsed.music === 'number' ? parsed.music : fallback.music),
      sfx: clamp01(typeof parsed.sfx === 'number' ? parsed.sfx : fallback.sfx),
    };
  } catch {
    return fallback;
  }
}

function writeVolumes(volumes: StoredVolumes): void {
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
  } catch {
    // storage unavailable — ignore
  }
}

function defaultCtxFactory(): AudioContext {
  return new AudioContext();
}

export function createAudioEngine(ctxFactory: () => AudioContext = defaultCtxFactory): AudioEngine {
  let ctx: AudioContext | null = null;
  let musicGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let muted = readMuted();
  const volumes = readVolumes();
  const active = new Map<SoundName, SoundHandle>();
  const samples = new Map<SoundName, AudioBuffer>();
  let samplesRequested = false;

  function playSample(name: SoundName, opts?: { loop?: boolean; volume?: number }): boolean {
    const buffer = samples.get(name);
    if (!ctx || !musicGain || !sfxGain || !buffer) return false;
    const bus = name === 'ambience' ? musicGain : sfxGain;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = opts?.loop ?? name === 'ambience';
    const gain = ctx.createGain();
    gain.gain.value = clamp01(opts?.volume ?? 1);
    src.connect(gain);
    gain.connect(bus);
    src.start();
    active.set(name, {
      stop() {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        gain.disconnect();
      },
    });
    return true;
  }

  function loadSamples(liveCtx: AudioContext): void {
    if (samplesRequested || typeof fetch !== 'function') return;
    samplesRequested = true;
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    for (const [name, file] of Object.entries(SAMPLE_FILES) as [SoundName, string][]) {
      void fetch(`${base}${file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((buf) => liveCtx.decodeAudioData(buf))
        .then((decoded) => {
          samples.set(name, decoded);
          // the music bed may already be running on the synth fallback —
          // swap it for the real track once decoded
          if (name === 'ambience' && active.has('ambience')) {
            active.get('ambience')?.stop();
            active.delete('ambience');
            playSample('ambience', { loop: true, volume: 1 });
          }
        })
        .catch(() => undefined); // synth fallback keeps working
    }
  }

  function ensureCtx(): { ctx: AudioContext; musicGain: GainNode; sfxGain: GainNode } {
    if (!ctx || !musicGain || !sfxGain) {
      ctx = ctxFactory();
      musicGain = ctx.createGain();
      sfxGain = ctx.createGain();
      musicGain.gain.value = muted ? 0 : volumes.music;
      sfxGain.gain.value = muted ? 0 : volumes.sfx;
      musicGain.connect(ctx.destination);
      sfxGain.connect(ctx.destination);
    }
    return { ctx, musicGain, sfxGain };
  }

  function busFor(name: SoundName, music: GainNode, sfx: GainNode): GainNode {
    return name === 'ambience' ? music : sfx;
  }

  return {
    unlock() {
      const { ctx: liveCtx } = ensureCtx();
      if (liveCtx.state === 'suspended') {
        void liveCtx.resume();
      }
      try {
        loadSamples(liveCtx);
      } catch {
        // sample loading must never block the synth engine
      }
    },

    play(name, opts) {
      // No context until unlock() has run — never create audio ahead of a
      // user gesture.
      if (!ctx || !musicGain || !sfxGain) return;
      const bus = busFor(name, musicGain, sfxGain);

      const existing = active.get(name);
      if (existing) {
        existing.stop();
        active.delete(name);
      }

      // recorded sample first; synth builder as the always-working fallback
      if (playSample(name, opts)) return;

      const volume = opts?.volume === undefined ? undefined : clamp01(opts.volume);
      const handle = buildSound(name, ctx, bus, { loop: opts?.loop, volume });
      active.set(name, handle);
    },

    stop(name) {
      const existing = active.get(name);
      if (existing) {
        existing.stop();
        active.delete(name);
      }
    },

    setMusicVolume(v) {
      volumes.music = clamp01(v);
      writeVolumes(volumes);
      if (musicGain && !muted) musicGain.gain.value = volumes.music;
    },

    setSfxVolume(v) {
      volumes.sfx = clamp01(v);
      writeVolumes(volumes);
      if (sfxGain && !muted) sfxGain.gain.value = volumes.sfx;
    },

    toggleMute() {
      muted = !muted;
      writeMuted(muted);
      if (musicGain) musicGain.gain.value = muted ? 0 : volumes.music;
      if (sfxGain) sfxGain.gain.value = muted ? 0 : volumes.sfx;
      return muted;
    },

    isMuted() {
      return muted;
    },
  };
}
