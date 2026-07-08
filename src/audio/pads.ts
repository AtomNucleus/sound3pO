import type { Waveform } from "./synth";

export interface PadDef {
  id: string;
  note: string;
  label: string;
  key: string;
  hue: number;
}

/** A C major pentatonic layout across two octaves, mapped to the home row. */
export const PADS: PadDef[] = [
  { id: "pad-c4", note: "C4", label: "C", key: "a", hue: 350 },
  { id: "pad-d4", note: "D4", label: "D", key: "s", hue: 20 },
  { id: "pad-e4", note: "E4", label: "E", key: "d", hue: 45 },
  { id: "pad-g4", note: "G4", label: "G", key: "f", hue: 150 },
  { id: "pad-a4", note: "A4", label: "A", key: "g", hue: 190 },
  { id: "pad-c5", note: "C5", label: "C", key: "h", hue: 220 },
  { id: "pad-d5", note: "D5", label: "D", key: "j", hue: 265 },
  { id: "pad-e5", note: "E5", label: "E", key: "k", hue: 300 },
];

export const WAVEFORMS: Waveform[] = ["triangle", "sine", "square", "sawtooth"];

export const keyToPad = new Map(PADS.map((pad) => [pad.key, pad]));
