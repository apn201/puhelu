import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PulseDecoder, pulseTrain, type DialProfile } from "../engine/signal/pulse";
import { DtmfDecoder, dtmfSamples, SAMPLE_RATE } from "../engine/signal/dtmf";
import type { LineEvent } from "../engine/line";

function run(dec: PulseDecoder, edges: { t: number; level: 0 | 1 }[], until: number): LineEvent[] {
  const out: LineEvent[] = [];
  let i = 0;
  for (let t = edges[0]?.t ?? 0; t <= until; t += 5) {
    while (i < edges.length && edges[i]!.t <= t) {
      out.push(...dec.edge(edges[i]!.t, edges[i]!.level));
      i++;
    }
    out.push(...dec.tick(t));
  }
  return out;
}

const digits = (evs: LineEvent[]) => evs.filter((e) => e.type === "DIGIT").map((e) => (e as { value: string }).value);

describe("pulse decoder", () => {
  it("decodes off-hook, a digit, and on-hook", () => {
    const dec = new PulseDecoder();
    const edges = [{ t: 0, level: 1 as const }, ...pulseTrain("3", 1000), { t: 3000, level: 0 as const }];
    const evs = run(dec, edges, 4000);
    expect(evs.map((e) => e.type)).toEqual(["OFF_HOOK", "DIGIT", "ON_HOOK"]);
    expect(digits(evs)).toEqual(["3"]);
    const d = evs.find((e) => e.type === "DIGIT") as { pps?: number };
    expect(d.pps).toBeCloseTo(10, 5);
  });

  it("maps 1 pulse to 0 on sweden_legacy", () => {
    const dec = new PulseDecoder({ profile: "sweden_legacy" });
    const edges = [{ t: 0, level: 1 as const }, ...pulseTrain("0", 500, { profile: "sweden_legacy" })];
    expect(digits(run(dec, edges, 1500))).toEqual(["0"]);
  });

  it("ignores glitches shorter than 10 ms", () => {
    const dec = new PulseDecoder();
    const edges = [
      { t: 0, level: 1 as const },
      { t: 500, level: 0 as const },
      { t: 504, level: 1 as const },
    ];
    expect(run(dec, edges, 1500).map((e) => e.type)).toEqual(["OFF_HOOK"]);
  });

  // Property: any digit sequence, dialed at 7 to 13 pps with 55-70% break ratio and
  // jitter, on either profile, decodes back to itself.
  it("property: jittered pulse trains decode to the dialed digits", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 6 }),
        fc.constantFrom<DialProfile>("standard", "sweden_legacy"),
        fc.double({ min: 7, max: 13, noNaN: true }),
        fc.double({ min: 0.55, max: 0.7, noNaN: true }),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        (seq, profile, pps, ratio, seed) => {
          let s = seed;
          const jitter = () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return (s / 0x7fffffff - 0.5) * 6; // +-3 ms
          };
          const period = 1000 / pps;
          const edges: { t: number; level: 0 | 1 }[] = [{ t: 0, level: 1 }];
          let t = 400;
          for (const d of seq) {
            const train = pulseTrain(String(d), t, {
              profile,
              breakMs: period * ratio,
              makeMs: period * (1 - ratio),
            });
            for (const e of train) edges.push({ t: e.t + jitter(), level: e.level });
            t = train[train.length - 1]!.t + 400 + Math.abs(jitter()) * 20; // inter-digit gap
          }
          edges.sort((a, b) => a.t - b.t);
          const dec = new PulseDecoder({ profile });
          return digits(run(dec, edges, t + 400)).join("") === seq.join("");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("property: a long break is always ON_HOOK, never a digit", () => {
    fc.assert(
      fc.property(fc.integer({ min: 320, max: 5000 }), (brk) => {
        const dec = new PulseDecoder();
        const evs = run(dec, [{ t: 0, level: 1 }, { t: 500, level: 0 }, { t: 500 + brk, level: 1 }], 1000 + brk);
        return digits(evs).length === 0 && evs.some((e) => e.type === "ON_HOOK");
      }),
    );
  });
});

describe("dtmf decoder", () => {
  it("decodes every key", () => {
    for (const k of "0123456789*#") {
      const dec = new DtmfDecoder();
      const x = new Float32Array(SAMPLE_RATE / 4);
      x.set(dtmfSamples(k, 100), 400);
      expect(digits(dec.feed(x))).toEqual([k]);
    }
  });

  it("property: random key sequences with noise and click bursts decode exactly", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom(..."0123456789*#".split("")), { minLength: 1, maxLength: 5 }),
        fc.integer({ min: 1, max: 1e6 }),
        (keys, seed) => {
          let s = seed;
          const r = () => {
            s = (s * 16807) % 2147483647;
            return s / 2147483647;
          };
          const parts: Float32Array[] = [];
          const gap = () => {
            const g = new Float32Array(480);
            for (let i = 0; i < g.length; i++) g[i] = (r() - 0.5) * 0.02;
            // a pulse-dial click: one sharp spike
            g[Math.floor(r() * g.length)] = r() > 0.5 ? 0.9 : -0.9;
            return g;
          };
          for (const k of keys) {
            parts.push(gap(), dtmfSamples(k, 70 + r() * 60, 0.2 + r() * 0.4));
          }
          parts.push(gap());
          const total = parts.reduce((a, p) => a + p.length, 0);
          const x = new Float32Array(total);
          let o = 0;
          for (const p of parts) {
            for (let i = 0; i < p.length; i++) x[o + i] = p[i]! + (r() - 0.5) * 0.01;
            o += p.length;
          }
          const dec = new DtmfDecoder();
          // feed in uneven chunks like an audio callback would
          const out: LineEvent[] = [];
          for (let i = 0; i < x.length; i += 128) out.push(...dec.feed(x.slice(i, i + 128)));
          return digits(out).join("") === keys.join("");
        },
      ),
      { numRuns: 150 },
    );
  });
});
