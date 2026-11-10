# UNO Q build phases: connect it, program it, test it

Decision: the Arduino UNO Q is the product. Nothing gets built on the UNO R3 or the Pi 3. Everything below is built once and kept. Parts that appear in an early phase stay in the final box.

This file replaces the Pi 3 and sidecar parts of software-and-kiro-plan.md and hardware-hookup-and-test.md. The datasheet rules, the ring sequence, the Figure 4 netlist and the director design stay as written.

## 0. What the Q is, as it affects the plan

- Two processors. Debian Linux on the Qualcomm QRB2210 (the "MPU"). Your Arduino sketch on the STM32U585 (the "MCU", Zephyr underneath). They share no memory. They talk through the Router Bridge.
- An App Lab "App" is a folder with `sketch/sketch.ino` (MCU) and `python/main.py` (Linux).
- Bridge calls: Python uses `from arduino.app_utils import App, Bridge`, with `Bridge.provide`, `Bridge.call`, `Bridge.notify`. The sketch uses `#include <Arduino_RouterBridge.h>`, `Bridge.begin()`, `Bridge.provide`, `Bridge.call`, `Bridge.notify`. These come from the Arduino examples and forum posts. Check the exact signatures against the App Lab examples when you open them.
- MCU pins are 3.3 V logic and 5 V tolerant, except A0 and A1.
- One USB-C port. Needs a hub with PD input if you want power, sound card and keyboard together.
- Python apps run in a Docker container on the Linux side. System tools may not be visible from inside it. USB audio adapters show up in Linux as ALSA devices. App Lab has a USBSpeaker class and a WaveGen brick, and forum reports say they are not very stable. A reported workaround is a small host-side service that the container calls over the Docker bridge address (172.17.0.1).
- Access: App Lab on the laptop over USB or Wi-Fi, then SSH once set up (`arduino@<name>.local`) or ADB over USB. `arduino-app-cli app start <app>` starts apps from a terminal.

## 1. Architecture on the Q

```
 laptop (Kiro, repo)
    | scp / arduino-app-cli / App Lab
    v
 UNO Q
   MCU (STM32, sketch)                 MPU (Debian, Linux)
   - SHK edge timestamps (micros)      - sidecar (Python, App Lab app)
   - ring state machine                    - Bridge client
   - RM duty limit, watchdog               - audio: play / record (ALSA, USB)
   - ARM switch                            - Piper TTS, Vosk STT
   - drives RM, F/R                        - WebSocket server for the engine
   - LED matrix                        - engine (Node, TypeScript, host service)
                                           - director, decoder, scheduler
```

Rules:

- Time-critical and safety-critical logic lives on the MCU: edge timestamps, ring sequence (F/R high, then RM low more than 10 ms later and inside 500 ms), RM duty, and a watchdog that ends any ring if Linux goes quiet for 1 s. The ARM switch is read by the MCU, so a Linux crash cannot ring the phone.
- Edge timestamps come from the MCU clock. The engine only uses relative timing (break lengths, gaps). Bridge delay cannot bend a pulse.
- The engine is the same TypeScript as the hosted web phone. It runs on the Q as a plain Node service on the Debian host. This is a Phase 0 spike (can Node run there, and can it reach the Python app?). If it fails, a fallback is to run the engine inside the Python app's container, if Node can be installed there, or to talk to the sidecar over a published port.

Bridge interface (MCU and Python):

- MCU to Python (notify): `edge(t_us, level)`, `ring_end(reason)`, `armed(state)`
- Python to MCU (call): `ring(freq_hz, on_ms)`, `ring_stop()`, `keepalive()`, `set_matrix(...)`

## 2. Pin map (suggested, UNO header)

| Signal | Q pin | Notes |
|---|---|---|
| SHK in | D2 | direct from module pin 5, 5 V tolerant, never A0 or A1 |
| F/R out | D6 | through the 5 V buffer (Phase 4), 10k pull-up to 5 V at the module |
| RM out | D7 | through the 5 V buffer (Phase 4), 10k pull-down to GND at the module |
| ARM in | D4 | switch to GND, INPUT_PULLUP |
| Beep out | D9 | optional PWM beep (Phase 2a), if PWM and `tone()` exist on the core |
| Avoid | D0, D1 | serial pins |

## 3. Wiring that never changes

All of this is built in Phase 1 and stays:

- Module pin 13 (+VPWR) to a separate 5 V supply, 470 uF and 100 nF from pin 13 to pin 12 at the module.
- Pin 12 (GNDPWR) to supply ground and to a Q GND header pin. One ground point.
- Pin 14 (PD) unconnected. Pins 6, 7, 8, 11 unconnected.
- Pin 5 (SHK) to D2.
- Pin 4 (RM): 10k from this pin to GND.
- Pin 3 (F/R): 10k from this pin to the 5 V supply.
- Pin 1, 2: to the phone plug line pair.

The two pull resistors hold the module in its safe idle state (RM low, F/R high) before and during boot, and stay in place when the buffer is added later.

## 4. Phases

### Phase 0: Q bring-up (today, no SLIC)

Goal: know the platform before you trust it.

1. Power the Q from the laptop USB-C. Install App Lab. Run first setup (Wi-Fi, SSH). Update the board image if the docs say so.
2. Run Arduino's "Blink LED from Python" example.
3. Spikes. Write each answer down in `docs/q-spikes.md`:

| Spike | Question | Pass |
|---|---|---|
| S1 | Bridge round trip Python to sketch and back | A call returns a value, a notify arrives |
| S2 | Can you SSH in and use `arduino-app-cli app start` | Yes |
| S3 | Install Node on the Debian host | `node -v` works |
| S4 | Can Node on the host reach a Python app in the container | One byte over a socket |
| S5 | USB sound card through a hub: `aplay -l`, play a tone, record | Tone heard, recording non-silent |
| S6 | Same, but from inside an App Lab app (USBSpeaker, or via 172.17.0.1) | One route works. Note which |
| S7 | Piper speaks a sentence. Time it | Seconds per sentence recorded |
| S8 | Does `tone()` or analogWrite PWM exist for a pin | Yes or no |
| S9 | Does the Kiro CLI install and run on the board | Optional. Yes or no |

Timebox 2 to 3 hours. If S3 or S4 fail with no workaround, the engine moves to a laptop and the Q stays the sidecar (still fine for development, not for the final product). If S6 fails in every form, audio goes through a host service. Decide on the spot.

### Phase 1: hook and dial pulses (SLIC on, no audio, no ringing)

Parts needed: what you already have. SLIC, charger, caps, two resistors, phone.

Wiring: section 3. VIN, VOUT and the control lines from the MCU are not connected yet.

Program (sketch + Python, from Arduino's pattern):

```cpp
// sketch/sketch.ino
#include <Arduino_RouterBridge.h>

const uint8_t PIN_SHK = 2;
volatile uint32_t edgeT[64];
volatile uint8_t edgeL[64];
volatile uint8_t head = 0, tail = 0;

void onEdge() {
  uint8_t next = (head + 1) & 63;
  if (next != tail) {
    edgeT[head] = micros();
    edgeL[head] = digitalRead(PIN_SHK);
    head = next;
  }
}

void setup() {
  pinMode(PIN_SHK, INPUT);
  attachInterrupt(digitalPinToInterrupt(PIN_SHK), onEdge, CHANGE);
  Bridge.begin();
}

void loop() {
  while (tail != head) {
    uint32_t t = edgeT[tail];
    uint8_t l = edgeL[tail];
    tail = (tail + 1) & 63;
    Bridge.notify("edge", t, l);
  }
}
```

```python
# python/main.py
from arduino.app_utils import App, Bridge

last = None

def edge(t_us, level):
    global last
    dt = "" if last is None else f"{((t_us - last) & 0xFFFFFFFF) / 1000:9.1f} ms"
    print(f"{'HIGH (off-hook)' if level else 'LOW  (on-hook)'} {dt}", flush=True)
    last = t_us

Bridge.provide("edge", edge)
App.run()
```

If the Bridge complains about integer types, cast to int or send the timestamp as a string. Debounce is done later in the decoder (10 ms persistence, datasheet 3.11). Do not debounce here, you want the raw trace.

Tests:

| Step | Do | Pass |
|---|---|---|
| 1.1 | SLIC supply off. Phone connected. Check wiring with a meter | No shorts, pin 14 open |
| 1.2 | Power the Q, then the SLIC supply | Idle supply current about 60 to 90 mA at 5 V |
| 1.3 | Lift and replace the handset | HIGH on lift, LOW on replace |
| 1.4 | Dial 1, 0, 5, 9 three times each | Pulse counts and break times captured |

Save the console output as `tests/traces/<phone>-<digit>.txt`. This is the golden test data. Dial 0 and compare counts: 1 pulse means sweden_legacy, 10 means standard.

Needs Figure 4? No. No ringing and no long cables in this phase.

### Phase 2: audio into the handset

2a (optional, only if S8 says yes): a 425 Hz beep from the MCU when SHK is high. Wire D9 through 10k to a node, 1k from the node to GND, 10 nF from the node to module pin 9 (VIN). At 3.3 V drive the divider gives about 0.3 Vpp, safe for the module. Pass: tone in the earpiece when you lift the handset.

2b (the real path): a USB sound card on the hub, line-out through 10 nF to VIN. Use only one source on VIN at a time. Python plays a WAV (Piper's "Your call is important to us") into the handset. Pass: you hear it clearly, no screech. Keep the volume at 20 percent first, below 0 dBm (0.775 Vrms).

Needs Figure 4? No.

### Phase 3: mic path and decoding on Linux

Wiring: module pin 10 (VOUT) through 100 nF to the sound card input, with a divider if it is a mic input (47k in series, 1k to GND after the cap, tune it). VOUT needs a load of 10 kohm or more.

Program: Python records 8 kHz mono. The engine's pulse decoder (TypeScript, from the golden traces) decodes digits from the edge stream. A DTMF test: a smartphone dialer held to the mouthpiece, decoded from the recording.

Pass:

- Voice into the mouthpiece appears in the recording.
- Dialing 1, 0, 5, 9 decodes correctly on the right profile, including a slow dial and a fast dial.
- DTMF digits decode and pulse clicks do not create false digits.

Needs Figure 4? No.

This is the first time the engine and the hardware talk. Phase 3 ends with "call the phone from the web phone's code path".

### Phase 4: the MCU takes over RM and F/R

Parts needed: 74AHCT125 or 74HCT125 (DIP, powered from the 5 V supply, OE pins tied low). Without one, two NPN transistors with 10k pull-ups to 5 V work, but they invert and RM will glitch high for a moment at boot.

Wiring: D7 to the RM gate input, D6 to the F/R gate input. Buffer outputs to module pins 4 and 3. The 10k resistors from section 3 stay at the module pins.

Program: sketch sets F/R high and RM low first thing in setup. Bridge functions `ring_stop()` and `keepalive()` exist, `ring()` still refuses (no Figure 4 yet).

Tests:

| Step | Do | Pass |
|---|---|---|
| 4.1 | Meter on module pin 4 and pin 3 at power-up, at reset, and with the sketch not yet running | RM low, F/R high every time, even during reset |
| 4.2 | Toggle from Python via a test call | Pins follow, RM never high for more than the test |
| 4.3 | Pull the USB cable while a test call holds RM high | The watchdog drops RM within 1 s |

### Phase 5: Figure 4 and ringing

Parts needed: four 1N4004 (or an MB4S), one P6KE82 or BZT03C82. Build the netlist at the end of minimal-test-rig.md. Check the diode bars against the datasheet drawing before power.

Tests, in order:

1. Current-limited supply (600 mA). Phone disconnected. Idle current is still 60 to 90 mA. A backwards diode shows as a big current.
2. Meter node X to GND: tens of volts.
3. Phone connected, lift test as before.
4. Ring. Sequence exactly as in hardware-hookup-and-test.md section 2, running on the MCU. Ring-trip: lift while ringing, F/R goes high, RM drops 20 ms later, `ring_end("answered")` arrives in Python.
5. RM duty: a random ring schedule never exceeds the limit. Test on the bench with a scope or a logic analyzer if you have one, otherwise with the MCU's own log.
6. ARM switch open: `ring()` returns refused.
7. 50 ring cycles with temperature checks.

### Phase 6: everything connected

- The sketch is final. The Python sidecar is final.
- The engine runs on the board (Node). The director picks nodes. The scheduler runs at night.
- Demo mode and the web phone work from the same engine.
- LED matrix shows ring, call time and dread level, and optionally the eyes from your Piccolino sketch.
- Pass: the 3-minute video can be shot end to end from a power cycle.

### Phase 7: the box

- Power: either USB-C PD to the Q, or a 12 V supply into VIN (the board accepts 7 to 24 V) and a small 5 V buck for the SLIC. Check that USB host mode still works when the board is powered from VIN. That decides the final power layout.
- A perfboard shield on the UNO headers with the SLIC socket, Figure 4 parts, buffer, ARM switch and a status LED.
- Enclosure: ventilated, no exposed line-side terminals, reversible phone connection.
- Operating temperature 0 to 70 C per the SLIC datasheet.

## 5. How Kiro fits each phase

| Phase | Spec | Hook or check | Evidence for the write-up |
|---|---|---|---|
| 1 | line-driver: edges | on save of sketch, compile with the Arduino CLI | raw traces committed |
| 3 | pulse-dtmf-decoder | replay traces, property tests | decoder bugs found by properties |
| 4 | line-driver: boot-safe states | on save of sketch, lint that RM and F/R defaults are set in setup | scope or meter screenshots |
| 5 | ring safety | duty-cycle property test | before and after |
| 6 | director, scheduler | content lint, coverage MCP | coverage reports |

`bench-line` MCP: tools that call `arduino-app-cli` over SSH (`ring`, `read_hook`, `play`). Refuses unless ARM is closed. Kiro rings the real bell.

Deploy flow: edit in the repo on the laptop, copy the App folder to the board with scp, `arduino-app-cli app start <app>`. Check the App folder location on the board with `arduino-app-cli app list`.

## 6. Order today

- 74AHCT125 or 74HCT125, DIP-14
- 4 x 1N4004 (or an MB4S) and 2 x P6KE82 (or BZT03C82)
- USB-C hub with PD pass-through and a USB-A port, if you have none
- USB audio adapter with microphone and headphone jacks
- Perfboard or a UNO proto shield, 14-pin 2.54 mm socket strips
- A 5 V supply of 2 A or more for the SLIC, if the charger is smaller

## 7. Schedule (today is Nov 4)

- Nov 4 to 5: Phase 0 and Phase 1.
- Nov 6 to 8: Phase 2 and Phase 3. Repo, license, steering, specs in parallel.
- Nov 9 to 12: Phase 4 and 5 as parts arrive.
- Nov 13 to 22: Phase 6, content, recordings.
- Nov 23 to 29: video, write-up, box.
- Nov 30 to Dec 3: buffer, submit Dec 3.

## 8. Risks specific to the Q

- Platform novelty. The Bridge, App Lab's container and USB audio each have rough edges in forum reports. Phase 0 exists to find them early.
- Audio from inside the App Lab container is the biggest unknown. Have the host-service route ready.
- The Zephyr-based core may not have every Arduino function (`tone()`, some timers). Phase 0 spike S8 checks this.
- Node on the board is unverified until S3 and S4.
