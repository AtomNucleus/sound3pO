/**
 * Web Audio synth engine + 16-step sequencer for MOD DESK.
 */

/** Selectable oscillator waveforms. */
export type Waveform = 'sawtooth' | 'square' | 'triangle' | 'sine';

/** LFO modulation target. */
export type LfoTarget = 'pitch' | 'cutoff' | 'off';

/** Continuous parameters (normalized 0..1 unless noted in docs). */
export type SynthParam =
  | 'cutoff'
  | 'resonance'
  | 'attack'
  | 'decay'
  | 'sustain'
  | 'release'
  | 'delayTime'
  | 'delayFeedback'
  | 'delayMix'
  | 'lfoRate'
  | 'lfoDepth'
  | 'volume'
  | 'tune';

interface Voice {
  osc: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  midi: number | null;
  active: boolean;
}

const VOICE_COUNT = 8;

function midiToFreq(midi: number, tuneSemis = 0): number {
  return 440 * Math.pow(2, (midi + tuneSemis - 69) / 12);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Polyphonic Web Audio synth: osc → filter → ADSR → master (delay send + compressor).
 *
 * Call {@link SynthEngine.resume} on the first user gesture to unlock AudioContext.
 */
export class SynthEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private filterBus!: GainNode;
  private delay!: DelayNode;
  private delayFeedback!: GainNode;
  private delayWet!: GainNode;
  private delayDry!: GainNode;
  private compressor!: DynamicsCompressorNode;
  private analyser!: AnalyserNode;
  private lfo!: OscillatorNode;
  private lfoGain!: GainNode;
  private voices: Voice[] = [];
  private waveform: Waveform = 'sawtooth';
  private lfoTarget: LfoTarget = 'cutoff';
  private params: Record<SynthParam, number> = {
    cutoff: 0.65,
    resonance: 0.2,
    attack: 0.08,
    decay: 0.25,
    sustain: 0.55,
    release: 0.35,
    delayTime: 0.25,
    delayFeedback: 0.25,
    delayMix: 0.2,
    lfoRate: 0.35,
    lfoDepth: 0.2,
    volume: 0.7,
    tune: 0.5,
  };
  private levelSmoothed = 0;
  private levelBuf = new Float32Array(512);
  private started = false;

  /** Lazily create / resume AudioContext. Safe to call repeatedly. */
  async resume(): Promise<void> {
    if (!this.ctx) this.buildGraph();
    if (this.ctx!.state !== 'running') await this.ctx!.resume();
    if (!this.started) {
      this.lfo.start();
      this.started = true;
    }
  }

  /** Whether the context is running. */
  get isRunning(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  /** Underlying AudioContext (null before first resume). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  private buildGraph(): void {
    const ctx = new AudioContext();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.params.volume;

    this.filterBus = ctx.createGain();
    this.filterBus.gain.value = 1;

    this.delay = ctx.createDelay(1.5);
    this.delay.delayTime.value = lerp(0.05, 0.75, this.params.delayTime);
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = this.params.delayFeedback * 0.85;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = this.params.delayMix;
    this.delayDry = ctx.createGain();
    this.delayDry.gain.value = 1 - this.params.delayMix * 0.5;

    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 3;
    this.compressor.attack.value = 0.01;
    this.compressor.release.value = 0.2;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.75;

    this.lfo = ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.value = lerp(0.1, 12, this.params.lfoRate);
    this.lfoGain = ctx.createGain();
    this.lfoGain.gain.value = this.params.lfoDepth;
    this.lfo.connect(this.lfoGain);

    // Voice pool
    for (let i = 0; i < VOICE_COUNT; i++) {
      const osc = ctx.createOscillator();
      osc.type = this.waveform;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = this.cutoffHz();
      filter.Q.value = lerp(0.3, 18, this.params.resonance);
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.filterBus);
      osc.start();
      this.voices.push({ osc, filter, gain, midi: null, active: false });
    }

    // Master routing: dry + wet delay → compressor → analyser → destination
    this.filterBus.connect(this.delayDry);
    this.filterBus.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delayDry.connect(this.compressor);
    this.delayWet.connect(this.compressor);
    this.compressor.connect(this.analyser);
    this.analyser.connect(this.master);
    this.master.connect(ctx.destination);

    this.applyLfoRouting();
  }

  private cutoffHz(): number {
    return lerp(120, 12000, Math.pow(this.params.cutoff, 1.6));
  }

  private tuneSemis(): number {
    return (this.params.tune - 0.5) * 24;
  }

  private applyLfoRouting(): void {
    if (!this.ctx) return;
    try {
      this.lfoGain.disconnect();
    } catch {
      /* not connected */
    }
    if (this.lfoTarget === 'off') {
      this.lfoGain.gain.value = 0;
      return;
    }
    this.lfoGain.gain.value = this.params.lfoDepth;
    if (this.lfoTarget === 'cutoff') {
      // Scale LFO into Hz range
      const depthHz = lerp(50, 4000, this.params.lfoDepth);
      this.lfoGain.gain.value = depthHz;
      for (const v of this.voices) {
        this.lfoGain.connect(v.filter.frequency);
      }
    } else if (this.lfoTarget === 'pitch') {
      const depth = lerp(0, 40, this.params.lfoDepth);
      this.lfoGain.gain.value = depth;
      for (const v of this.voices) {
        this.lfoGain.connect(v.osc.detune);
      }
    }
  }

  private allocVoice(midi: number): Voice {
    let free = this.voices.find((v) => !v.active);
    if (!free) {
      free = this.voices[0]!;
      this.noteOff(free.midi ?? midi);
    }
    // Prefer same midi re-trigger
    const same = this.voices.find((v) => v.midi === midi);
    return same ?? free;
  }

  /**
   * Start a note (MIDI number, e.g. 60 = C4).
   */
  noteOn(midi: number, velocity = 0.85): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = this.allocVoice(midi);
    v.midi = midi;
    v.active = true;
    v.osc.type = this.waveform;
    v.osc.frequency.setValueAtTime(midiToFreq(midi, this.tuneSemis()), t);
    v.filter.frequency.setTargetAtTime(this.cutoffHz(), t, 0.02);
    v.filter.Q.setTargetAtTime(lerp(0.3, 18, this.params.resonance), t, 0.02);

    const g = v.gain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(g.value, 0.0001), t);
    const peak = velocity * 0.35;
    const atk = lerp(0.005, 1.2, this.params.attack);
    const dec = lerp(0.02, 1.5, this.params.decay);
    const sus = this.params.sustain * peak;
    g.linearRampToValueAtTime(peak, t + atk);
    g.linearRampToValueAtTime(sus, t + atk + dec);
  }

  /**
   * Release a note by MIDI number.
   */
  noteOff(midi: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const v of this.voices) {
      if (v.midi !== midi || !v.active) continue;
      v.active = false;
      const rel = lerp(0.02, 2.5, this.params.release);
      const g = v.gain.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(g.value, 0.0001), t);
      g.exponentialRampToValueAtTime(0.0001, t + rel);
      v.midi = null;
    }
  }

  /** Set a continuous parameter (0..1). */
  setParam(name: SynthParam, value01: number): void {
    const v = Math.max(0, Math.min(1, value01));
    this.params[name] = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'cutoff':
        for (const voice of this.voices) {
          voice.filter.frequency.setTargetAtTime(this.cutoffHz(), t, 0.03);
        }
        break;
      case 'resonance':
        for (const voice of this.voices) {
          voice.filter.Q.setTargetAtTime(lerp(0.3, 18, v), t, 0.03);
        }
        break;
      case 'delayTime':
        this.delay.delayTime.setTargetAtTime(lerp(0.05, 0.75, v), t, 0.05);
        break;
      case 'delayFeedback':
        this.delayFeedback.gain.setTargetAtTime(v * 0.85, t, 0.05);
        break;
      case 'delayMix':
        this.delayWet.gain.setTargetAtTime(v, t, 0.05);
        this.delayDry.gain.setTargetAtTime(1 - v * 0.5, t, 0.05);
        break;
      case 'lfoRate':
        this.lfo.frequency.setTargetAtTime(lerp(0.1, 12, v), t, 0.05);
        break;
      case 'lfoDepth':
        this.applyLfoRouting();
        break;
      case 'volume':
        this.master.gain.setTargetAtTime(v, t, 0.05);
        break;
      case 'tune':
        for (const voice of this.voices) {
          if (voice.midi != null) {
            voice.osc.frequency.setTargetAtTime(midiToFreq(voice.midi, this.tuneSemis()), t, 0.03);
          }
        }
        break;
      default:
        break;
    }
  }

  /** Get current param value 0..1. */
  getParam(name: SynthParam): number {
    return this.params[name];
  }

  setWaveform(w: Waveform): void {
    this.waveform = w;
    for (const v of this.voices) v.osc.type = w;
  }

  getWaveform(): Waveform {
    return this.waveform;
  }

  setLfoTarget(t: LfoTarget): void {
    this.lfoTarget = t;
    this.applyLfoRouting();
  }

  getLfoTarget(): LfoTarget {
    return this.lfoTarget;
  }

  /** Analyser for LCD scope / spectrum. Creates graph if needed (silent). */
  getAnalyser(): AnalyserNode {
    if (!this.ctx) this.buildGraph();
    return this.analyser;
  }

  /**
   * Smoothed output level 0..1 for speaker-grille pulse.
   * Call once per frame.
   */
  getLevel(): number {
    if (!this.ctx) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) {
      const s = this.levelBuf[i]!;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / this.levelBuf.length);
    this.levelSmoothed = this.levelSmoothed * 0.85 + rms * 3.5 * 0.15;
    return Math.max(0, Math.min(1, this.levelSmoothed));
  }

  /** Tear down audio graph. */
  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.voices = [];
    this.started = false;
  }
}

/** Callback fired each sequencer step. */
export type StepCallback = (stepIndex: number, active: boolean, time: number) => void;

/**
 * Simple 16-step sequencer. Schedules steps against an AudioContext clock.
 * v4 Night Mode is the primary consumer; kept in core for shared use.
 */
export class StepSequencer {
  readonly steps: boolean[] = Array.from({ length: 16 }, () => false);
  tempo = 120;
  private timer: number | null = null;
  private step = 0;
  private playing = false;
  private cb: StepCallback | null = null;
  private engine: SynthEngine | null = null;
  private note = 60;

  constructor(engine?: SynthEngine) {
    this.engine = engine ?? null;
  }

  /** Bind a synth for automatic noteOn/noteOff on active steps. */
  setEngine(engine: SynthEngine): void {
    this.engine = engine;
  }

  setCallback(cb: StepCallback | null): void {
    this.cb = cb;
  }

  toggleStep(index: number): boolean {
    const i = ((index % 16) + 16) % 16;
    this.steps[i] = !this.steps[i];
    return this.steps[i]!;
  }

  setStep(index: number, on: boolean): void {
    this.steps[((index % 16) + 16) % 16] = on;
  }

  setTempo(bpm: number): void {
    this.tempo = Math.max(40, Math.min(240, bpm));
  }

  get currentStep(): number {
    return this.step;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  start(): void {
    if (this.playing) return;
    this.playing = true;
    this.tick();
  }

  stop(): void {
    this.playing = false;
    if (this.timer != null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    this.engine?.noteOff(this.note);
  }

  private tick = (): void => {
    if (!this.playing) return;
    const active = this.steps[this.step]!;
    const now = this.engine?.context?.currentTime ?? performance.now() / 1000;
    this.cb?.(this.step, active, now);
    if (this.engine) {
      this.engine.noteOff(this.note);
      if (active) this.engine.noteOn(this.note);
    }
    this.step = (this.step + 1) % 16;
    const ms = (60_000 / this.tempo) / 4; // 16th notes
    this.timer = window.setTimeout(this.tick, ms);
  };
}
