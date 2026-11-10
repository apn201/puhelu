# Software and Kiro plan v2

Working title: Your Call Is Important (or Kaiku, Finnish for echo). A box with a Raspberry Pi 3 and an AG1171 that rings an old phone at night, traps whoever answers in an IVR that behaves a little too well, and calls back when you hang up. The same engine runs in a browser, so anyone can be haunted by URL.

Category: Resurrection (a dead landline phone brought back as a haunted terminal). Best Demo is automatic for every eligible submission.

## 1. The 2026 rules (read from the Devpost page on Nov 1)

Things that changed from 2025 and change the plan:

- Deadline: Friday December 4 2026, 2:00 PM Pacific (that is midnight Helsinki into December 5). Submit December 3.
- Only new projects, started in the window October 30 to December 4.
- Judging has five criteria now: Potential Impact, Technological Implementation (Kiro), Design, Innovation/Idea, Presentation.
- A URL to the working app is required. A phone box alone is not enough. The browser version must be hosted publicly (GitHub Pages is free and cannot go to sleep).
- Repo must be public on GitHub (not GitLab or Bitbucket), with a license file visible in the About section, and `/.kiro` at the root, not gitignored.
- Demo video: under 3 minutes, shows the project working on its device, uploaded to YouTube as public, no copyrighted music.
- Write-up on how Kiro was used. The prompts now name: Kiro IDE/CLI/Web/Crew differences, custom agents, hooks, specs versus vibe coding, steering, MCP, property-based testing, Kiro powers.
- Free extras: 4,000 Kiro credits (request on the Resources tab before December 1, noon PT), a Devpost build session November 11, 10:00 AM PT.
- Cheap bonus prizes: Bonus Blog Prize (public blog post during the period, mention the hackathon, 100 winners get 2,000 credits), Social Blitz (a post starting with #KiroweenHackathon26), Best Demo (automatic). Best Kiro Crew App and Ghost of Kiroween Past exist, and only worth it if they cost nothing extra.
- An eligible project wins one overall or one category prize, plus any bonuses.

## 2. Architecture decision: TypeScript engine, small hardware sidecar

Why: the hosted demo must run for judges without a server, without keys, without cold starts. A TypeScript engine runs in the browser (GitHub Pages) and on the Pi under Node. Everything that touches hardware lives in a small sidecar.

```
              +--------------------------- engine (TypeScript) ---------------------------+
              | director, state, storylets, scheduler, pulse decoder, DTMF decoder, tools |
              +--------------^----------------------------------------------^------------+
                             | Line interface (JSON events + commands)      |
          +------------------+------------------+              +------------+------------+
          | sim line (in-process, tests, MCP)  |              | browser line (web phone) |
          +------------------------------------+              +--------------------------+
                             |
                    sidecar protocol (WebSocket on the Pi, USB serial for the Atom)
                             |
        +--------------------+---------------------+
        | Python sidecar on Pi: lgpio, ALSA, Piper |   or   Atom Echo GPIO bridge firmware
        +--------------------------------------------+
```

Rules of the seam:

- The sidecar timestamps edges at the source (kernel timestamps on the Pi, `micros()` on the Atom) and sends raw edges. The engine decodes pulses from those timestamps. Network jitter cannot corrupt pulse timing.
- Audio: the sidecar streams 8 kHz mono PCM frames to the engine (for DTMF and STT) and plays audio it is sent. TTS (Piper) runs in the sidecar and is cached.
- The sidecar owns safety: ring sequence, RM duty limit, auto stop if the engine goes silent for a second, arm switch.
- The browser line simulates edges and audio itself. Variable robot lines use the browser's speech synthesis, fixed lines use the pre-rendered audio shipped in the repo. The hosted demo needs no API keys. If the LLM tier is on in the hosted demo at all, it goes through a rate-limited proxy and always has a fallback. Plan for it to be off.

Repo layout:

```
repo/
  .kiro/
    specs/        line-driver, decoder, director, scheduler, web-phone, virtual-caller
    steering/     product.md, telephony.md, content-style.md, tech.md, safety.md
    hooks/        (made in the Kiro hook UI)
    settings/     mcp.json
  engine/         TypeScript: line/, signal/ (pulse.ts, dtmf.ts), director/, schedule/
  sidecar/        Python (Pi): gpio, audio, tts, stt, ring safety
  firmware/       Atom Echo GPIO bridge (backup)
  web/            browser phone (rotary dial and keypad), builds to GitHub Pages
  content/        nodes/*.yaml, audio/human, audio/robot, audio/music
  mcp/            virtual-caller server, bench-line server
  tests/          traces/, property tests (fast-check), director sims
  docs/kiro-writeup-notes.md   appended by a hook
  LICENSE
```

## 3. Line interface

Events from the line: OFF_HOOK, ON_HOOK, EDGE(t_ns, level) raw, DIGIT(value, source pulse or dtmf, pulses, dial_pps, think_ms), SILENCE(ms), SPEECH(text, conf), RING_TIMEOUT.

Commands to the line: ring(cadence), stop_ring, play(source, barge_in), listen(seconds), arm_state.

Implementations: `sim` (tests, MCP), `web` (browser), `sidecar` (Pi or Atom).

### 3.1 Pulse decoder (from raw edges)

- Apply a 10 ms persistence rule to SHK edges (datasheet 3.11). Ignore transitions shorter than 10 ms.
- A loop break between about 20 and 120 ms counts as a pulse. Tune from the T5 bench traces.
- A burst ends after a gap of at least 250 ms. The number of breaks is the pulse count.
- A break longer than `hangup_ms` (start at 300 ms, tune) is ON_HOOK, not a pulse.
- Dial profiles: `standard` (N pulses = digit N, 10 pulses = 0) and `sweden_legacy` (N pulses = digit N minus 1). Calibration: "please dial zero".
- Metadata on every digit: pulses per second, and think time from end of prompt to first pulse.

### 3.2 DTMF decoder

Goertzel on the eight standard frequencies in 205-sample windows at 8 kHz. Accept a digit when the tone pair holds at least 40 ms with sane twist. Mute while a prompt plays unless barge-in is on. Pulse clicks must not become false digits. Property tests cover it.

### 3.3 Barge-in

Playback stops at the first break of a pulse burst, or the first DTMF tone. Old phones are dialed before the sentence ends.

## 4. The director (where "options really matter" lives)

A pool of storylets with state, not a tree.

State, persisted to JSON between calls and nights: dread, trust, patience (0 to 10), night, calls, hangups, silences, flags (set of strings such as `hung_up_on_it`, `answered_late`, `pressed_zero`, `was_rude`, `heard_human`), history of the last 20 node ids, the caller's average dial speed and think time.

Node format:

```yaml
- id: billing_02
  tag: menu_billing
  speaker: robot            # robot or human
  kind: tts                 # tts, recorded, llm
  say: "You have reached Thirdwatch billing. Your balance is {{balance_phrase}}."
  requires: { dread: ">=2", flags_absent: [named] }
  effects: { dread: +1, flags_add: [heard_billing] }
  weight: 3
  menu:
    "1": { tag: menu_main }
    "2": { tag: hold_long, effects: { patience: -1 } }
    "9": { tag: escape_attempt }
    timeout: { after_s: 12, tag: silence_comment }
    hangup: { tag: callback_sad, effects: { flags_add: [hung_up_on_it] } }
    say: { "help": { tag: human_helper } }       # deluxe, spoken options
- id: human_helper_01
  tag: human_helper
  speaker: human
  kind: recorded
  audio: audio/human/h_help_01.wav
  cut_at_ms: 4200
  requires: { trust: ">=1" }
  effects: { trust: +1, flags_add: [heard_human] }
  next: { tag: robot_override }
```

Selection: input names a tag, candidates are nodes with that tag whose `requires` pass, drop recently used, score by weight x novelty x closeness of target dread, seeded weighted random pick, apply effects, play. Every requestable tag has fallback nodes with no `requires`, so the loop cannot dead-end (checked by a property test). Escalation: night 1 polite, night 2 remembers (flags), night 3 and later the human voice appears, tries to help, and is cut off by the robot. Everything it "knows" comes from state: calls, dial speed, hesitation, hang-ups. Nothing outside the box.

Callback: when ON_HOOK arrives mid-call, the scheduler waits a random delay (8 seconds in demo mode), rings, and the first node carries a `callback_*` tag selected by flags.

Optional trick if it is free: the engine knows the cost of each digit in pulses for the connected profile, so a content tag `risky` can map onto the most expensive digit at runtime. Skip it unless it falls out of the design.

## 5. Tiers

| Tier | What | Needs network |
|---|---|---|
| 0 | Recorded human voice | no |
| 1 | Templated TTS (Piper on the Pi, speech synthesis in the browser) | no |
| 2 | LLM writes 1 to 2 sentences during hold music, 6 second timeout, always a fallback | yes |
| 3 | STT understands spoken replies (Vosk with a small grammar, Pi only) | no |

Guardrails (steering/safety.md): deadpan call-centre voice, two sentences at most, only supplied state variables, no threats against real people, no real personal data beyond the configured household name, no self-harm, no profanity, never claims to be a real company or person. Horror is bureaucratic, not violent. Pi 3 speed for Piper and Vosk is unmeasured. Measure on day 3. If uncached Piper takes over about 2 seconds per sentence, move the engine to the laptop (configuration B in the hardware doc).

## 6. Scheduler and safety

- Disarmed by default. The hardware ARM switch must be closed or nothing rings.
- Night window (default 23:00 to 05:00), random gaps, max 3 rings per night, ring burst 1 s on and 3 to 5 s off, auto-disarm after N nights.
- RM high duty cycle never above about 25 to 30 percent (the datasheet absolute maximum is 33). Enforced in the sidecar, not in the engine.
- Demo mode ignores the window and uses short delays. A "ring now" button and CLI command exist for the video.
- One phone, one house. State it in the README.

## 7. Kiro plan

### 7.1 Specs (EARS)

line-driver:
- WHEN SHK is high for at least 10 ms THE SYSTEM SHALL emit OFF_HOOK.
- WHEN ring is requested THE SYSTEM SHALL set RM high, toggle F/R at the configured frequency (20 to 25 Hz), and honor the cadence.
- WHEN off-hook is detected while ringing THE SYSTEM SHALL set F/R high, then set RM low more than 10 ms and less than 500 ms later.
- WHEN a ring ends for any reason THE SYSTEM SHALL leave F/R high and RM low.
- THE SYSTEM SHALL NOT drive PD.
- THE SYSTEM SHALL limit RM-high duty cycle to the configured maximum.
- IF the ARM input is open THE SYSTEM SHALL NOT ring.
- IF the engine has been silent for more than 1 s THE SYSTEM SHALL stop ringing.

pulse-dtmf-decoder:
- WHEN N breaks between 20 and 120 ms are followed by a gap of at least 250 ms THE SYSTEM SHALL emit a DIGIT mapped through the active profile.
- WHEN a break exceeds hangup_ms THE SYSTEM SHALL emit ON_HOOK and not count a pulse.
- WHERE the profile is sweden_legacy THE SYSTEM SHALL map 1 pulse to 0.
- WHEN a DTMF pair persists at least 40 ms THE SYSTEM SHALL emit DIGIT with source dtmf.

director, scheduler, web-phone, virtual-caller: same style, short.

### 7.2 Property-based testing (new in the rules, and a natural fit)

With fast-check:
- Decoder: any pulse train with timings inside tolerance decodes to the intended digit, for both profiles, with random jitter. Any train with a long break decodes to ON_HOOK.
- DTMF: random digit sequences with noise decode correctly, with pulse-click bursts injected and no false digits.
- Director: from any reachable state and any input sequence, a next node exists. `requires` is never violated. Human lines never play unless allowed. State stays inside bounds.
- Scheduler: RM duty never exceeds the limit for any random ring schedule.

Write-up gold: say which property found a bug that example tests missed.

### 7.3 Steering

`product.md` (voice, arc, personas), `telephony.md` (datasheet facts and rules, a draft is in telephony-steering-draft.md), `content-style.md` (loaded when editing content), `tech.md` (stack, pins, how to run), `safety.md`.

### 7.4 Hooks

1. On save of `content/nodes/*.yaml`: lint the graph, regenerate TTS cache for changed text.
2. On save of `engine/signal/**`: replay `tests/traces/` and run property tests.
3. On task completion in a spec: append an entry to `docs/kiro-writeup-notes.md`.
4. On commit: `make check`.

### 7.5 Custom agents

Two, both cheap and easy to write about:
- `line-engineer`: knows steering/telephony.md, edits engine/ and sidecar/, never touches content/.
- `haunt-writer`: knows product.md and content-style.md, edits only content/, must run the lint hook after each change.

### 7.6 MCP

`virtual-caller`: tools `dial(digits, style)`, `hangup`, `pickup`, `wait_for_audio`, `get_state`, `set_state`, `simulate_nights(n, strategy, seed)`, `coverage_report`. It lets Kiro play the product, find unreachable content and prove the loop never ends.

`bench-line` (optional, hardware): tools `ring(seconds)`, `read_hook(duration)`, `play(file)` over SSH to the Pi. Refuses unless ARM is closed. Kiro rings the real bell.

### 7.7 Powers and Kiro apps

Check the Powers list inside Kiro and use whichever ones help (TypeScript, testing, MCP building). Say honestly what you used. For the write-up, note which parts you built in the IDE and which in the CLI, and what differed. Kiro Crew: read what counts as a Crew app. Do not bend the project for it.

### 7.8 Write-up evidence, collected as you go

Spec-first git history, a vibe-versus-spec comparison on two comparable chunks, a hook catching a real content bug, a property test finding a real bug, coverage report before and after. Judges read for depth. Show it.

## 8. Mapping to the five judging criteria

- Potential Impact: a kit for haunted houses, escape rooms, museums and art installations. Any old phone becomes an interactive horror terminal. The hosted web version reaches anyone, no hardware.
- Technological Implementation: specs, property tests, hooks, custom agents, MCP that plays the product, powers.
- Design: a coherent product experience. The sound design is the interface. The web phone looks like an object, not a form.
- Innovation: judgment by the way you dial (hesitation, speed, hang-ups), storylet director with night-to-night memory, the callback. Credit Analog Redial and weeBell in the README for the line side. You build the director.
- Presentation: three minutes. Ring, pickup, hold music, human voice cut off by the robot, hang-up, callback. Device on screen.

## 9. Build order (start Nov 2, submit Dec 3)

1. Nov 2 to Nov 4: repo, license, steering, specs. Engine skeleton, sim line, web phone with pulse and keypad, five nodes. `make demo` works. Deploy to GitHub Pages early and keep it live.
2. Nov 5 to Nov 9: sidecar, real pulses from the Ericofon, ring and callback, hold music. T0 to T9 done. Measure Piper speed on the Pi 3 and decide A or B by Nov 9.
3. Nov 10 to Nov 16: content pool (about 25 nodes), recordings placed, persistence, escalation, lint hook, coverage MCP, property tests green.
4. Nov 17 to Nov 22: Tier 2 (LLM during hold) if it earns its keep, Tier 3 (STT) if the Pi can take it, DTMF polish.
5. Nov 23 to Nov 29: video script, shoot, edit. Write-up. README. Blog post and social post. Enclosure print.
6. Nov 30 to Dec 3: buffer, request the free Kiro credits before December 1, submit December 3.

Cut order if time runs out: STT, then LLM, then enclosure. Never cut: the hosted web phone, the recordings, the hardware demo, the write-up evidence.

## 10. Risks

- Content quality. Twenty-five sharp nodes beat eighty average ones.
- Pi 3 speed. Measure early.
- AG1171 with your bell. Bench steps in the hardware doc, and the ring sequence follows the datasheet to the letter.
- The requirement for a working-app URL. The browser phone is no longer a nice-to-have.
