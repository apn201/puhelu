# Requirements Document

## Introduction

MCU firmware (STM32 side of the UNO Q) and the Python sidecar that drive the AG1171. Not built yet. Facts from AG1171 datasheet V1.6 and `.kiro/steering/telephony.md`. The engine never touches RM directly.

## Requirements

### Requirement 1: Boot-safe and idle
1. THE SYSTEM SHALL NOT drive PD.
2. THE SYSTEM SHALL set F/R high and RM low first thing in setup, and hold them there except while ringing.

### Requirement 2: Edges
1. WHEN SHK changes THE SYSTEM SHALL timestamp it with micros() in an interrupt and notify `edge(t_us, level)` over the Bridge, without debouncing.

### Requirement 3: Ringing
1. WHEN ring is requested and ARM is closed THE SYSTEM SHALL set RM high, then toggle F/R at 20 to 25 Hz with cadence 1 s on, 3 to 5 s off.
2. IF ARM is open THE SYSTEM SHALL refuse to ring.
3. WHEN SHK is high for at least 10 ms while ringing THE SYSTEM SHALL set F/R high, then set RM low more than 10 ms and less than 500 ms later, and notify `ring_end("answered")`.
4. WHEN a ring ends for any reason THE SYSTEM SHALL leave F/R high and RM low.
5. THE SYSTEM SHALL keep RM-high duty cycle at or below 30 percent over any window.
6. IF no keepalive arrives for 1 s THE SYSTEM SHALL stop ringing.

### Requirement 4: Audio (sidecar)
1. THE sidecar SHALL play engine audio into VIN at below 0 dBm and record VOUT at 8 kHz mono, half duplex.
