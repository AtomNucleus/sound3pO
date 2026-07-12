# MOD DESK — three.js variations

Five interactive three.js variations of a desktop modular synthesizer product photo, in the design language of Teenage Engineering.

## Setup

```bash
npm install
npm run dev
```

## Variants

| Page | Name | Description |
|------|------|-------------|
| [/](index.html) | Landing | Variant index |
| [/v1/](v1/) | Product Shot | Photo-faithful fixed camera |
| [/v2/](v2/) | On the Desk | Photoreal orbit + real repatching |
| [/v3/](v3/) | Toy | Clay & bouncy |
| [/v4/](v4/) | Night Mode | Neon + sequencer |
| [/v5/](v5/) | Exploded | Pull it apart |

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — Typecheck + production build
- `npm run preview` — Preview production build

## Core library

Shared procedural device, patch cables, Web Audio synth, LCD screens, and interaction live under `src/core/`. Variants import from there.
