---
inclusion: always
---

# Telephony rules for this project

Drop this in `.kiro/steering/telephony.md` once the repo exists. Facts come from the Silvertel AG1171 datasheet V1.6. If anything here disagrees with the datasheet, the datasheet wins and this file gets fixed.

## Hardware

- SLIC: Silvertel AG1171, powered from a separate regulated 5 V supply (3.1 to 5.5 V allowed, 7.0 V absolute maximum).
- Host: Arduino UNO Q. The STM32 MCU runs the sketch (edge timestamps, ring sequence, RM duty limit, watchdog, ARM switch). The Linux side runs the Python sidecar, audio, TTS and the engine. Logic is 3.3 V, pins are 5 V tolerant except A0 and A1. Bridge calls connect the two sides.
- Pins (module): 1 RING(B), 2 TIP(A), 3 F/R, 4 RM, 5 SHK, 9 VIN, 10 VOUT, 12 GNDPWR, 13 +VPWR, 14 PD. Pins 6, 7, 8, 11 are NC and stay unconnected.
- UNO Q pins (suggested): SHK D2, F/R D6, RM D7, ARM D4. Never use A0 or A1 for 5 V signals. RM and F/R go through a 5 V buffer. Pull-ups and pull-downs at the module: 10k from RM to GND, 10k from F/R to 5 V.

## Signal rules (never violate)

- PD is never driven. Never set it high. Leave it unconnected.
- RM is high only during ringing. Low at all other times.
- F/R idles high (forward). It toggles at 20 to 25 Hz only while ringing.
- SHK high means off-hook. Require 10 ms persistence before acting on any SHK edge.
- RM high duty cycle stays at or below about 25 to 30 percent (datasheet absolute maximum is 33).
- Control inputs need 3.5 V or more for a logic high at a 5 V supply. The UNO Q's 3.3 V MCU pins need the 74AHCT125 buffer for RM and F/R.
- SHK output has a 3.3k pull-up and 100 uA limit. The MCU reads it through a 56k/100k divider (or directly if the pin is 5 V tolerant, check the Phase 0 notes).

## Ring sequence

1. RM high.
2. Toggle F/R at the configured frequency (default 25 Hz). Cadence default 1 s on, 3 to 5 s off.
3. On ring-trip (SHK high for at least 10 ms): set F/R high, wait more than 10 ms, set RM low. Total within 500 ms of detection.
4. On a normal end of ring: stop toggling, F/R high, wait more than 10 ms, RM low.

## Audio

- VIN (pin 9) through 10 nF. VOUT (pin 10) through 100 nF, load 10 kohm or more.
- 0 dBm is 0.775 Vrms. Keep levels below that. Distortion rises above +3 dBm.
- Half-duplex only: play, then listen. No echo cancellation.
- Sample rate 8 kHz, mono, 16 bit.

## Dialing

- Pulse dial: SHK breaks. Burst ends after at least 250 ms with no break. Pulse breaks roughly 20 to 120 ms (tune from tests/traces). A much longer break is a hang-up.
- Profiles: `standard` (N pulses = digit N, 10 = 0) and `sweden_legacy` (N pulses = digit N minus 1, so 1 pulse = 0). The Ericofon is Swedish. Calibrate by asking the caller to dial zero.
- DTMF: Goertzel, 8 frequencies, 205-sample windows, at least 40 ms to accept.
- Both must work. Rotary is the primary target.

## Safety

- The line side carries about 48 V DC on-hook and about 65 Vrms while ringing. Treat the plug as live whenever the SLIC is powered.
- Only the one phone is connected. Never house wiring.
- Ring only if ARM is closed. The sidecar stops ringing if the engine stays silent for 1 s.
- Do not open or modify the Ericofon.

## Prior art to credit in README

Analog Redial (sdylewski) and weeBell (Dan Julio) built the line side with the same SLIC. This project's contribution is the director, the hold-and-callback haunting, and the hosted web phone.
