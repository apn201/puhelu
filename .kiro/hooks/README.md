# Hooks

Create these in the Kiro hook UI (Agent Hooks panel) so the files Kiro writes land in this folder. Each one is listed with its trigger and what it asks.

1. **content-lint** - On file save, `content/**/*.yaml`. Run `npm run check`. If the content lint fails, fix the YAML and explain the fix in one line.
2. **signal-guard** - On file save, `engine/signal/**/*.ts`. Run `npm test`. If a property test fails, show the counterexample and fix the decoder, not the test.
3. **sketch-safety** - On file save, `device/**/*.ino`. Check that setup() sets F/R high and RM low before anything else, that PD is never written, and that every ring path checks ARM. Compile with arduino-cli if available.
4. **writeup-log** - On spec task completion. Append a dated entry to `docs/kiro-writeup-notes.md`: what was done, which Kiro feature did it (spec, hook, agent, MCP, steering), and anything the property tests caught.
