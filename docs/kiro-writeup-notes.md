# Kiro write-up notes

Running log for the Devpost "how Kiro was used" write-up. Keep it honest: say which tool did what.

## 2026-11-10 - scaffold and web phone (Claude Code, before Kiro was set up)

- Built with Claude Code, not Kiro: repo scaffold, TypeScript engine (pulse decoder, DTMF decoder, director, call session, sim line), 35 storylets, browser web phone, Vitest + fast-check tests.
- Steering files and spec requirements written from the existing plan docs. Design and tasks for the specs are left for Kiro to generate.
- Property test found a real bug: with non-overlapping 205-sample Goertzel windows, the same DTMF key pressed twice with a ~60 ms gap decoded as one digit (counterexample `["1","1","0"]`). Fix: half-window hop, accept after 3 windows (51 ms), re-arm after 2 quiet windows.
- Browser test found: dial pulses timed with setTimeout broke when the tab was throttled. Fix: stamp each pulse edge with its scheduled time, the way the MCU stamps edges with micros().

## Next, in Kiro
- line-driver spec: generate design + tasks, build `device/uno-q/` sketch and sidecar.
- virtual-caller spec: build the MCP server, register in `.kiro/settings/mcp.json`, run coverage.
- Hooks from `.kiro/hooks/README.md` created in the Kiro UI.
- haunt-writer agent: grow content to about 25 to 40 sharp nodes.
