# sound3pO

A browser-based synth pad powered by the [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API).
Tap the colored pads — or use your keyboard (`A S D F G H J K`) — to play notes
across a C major pentatonic layout. Switch between `triangle`, `sine`, `square`,
and `sawtooth` waveforms and adjust the master volume in real time.

Built with **Vite + React + TypeScript**. Everything runs client-side; there is
no backend.

## Getting started

```bash
npm install
npm run dev      # start the dev server at http://localhost:5173
```

## Scripts

| Command         | Description                                  |
| --------------- | -------------------------------------------- |
| `npm run dev`   | Start the Vite dev server (port `5173`).     |
| `npm run build` | Type-check (`tsc -b`) and build for prod.    |
| `npm run lint`  | Run ESLint over the project.                 |
| `npm test`      | Run the Vitest unit/component test suite.    |

## Project layout

- `src/audio/synth.ts` — the Web Audio synthesizer and `noteToFrequency` helper.
- `src/audio/pads.ts` — pad definitions (notes, keyboard mapping, colors).
- `src/App.tsx` — the UI: pad grid, waveform picker, and volume control.
