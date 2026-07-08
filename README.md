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

- **Image-as-chassis UI**
  - The Mod Desk PNG is the full interface artwork
  - Interactive overlays are positioned on top (knobs, buttons, LCDs, keys)
  - Click **PLAY / POWER** first to resume audio
- **Module controls mapped to the chassis art**:
  - OSC (orange)
  - FILTER (teal)
  - ENV (yellow)
  - DELAY (red)
  - LFO, DIST, REVERB, OUTPUT
- **Factory signal routing**: OSC → FILTER → DIST → DELAY → REVERB → MASTER
- **Playable keyboard controls**
  - On-screen piano overlays on the drawn keyboard
  - Computer keyboard mapping (Z-M low row + Q-U upper row)
  - Hold mode toggle and panic/all-notes-off
- **Direct manipulation controls**
  - Drag knobs up/down to morph parameters in real time
  - Click keys to play notes
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

## Live demo (Netlify)

Anonymous claimable deploy:

- **URL:** https://reliable-conkies-28effe.netlify.app/
- **Password:** `My-Drop-Site` (temporary Drop protection)
- **Claim ownership (1 hour):** https://app.netlify.com/drop/reliable-conkies-28effe

After claiming in your Netlify account you can remove the password and keep the site permanently.

## Netlify config

`netlify.toml` is included with:

- publish directory: `dist`
- build command: `npm run build`
- SPA fallback redirect to `index.html`

Redeploy from this repo:

```bash
npm run build
npx netlify-cli deploy --dir=dist --prod
```
