// Content lint for content/nodes.yaml. Run by `npm run check` and the Kiro hook.
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const text = readFileSync(new URL("../content/nodes.yaml", import.meta.url), "utf8");
const nodes = parse(text);
// Keep in sync with engine/content.ts lintNodes (the test suite runs the TS version).
const ENTRY = ["greeting", "self_call", "callback", "menu_main", "silence", "invalid"];
const problems = [];
const ids = new Set(), fallback = new Set(), tags = new Set(), referenced = new Map();
for (const n of nodes) {
  if (ids.has(n.id)) problems.push(`duplicate id ${n.id}`);
  ids.add(n.id); tags.add(n.tag);
  if (!n.requires || Object.keys(n.requires).length === 0) fallback.add(n.tag);
  if (n.kind !== "hold" && !n.say) problems.push(`${n.id}: needs say text`);
  if (!n.menu && !n.next && !n.end) problems.push(`${n.id}: dead end`);
  if (n.menu && n.next) problems.push(`${n.id}: has both menu and next`);
  const refs = [];
  if (n.next) refs.push(n.next.tag);
  if (n.menu) for (const v of Object.values(n.menu)) if (v) refs.push(v.tag);
  for (const r of refs) if (!referenced.has(r)) referenced.set(r, n.id);
}
for (const t of ENTRY) if (!referenced.has(t)) referenced.set(t, "(engine)");
for (const [tag, by] of referenced) {
  if (!tags.has(tag)) problems.push(`tag "${tag}" referenced by ${by} has no nodes`);
  else if (!fallback.has(tag)) problems.push(`tag "${tag}" has no fallback node`);
}
for (const t of tags) if (!referenced.has(t)) problems.push(`tag "${t}" is unreachable`);

if (problems.length) {
  console.error(`content lint: ${problems.length} problem(s)`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`content lint: ${nodes.length} nodes, ${tags.size} tags, ok`);
