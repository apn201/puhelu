# Requirements Document

## Introduction

The storylet director picks what the line says next from `content/nodes.yaml`, using persistent state (dread, trust, patience, night, calls, hang-ups, flags, dial speed, hesitation). Implemented in `engine/director/` and `engine/call.ts` (first pass).

## Requirements

### Requirement 1: Selection
1. WHEN a tag is requested THE SYSTEM SHALL choose only among nodes with that tag whose `requires` hold.
2. THE SYSTEM SHALL avoid the last six nodes when another candidate exists.
3. THE SYSTEM SHALL prefer more specific nodes and nodes whose target_dread is closest to current dread.
4. THE SYSTEM SHALL be deterministic for a given seed.

### Requirement 2: Never stuck
1. FOR every reachable tag THE content SHALL contain a fallback node with no `requires`.
2. WHILE a call is connected THE SYSTEM SHALL always be playing a node or waiting on a menu with a timeout.
3. Meters SHALL stay within 0 to 10 for any input sequence.

### Requirement 3: Memory
1. WHEN the caller hangs up mid-call THE SYSTEM SHALL count it, set `hung_up_on_it`, and schedule a callback (8 s in demo mode, at most 2 pending).
2. WHEN a ring goes unanswered THE SYSTEM SHALL set `ignored_ring` and raise dread.
3. State SHALL persist between calls and nights (localStorage on the web, JSON file on the Q).

### Requirement 4: Text
1. Placeholders SHALL be filled only from state.
2. Content lint SHALL run on every content change.
