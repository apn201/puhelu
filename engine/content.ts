import { parse } from "yaml";
import type { StoryNode } from "./director/types";

export function loadNodes(yamlText: string): StoryNode[] {
  const data = parse(yamlText) as StoryNode[];
  if (!Array.isArray(data)) throw new Error("content must be a list of nodes");
  return data;
}

/** Tags the call session itself asks for, outside any node. */
export const ENTRY_TAGS = ["greeting", "self_call", "callback", "menu_main", "silence", "invalid"];

/** Content lint. Returns a list of problems; empty means good. */
export function lintNodes(nodes: StoryNode[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const fallback = new Set<string>();
  const tags = new Set<string>();
  const referenced = new Map<string, string>(); // tag -> first referrer

  for (const n of nodes) {
    if (!n.id || !n.tag) problems.push(`node without id or tag: ${JSON.stringify(n).slice(0, 60)}`);
    if (ids.has(n.id)) problems.push(`duplicate id ${n.id}`);
    ids.add(n.id);
    tags.add(n.tag);
    if (!n.requires || Object.keys(n.requires).length === 0) fallback.add(n.tag);
    if (n.kind !== "hold" && !n.say) problems.push(`${n.id}: needs say text (also used as subtitles)`);
    if (n.kind === "recorded" && !n.audio) problems.push(`${n.id}: recorded node needs audio`);
    if (!n.menu && n.say && n.say.split(/[.?!]\s/).length > 4) problems.push(`${n.id}: more than four sentences`);
    if (!n.menu && !n.next && !n.end) problems.push(`${n.id}: dead end (needs menu, next or end)`);
    if (n.menu && n.next) problems.push(`${n.id}: has both menu and next; next wins and the menu is dead`);
    const refs: string[] = [];
    if (n.next) refs.push(n.next.tag);
    if (n.menu) for (const v of Object.values(n.menu)) if (v) refs.push(v.tag);
    for (const r of refs) if (!referenced.has(r)) referenced.set(r, n.id);
  }
  for (const t of ENTRY_TAGS) if (!referenced.has(t)) referenced.set(t, "(engine)");
  for (const [tag, by] of referenced) {
    if (!tags.has(tag)) problems.push(`tag "${tag}" referenced by ${by} has no nodes`);
    else if (!fallback.has(tag)) problems.push(`tag "${tag}" has no fallback node without requires`);
  }
  for (const t of tags) if (!referenced.has(t)) problems.push(`tag "${t}" is unreachable`);
  return problems;
}
