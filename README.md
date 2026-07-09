# MOD DESK

Teenage Engineering-inspired modular web synthesizer workbench built with React + TypeScript + Vite.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

## What is included

- **Native modular desk UI**
  - Real CSS modules (OSC / FILTER / ENV / DELAY) — not a static chassis image with hotspots
  - Tactile knobs that rotate, ENV faders that slide, keys that depress
  - Live LCD readouts per module
  - Press **PLAY** first to resume audio
- **Module controls**:
  - OSC (orange) — engine, detune, mix, LFO/dist/reverb macros
  - FILTER (teal) — cutoff, resonance, drive, type
  - ENV (yellow) — ADSR faders + velocity
  - DELAY (red) — time, feedback, mix, tone
  - Macros, SCALE, GLIDE, HOLD / ARP
- **Factory signal routing**: OSC → FILTER → DIST → DELAY → REVERB → MASTER
- **Playable keyboard**
  - On-screen piano with press feedback
  - Computer keyboard mapping (Z-M low row + Q-U upper row)
  - Hold mode toggle and panic / all-notes-off
- **Chord Field** — draggable chord nodes, progression loop, audio-reactive viz
- **Web Audio synth engine**
  - AudioContext starts on first user gesture
  - Polyphonic voices
  - Filter, distortion, delay, reverb FX

## Sound engines (OSC)

1. Analog-ish
2. FM Bell
3. Noise / texture
4. Pluck (Karplus-ish excitation)
5. Bass / sub
6. Pad
7. Perc blip
8. Choir / formant-ish

## Netlify

`netlify.toml` publishes `dist` with SPA redirects.
