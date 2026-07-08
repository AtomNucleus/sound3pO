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

- **Patchable module desk UI** with colored modules:
  - OSC (orange)
  - FILTER (teal)
  - ENV (yellow)
  - DELAY (red)
  - LFO, DIST, REVERB, OUTPUT
- **Virtual cable patching**
  - Click an output jack, then click an input jack to connect
  - Click a cable to remove it
  - Factory patch / clear patch controls
- **Playable keyboard controls**
  - On-screen piano
  - Computer keyboard mapping (Z-M low row + A-I upper accents)
  - Hold mode toggle and panic/all-notes-off
- **Web Audio synth engine**
  - AudioContext starts on first user gesture
  - Polyphonic voices
  - Filter, distortion, delay, reverb FX
  - LFO and ENV modulation routes via patch cables

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

`netlify.toml` is included with:

- publish directory: `dist`
- build command: `npm run build`
- SPA fallback redirect to `index.html`
