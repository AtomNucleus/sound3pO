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

## Live demo (no password)

**Public URL (no password):** https://sees-divide-summaries-barrier.trycloudflare.com/

### Permanent Netlify (remove Drop password)

Anonymous Netlify Drop deploys are password-gated until claimed. To publish on Netlify **without a password**:

1. Open this claim link while signed into Netlify (expires ~1 hour):  
   https://app.netlify.com/drop/ephemeral-cuchufli-1036ac#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzM3NzgsImV4cCI6MTc4MzU3NzM3OCwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiI5ZTZmZWFlZS0yMzRlLTRiZDYtODRkOC0xZDg5NjNiNjdjMWIifQ.sJfE6D52SfGTrnJRZef_mPZV_SIeOTkUA5GqBbua18c
2. Claiming attaches the site to your account and removes the Drop password.
3. Site URL after claim: https://ephemeral-cuchufli-1036ac.netlify.app/

Or authorize the CLI so future deploys are public:  
https://app.netlify.com/authorize?response_type=ticket&ticket=9e70f7289223b6c209cafd070d9a051c

### GitHub Pages (optional)

A `gh-pages` branch with the built site is already pushed. Enable Pages in the repo settings → Pages → Source: `gh-pages` / root for a permanent public URL at `https://atomnucleus.github.io/sound3pO/`.

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
