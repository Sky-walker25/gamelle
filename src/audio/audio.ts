/**
 * Procedural audio: every sound effect and the music are synthesised with
 * the Web Audio API, so the game ships no audio files.
 */
export type SoundName =
  | 'arrow'
  | 'bolt'
  | 'musket'
  | 'gatling'
  | 'cannon'
  | 'artillery'
  | 'explosion'
  | 'bigExplosion'
  | 'rocket'
  | 'flame'
  | 'trap'
  | 'build'
  | 'upgrade'
  | 'sell'
  | 'coin'
  | 'wave'
  | 'boss'
  | 'death'
  | 'leak'
  | 'victory'
  | 'defeat'
  | 'click'
  | 'error'
  | 'waterjet';

interface PlayOptions {
  volume?: number;
  /** Pitch multiplier. */
  pitch?: number;
  /** Stereo pan -1..1. */
  pan?: number;
}

/** Minimum interval between two plays of the same sound, in ms. */
const THROTTLE_MS: Partial<Record<SoundName, number>> = {
  arrow: 45,
  bolt: 60,
  musket: 60,
  gatling: 35,
  cannon: 90,
  artillery: 120,
  explosion: 70,
  bigExplosion: 150,
  rocket: 40,
  flame: 140,
  trap: 80,
  coin: 50,
  death: 60,
  waterjet: 200,
};

const MAX_VOICES = 28;

export type MusicMood = 'sunny' | 'green' | 'dusk' | 'rain' | 'night' | 'snow';

interface MoodDef {
  tempo: number;
  /** Semitone offsets of the scale relative to the root. */
  scale: number[];
  /** Chord roots progression in semitones. */
  progression: number[];
  root: number; // MIDI note
  brightness: number; // filter cutoff multiplier
}

const MOODS: Record<MusicMood, MoodDef> = {
  sunny: { tempo: 92, scale: [0, 2, 4, 7, 9], progression: [0, 5, 7, 5], root: 45, brightness: 1.2 },
  green: { tempo: 86, scale: [0, 2, 3, 5, 7, 10], progression: [0, 8, 3, 10], root: 45, brightness: 1 },
  dusk: { tempo: 80, scale: [0, 2, 3, 5, 7, 8, 10], progression: [0, 8, 10, 7], root: 43, brightness: 0.8 },
  rain: { tempo: 78, scale: [0, 3, 5, 7, 10], progression: [0, 3, 10, 5], root: 41, brightness: 0.7 },
  night: { tempo: 72, scale: [0, 1, 3, 5, 7, 8], progression: [0, 1, 0, 8], root: 40, brightness: 0.5 },
  snow: { tempo: 76, scale: [0, 2, 3, 7, 8], progression: [0, 8, 3, 7], root: 43, brightness: 0.9 },
};

function midiToHz(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private music: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayed = new Map<SoundName, number>();
  private activeVoices = 0;
  private volumes = { master: 0.8, sfx: 0.8, music: 0.5 };
  private musicTimer: number | null = null;
  private musicMood: MusicMood = 'sunny';
  private musicStep = 0;
  private musicNextTime = 0;
  private intensity = 0;
  private lastMelody = 0;
  private melodyDegree = 0;
  private enabled = true;
  private unlocked = false;
  private musicRequested = false;

  /** Must be called from a user gesture before anything is heard. */
  unlock(): void {
    if (this.unlocked) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.sfx = this.ctx.createGain();
      this.music = this.ctx.createGain();
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 4;
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      this.master.connect(compressor);
      compressor.connect(this.ctx.destination);
      this.applyVolumes();
      this.unlocked = true;
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      if (this.musicRequested) this.startMusic(this.musicMood);
    } catch {
      this.ctx = null;
    }
  }

  get isUnlocked(): boolean {
    return this.unlocked;
  }

  resume(): void {
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.volumes = { master, sfx, music };
    this.applyVolumes();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.sfx || !this.music) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.02);
    this.sfx.gain.setTargetAtTime(this.volumes.sfx, t, 0.02);
    this.music.gain.setTargetAtTime(this.volumes.music * 0.35, t, 0.02);
  }

  private noise(): AudioBuffer {
    const ctx = this.ctx as AudioContext;
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  // ----------------------------------------------------------------------
  // Sound effects
  // ----------------------------------------------------------------------

  play(name: SoundName, opts: PlayOptions = {}): void {
    if (!this.enabled || !this.ctx || !this.sfx) return;
    if (this.ctx.state !== 'running') return;
    const now = performance.now();
    const throttle = THROTTLE_MS[name];
    if (throttle) {
      const last = this.lastPlayed.get(name) ?? -Infinity;
      if (now - last < throttle) return;
      this.lastPlayed.set(name, now);
    }
    if (this.activeVoices >= MAX_VOICES) return;
    const out = this.ctx.createGain();
    out.gain.value = opts.volume ?? 1;
    let node: AudioNode = out;
    if (opts.pan !== undefined && typeof this.ctx.createStereoPanner === 'function') {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = Math.max(-1, Math.min(1, opts.pan));
      out.connect(pan);
      node = pan;
    }
    node.connect(this.sfx);
    const pitch = opts.pitch ?? 1;
    const duration = this.synth(name, out, pitch);
    this.activeVoices++;
    window.setTimeout(
      () => {
        this.activeVoices = Math.max(0, this.activeVoices - 1);
        out.disconnect();
      },
      duration * 1000 + 80,
    );
  }

  /** Builds the graph for a sound and returns its duration in seconds. */
  private synth(name: SoundName, out: GainNode, pitch: number): number {
    switch (name) {
      case 'arrow':
        this.burst(out, { type: 'bandpass', freq: 2600 * pitch, q: 2, dur: 0.07, gain: 0.35 });
        this.tone(out, { type: 'sine', from: 1800 * pitch, to: 600 * pitch, dur: 0.08, gain: 0.12 });
        return 0.1;
      case 'bolt':
        this.tone(out, { type: 'triangle', from: 220 * pitch, to: 70 * pitch, dur: 0.16, gain: 0.5 });
        this.burst(out, { type: 'lowpass', freq: 1200, q: 1, dur: 0.1, gain: 0.4 });
        return 0.18;
      case 'musket':
        this.burst(out, { type: 'lowpass', freq: 1800 * pitch, q: 0.7, dur: 0.14, gain: 0.7, attack: 0.002 });
        this.tone(out, { type: 'sine', from: 160, to: 50, dur: 0.12, gain: 0.35 });
        return 0.16;
      case 'gatling':
        this.burst(out, {
          type: 'highpass',
          freq: 900 * pitch,
          q: 0.5,
          dur: 0.04,
          gain: 0.45,
          attack: 0.001,
        });
        return 0.05;
      case 'cannon':
        this.tone(out, { type: 'sine', from: 110 * pitch, to: 32, dur: 0.4, gain: 0.9 });
        this.burst(out, { type: 'lowpass', freq: 500, q: 0.8, dur: 0.28, gain: 0.7, attack: 0.003 });
        return 0.42;
      case 'artillery':
        this.tone(out, { type: 'sine', from: 80 * pitch, to: 28, dur: 0.5, gain: 0.9 });
        this.burst(out, { type: 'lowpass', freq: 350, q: 0.8, dur: 0.35, gain: 0.6, attack: 0.004 });
        return 0.5;
      case 'explosion':
        this.burst(out, {
          type: 'lowpass',
          freq: 2200,
          to: 120,
          q: 0.9,
          dur: 0.45,
          gain: 0.8,
          attack: 0.002,
        });
        this.tone(out, { type: 'sine', from: 70, to: 30, dur: 0.4, gain: 0.7 });
        return 0.5;
      case 'bigExplosion':
        this.burst(out, { type: 'lowpass', freq: 2600, to: 80, q: 1, dur: 0.9, gain: 1, attack: 0.002 });
        this.tone(out, { type: 'sine', from: 60, to: 22, dur: 0.9, gain: 0.9 });
        return 1;
      case 'rocket':
        this.burst(out, {
          type: 'bandpass',
          freq: 500 * pitch,
          to: 2400 * pitch,
          q: 1.5,
          dur: 0.22,
          gain: 0.35,
        });
        return 0.24;
      case 'flame':
        this.burst(out, { type: 'bandpass', freq: 700 * pitch, q: 0.8, dur: 0.26, gain: 0.28, attack: 0.03 });
        return 0.28;
      case 'waterjet':
        this.burst(out, {
          type: 'bandpass',
          freq: 1500,
          to: 900,
          q: 0.6,
          dur: 0.35,
          gain: 0.18,
          attack: 0.05,
        });
        return 0.36;
      case 'trap':
        this.burst(out, { type: 'highpass', freq: 1400, q: 0.5, dur: 0.06, gain: 0.5, attack: 0.001 });
        this.tone(out, { type: 'square', from: 500, to: 180, dur: 0.07, gain: 0.2 });
        return 0.1;
      case 'build':
        this.tone(out, { type: 'square', from: 330, to: 330, dur: 0.06, gain: 0.18 });
        this.tone(out, { type: 'square', from: 494, to: 494, dur: 0.08, gain: 0.18, delay: 0.09 });
        this.burst(out, { type: 'lowpass', freq: 900, q: 1, dur: 0.05, gain: 0.3, attack: 0.001 });
        return 0.2;
      case 'upgrade':
        this.arpeggio(out, [523, 659, 784, 1047], 0.09, 'triangle', 0.18);
        return 0.5;
      case 'sell':
        this.arpeggio(out, [784, 587, 440], 0.09, 'triangle', 0.16);
        return 0.35;
      case 'coin':
        this.tone(out, { type: 'sine', from: 1320 * pitch, to: 1320 * pitch, dur: 0.06, gain: 0.16 });
        this.tone(out, {
          type: 'sine',
          from: 1980 * pitch,
          to: 1980 * pitch,
          dur: 0.1,
          gain: 0.14,
          delay: 0.06,
        });
        return 0.18;
      case 'wave':
        this.horn(out, 196, 0.7, 0.35);
        this.horn(out, 294, 0.7, 0.22);
        return 0.8;
      case 'boss':
        this.horn(out, 98, 1.4, 0.5);
        this.horn(out, 147, 1.4, 0.3);
        this.tone(out, { type: 'sine', from: 60, to: 40, dur: 0.6, gain: 0.8, delay: 0.1 });
        return 1.5;
      case 'death':
        this.tone(out, { type: 'sine', from: 240 * pitch, to: 70 * pitch, dur: 0.12, gain: 0.22 });
        this.burst(out, { type: 'lowpass', freq: 700, q: 1, dur: 0.08, gain: 0.15 });
        return 0.14;
      case 'leak':
        this.tone(out, { type: 'square', from: 660, to: 660, dur: 0.12, gain: 0.14 });
        this.tone(out, { type: 'square', from: 440, to: 440, dur: 0.18, gain: 0.14, delay: 0.14 });
        return 0.35;
      case 'victory':
        this.arpeggio(out, [523, 659, 784, 1047, 1319], 0.16, 'triangle', 0.22);
        this.horn(out, 262, 1.2, 0.2);
        return 1.3;
      case 'defeat':
        this.arpeggio(out, [440, 415, 349, 262], 0.3, 'sawtooth', 0.14);
        this.tone(out, { type: 'sine', from: 90, to: 40, dur: 1.2, gain: 0.5 });
        return 1.4;
      case 'click':
        this.tone(out, { type: 'sine', from: 900, to: 700, dur: 0.03, gain: 0.12 });
        return 0.04;
      case 'error':
        this.tone(out, { type: 'sawtooth', from: 160, to: 140, dur: 0.14, gain: 0.12 });
        return 0.15;
    }
  }

  private tone(
    out: AudioNode,
    o: { type: OscillatorType; from: number; to: number; dur: number; gain: number; delay?: number },
  ): void {
    const ctx = this.ctx as AudioContext;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(Math.max(20, o.from), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  private burst(
    out: AudioNode,
    o: {
      type: BiquadFilterType;
      freq: number;
      to?: number;
      q: number;
      dur: number;
      gain: number;
      attack?: number;
    },
  ): void {
    const ctx = this.ctx as AudioContext;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    src.loop = true;
    src.playbackRate.value = 1;
    const filter = ctx.createBiquadFilter();
    filter.type = o.type;
    filter.frequency.setValueAtTime(o.freq, t0);
    if (o.to !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + o.dur);
    filter.Q.value = o.q;
    const g = ctx.createGain();
    const attack = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(out);
    src.start(t0);
    src.stop(t0 + o.dur + 0.02);
  }

  private arpeggio(out: AudioNode, notes: number[], step: number, type: OscillatorType, gain: number): void {
    notes.forEach((f, i) => this.tone(out, { type, from: f, to: f, dur: step * 2.2, gain, delay: i * step }));
  }

  private horn(out: AudioNode, freq: number, dur: number, gain: number): void {
    const ctx = this.ctx as AudioContext;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibGain = ctx.createGain();
    vibGain.gain.value = freq * 0.012;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t0);
    filter.frequency.linearRampToValueAtTime(1800, t0 + dur * 0.4);
    filter.frequency.linearRampToValueAtTime(500, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.08);
    g.gain.setValueAtTime(gain, t0 + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(filter);
    filter.connect(g);
    g.connect(out);
    osc.start(t0);
    vib.start(t0);
    osc.stop(t0 + dur + 0.05);
    vib.stop(t0 + dur + 0.05);
  }

  // ----------------------------------------------------------------------
  // Music
  // ----------------------------------------------------------------------

  startMusic(mood: MusicMood): void {
    this.musicMood = mood;
    this.musicRequested = true;
    if (!this.ctx || !this.music) return;
    if (this.musicTimer !== null) return;
    this.musicStep = 0;
    this.musicNextTime = this.ctx.currentTime + 0.1;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 90);
  }

  stopMusic(): void {
    this.musicRequested = false;
    if (this.musicTimer !== null) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  setMood(mood: MusicMood): void {
    this.musicMood = mood;
  }

  /** 0 = calm (between waves), 1 = full battle. */
  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.music || ctx.state !== 'running') return;
    const mood = MOODS[this.musicMood];
    const beat = 60 / mood.tempo;
    const sixteenth = beat / 4;
    while (this.musicNextTime < ctx.currentTime + 0.25) {
      this.playMusicStep(this.musicStep, this.musicNextTime, mood, sixteenth);
      this.musicStep = (this.musicStep + 1) % (16 * mood.progression.length);
      this.musicNextTime += sixteenth;
    }
  }

  private playMusicStep(step: number, time: number, mood: MoodDef, sixteenth: number): void {
    const out = this.music as GainNode;
    const bar = Math.floor(step / 16) % mood.progression.length;
    const inBar = step % 16;
    const chordRoot = mood.root + (mood.progression[bar] ?? 0);
    const intensity = this.intensity;

    // Bass drone on the chord root, retriggered each bar.
    if (inBar === 0) {
      this.musicVoice(
        out,
        midiToHz(chordRoot),
        'triangle',
        time,
        sixteenth * 15.5,
        0.22,
        300 * mood.brightness,
      );
      this.musicVoice(out, midiToHz(chordRoot - 12), 'sine', time, sixteenth * 15.5, 0.18, 200);
    }
    // Fifth / pad every half bar.
    if (inBar === 0 || inBar === 8) {
      this.musicVoice(
        out,
        midiToHz(chordRoot + 7 + 12),
        'sine',
        time,
        sixteenth * 7.5,
        0.06 + intensity * 0.04,
        900 * mood.brightness,
      );
    }
    // Percussion: kick on 1 and 3, snare on 2 and 4 (only when the battle is on), hats on off-beats.
    if (inBar === 0 || inBar === 8) this.kick(out, time, 0.35 + intensity * 0.25);
    if (intensity > 0.15 && (inBar === 4 || inBar === 12)) this.snare(out, time, 0.12 + intensity * 0.18);
    if (intensity > 0.5 && inBar % 2 === 1) this.hat(out, time, 0.05 * intensity);
    if (intensity > 0.8 && inBar === 14) this.snare(out, time, 0.15);

    // Melody: sparse, stepwise, from the mood scale, denser as the battle heats up.
    const density = 0.18 + intensity * 0.35;
    const seed = Math.abs(Math.sin(step * 12.9898 + bar * 78.233) * 43758.5453) % 1;
    if (inBar % 2 === 0 && seed < density && step - this.lastMelody >= 2) {
      const move = seed * 3 < 1 ? -1 : seed * 3 < 2 ? 0 : 1;
      this.melodyDegree = Math.max(
        0,
        Math.min(mood.scale.length * 2 - 1, this.melodyDegree + move + (seed > 0.9 ? 2 : 0)),
      );
      const octave = Math.floor(this.melodyDegree / mood.scale.length);
      const degree = mood.scale[this.melodyDegree % mood.scale.length] ?? 0;
      const note = chordRoot + 24 + degree + octave * 12;
      this.musicVoice(
        out,
        midiToHz(note),
        'triangle',
        time,
        sixteenth * 3,
        0.1 + intensity * 0.05,
        2200 * mood.brightness,
        true,
      );
      this.lastMelody = step;
    }
  }

  private musicVoice(
    out: AudioNode,
    freq: number,
    type: OscillatorType,
    time: number,
    dur: number,
    gain: number,
    cutoff: number,
    echo = false,
  ): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(gain, time + 0.04);
    g.gain.setValueAtTime(gain, time + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(filter);
    filter.connect(g);
    g.connect(out);
    if (echo) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = 0.28;
      const fb = ctx.createGain();
      fb.gain.value = 0.3;
      g.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      fb.connect(out);
      window.setTimeout(
        () => {
          delay.disconnect();
          fb.disconnect();
        },
        (dur + 2) * 1000,
      );
    }
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  private kick(out: AudioNode, time: number, gain: number): void {
    const ctx = this.ctx as AudioContext;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
    osc.connect(g);
    g.connect(out);
    osc.start(time);
    osc.stop(time + 0.25);
  }

  private snare(out: AudioNode, time: number, gain: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    src.connect(filter);
    filter.connect(g);
    g.connect(out);
    src.start(time);
    src.stop(time + 0.2);
  }

  private hat(out: AudioNode, time: number, gain: number): void {
    const ctx = this.ctx as AudioContext;
    const src = ctx.createBufferSource();
    src.buffer = this.noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    src.connect(filter);
    filter.connect(g);
    g.connect(out);
    src.start(time);
    src.stop(time + 0.06);
  }
}

export const audio = new AudioEngine();
