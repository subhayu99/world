// Procedural sound builders — one function per SoundName. No audio files;
// every sound is assembled from oscillators, filtered noise and gain/filter
// automation scheduled against the AudioContext clock (ctx.currentTime).
// engine.ts owns lifecycle (unlock, mute, volumes, buses); this file only
// knows how to wire up a single voice's node graph and hand back a handle
// that can stop it.
import type { SoundName } from '../types';

export interface SoundHandle {
  stop(): void;
}

export interface SoundOpts {
  loop?: boolean;
  volume?: number; // 0..1, per-voice multiplier on top of the bus gain
}

type Builder = (ctx: AudioContext, destination: GainNode, opts: SoundOpts) => SoundHandle;

function safeStop(node: { stop(when?: number): void }): void {
  try {
    node.stop();
  } catch {
    // already stopped / never started — ignore
  }
}

function createNoiseBuffer(ctx: AudioContext, seconds: number, mode: 'white' | 'brown' = 'white'): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  if (mode === 'brown') {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  } else {
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  return buffer;
}

function createNoiseSource(ctx: AudioContext, buffer: AudioBuffer, loop: boolean): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = loop;
  return src;
}

// pencil — looped filtered noise bursts (bandpass ~1.8kHz) with a slow
// random-ish amplitude jitter, driven by a second, heavily lowpassed noise
// source used purely as a wandering LFO into the voice gain.
const buildPencil: Builder = (ctx, destination, opts) => {
  const loop = opts.loop ?? true;
  const t0 = ctx.currentTime;
  const baseVolume = (opts.volume ?? 1) * 0.4;

  const voice = ctx.createGain();
  voice.gain.value = baseVolume;
  voice.connect(destination);

  const noiseBuffer = createNoiseBuffer(ctx, 2, 'white');
  const noiseSrc = createNoiseSource(ctx, noiseBuffer, loop);
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1800;
  bandpass.Q.value = 4;
  noiseSrc.connect(bandpass);
  bandpass.connect(voice);

  const jitterBuffer = createNoiseBuffer(ctx, 4, 'white');
  const jitterSrc = createNoiseSource(ctx, jitterBuffer, loop);
  const jitterFilter = ctx.createBiquadFilter();
  jitterFilter.type = 'lowpass';
  jitterFilter.frequency.value = 6;
  const jitterDepth = ctx.createGain();
  jitterDepth.gain.value = baseVolume * 0.6;
  jitterSrc.connect(jitterFilter);
  jitterFilter.connect(jitterDepth);
  jitterDepth.connect(voice.gain);

  noiseSrc.start(t0);
  jitterSrc.start(t0);

  return {
    stop() {
      safeStop(noiseSrc);
      safeStop(jitterSrc);
      voice.disconnect();
    },
  };
};

// tear — 0.4s noise sweep, highpass filter sweeping down, plus a handful of
// short overlaid crackle pops.
const buildTear: Builder = (ctx, destination, opts) => {
  const duration = 0.4;
  const t0 = ctx.currentTime;
  const vol = opts.volume ?? 0.6;

  const voice = ctx.createGain();
  voice.gain.setValueAtTime(vol, t0);
  voice.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  voice.connect(destination);

  const buffer = createNoiseBuffer(ctx, duration, 'white');
  const src = createNoiseSource(ctx, buffer, false);
  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.setValueAtTime(8000, t0);
  highpass.frequency.exponentialRampToValueAtTime(400, t0 + duration);
  src.connect(highpass);
  highpass.connect(voice);
  src.start(t0);
  src.stop(t0 + duration);

  const crackles: AudioBufferSourceNode[] = [];
  const crackleCount = 5;
  for (let i = 0; i < crackleCount; i++) {
    const offset = Math.random() * (duration - 0.02);
    const crackleBuffer = createNoiseBuffer(ctx, 0.015, 'white');
    const crackleSrc = createNoiseSource(ctx, crackleBuffer, false);
    const crackleGain = ctx.createGain();
    crackleGain.gain.setValueAtTime(vol * 0.6, t0 + offset);
    crackleGain.gain.exponentialRampToValueAtTime(0.001, t0 + offset + 0.015);
    crackleSrc.connect(crackleGain);
    crackleGain.connect(destination);
    crackleSrc.start(t0 + offset);
    crackleSrc.stop(t0 + offset + 0.02);
    crackles.push(crackleSrc);
  }

  return {
    stop() {
      safeStop(src);
      crackles.forEach(safeStop);
      voice.disconnect();
    },
  };
};

// pageFlip — 0.15s bandpassed noise whoosh, frequency sweeping up.
const buildPageFlip: Builder = (ctx, destination, opts) => {
  const duration = 0.15;
  const t0 = ctx.currentTime;
  const vol = opts.volume ?? 0.5;

  const voice = ctx.createGain();
  voice.gain.setValueAtTime(0.0001, t0);
  voice.gain.linearRampToValueAtTime(vol, t0 + 0.03);
  voice.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  voice.connect(destination);

  const buffer = createNoiseBuffer(ctx, duration, 'white');
  const src = createNoiseSource(ctx, buffer, false);
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.Q.value = 0.8;
  bandpass.frequency.setValueAtTime(900, t0);
  bandpass.frequency.exponentialRampToValueAtTime(2800, t0 + duration);
  src.connect(bandpass);
  bandpass.connect(voice);
  src.start(t0);
  src.stop(t0 + duration);

  return {
    stop() {
      safeStop(src);
      voice.disconnect();
    },
  };
};

// doorCreak — slow sawtooth pitch bend 200 -> 260Hz over 0.3s with tremolo,
// quiet.
const buildDoorCreak: Builder = (ctx, destination, opts) => {
  const duration = 0.3;
  const t0 = ctx.currentTime;
  const vol = (opts.volume ?? 1) * 0.18;

  const voice = ctx.createGain();
  voice.gain.setValueAtTime(vol, t0);
  voice.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  voice.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, t0);
  osc.frequency.linearRampToValueAtTime(260, t0 + duration);

  const tremolo = ctx.createGain();
  tremolo.gain.value = 1;
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 18;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.5;
  lfo.connect(lfoDepth);
  lfoDepth.connect(tremolo.gain);

  osc.connect(tremolo);
  tremolo.connect(voice);

  osc.start(t0);
  osc.stop(t0 + duration);
  lfo.start(t0);
  lfo.stop(t0 + duration);

  return {
    stop() {
      safeStop(osc);
      safeStop(lfo);
      voice.disconnect();
    },
  };
};

// thud — 80Hz sine, fast exponential decay.
const buildThud: Builder = (ctx, destination, opts) => {
  const t0 = ctx.currentTime;
  const vol = opts.volume ?? 0.8;

  const voice = ctx.createGain();
  voice.gain.setValueAtTime(vol, t0);
  voice.gain.exponentialRampToValueAtTime(0.001, t0 + 0.18);
  voice.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = 80;
  osc.connect(voice);
  osc.start(t0);
  osc.stop(t0 + 0.2);

  return {
    stop() {
      safeStop(osc);
      voice.disconnect();
    },
  };
};

// pop — 400 -> 900Hz sine blip, 0.08s.
const buildPop: Builder = (ctx, destination, opts) => {
  const duration = 0.08;
  const t0 = ctx.currentTime;
  const vol = opts.volume ?? 0.6;

  const voice = ctx.createGain();
  voice.gain.setValueAtTime(vol, t0);
  voice.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  voice.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(400, t0);
  osc.frequency.exponentialRampToValueAtTime(900, t0 + duration);
  osc.connect(voice);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);

  return {
    stop() {
      safeStop(osc);
      voice.disconnect();
    },
  };
};

// chime — achievement two-tone: sine steps 440 -> 659.25Hz (perfect fifth) at
// +0.15s; gain ramps 0 -> 0.3, then exponential decay to 0.001 by +0.5s
// (research §8).
const CHIME = { first: 440, second: 659.25, secondAt: 0.15, decayBy: 0.5, peakGain: 0.3 } as const;

const buildChime: Builder = (ctx, destination, opts) => {
  const t0 = ctx.currentTime;
  const vol = opts.volume ?? 1;

  const voice = ctx.createGain();
  voice.gain.setValueAtTime(0.0001, t0);
  voice.gain.linearRampToValueAtTime(CHIME.peakGain * vol, t0 + 0.02);
  voice.gain.exponentialRampToValueAtTime(0.001, t0 + CHIME.decayBy);
  voice.connect(destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(CHIME.first, t0);
  osc.frequency.setValueAtTime(CHIME.second, t0 + CHIME.secondAt);
  osc.connect(voice);
  osc.start(t0);
  osc.stop(t0 + CHIME.decayBy + 0.05);

  return {
    stop() {
      safeStop(osc);
      voice.disconnect();
    },
  };
};

// ambience — generative lo-fi music (no audio files): a felt-piano arpeggio
// walking a Cmaj7 / Am7 / Fmaj7 / G6 progression at ~76bpm with humanized
// timing and velocity, a sparse pentatonic melody on top, a warm detuned
// pad underneath, a lowpassed feedback-delay tail for space, and a whisper
// of brown noise as vinyl warmth. Scheduled ahead on the WebAudio clock so
// stop() can cancel cleanly.
const buildAmbience: Builder = (ctx, destination, opts) => {
  const loop = opts.loop ?? true;
  const baseVolume = (opts.volume ?? 1) * 0.85;

  const master = ctx.createGain();
  master.gain.value = baseVolume;
  master.connect(destination);

  // gentle master tone shaping — keeps the synth voices soft, not chippy
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  tone.connect(master);

  // space: two lowpassed feedback delays as a send
  const send = ctx.createGain();
  send.gain.value = 0.35;
  const mkDelay = (time: number, fb: number) => {
    const d = ctx.createDelay(1.5);
    d.delayTime.value = time;
    const g = ctx.createGain();
    g.gain.value = fb;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1600;
    d.connect(lp);
    lp.connect(g);
    g.connect(d);
    lp.connect(tone);
    return d;
  };
  send.connect(mkDelay(0.31, 0.32));
  send.connect(mkDelay(0.47, 0.26));

  // vinyl warmth — a whisper of the old room tone
  const hiss = ctx.createGain();
  hiss.gain.value = 0.016;
  hiss.connect(master);
  const noiseBuf = createNoiseBuffer(ctx, 4, 'brown');
  const noiseSrc = createNoiseSource(ctx, noiseBuf, true);
  const hissLp = ctx.createBiquadFilter();
  hissLp.type = 'lowpass';
  hissLp.frequency.value = 900;
  noiseSrc.connect(hissLp);
  hissLp.connect(hiss);
  noiseSrc.start();

  // pad: two detuned triangles sustaining root+fifth, very low
  const padGain = ctx.createGain();
  padGain.gain.value = 0.05;
  const padLp = ctx.createBiquadFilter();
  padLp.type = 'lowpass';
  padLp.frequency.value = 520;
  padGain.connect(padLp);
  padLp.connect(tone);
  const padOscs: OscillatorNode[] = [];

  // note helper — the "felt piano" voice
  const pluck = (freq: number, when: number, vel: number, dur = 1.9) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vel, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0004, when + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, when);
    lp.frequency.exponentialRampToValueAtTime(500, when + dur * 0.8);
    const o1 = ctx.createOscillator();
    o1.type = 'triangle';
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq / 2;
    const o2g = ctx.createGain();
    o2g.gain.value = 0.35;
    o1.connect(lp);
    o2.connect(o2g);
    o2g.connect(lp);
    lp.connect(g);
    g.connect(tone);
    g.connect(send);
    o1.start(when);
    o2.start(when);
    o1.stop(when + dur + 0.1);
    o2.stop(when + dur + 0.1);
  };

  // progression: Cmaj7 Am7 Fmaj7 G6 (freqs in Hz, around octave 3-4)
  const C3 = 130.81;
  const chords = [
    [C3, C3 * 1.25, C3 * 1.5, C3 * 1.875], // Cmaj7: C E G B
    [110.0, 110.0 * 1.2, 110.0 * 1.5, 110.0 * 1.782], // Am7: A C E G
    [174.61, 174.61 * 1.26, 174.61 * 1.5, 174.61 * 1.888], // Fmaj7: F A C E
    [196.0, 196.0 * 1.26, 196.0 * 1.5, 196.0 * 1.682], // G6: G B D E
  ];
  // pentatonic pool for the melody (C major pent, octave up)
  const pent = [523.25, 587.33, 659.25, 783.99, 880.0];

  const bpm = 76;
  const beat = 60 / bpm;
  const barsPerChord = 2;
  const chordDur = barsPerChord * 4 * beat;

  let nextChordTime = ctx.currentTime + 0.15;
  let chordIdx = 0;
  let melodyCooldown = 0;
  let rnd = 1234567;
  const rand = () => {
    rnd = (rnd * 48271) % 2147483647;
    return rnd / 2147483647;
  };

  // sustain pad voices re-tuned per chord
  for (let i = 0; i < 2; i++) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.detune.value = i === 0 ? -4 : 4;
    o.frequency.value = chords[0][0];
    o.connect(padGain);
    o.start();
    padOscs.push(o);
  }

  const scheduleChord = (t: number, chord: number[]) => {
    // pad glides to the new root/fifth
    padOscs[0].frequency.setTargetAtTime(chord[0], t, 0.4);
    padOscs[1].frequency.setTargetAtTime(chord[2], t, 0.4);
    // broken chord: root low, then a lazy spread of the upper notes
    pluck(chord[0], t + rand() * 0.02, 0.16, 2.4);
    const order = [1, 2, 3, 1, 2].slice(0, 3 + Math.floor(rand() * 3));
    order.forEach((idx, i) => {
      const when = t + beat * (0.9 + i * 0.9) + (rand() - 0.5) * 0.05;
      if (when < t + chordDur - 0.2) pluck(chord[idx] * 2, when, 0.07 + rand() * 0.05, 1.9);
    });
    // sparse melody
    melodyCooldown -= 1;
    if (melodyCooldown <= 0 && rand() > 0.35) {
      const n = pent[Math.floor(rand() * pent.length)];
      pluck(n, t + beat * (2 + Math.floor(rand() * 4)) + (rand() - 0.5) * 0.06, 0.05 + rand() * 0.04, 2.4);
      if (rand() > 0.6) {
        const n2 = pent[Math.floor(rand() * pent.length)];
        pluck(n2, t + beat * (5 + Math.floor(rand() * 2)), 0.04 + rand() * 0.03, 2.2);
      }
      melodyCooldown = Math.floor(rand() * 2);
    }
  };

  // lookahead scheduler
  const timer = setInterval(() => {
    while (nextChordTime < ctx.currentTime + 1.2) {
      scheduleChord(nextChordTime, chords[chordIdx % chords.length]);
      chordIdx += 1;
      nextChordTime += chordDur;
      if (!loop && chordIdx >= chords.length) {
        clearInterval(timer);
        break;
      }
    }
  }, 250);
  // fade the whole bed in gently
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(baseVolume, ctx.currentTime + 2.5);

  return {
    stop() {
      clearInterval(timer);
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.6);
      setTimeout(() => {
        safeStop(noiseSrc);
        padOscs.forEach((o) => safeStop(o));
        master.disconnect();
      }, 700);
    },
  };
};

const BUILDERS: Record<SoundName, Builder> = {
  pencil: buildPencil,
  tear: buildTear,
  pageFlip: buildPageFlip,
  doorCreak: buildDoorCreak,
  thud: buildThud,
  pop: buildPop,
  chime: buildChime,
  ambience: buildAmbience,
};

export function buildSound(name: SoundName, ctx: AudioContext, destination: GainNode, opts: SoundOpts): SoundHandle {
  return BUILDERS[name](ctx, destination, opts);
}
