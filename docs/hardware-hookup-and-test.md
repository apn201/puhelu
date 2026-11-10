# Hardware hookup and bench test v2: Raspberry Pi 3 + AG1171 + old phone

Source: Silvertel AG1171 datasheet V1.6 (Oct 2011), electrokit copy. Section numbers below refer to it. Things I could not read (the drawings) are marked DRAWING.

## 0. What changed from v1 (read this, it saves a module)

1. PD must NEVER be driven high. Datasheet pin 14: logic low powers the module down, "DO NOT put logic (H) on this pin". Leave PD unconnected. v1 had it on a push-pull output. Wrong.
2. F/R idles HIGH (forward). Ringing ends with F/R held high, then RM goes low. v1 left F/R low. Wrong.
3. At a 5 V supply, RM and F/R need a logic high of at least 3.5 V (section 8.3). The Pi's 3.3 V is not enough. The level shifter is required, not optional.
4. SHK is high when off-hook, and it has an internal 3.3k pull-up with a 100 uA output limit. My 10k/20k divider would have exceeded that. Use 56k/100k.
5. Supply current is real: up to 400 mA off-hook and 480 mA ringing at 5 V. Separate supply, 1 A minimum, 2 A comfortable.
6. Ringing RM duty cycle absolute maximum is 33 percent. Software must enforce it.
7. The overvoltage protection circuit (Figure 4) is the minimum Silvertel supports. Build it.
8. Pins 6, 7, 8 and 11 are NC. Do not connect anything to them.

## 1. Datasheet facts you will use

| Item | Value | Where |
|---|---|---|
| Package | 14 pin SIL, 2.54 mm pitch, use sockets | section 9 |
| Supply | 3.1 to 5.5 V recommended, 7.0 V absolute max, must be clean and regulated | 8.1, 8.2, 6 |
| Idle supply current (on-hook) | about 60 mA typ, 90 mA max at 5 V | 8.3 |
| Off-hook supply current | 290 mA typ, 400 mA max at 5 V (300 ohm load) | 8.3 |
| Ringing supply current | 330 mA typ, 480 mA max at 5 V (1 REN) | 8.3 |
| Power-down current | 7 mA max at 5 V | 8.3 |
| Line feed | internal 48 V battery, constant 30 mA loop current at 5 V | 3.2 |
| Ringing | RM high, toggle F/R at 20 to 25 Hz. About 65 Vrms no load, over 40 Vrms into 3 phones with tone ringers or 2 with mechanical bells | 3.3, 8.4 |
| Ring cadence in the datasheet figure | 1 s on, 3 s off | Figure 3 |
| RM high duty cycle | 33 percent absolute max | 8.1 |
| SHK | high = off-hook. Debounce 10 ms. 5 ms detect time. Pulses during dialing and during ring trip | 2, 3.11, 8.4 |
| SHK output | VOH 4.5 V min at 5 V supply, VOL 0.5 V max, 3.3k internal pull-up, 100 uA max | 8.3 |
| RM, F/R input levels at 5 V supply | VIH 3.5 V min, VIL 0.5 V max, input current within +/- 0.5 mA | 8.3 |
| RM, F/R input levels at 3.3 V supply | VIH 2.0 V min, VIL 0.5 V max | 8.3 |
| Audio | VIN via 10 nF, input impedance 60 kohm. VOUT via 100 nF, output impedance 10 ohm, load 10 kohm or more. 0 dB gain each way. 2-wire impedance 600 ohm | 2, 3.5 to 3.8, 8.4 |
| Audio level | 0 dBm = 0.775 Vrms. Distortion about 0.5 percent at +3 dBm, about 5 percent at +6 dBm | 8.4 |
| Wake-up from PD | 50 ms, logic outputs invalid meanwhile | 3.4 |
| Operating temperature | 0 to 70 C. Max dissipation 1.2 W off-hook | 8.1, 8.2 |
| Ring-trip reach | loop up to about 470 ohm including phone | 3.3 |

## 2. Ring sequence (the exact order, from section 3.3 and Figure 3)

Start ring:
1. RM high.
2. Toggle F/R at 20 to 25 Hz in the cadence (default 1 s on, then 3 to 5 s off).

On a ring-trip (SHK goes high while ringing):
1. Require SHK to stay high for 10 ms (persistence check), then treat it as off-hook.
2. Set F/R permanently HIGH.
3. Wait more than 10 ms, but less than 500 ms from detection, then set RM LOW.

Normal end of a ring burst with nobody answering:
1. Stop toggling, F/R high.
2. More than 10 ms later, RM low.

Between rings: RM low, F/R high. Never leave RM high. Enforce RM duty at or below 25 to 30 percent over any rolling window.

## 3. Parts

- Raspberry Pi 3 with its own 2.5 A supply
- Silvertel AG1171, in a 2.54 mm socket
- Separate regulated 5 V supply, 1 A minimum (2 A is comfortable). Measure it under load. It must read 5.5 V or less. Abs max is 7.0 V and cheap adapters float high with no load
- 74AHCT125 or 74HCT125 (or equivalent, powered from the 5 V supply), for RM and F/R
- 10k resistors: pull-down on the RM input, pull-up on the F/R input of the buffer
- SHK divider: 56k from SHK to the Pi pin, 100k from the Pi pin to ground
- Figure 4 protection and decoupling parts (DRAWING, copy it exactly): 100 nF x2, 10 nF x1, 470 uF 16 V electrolytic, D1 82 V transient suppressor (BZT03C82 or P6KE82), D2-D5 1N4004 or an MB4S bridge, D6 1N4148 or BAS16. R1 (CLI bias) is not needed
- USB sound card with line-in or mic-in
- ARM switch
- 3-pin plug breakout for the Ericofon

The Figure 4 netlist (which diode connects where, and which way round) is written out at the end of minimal-test-rig.md. Check the diode bars against the datasheet drawing before power-up.

## 4. Wiring

```
5V supply A (1-2A) ---+--- 470uF + 100nF (at the module) --- pin 13 +VPWR
                      +--- GND ----------------------------- pin 12 GNDPWR
Pi 3 (own supply B)
 GPIO17 --[AHCT125 gate 1]--> pin 4  RM       (10k pull-down on gate input)
 GPIO27 --[AHCT125 gate 2]--> pin 3  F/R      (10k pull-up on gate input)
 GPIO23 <--[56k]--+--[100k]--GND --- pin 5  SHK
 GPIO24 <-- ARM switch to GND (internal pull-up)
 pin 14 PD: not connected
 pins 6 7 8 11: not connected
 pin 9  VIN  <-- 10 nF <-- sound card line-out
 pin 10 VOUT --> 100 nF --> sound card input
 pin 1 RING (B), pin 2 TIP (A) --> Figure 4 protection --> phone plug line pair
All grounds joined: supply A, Pi, buffer, sound card, GNDPWR.
```

Notes:

- Both AHCT125 output enables tied low. Buffer powered from the 5 V supply, not from the Pi.
- Do not power the SLIC from the Pi header. Ringing draws up to 480 mA.
- The buffer inputs have defined states at boot, so a Pi that is resetting cannot ring the phone.
- Keep audio wires short. The SLIC's DC/DC converter is a noise source. If you hear whine, optional capacitors of 1 to 10 nF from Tip and Ring to ground may help (sections 6, 7.1).
- 3.3 V alternative: run the SLIC from a regulated 3.3 V rail (1 A or more, buck module set and measured before connecting). Then RM, F/R and SHK are all 3.3 V compatible and you drop the buffer and divider. Currents are a little higher (up to 450 mA off-hook, 500 mA ringing). I would still start with 5 V, because a wrongly set buck costs more than one 74AHCT125.

## 5. Audio levels

- Pin 9 (VIN): the datasheet wants 10 nF in series and says the input impedance is 60 kohm. A line-out is fine. Start with the ALSA volume low (20 percent) and keep the signal below 0 dBm, about 0.775 Vrms.
- Pin 10 (VOUT): 100 nF in series, load must be 10 kohm or more. If the sound card has a true line-in, connect directly after the cap. If the card only has a mic input, use a divider such as 47k in series and 1k to ground after the cap (mic inputs expect millivolts). Tune on the bench.
- Echo: the hybrid reflects some of the output (transhybrid loss 12 to 21 dB depending on frequency). Do not build echo cancellation. The software plays, then listens.

## 6. Find the line pair on the Ericofon plug

Power off, SLIC not connected. Multimeter on resistance.

1. Probe each pair of the three pins with the handset on its cradle. The bell is capacitor-coupled, so the line pair should read open at DC.
2. Lift the handset. The pair that drops to a low resistance is the line pair. Note which two pins.
3. The third pin: leave it alone. If the bell turns out to hang on the third pin, the fix is a jumper in your adapter. The phone stays closed.
4. Rotate the dial and release while watching the same pair. You should see open/closed bursts. That is the pulse contact.

## 7. Software for the bench

```
sudo apt update
sudo apt install -y python3-lgpio sox alsa-utils
```

Tonight's scripts are inside the Kiroween submission window (it started October 30), so they may go in the repo. Better for the write-up: let Kiro regenerate them from your spec tomorrow and keep these as the reference.

### 7.1 bench_shk.py (print every SHK edge)

```python
#!/usr/bin/env python3
import lgpio, time

SHK = 23
h = lgpio.gpiochip_open(0)
lgpio.gpio_claim_input(h, SHK, lgpio.SET_PULL_DOWN)
last = [None]

def cb(chip, gpio, level, ts_ns):
    prev = last[0]
    dt = "" if prev is None else f"{(ts_ns - prev) / 1e6:9.1f} ms"
    flag = "  <10ms: glitch" if prev is not None and (ts_ns - prev) < 10e6 else ""
    print(f"{'HIGH(off-hook)' if level else 'LOW (on-hook)'} {dt}{flag}")
    last[0] = ts_ns

cbk = lgpio.callback(h, SHK, lgpio.BOTH_EDGES, cb)
try:
    while True:
        time.sleep(1)
finally:
    cbk.cancel()
    lgpio.gpiochip_close(h)
```

No hardware debounce on purpose. The decoder applies the 10 ms persistence rule from the datasheet in software using the kernel timestamps.

### 7.2 bench_ring.py (ring with the datasheet sequence)

```python
#!/usr/bin/env python3
import lgpio, time

RM, FR, SHK = 17, 27, 23
h = lgpio.gpiochip_open(0)
lgpio.gpio_claim_output(h, RM, 0)     # RM low when idle
lgpio.gpio_claim_output(h, FR, 1)     # F/R HIGH when idle (forward)
lgpio.gpio_claim_input(h, SHK, lgpio.SET_PULL_DOWN)

def ring(on_s=1.0, freq=25):
    lgpio.gpio_write(h, RM, 1)
    lgpio.tx_pwm(h, FR, freq, 50)
    t0 = time.monotonic()
    high_since = None
    answered = False
    while time.monotonic() - t0 < on_s:
        if lgpio.gpio_read(h, SHK):
            if high_since is None:
                high_since = time.monotonic()
            elif time.monotonic() - high_since >= 0.010:   # 10 ms persistence
                answered = True
                break
        else:
            high_since = None
        time.sleep(0.001)
    lgpio.tx_pwm(h, FR, freq, 0)       # stop toggling
    lgpio.gpio_write(h, FR, 1)         # F/R permanently high
    time.sleep(0.02)                   # RM low only after more than 10 ms
    lgpio.gpio_write(h, RM, 0)         # and well inside 500 ms
    return answered

try:
    for i in range(5):
        print(f"ring {i + 1}")
        if ring():
            print("picked up")
            break
        time.sleep(4.0)                # 1 s on, 4 s off: duty 20 percent
finally:
    lgpio.gpio_write(h, FR, 1)
    lgpio.gpio_write(h, RM, 0)
    lgpio.gpiochip_close(h)
```

PD is not used anywhere. Do not add it.

## 8. Test sequence

| Step | What | Pass |
|---|---|---|
| T0 | Line-pair check (section 6), SLIC not connected | Pair identified |
| T1 | Power the SLIC alone from a current-limited supply (limit 600 mA), no phone, RM low, F/R high | Idle current in the 60 to 90 mA region at 5 V. Module warm at most |
| T2 | Meter on Tip to Ring with power off, probes clipped, then power on. Stay hands off | A DC voltage in the tens of volts on-hook (the 48 V class, it adjusts). Not 0, not wild |
| T3 | Connect the phone. Meter on the SHK divider output, lift the handset | Reads about 3 V when off-hook, about 0 V on-hook. Never above 3.3 V |
| T4 | Run bench_shk.py, lift and replace | Clean edges, chatter under 10 ms flagged but rare |
| T5 | Dial 1, 0, 5, 9 with bench_shk.py running (section 9) | Pulse counts and break durations captured |
| T6 | Run bench_ring.py | Bell rings, stops promptly on pickup, SHK reads high after |
| T7 | After a ring, dial again | Pulses still count correctly |
| T8 | Audio tone out, speech in (section 10) | Tone in the earpiece, voice in the recording, no screech |
| T9 | 50 ring cycles | Supply steady, module not hot, Pi stays up |

If the bell sounds weak or buzzy, try 20 Hz against 25 Hz. The module shapes the edges for 20 to 25 Hz (section 3.3).

## 9. Pulse capture

Dial 1, 0, 5, 9, three times each, paste the printed deltas into pulse_traces.txt. These become the golden test traces for the decoder.

- Break duration per pulse: expect tens of ms, rate near 10 pulses per second.
- Gap between digits: hundreds of ms.
- Swedish dial check: dial 0. One pulse means legacy Swedish layout (digit = pulses minus 1). Ten pulses means standard. Dial 1 as a second check: two pulses confirms legacy.
- Note the longest break that is still a pulse. Anything much longer will be your hang-up threshold.

## 10. Audio check

```
sox -n -r 8000 -c 1 -b 16 tone1k.wav synth 3 sine 1000 vol 0.1
aplay -D plughw:1 tone1k.wav
arecord -D plughw:1 -f S16_LE -r 8000 -c 1 -d 5 rec.wav
sox rec.wav -n stat
```

Raise volume gradually. For DTMF later, record a smartphone DTMF dialer held to the mouthpiece and check `sox rec.wav -n spectrogram`.

## 11. Backup hardware plans

The software keeps hardware behind one seam (a "line sidecar" speaking JSON over a socket or serial port, see the software plan). That makes the backups cheap.

A. Primary: Pi 3 does everything. Sidecar and engine on the Pi.

B. Pi 3 too slow for TTS or STT: engine moves to the laptop, the Pi runs only the sidecar (GPIO and audio streaming over the network). Same code, a config change. Decide by Nov 9 based on measured Piper speed.

C. Pi 3 dies: the M5Stack Atom Echo becomes a three-pin GPIO bridge on USB serial. Check its pinout first, since the on-board mic and speaker use some pins internally and you only need RM, F/R and SHK plus ground. It runs a few dozen lines of firmware: timestamp SHK edges, run the ring sequence, enforce RM duty, and stop ringing if the laptop stops talking for a second (a watchdog, so a crashed laptop cannot leave RM high). Audio goes through a USB sound card on the laptop. The same level shifting applies, since the ESP32 is 3.3 V and the SLIC is on 5 V.

The laptop on its own cannot drive RM or F/R. It always needs the Pi or the Atom for the GPIO.

## 12. Things that will bite you

- Never drive PD. Never leave RM high.
- The SLIC supply: clean, regulated, 5.5 V or less.
- Box it with ventilation, but keep it at or above 0 C.
- Line side is live (48 V DC on-hook feed, about 65 Vrms ringing). No house wiring, only this phone.
- Keep the Ericofon reversible. No cutting.
