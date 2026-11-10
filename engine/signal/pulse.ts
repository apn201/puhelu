// Pulse (rotary) decoder from raw hook-switch edges.
// Rules come from .kiro/steering/telephony.md and the AG1171 datasheet V1.6:
//  - SHK high = off-hook (loop closed). A dial pulse is a short loop break.
//  - Require 10 ms persistence before acting on any edge (datasheet 3.11).
//  - Breaks of 20..120 ms are pulses. A burst ends after >= 250 ms of make.
//  - A break longer than hangupMs is ON_HOOK.
// Timestamps are in milliseconds from any monotonic clock (MCU micros() / 1000
// on the hardware, performance.now() in the browser). Only differences matter.

import type { LineEvent } from "../line";

export type DialProfile = "standard" | "sweden_legacy";

export interface PulseConfig {
  persistMs: number;
  minBreakMs: number;
  maxBreakMs: number;
  interDigitMs: number;
  hangupMs: number;
  profile: DialProfile;
}

export const DEFAULT_PULSE: PulseConfig = {
  persistMs: 10,
  minBreakMs: 20,
  maxBreakMs: 120,
  interDigitMs: 250,
  hangupMs: 300,
  profile: "standard",
};

/** Map a pulse count to a digit for the given profile. Returns null if out of range. */
export function pulsesToDigit(pulses: number, profile: DialProfile): string | null {
  if (pulses < 1 || pulses > 10) return null;
  if (profile === "standard") return pulses === 10 ? "0" : String(pulses);
  return String(pulses - 1); // sweden_legacy: 1 pulse = 0 ... 10 pulses = 9
}

/** Inverse of pulsesToDigit, used by the web phone dial and by tests. */
export function digitToPulses(digit: string, profile: DialProfile): number {
  const d = Number(digit);
  if (!Number.isInteger(d) || d < 0 || d > 9) throw new Error(`not a dial digit: ${digit}`);
  if (profile === "standard") return d === 0 ? 10 : d;
  return d + 1;
}

export class PulseDecoder {
  readonly cfg: PulseConfig;
  private level: 0 | 1 = 0; // debounced level, starts on-hook
  private levelSince = 0;
  private pending: { level: 0 | 1; t: number } | null = null;
  private pulses = 0;
  private burstStart = 0;
  private lastMake = 0;
  private lastBreak = 0;
  private onHookSent = true;

  constructor(cfg: Partial<PulseConfig> = {}) {
    this.cfg = { ...DEFAULT_PULSE, ...cfg };
  }

  get offHook(): boolean {
    return !this.onHookSent;
  }

  /** Feed one raw edge. Returns any events that became certain. */
  edge(t: number, level: 0 | 1): LineEvent[] {
    const out = this.tick(t);
    if (this.pending && this.pending.level !== level) {
      // The pending edge reverted before persisting: it was a glitch.
      this.pending = null;
      return out;
    }
    if (level !== this.level && !this.pending) this.pending = { level, t };
    return out;
  }

  /** Advance time with no edge. Call this regularly (every 10 to 50 ms). */
  tick(now: number): LineEvent[] {
    const out: LineEvent[] = [];
    if (this.pending && now - this.pending.t >= this.cfg.persistMs) {
      this.commit(this.pending.level, this.pending.t, out);
      this.pending = null;
    }
    if (this.level === 0 && !this.onHookSent && now - this.levelSince > this.cfg.hangupMs) {
      // Loop open too long: hang-up. A partial burst is dropped.
      this.pulses = 0;
      this.onHookSent = true;
      out.push({ type: "ON_HOOK", t: this.levelSince });
    }
    if (this.level === 1 && this.pulses > 0 && now - this.lastMake >= this.cfg.interDigitMs) {
      this.emitDigit(out);
    }
    return out;
  }

  private commit(level: 0 | 1, t: number, out: LineEvent[]): void {
    const prevSince = this.levelSince;
    this.level = level;
    this.levelSince = t;
    if (level === 1) {
      if (this.onHookSent) {
        this.onHookSent = false;
        this.pulses = 0;
        out.push({ type: "OFF_HOOK", t });
        return;
      }
      const brk = t - prevSince;
      if (brk >= this.cfg.minBreakMs && brk <= this.cfg.maxBreakMs) {
        if (this.pulses === 0) this.burstStart = prevSince;
        this.lastBreak = prevSince;
        this.pulses++;
        this.lastMake = t;
      }
      // Breaks between maxBreakMs and hangupMs (hook flash) are ignored.
    }
  }

  private emitDigit(out: LineEvent[]): void {
    const pulses = this.pulses;
    this.pulses = 0;
    const value = pulsesToDigit(pulses, this.cfg.profile);
    if (value === null) return;
    // Pulse rate from break start to break start.
    const span = this.lastBreak - this.burstStart;
    const pps = pulses > 1 && span > 0 ? ((pulses - 1) * 1000) / span : undefined;
    out.push({ type: "DIGIT", t: this.lastMake, value, source: "pulse", pulses, pps });
  }
}

/** Build the raw edge train for dialing one digit. Used by the web dial and tests. */
export function pulseTrain(
  digit: string,
  startT: number,
  opts: { profile?: DialProfile; breakMs?: number; makeMs?: number } = {},
): { t: number; level: 0 | 1 }[] {
  const n = digitToPulses(digit, opts.profile ?? "standard");
  const brk = opts.breakMs ?? 60;
  const make = opts.makeMs ?? 40;
  const edges: { t: number; level: 0 | 1 }[] = [];
  let t = startT;
  for (let i = 0; i < n; i++) {
    edges.push({ t, level: 0 });
    t += brk;
    edges.push({ t, level: 1 });
    t += make;
  }
  return edges;
}
