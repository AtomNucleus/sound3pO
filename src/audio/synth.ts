export type Waveform = "sine" | "square" | "sawtooth" | "triangle";

export interface PlayOptions {
  waveform?: Waveform;
  attack?: number;
  release?: number;
  velocity?: number;
}

export interface SynthOptions {
  masterGain?: number;
  waveform?: Waveform;
  attack?: number;
  release?: number;
}

const NOTE_INDEX: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

/**
 * Convert scientific pitch notation (e.g. "A4", "C#5") into a frequency in Hz,
 * using equal temperament with A4 = 440 Hz.
 */
export function noteToFrequency(note: string): number {
  const match = /^([A-Ga-g])(#|b)?(-?\d+)$/.exec(note.trim());
  if (!match) {
    throw new Error(`Invalid note: "${note}"`);
  }
  const [, letter, accidental, octaveStr] = match;
  const key = letter.toUpperCase() + (accidental ?? "");
  const semitone = NOTE_INDEX[key];
  if (semitone === undefined) {
    throw new Error(`Invalid note: "${note}"`);
  }
  const octave = Number(octaveStr);
  // MIDI note number, where A4 (440Hz) = 69.
  const midi = semitone + (octave + 1) * 12;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

type AudioContextCtor = new () => AudioContext;

function resolveAudioContext(): AudioContextCtor {
  const w = globalThis as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) {
    throw new Error("Web Audio API is not supported in this environment.");
  }
  return Ctor;
}

/**
 * A tiny polyphonic synthesizer built on the Web Audio API. Each `play` call
 * spins up an oscillator with a short attack/release envelope so notes sound
 * plucked rather than clicking on and off.
 */
export class Synth {
  readonly context: AudioContext;
  private readonly master: GainNode;
  private readonly options: Required<SynthOptions>;

  constructor(options: SynthOptions = {}, context?: AudioContext) {
    this.options = {
      masterGain: options.masterGain ?? 0.3,
      waveform: options.waveform ?? "triangle",
      attack: options.attack ?? 0.005,
      release: options.release ?? 0.6,
    };
    this.context = context ?? new (resolveAudioContext())();
    this.master = this.context.createGain();
    this.master.gain.value = this.options.masterGain;
    this.master.connect(this.context.destination);
  }

  /** Browsers start the AudioContext suspended until a user gesture. */
  async resume(): Promise<void> {
    if (this.context.state === "suspended") {
      await this.context.resume();
    }
  }

  get isRunning(): boolean {
    return this.context.state === "running";
  }

  playNote(note: string, options?: PlayOptions): void {
    this.play(noteToFrequency(note), options);
  }

  play(frequency: number, options: PlayOptions = {}): void {
    const now = this.context.currentTime;
    const attack = options.attack ?? this.options.attack;
    const release = options.release ?? this.options.release;
    const velocity = clamp(options.velocity ?? 1, 0, 1);

    const osc = this.context.createOscillator();
    osc.type = options.waveform ?? this.options.waveform;
    osc.frequency.setValueAtTime(frequency, now);

    const env = this.context.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(velocity, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);

    osc.connect(env);
    env.connect(this.master);

    osc.start(now);
    osc.stop(now + attack + release + 0.05);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  setMasterGain(value: number): void {
    this.master.gain.value = clamp(value, 0, 1);
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
