---
inclusion: always
---

# Structure

```
.kiro/        steering, specs, hooks, agents, settings (MCP)
engine/       TypeScript engine (line, signal, director, call session, sim)
content/      nodes.yaml (storylets), audio/ (recordings, own or licensed only)
web/          browser web phone (Vite root)
device/       UNO Q App Lab app (sketch + python), legacy-r3 reference sketch
tests/        Vitest + fast-check, traces/ (golden hook traces from the bench)
scripts/      content lint and small tools
docs/         plans, hardware notes, kiro write-up notes
```

Rules: engine never imports from web or device. Content never contains code. Safety logic never lives in the engine.
