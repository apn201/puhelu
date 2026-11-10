# Minimal AG1171 test rig: Arduino UNO + breadboard

Goal: hear a tone in the Ericofon earpiece and see dial pulses on the Serial monitor. Nothing else. No Pi, no sound card, no Figure 4 parts.

## What this rig skips, honestly

Silvertel says the Figure 4 overvoltage circuit is the minimum protection for real use, and they will not support the module without it. For a first test with one phone on short leads, no ringing, the exposure is mainly static when you handle the module. So:

- Part 1 (audio and dialing) runs without Figure 4. Touch a grounded object before you touch the module.
- Ringing waits until Figure 4 is built. The sketch has ringing disabled until you flip `RING_ENABLED`. A bell's inductive kick at the end of a ring is exactly what the 82 V suppressor is for.
- LEDs cannot stand in for the diodes. An LED blocks only about 5 V in reverse, and the line carries about 48 V DC and ringing peaks near 90 V. They would die and take your test with them.

If your parts bin has no suitable diodes, order today: one P6KE82 (or BZT03C82) 82 V suppressor and four 1N4004 (or an MB4S bridge). A few cents each. The exact Figure 4 wiring is in the last section of this file. Do not use 1N4148 for D2 to D5: it only blocks 100 V and ringing peaks near 90 V.

## Parts for part 1

- AG1171 module, in a 14-pin 2.54 mm socket or strip
- Arduino UNO (5 V logic, so no level shifter needed)
- 5 V USB charger, 1 A or more, with a breadboard-friendly cable or breakout. Measure it: must read 5.5 V or less
- 470 uF capacitor (16 V or higher) and 100 nF ceramic, at the module supply pins
- 10 nF capacitor (audio coupling into VIN)
- Resistors: 10k x3 (RM pull-down, F/R pull-up, tone divider top), 1k (tone divider bottom)
- Jumper wires, two alligator clips for the phone plug pins
- The phone, with its line pair identified (T0 in the hardware doc)
- Optional mic path: one more 100 nF, two 100k resistors

Do not power the SLIC from the UNO's 5 V pin. Off-hook it draws 300 to 400 mA, which trips USB protection or browns out the UNO.

## Wiring

Module pins, counting from pin 1 (RING) as in the datasheet.

| Module pin | Name | Connect to |
|---|---|---|
| 1 | RING (B) | phone plug line pair, wire A |
| 2 | TIP (A) | phone plug line pair, wire B |
| 3 | F/R | UNO D6, plus 10k from this node to 5 V (pull-up) |
| 4 | RM | UNO D7, plus 10k from this node to GND (pull-down) |
| 5 | SHK | UNO D2 (direct, UNO reads it fine) |
| 6, 7, 8, 11 | NC | nothing |
| 9 | VIN | 10 nF to the tone node (see below) |
| 10 | VOUT | nothing, or optional mic path |
| 12 | GNDPWR | GND |
| 13 | +VPWR | charger 5 V, with 470 uF and 100 nF from here to pin 12, as close to the module as you can |
| 14 | PD | nothing, never connect |

Tone node: UNO D8 through 10k to a node. From that node, 1k to GND, and 10 nF in series from that node to module pin 9. This divides the UNO's 5 V square wave to about a tenth, which keeps it under the 0 dBm limit (0.775 Vrms).

Optional mic path: module pin 10 through 100 nF to UNO A0. Bias A0 with 100k to 5 V and 100k to GND.

All grounds meet in one point: charger GND, UNO GND, module pin 12.

Breadboard note: the module's pins sit in separate 5-hole strips, so each pin gets its own strip. Run the phone leads out from the pin 1 and 2 strips with jumper wires to alligator clips. Keep fingers off those two strips when the supply is on.

## Power-up order

1. Everything wired, charger unplugged, phone clipped to the plug pair.
2. Plug the UNO into your PC and upload `ag1171_minitest.ino`. It sets F/R high and RM low first thing. Open the Serial monitor at 9600.
3. Plug in the charger for the module.
4. If you have a multimeter in series with the supply: expect roughly 60 to 90 mA at idle. Well above 150 mA, unplug and recheck the wiring.

Never connect or disconnect the phone while the supply is on.

## Tests

| Step | Do | Expect |
|---|---|---|
| 1 | Lift the handset | Serial prints `OFF-HOOK`, steady 425 Hz tone in the earpiece |
| 2 | Hang up | `ON-HOOK`, tone stops |
| 3 | Lift, dial 1 | Tone stops at first movement, Serial prints pulses, both profile readings, and break times. Beeps back the pulse count |
| 4 | Dial 0 | Compare pulse counts: 1 pulse means sweden_legacy, 10 means standard. Note the break times |
| 5 | Lift, send `b` in Serial | 1 kHz beep for 1 s |
| 6 | Optional: send `m` while talking into the mouthpiece | Peak-to-peak counts jump over the quiet reading |

Save the Serial output from steps 3 and 4. Those break times are your first real decoder test data.

## If it does not work

- No `OFF-HOOK` when lifting: line pair wrong, or the pair has an open (plug contact). Recheck T0 with the meter. Confirm SHK reaches D2 and module pin 5, by reading D2 with the multimeter (about 5 V off-hook).
- `OFF-HOOK` but silence: check D8, the 10k/1k divider, the 10 nF into pin 9. Try `b` while lifted. Check that the earpiece works at all with a 1.5 V battery click.
- Tone present but fuzzy: the divider may be too hot or the 5 V supply noisy. Add the 470 uF closer to the module.
- Pulses miscounted: print the break times. Anything under 10 ms is contact noise and is already filtered. Share the output with me and we tune the thresholds.
- Module hot, current above 500 mA: unplug, check pin 13 and 12, no shorts across TIP/RING.

## Figure 4 protection, as read from the drawing

Names follow the datasheet figure. TIP and RING below mean the module pins 2 and 1 and the phone wires attached to them. These parts hang in parallel on those nets. Nothing sits in series with the line.

| Part | Value | Connects |
|---|---|---|
| C2 | 470 uF, 16 V electrolytic | + to module pin 13 (+VPWR), minus to pin 12 (GNDPWR) |
| C1 | 100 nF | module pin 13 to pin 12, beside C2 |
| C4 | 10 nF | audio source to module pin 9 (VIN) |
| C3 | 100 nF | module pin 10 (VOUT) to audio destination |
| D2 | 1N4004 | anode GND, cathode TIP |
| D4 | 1N4004 | anode GND, cathode RING |
| D3 | 1N4004 | anode TIP, cathode node X |
| D5 | 1N4004 | anode RING, cathode node X |
| D1 | P6KE82 or BZT03C82 | cathode node X, anode GND |
| R1 | 20k to 39k | TIP to RING. Only for caller ID. Leave it out |
| D6 | 1N4148 | anode on PD, cathode to controller. Only for power-down. Leave it out, PD stays unconnected |

Node X is the "to other circuits" point in the drawing. The only things on it are D3, D5 and D1.

The idea: the module's DC/DC makes a positive battery, so TIP and RING live between 0 V and about 72 V against GNDPWR. D2 and D4 catch anything that dips below ground. D3 and D5 steer any overshoot into D1, which clamps at about 82 V.

Orientation is the part to check. A bar on a diode symbol is the cathode. I derived the directions above from how the circuit has to work, and they should match the bars in your picture: D1's bar toward node X, D3 and D5 bars toward node X, D2 and D4 bars toward TIP and RING. If the drawing in front of you shows any of them the other way, trust the drawing and tell me. A mirrored figure would mean the line runs negative, and I would redo the netlist.

Check before ringing:

1. Phone disconnected, current-limited supply set to 600 mA, Figure 4 built.
2. Idle current should still be 60 to 90 mA at 5 V. If it jumps, or the supply drops into current limit, a diode is backwards. Power off and fix it.
3. Meter from node X to GND: tens of volts, roughly the on-hook line voltage minus 0.6 V. If it reads about 0 V, something is reversed.
4. Then connect the phone (supply off), power up, and the lift-handset test should still work exactly as before.

## Ringing (part 2, later)

After Figure 4 is built on the breadboard: flip `RING_ENABLED` to true, make sure the handset is on the cradle, send `r`. You get 1 s of ringing at 25 Hz. The sketch follows the datasheet order: RM high, toggle F/R, on pickup hold F/R high then drop RM after 20 ms. Allow at least 4 s between rings.
