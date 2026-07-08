import { describe, expect, it, vi } from "vitest";
import { clamp, noteToFrequency, Synth } from "./synth";

describe("noteToFrequency", () => {
  it("returns 440Hz for A4", () => {
    expect(noteToFrequency("A4")).toBeCloseTo(440, 5);
  });

  it("returns 261.63Hz for middle C (C4)", () => {
    expect(noteToFrequency("C4")).toBeCloseTo(261.6256, 3);
  });

  it("handles sharps and flats equivalently", () => {
    expect(noteToFrequency("A#4")).toBeCloseTo(noteToFrequency("Bb4"), 5);
  });

  it("doubles the frequency one octave up", () => {
    expect(noteToFrequency("A5")).toBeCloseTo(2 * noteToFrequency("A4"), 5);
  });

  it("throws on invalid input", () => {
    expect(() => noteToFrequency("H9")).toThrow();
    expect(() => noteToFrequency("nope")).toThrow();
  });
});

describe("clamp", () => {
  it("bounds values to the range", () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-2, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});

function createMockContext() {
  const gainNode = () => ({
    gain: {
      value: 0,
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  });

  const oscillator = {
    type: "sine" as OscillatorType,
    frequency: { setValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as null | (() => void),
  };

  const ctx = {
    state: "suspended" as AudioContextState,
    currentTime: 0,
    destination: {},
    createGain: vi.fn(gainNode),
    createOscillator: vi.fn(() => oscillator),
    resume: vi.fn(async () => {
      ctx.state = "running";
    }),
  };

  return { ctx, oscillator };
}

describe("Synth", () => {
  it("connects a master gain to the destination on construction", () => {
    const { ctx } = createMockContext();
    new Synth({}, ctx as unknown as AudioContext);
    expect(ctx.createGain).toHaveBeenCalledTimes(1);
  });

  it("resumes a suspended context", async () => {
    const { ctx } = createMockContext();
    const synth = new Synth({}, ctx as unknown as AudioContext);
    expect(synth.isRunning).toBe(false);
    await synth.resume();
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    expect(synth.isRunning).toBe(true);
  });

  it("creates and starts an oscillator when playing a note", () => {
    const { ctx, oscillator } = createMockContext();
    const synth = new Synth({}, ctx as unknown as AudioContext);
    synth.playNote("A4", { waveform: "square" });
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(oscillator.type).toBe("square");
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(440, 0);
    expect(oscillator.start).toHaveBeenCalledTimes(1);
    expect(oscillator.stop).toHaveBeenCalledTimes(1);
  });
});
