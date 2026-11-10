# Puhelu - notes for Claude Code

Read `README.md`, then `docs/uno-q-build-phases.md`. Start with the Phase 0 spikes (S1 to S9), not with features.

## Rules
- Hardware is Arduino UNO Q + AG1171 SLIC. Not Pi, not UNO R3. Pi bits in older docs are superseded.
- Datasheet V1.6 beats every doc here. `.kiro/steering/telephony.md` holds the signal rules. Never drive PD. RM only high while ringing. F/R idles high. RM duty at most 33% (target 25 to 30%). Ring only with ARM closed.
- MCU firmware owns safety (ring state machine, duty limit, watchdog). The engine never touches RM directly.
- Line side is about 48 V DC / 65 Vrms ringing. Do not open or modify the Ericofon. One phone only, no house wiring.
- Unverified until tested: Piper/Vosk speed on the board, Node on the Q, USB audio from inside the App Lab Docker container (fallback: host service at 172.17.0.1), `tone()` on the Zephyr core.
- Repo must be new, public on GitHub, with an open source license, and contain `/.kiro` (specs, steering, hooks, agents, MCP). Kiro use must be real and visible in history.
- Credit prior art in the README: Analog Redial (sdylewski), weeBell (Dan Julio).
- Record voice and hold music only from own or licensed material. Fictional company only (Thirdwatch Customer Continuity).

## Judging
Potential Impact, Technological Implementation, Design, Innovation/Idea, Presentation. Needs a working hosted URL (web phone), a demo video, and a Kiro write-up. Request 4,000 free Kiro credits before Dec 1 noon PT.
