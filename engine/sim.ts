// Simulated line and clock. Used by tests, and later by the virtual-caller MCP server
// so Kiro can play the product without a browser or hardware.

import type { Clock } from "./call";
import type { Line, Speaker } from "./line";

export class FakeClock implements Clock {
  t = 0;
  private q: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now(): number {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.q.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(h: unknown): void {
    this.q = this.q.filter((x) => x.id !== h);
  }
  /** Run timers up to t + ms. Awaits microtasks between timers so promises settle. */
  async advance(ms: number): Promise<void> {
    const end = this.t + ms;
    for (;;) {
      await flush();
      this.q.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.q[0];
      if (!next || next.at > end) break;
      this.q.shift();
      this.t = next.at;
      next.fn();
    }
    this.t = end;
    await flush();
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

export interface SimRecord {
  kind: "ring" | "stopRing" | "say" | "hold" | "busy";
  text?: string;
  speaker?: Speaker;
}

/** A line where speech takes a fixed time per word and hold takes its seconds. */
export class SimLine implements Line {
  log: SimRecord[] = [];
  ringing = false;
  private cancel: (() => void) | null = null;
  constructor(private clock: FakeClock, private msPerWord = 300) {}

  ring(): void {
    this.ringing = true;
    this.log.push({ kind: "ring" });
  }
  stopRing(): void {
    this.ringing = false;
    this.log.push({ kind: "stopRing" });
  }
  say(text: string, speaker: Speaker): Promise<void> {
    this.log.push({ kind: "say", text, speaker });
    return this.wait(Math.max(500, text.split(/\s+/).length * this.msPerWord));
  }
  hold(seconds: number): Promise<void> {
    this.log.push({ kind: "hold" });
    return this.wait(seconds * 1000);
  }
  interrupt(): void {
    const c = this.cancel;
    this.cancel = null;
    c?.();
  }
  busy(): void {
    this.log.push({ kind: "busy" });
  }
  private wait(ms: number): Promise<void> {
    this.interrupt();
    return new Promise((resolve) => {
      const h = this.clock.setTimeout(() => {
        this.cancel = null;
        resolve();
      }, ms);
      this.cancel = () => {
        this.clock.clearTimeout(h);
        resolve();
      };
    });
  }
}
