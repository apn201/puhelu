# Puhelu

A haunted IVR phone. An Arduino UNO Q drives a Silvertel AG1171 SLIC wired to the 3-pin plug of a 1950s Swedish Ericofon (the phone stays closed). It rings at night, traps whoever answers in a phone menu run by a storylet "director" with memory across nights, and calls back when you hang up. Human recordings and robot TTS take turns. Pulse and DTMF dialing both work. A hosted browser web phone runs the same TypeScript engine so judges can try it without the hardware.

Target: Kiroween 2026 (Devpost, Resurrection category). Deadline Dec 4 2026, 2:00 PM Pacific. Plan to submit Dec 3.

## Try it

Web phone: (GitHub Pages URL goes here once the repo is public)

Lift the handset, wait for Thirdwatch, then dial. Drag a finger hole to the metal stop, type a digit, or switch to the keypad. Hang up and wait. The line monitor on the right shows the raw hook-switch trace, every decoded digit with its pulse rate, and what the haunting thinks of you.

## Run locally

```
npm install
npm run dev      # web phone at http://localhost:5173
npm test         # unit + property tests (Vitest, fast-check)
npm run check    # typecheck + tests + content lint
npm run build    # static site in dist/
```

## How it works

```
 web phone (browser)            UNO Q (to build)
  rotary dial -> SHK edges        MCU sketch -> SHK edges (micros)
  keypad -> 8 kHz DTMF            sound card -> 8 kHz audio
          \                         /
           +--> engine (TypeScript, same code) <--+
                pulse decoder, DTMF decoder (Goertzel)
                director: storylets + persistent state
                call session: ring, menu, hold, hang-up, callback
```

- `engine/` has no DOM code. The web phone and the sidecar are just two `Line` implementations.
- The web phone never sends digits. It produces timestamped hook edges and DTMF audio and lets the decoders do their job, so the judged URL exercises the same code path as the hardware.
- All sound is synthesized: the bell (two gongs and a 25 Hz hammer), dial clicks, DTMF, busy tone and the hold music. Voices are browser speech until the recordings are in.

## Prior art

The line side follows two projects that used the same Silvertel SLIC family to bring old phones back: **Analog Redial** by sdylewski and **weeBell** by Dan Julio. Puhelu's own work is the director, the hold-and-callback haunting, and the web phone.

## License

MIT. Thirdwatch Customer Continuity is fictional. Recordings are own material.

## Docs
- `docs/uno-q-build-phases.md` - THE active plan. Phases 0 to 7, pin map, Phase 0 spikes. Wins over anything below where they disagree on the host hardware.
- `docs/software-and-kiro-plan.md` - engine, director YAML, tiers, EARS specs, PBT, hooks, agents, MCP. Build dates in it are Pi-era, use the UNO Q schedule instead.
- `docs/hardware-hookup-and-test.md` - datasheet facts, ring sequence, test ladder T0 to T9. Wiring and Pi scripts are superseded by the UNO Q doc.
- `docs/minimal-test-rig.md` - breadboard rig, parts, Figure 4 protection netlist, troubleshooting.
- `docs/recording-script.md` - voice lines to record.
- `.kiro/steering/telephony.md` - Kiro steering file, goes into the repo as is.
- `device/legacy-r3/ag1171_minitest.ino` - old UNO R3 sketch, reference only.
- `docs/kiro-writeup-notes.md` - running log for the Kiro write-up.
