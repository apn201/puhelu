// The seam between the engine and whatever is on the other end of the wire:
// the browser web phone, the UNO Q sidecar, or a simulated line in tests.

export type Speaker = "robot" | "human";

export type DigitSource = "pulse" | "dtmf";

export interface DigitInfo {
  value: string; // "0".."9", "*", "#"
  source: DigitSource;
  pulses?: number; // pulse source only
  pps?: number; // pulses per second (pulse source only)
}

/** Events the line sends to the engine. */
export type LineEvent =
  | { type: "OFF_HOOK"; t: number }
  | { type: "ON_HOOK"; t: number }
  | ({ type: "DIGIT"; t: number } & DigitInfo);

/** What the engine asks the line to do. Implementations own all safety. */
export interface Line {
  /** Start ringing. The hardware line refuses unless ARM is closed. */
  ring(): void;
  stopRing(): void;
  /** Speak or play one line. Resolves when finished or interrupted. */
  say(text: string, speaker: Speaker, audio?: string): Promise<void>;
  /** Hold music for a number of seconds. Resolves when finished or interrupted. */
  hold(seconds: number): Promise<void>;
  /** Stop whatever is playing (barge-in). */
  interrupt(): void;
  /** Disconnect tone after the far end "hangs up". */
  busy(): void;
}
