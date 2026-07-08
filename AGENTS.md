# sound3pO

A browser-based synth pad built with Vite + React + TypeScript. Clicking a pad
(or pressing `A S D F G H J K`) triggers a note synthesized in real time via the
Web Audio API. There is no backend — everything runs client-side.

## Cursor Cloud specific instructions

- Standard commands live in `package.json` scripts: `npm run dev` (Vite dev
  server on port `5173`, bound to `0.0.0.0`), `npm run build` (`tsc -b` +
  `vite build`), `npm run lint` (ESLint flat config), `npm test` (Vitest, single
  run). The update script already runs `npm install`, so dependencies are ready.
- Audio is gated behind a user gesture: browsers keep the `AudioContext`
  suspended until the first click/keypress, so no sound plays on page load. The
  app calls `synth.resume()` on the first pad trigger — this is expected, not a
  bug.
- The cloud VM has no audio output device, so notes are inaudible during manual
  testing. Verify functionality visually instead: the clicked pad glows and the
  bottom status line updates to `Last note: <note> · <n> played`.
- Tests run under jsdom, which has no Web Audio API. `AudioContext` is stubbed in
  `src/App.test.tsx`, and `src/audio/synth.test.ts` injects a mock context into
  `Synth`. When adding audio behavior, keep `Synth` injectable (its constructor
  accepts an optional `AudioContext`) so it stays testable headlessly.
