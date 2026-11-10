---
inclusion: always
---

# Tech

- TypeScript engine in `engine/`, no DOM imports. Runs in the browser (Vite) and under Node on the UNO Q.
- `engine/line.ts` is the seam. Line implementations: `web/main.ts` (browser), `engine/sim.ts` (tests, MCP), sidecar (UNO Q, to build).
- Signals: `engine/signal/pulse.ts` (raw SHK edges with timestamps to digits), `engine/signal/dtmf.ts` (Goertzel, 8 kHz).
- Director: `engine/director/`. Content: `content/nodes.yaml`.
- Tests: Vitest + fast-check in `tests/`. Property tests are the main evidence. `npm run check` = typecheck + tests + content lint.
- Web: `web/`, built by Vite to `dist/`, deployed to GitHub Pages by `.github/workflows/pages.yml`.
- Hardware side (to build): `device/uno-q/` App Lab app: `sketch/sketch.ino` (MCU: edges, ring state machine, duty limit, watchdog, ARM) and `python/main.py` (Bridge, audio).
- All sound in the web phone is synthesized (WebAudio) or browser speech. No samples.

Commands: `npm run dev`, `npm test`, `npm run check`, `npm run build`.
