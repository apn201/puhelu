# Requirements Document

## Introduction

Decode dialed digits from the line: rotary pulses from raw hook-switch edges, and DTMF tones from 8 kHz audio. Same code in the browser and on the UNO Q. Implemented in `engine/signal/` (first pass, Nov 10); this spec drives hardening against real bench traces.

## Requirements

### Requirement 1: Hook state

**User Story:** As the engine, I want clean hook events, so that contact bounce never starts or ends a call.

#### Acceptance Criteria
1. WHEN SHK is high for at least 10 ms THE SYSTEM SHALL emit OFF_HOOK.
2. WHEN an SHK transition reverts within 10 ms THE SYSTEM SHALL ignore it.
3. WHEN the loop stays open longer than hangup_ms (default 300 ms) THE SYSTEM SHALL emit ON_HOOK and drop any partial pulse burst.

### Requirement 2: Pulse dialing

**User Story:** As a caller with a rotary phone, I want my dialed digit understood at any normal dial speed.

#### Acceptance Criteria
1. WHEN N loop breaks of 20 to 120 ms are followed by at least 250 ms of closed loop THE SYSTEM SHALL emit DIGIT with source pulse, mapped through the active profile.
2. WHERE the profile is standard THE SYSTEM SHALL map 10 pulses to 0 and N pulses to N.
3. WHERE the profile is sweden_legacy THE SYSTEM SHALL map N pulses to N minus 1.
4. THE SYSTEM SHALL attach pulses-per-second, measured from break start to break start.
5. WHEN a break is between 120 ms and hangup_ms THE SYSTEM SHALL ignore it (hook flash).

### Requirement 3: DTMF

**User Story:** As a caller with a touch-tone phone (or a smartphone held to the mouthpiece), I want key presses understood.

#### Acceptance Criteria
1. WHEN a valid DTMF pair persists at least 40 ms THE SYSTEM SHALL emit one DIGIT with source dtmf.
2. WHEN the same key is pressed twice with a gap of at least 40 ms THE SYSTEM SHALL emit two digits.
3. WHEN audio contains pulse-dial clicks or line noise THE SYSTEM SHALL NOT emit a digit.

### Requirement 4: Evidence

1. Property tests SHALL cover jittered pulse trains on both profiles, long breaks, and DTMF sequences with noise and clicks.
2. Bench traces in `tests/traces/` SHALL replay to the digits that were dialed.
