// One haunted line: ring, answer, menu, hold, hang-up, callback.
// The same class runs in the browser web phone and on the UNO Q (Node).
// It only talks to the Line interface, never to pins. Ring safety lives in
// the line implementation (MCU firmware on the hardware).

import { Director, initialState, render } from "./director/director";
import type { Edge, HauntState, StoryNode } from "./director/types";
import type { Line, LineEvent } from "./line";
import { applyEffects } from "./director/director";

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export const realClock: Clock = {
  now: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type Phase = "idle" | "ringing" | "connected" | "ended";

export interface CallOptions {
  clock?: Clock;
  random?: () => number;
  callbackDelayMs?: number;
  ringTimeoutMs?: number;
  defaultTimeoutS?: number;
  onChange?: (s: HauntState, phase: Phase) => void;
  onNode?: (node: StoryNode, text: string) => void;
  onLog?: (msg: string) => void;
}

export class CallSession {
  state: HauntState;
  phase: Phase = "idle";
  current: StoryNode | null = null;
  private clock: Clock;
  private random: () => number;
  private token = 0;
  private promptEndedAt: number | null = null;
  private menuOpen = false;
  private timers = new Set<unknown>();
  private ringTimer: unknown = null;
  private callbackTimer: unknown = null;
  private isCallback = false;
  private opts: Required<Pick<CallOptions, "callbackDelayMs" | "ringTimeoutMs" | "defaultTimeoutS">> & CallOptions;

  constructor(
    private line: Line,
    private director: Director,
    state: HauntState = initialState(),
    opts: CallOptions = {},
  ) {
    this.state = state;
    this.clock = opts.clock ?? realClock;
    this.random = opts.random ?? Math.random;
    this.opts = { callbackDelayMs: 8000, ringTimeoutMs: 30000, defaultTimeoutS: 10, ...opts };
  }

  /** The haunting decides to call. */
  ringNow(callback = false): void {
    if (this.phase !== "idle") return;
    this.isCallback = callback;
    this.phase = "ringing";
    this.log(callback ? "calling back" : "ringing");
    this.line.ring();
    this.ringTimer = this.clock.setTimeout(() => this.ringTimeout(), this.opts.ringTimeoutMs);
    this.changed();
  }

  nextNight(): void {
    this.hangupCleanup();
    this.state = { ...this.state, night: this.state.night + 1, callbacksPending: 0 };
    this.log(`night ${this.state.night}`);
    this.changed();
  }

  reset(state: HauntState = initialState()): void {
    this.hangupCleanup();
    if (this.phase === "ringing") this.line.stopRing();
    this.phase = "idle";
    this.state = state;
    this.changed();
  }

  handle(ev: LineEvent): void {
    switch (ev.type) {
      case "OFF_HOOK":
        return this.offHook();
      case "ON_HOOK":
        return this.onHook();
      case "DIGIT":
        return this.digit(ev.value, ev.t, ev.pps);
    }
  }

  private offHook(): void {
    if (this.phase === "ringing") {
      this.clearRingTimer();
      this.line.stopRing();
      this.connect(this.isCallback ? "callback" : "greeting");
    } else if (this.phase === "idle") {
      this.cancelCallback();
      this.connect("self_call");
    }
  }

  private connect(tag: string): void {
    this.phase = "connected";
    this.state = { ...this.state, calls: this.state.calls + 1 };
    this.log(`answered (${tag})`);
    void this.play(tag);
  }

  private onHook(): void {
    const was = this.phase;
    const node = this.current;
    this.hangupCleanup();
    this.phase = "idle";
    if (was === "connected") {
      const edge: Edge = node?.menu?.hangup ?? { tag: "callback" };
      let s = applyEffects(this.state, edge.effects);
      s = applyEffects(s, { flags_add: ["hung_up_on_it"], patience: -1 });
      s = { ...s, hangups: s.hangups + 1 };
      this.state = s;
      this.log("caller hung up");
      if (s.callbacksPending < 2) {
        this.state = { ...this.state, callbacksPending: s.callbacksPending + 1 };
        const delay = this.opts.callbackDelayMs * (0.75 + this.random() * 0.5);
        this.callbackTimer = this.clock.setTimeout(() => {
          this.callbackTimer = null;
          this.ringNow(true);
        }, delay);
        this.log(`callback in ${(delay / 1000).toFixed(1)} s`);
      }
    } else if (was === "ended") {
      this.log("line released");
    }
    this.changed();
  }

  private digit(value: string, t: number, pps?: number): void {
    if (this.phase !== "connected") return;
    if (pps !== undefined) {
      const avg = this.state.avgPps;
      this.state = { ...this.state, avgPps: avg === null ? pps : avg * 0.7 + pps * 0.3 };
    }
    const node = this.current;
    if (!node?.menu) {
      this.log(`digit ${value} ignored`);
      return;
    }
    const think = this.promptEndedAt === null ? 0 : Math.max(0, t - this.promptEndedAt);
    const avgT = this.state.avgThinkMs;
    this.state = { ...this.state, avgThinkMs: avgT === null ? think : avgT * 0.6 + think * 0.4 };
    const raw = node.menu[value];
    const edge: Edge = raw && "tag" in raw && !("after_s" in raw) ? raw : { tag: "invalid" };
    this.log(`digit ${value}${this.menuOpen ? "" : " (barge-in)"} -> ${edge.tag}`);
    this.state = applyEffects(this.state, edge.effects);
    void this.play(edge.tag);
  }

  private async play(tag: string): Promise<void> {
    const my = ++this.token;
    this.clearTimers();
    this.line.interrupt();
    this.menuOpen = false;
    this.promptEndedAt = null;
    let node: StoryNode;
    try {
      node = this.director.pick(tag, this.state);
    } catch (e) {
      this.log(String(e));
      node = this.director.pick("menu_main", this.state);
    }
    this.current = node;
    this.state = this.director.enter(node, this.state);
    if (node.kind === "hold") this.state = { ...this.state, queuePosition: this.state.queuePosition + 1 };
    const text = node.say ? render(node.say, this.state) : "";
    this.opts.onNode?.(node, text);
    this.changed();
    // Menus listen while the prompt plays (barge-in), like old exchanges did.
    if (node.menu) this.menuOpen = false;

    if (node.cut_at_ms) {
      this.later(() => {
        if (this.token === my) this.line.interrupt();
      }, node.cut_at_ms);
    }
    if (node.kind === "hold") await this.line.hold(node.hold_s ?? 8);
    else await this.line.say(text, node.speaker, node.audio);
    if (this.token !== my || this.phase !== "connected") return;

    if (node.end) {
      this.phase = "ended";
      this.line.busy();
      this.log("they hung up on you");
      this.changed();
      return;
    }
    if (node.next) {
      this.state = applyEffects(this.state, node.next.effects);
      void this.play(node.next.tag);
      return;
    }
    if (node.menu) {
      this.menuOpen = true;
      this.promptEndedAt = this.clock.now();
      const to = node.menu.timeout ?? { after_s: this.opts.defaultTimeoutS, tag: "silence" };
      this.later(() => {
        if (this.token !== my) return;
        this.state = applyEffects({ ...this.state, silences: this.state.silences + 1 }, to.effects);
        this.log("silence");
        void this.play(to.tag);
      }, to.after_s * 1000);
      return;
    }
    void this.play("menu_main");
  }

  private ringTimeout(): void {
    this.ringTimer = null;
    if (this.phase !== "ringing") return;
    this.line.stopRing();
    this.phase = "idle";
    this.state = applyEffects(this.state, { dread: 1, flags_add: ["ignored_ring"] });
    this.log("nobody answered");
    this.changed();
  }

  private later(fn: () => void, ms: number): void {
    const h = this.clock.setTimeout(() => {
      this.timers.delete(h);
      fn();
    }, ms);
    this.timers.add(h);
  }

  private clearTimers(): void {
    for (const h of this.timers) this.clock.clearTimeout(h);
    this.timers.clear();
  }

  private clearRingTimer(): void {
    if (this.ringTimer !== null) this.clock.clearTimeout(this.ringTimer);
    this.ringTimer = null;
  }

  private cancelCallback(): void {
    if (this.callbackTimer !== null) this.clock.clearTimeout(this.callbackTimer);
    this.callbackTimer = null;
  }

  private hangupCleanup(): void {
    this.token++;
    this.clearTimers();
    this.clearRingTimer();
    this.cancelCallback();
    this.line.interrupt();
    this.current = null;
    this.menuOpen = false;
  }

  private changed(): void {
    this.opts.onChange?.(this.state, this.phase);
  }

  private log(msg: string): void {
    this.opts.onLog?.(msg);
  }
}
