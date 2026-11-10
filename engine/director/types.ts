import type { Speaker } from "../line";

export const METERS = ["dread", "trust", "patience"] as const;
export type Meter = (typeof METERS)[number];
export const METER_MIN = 0;
export const METER_MAX = 10;

/** Everything the haunting knows. Persisted between calls and nights. */
export interface HauntState {
  dread: number;
  trust: number;
  patience: number;
  night: number;
  calls: number;
  hangups: number;
  silences: number;
  callbacksPending: number;
  flags: string[];
  history: string[]; // last node ids, newest last
  avgPps: number | null; // caller's average dial speed
  avgThinkMs: number | null; // average time from end of prompt to first digit
  queuePosition: number;
}

/** A condition string like ">=2", "<5", "==0". */
export type Cond = string;

export interface Requires {
  dread?: Cond;
  trust?: Cond;
  patience?: Cond;
  night?: Cond;
  calls?: Cond;
  hangups?: Cond;
  flags_all?: string[];
  flags_absent?: string[];
}

export interface Effects {
  dread?: number;
  trust?: number;
  patience?: number;
  flags_add?: string[];
  flags_remove?: string[];
}

export interface Edge {
  tag: string;
  effects?: Effects;
}

export interface Menu {
  [digit: string]: Edge | { after_s: number; tag: string; effects?: Effects } | undefined;
  timeout?: { after_s: number; tag: string; effects?: Effects };
  hangup?: Edge;
}

export interface StoryNode {
  id: string;
  tag: string;
  speaker: Speaker;
  kind: "tts" | "recorded" | "hold";
  say?: string;
  audio?: string;
  hold_s?: number;
  requires?: Requires;
  effects?: Effects;
  weight?: number;
  target_dread?: number;
  menu?: Menu;
  next?: Edge;
  /** The far end hangs up after this node. */
  end?: boolean;
  /** Stop human audio early: the robot cuts in. */
  cut_at_ms?: number;
}
