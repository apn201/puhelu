// DTMF decoder: Goertzel on the 8 standard frequencies, 205-sample windows at 8 kHz.
// Windows hop by half a window. A digit is accepted when the same pair holds in
// 3 consecutive windows (51 ms >= 40 ms) with sane twist, and re-armed after 2
// quiet windows.

import type { LineEvent } from "../line";

export const SAMPLE_RATE = 8000;
export const WINDOW = 205;
/** Windows overlap by half. With hop = WINDOW, a short gap between two equal keys
 *  can be covered by windows that straddle the tones, and "1 1" decodes as "1".
 *  Found by the DTMF property test. */
export const HOP = 102;
const LOW = [697, 770, 852, 941];
const HIGH = [1209, 1336, 1477, 1633];
const KEYS = ["123A", "456B", "789C", "*0#D"];

export function dtmfPair(key: string): [number, number] {
  for (let r = 0; r < 4; r++) {
    const c = KEYS[r]!.indexOf(key);
    if (c >= 0) return [LOW[r]!, HIGH[c]!];
  }
  throw new Error(`not a DTMF key: ${key}`);
}

function goertzel(x: Float32Array, off: number, n: number, freq: number): number {
  const k = Math.round((n * freq) / SAMPLE_RATE);
  const w = (2 * Math.PI * k) / n;
  const coeff = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = x[off + i]! + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

/** Classify one window. Returns the key or null. */
export function classifyWindow(x: Float32Array, off = 0): string | null {
  let energy = 0;
  for (let i = 0; i < WINDOW; i++) energy += x[off + i]! * x[off + i]!;
  if (energy < 1e-3) return null;
  const lo = LOW.map((f) => goertzel(x, off, WINDOW, f));
  const hi = HIGH.map((f) => goertzel(x, off, WINDOW, f));
  const li = lo.indexOf(Math.max(...lo));
  const hiI = hi.indexOf(Math.max(...hi));
  const lp = lo[li]!;
  const hp = hi[hiI]!;
  // Each tone must clearly beat the others in its group.
  for (let i = 0; i < 4; i++) {
    if (i !== li && lo[i]! * 6 > lp) return null;
    if (i !== hiI && hi[i]! * 6 > hp) return null;
  }
  // Twist: the two tones within about 8 dB of each other.
  const twist = lp / hp;
  if (twist > 6.3 || twist < 1 / 6.3) return null;
  // The pair must hold most of the window energy (rejects clicks and speech).
  const pairPower = ((lp + hp) * 2) / WINDOW;
  if (pairPower < energy * 0.25) return null;
  return KEYS[li]![hiI]!;
}

export class DtmfDecoder {
  private buf = new Float32Array(0);
  private samplesSeen = 0;
  private candidate: string | null = null;
  private candidateWindows = 0;
  private latched: string | null = null;
  private quietWindows = 0;

  /** Feed 8 kHz mono samples in -1..1. tStart is the time of the first sample in ms. */
  feed(samples: Float32Array, tStart = 0): LineEvent[] {
    const out: LineEvent[] = [];
    const merged = new Float32Array(this.buf.length + samples.length);
    merged.set(this.buf);
    merged.set(samples, this.buf.length);
    const t0 = tStart - (this.buf.length * 1000) / SAMPLE_RATE;
    let off = 0;
    while (off + WINDOW <= merged.length) {
      const key = classifyWindow(merged, off);
      const t = t0 + (off * 1000) / SAMPLE_RATE;
      this.step(key, t, out);
      off += HOP;
    }
    this.buf = merged.slice(off);
    this.samplesSeen += samples.length;
    return out;
  }

  private step(key: string | null, t: number, out: LineEvent[]): void {
    if (key === null) {
      this.candidate = null;
      this.candidateWindows = 0;
      if (++this.quietWindows >= 2) this.latched = null;
      return;
    }
    this.quietWindows = 0;
    if (key === this.candidate) this.candidateWindows++;
    else {
      this.candidate = key;
      this.candidateWindows = 1;
    }
    // 3 windows at hop 102 span 409 samples = 51 ms >= 40 ms.
    if (this.candidateWindows >= 3 && this.latched !== key) {
      this.latched = key;
      out.push({ type: "DIGIT", t, value: key, source: "dtmf" });
    }
  }
}

/** Synthesize a DTMF key at 8 kHz. Used by the web keypad and tests. */
export function dtmfSamples(key: string, ms = 80, amp = 0.4): Float32Array {
  const [f1, f2] = dtmfPair(key);
  const n = Math.round((ms * SAMPLE_RATE) / 1000);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    x[i] = amp * 0.5 * (Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t));
  }
  return x;
}
