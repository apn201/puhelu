// The director: a pool of storylets with state, not a tree.
// Input names a tag. Candidates are nodes with that tag whose `requires` pass.
// Recently used nodes are dropped, the rest are scored by weight, novelty and
// closeness to their target dread, then picked with a seeded random.

import {
  METERS,
  METER_MAX,
  METER_MIN,
  type Cond,
  type Effects,
  type HauntState,
  type Requires,
  type StoryNode,
} from "./types";

export function initialState(): HauntState {
  return {
    dread: 0,
    trust: 0,
    patience: 5,
    night: 1,
    calls: 0,
    hangups: 0,
    silences: 0,
    callbacksPending: 0,
    flags: [],
    history: [],
    avgPps: null,
    avgThinkMs: null,
    queuePosition: 7,
  };
}

/** mulberry32: small, fast, seedable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function checkCond(value: number, cond: Cond): boolean {
  const m = /^\s*(>=|<=|==|!=|>|<)\s*(-?\d+(?:\.\d+)?)\s*$/.exec(cond);
  if (!m) throw new Error(`bad condition: ${cond}`);
  const n = Number(m[2]);
  switch (m[1]) {
    case ">=": return value >= n;
    case "<=": return value <= n;
    case "==": return value === n;
    case "!=": return value !== n;
    case ">": return value > n;
    default: return value < n;
  }
}

export function passes(req: Requires | undefined, s: HauntState): boolean {
  if (!req) return true;
  const numeric = ["dread", "trust", "patience", "night", "calls", "hangups"] as const;
  for (const k of numeric) {
    const c = req[k];
    if (c !== undefined && !checkCond(s[k], c)) return false;
  }
  if (req.flags_all?.some((f) => !s.flags.includes(f))) return false;
  if (req.flags_absent?.some((f) => s.flags.includes(f))) return false;
  return true;
}

const clamp = (v: number) => Math.max(METER_MIN, Math.min(METER_MAX, v));

export function applyEffects(s: HauntState, e: Effects | undefined): HauntState {
  if (!e) return s;
  const next: HauntState = { ...s, flags: [...s.flags] };
  for (const m of METERS) {
    const d = e[m];
    if (d !== undefined) next[m] = clamp(next[m] + d);
  }
  for (const f of e.flags_add ?? []) if (!next.flags.includes(f)) next.flags.push(f);
  if (e.flags_remove) next.flags = next.flags.filter((f) => !e.flags_remove!.includes(f));
  return next;
}

export class Director {
  private byTag = new Map<string, StoryNode[]>();
  readonly nodes: StoryNode[];

  constructor(nodes: StoryNode[], private random: () => number = Math.random) {
    this.nodes = nodes;
    for (const n of nodes) {
      const list = this.byTag.get(n.tag) ?? [];
      list.push(n);
      this.byTag.set(n.tag, list);
    }
  }

  get tags(): string[] {
    return [...this.byTag.keys()];
  }

  candidates(tag: string, s: HauntState): StoryNode[] {
    return (this.byTag.get(tag) ?? []).filter((n) => passes(n.requires, s));
  }

  /** Pick a node for a tag. Throws only if the content has no fallback (lint catches that). */
  pick(tag: string, s: HauntState): StoryNode {
    const all = this.candidates(tag, s);
    if (all.length === 0) throw new Error(`no node for tag "${tag}" in this state`);
    const recent = new Set(s.history.slice(-6));
    const fresh = all.filter((n) => !recent.has(n.id));
    const pool = fresh.length > 0 ? fresh : all;
    const scores = pool.map((n) => {
      const w = n.weight ?? 1;
      const used = s.history.filter((h) => h === n.id).length;
      const novelty = 1 / (1 + used);
      const closeness = n.target_dread === undefined ? 1 : 1 / (1 + Math.abs(n.target_dread - s.dread));
      // Nodes with stricter requirements are more specific to this moment: prefer them.
      const specific = 1 + Object.keys(n.requires ?? {}).length * 0.75;
      return w * novelty * closeness * specific;
    });
    const total = scores.reduce((a, b) => a + b, 0);
    let r = this.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= scores[i]!;
      if (r <= 0) return pool[i]!;
    }
    return pool[pool.length - 1]!;
  }

  /** Record that a node played and apply its effects. */
  enter(node: StoryNode, s: HauntState): HauntState {
    const next = applyEffects(s, node.effects);
    next.history = [...s.history, node.id].slice(-20);
    return next;
  }
}

function speedPhrase(pps: number | null): string {
  if (pps === null) return "at a speed we have noted";
  if (pps < 8) return "slowly, as if someone were watching";
  if (pps > 11) return "quickly. You are in a hurry. We are not";
  return "at a perfectly ordinary speed";
}

function thinkPhrase(ms: number | null): string {
  if (ms === null) return "We noticed the pause";
  if (ms > 4000) return `You waited ${Math.round(ms / 1000)} seconds before choosing. We waited with you`;
  if (ms < 1200) return "You chose before we finished. You do that";
  return "You considered your options. There were fewer than you thought";
}

const NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const say = (n: number) => NUMBERS[n] ?? String(n);

/** Fill {{placeholders}} from state only. Nothing outside the box. */
export function render(text: string, s: HauntState): string {
  const vars: Record<string, string> = {
    night: say(s.night),
    calls: say(s.calls),
    hangups: say(s.hangups),
    hangups_times: s.hangups === 1 ? "once" : s.hangups === 2 ? "twice" : `${say(s.hangups)} times`,
    position: say(s.queuePosition),
    dial_speed: speedPhrase(s.avgPps),
    think: thinkPhrase(s.avgThinkMs),
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}
