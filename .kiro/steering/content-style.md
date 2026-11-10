---
inclusion: fileMatch
fileMatchPattern: "content/**"
---

# Content style (content/nodes.yaml)

- Voice: deadpan call-centre. Polite, procedural, slightly wrong. Horror is bureaucratic, never violent.
- At most four short sentences per node, usually two. Menus may list options.
- Only Thirdwatch Customer Continuity. Never a real company, person, or place.
- No threats against real people, no self-harm, no profanity, no real personal data.
- Placeholders come only from state: {{night}}, {{calls}}, {{hangups}}, {{hangups_times}}, {{position}}, {{dial_speed}}, {{think}}.
- Every tag that anything can reach needs a fallback node with no `requires`. Every node needs `menu`, `next` or `end`, never both `menu` and `next`.
- Human nodes (`speaker: human`) are recorded voice; `say` holds the exact transcript for subtitles. Record only own or licensed material.
- Run `npm run check` after every content change.
