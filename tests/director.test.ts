import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { loadNodes, lintNodes } from "../engine/content";
import { Director, initialState, passes, rng } from "../engine/director/director";
import { METERS, METER_MAX, METER_MIN, type StoryNode } from "../engine/director/types";
import { CallSession } from "../engine/call";
import { FakeClock, SimLine } from "../engine/sim";

const nodes = loadNodes(readFileSync(new URL("../content/nodes.yaml", import.meta.url), "utf8"));

describe("content", () => {
  it("passes lint", () => {
    expect(lintNodes(nodes)).toEqual([]);
  });
});

type Action =
  | { a: "pickup" }
  | { a: "hangup" }
  | { a: "digit"; d: string }
  | { a: "wait"; ms: number }
  | { a: "night" }
  | { a: "ring" };

const action: fc.Arbitrary<Action> = fc.oneof(
  { weight: 1, arbitrary: fc.constant({ a: "pickup" } as Action) },
  { weight: 1, arbitrary: fc.constant({ a: "hangup" } as Action) },
  { weight: 1, arbitrary: fc.constant({ a: "ring" } as Action) },
  { weight: 1, arbitrary: fc.constant({ a: "night" } as Action) },
  { weight: 5, arbitrary: fc.constantFrom(..."0123456789*#").map((d) => ({ a: "digit", d }) as Action) },
  { weight: 4, arbitrary: fc.integer({ min: 100, max: 20000 }).map((ms) => ({ a: "wait", ms }) as Action) },
);

describe("director and call session", () => {
  // From any reachable state and any input sequence: the session never throws,
  // meters stay in bounds, every picked node's requires held when it was picked,
  // and a connected call is never silent (something is playing or a menu is waiting).
  it("property: any caller behaviour keeps the haunting valid", async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(action, { maxLength: 60 }), fc.integer(), async (actions, seed) => {
        const clock = new FakeClock();
        const line = new SimLine(clock);
        const director = new Director(nodes, rng(seed));
        const violations: string[] = [];
        const session = new CallSession(line, director, initialState(), {
          clock,
          random: rng(seed + 1),
          onNode: (n: StoryNode) => {
            // state at onNode already has effects applied; check requires against the pre-state
            if (!passes(n.requires, pre)) violations.push(`${n.id} picked against requires`);
          },
        });
        let pre = session.state;
        const origPick = director.pick.bind(director);
        director.pick = (tag, s) => {
          pre = s;
          return origPick(tag, s);
        };
        let offHook = false;
        for (const act of actions) {
          switch (act.a) {
            case "pickup":
              if (!offHook) {
                offHook = true;
                session.handle({ type: "OFF_HOOK", t: clock.now() });
              }
              break;
            case "hangup":
              if (offHook) {
                offHook = false;
                session.handle({ type: "ON_HOOK", t: clock.now() });
              }
              break;
            case "digit":
              if (offHook) session.handle({ type: "DIGIT", t: clock.now(), value: act.d, source: "dtmf" });
              break;
            case "wait":
              await clock.advance(act.ms);
              break;
            case "night":
              session.nextNight();
              offHook = false;
              break;
            case "ring":
              session.ringNow();
              break;
          }
          for (const m of METERS) {
            const v = session.state[m];
            if (v < METER_MIN || v > METER_MAX) violations.push(`${m}=${v}`);
          }
        }
        if (violations.length) throw new Error(violations.join("; "));
        return true;
      }),
      { numRuns: 300 },
    );
  });

  it("calls back after a hang-up", async () => {
    const clock = new FakeClock();
    const line = new SimLine(clock);
    const session = new CallSession(line, new Director(nodes, rng(1)), initialState(), { clock, random: rng(2) });
    session.ringNow();
    session.handle({ type: "OFF_HOOK", t: 0 });
    await clock.advance(3000);
    session.handle({ type: "ON_HOOK", t: clock.now() });
    await clock.advance(15000);
    expect(session.phase).toBe("ringing");
    session.handle({ type: "OFF_HOOK", t: clock.now() });
    await clock.advance(100);
    expect(session.current?.tag).toBe("callback");
  });

  it("the human can be reached and the service exit found", async () => {
    // Walk: operator, operator again (human), 4 (refused), records twice (trust), 4 (exit).
    const clock = new FakeClock();
    const line = new SimLine(clock, 50);
    const session = new CallSession(line, new Director(nodes, rng(3)), initialState(), { clock, random: rng(4) });
    const press = async (d: string) => {
      session.handle({ type: "DIGIT", t: clock.now(), value: d, source: "dtmf" });
      await clock.advance(50);
    };
    const untilMenu = async () => {
      for (let i = 0; i < 80 && session.current?.tag !== "menu_main"; i++) await clock.advance(250);
    };
    session.handle({ type: "OFF_HOOK", t: 0 });
    await untilMenu();
    await press("0");
    await untilMenu();
    await press("0");
    expect(session.current?.id).toBe("operator_02");
    for (let i = 0; i < 40 && session.current?.tag !== "human_helper"; i++) await clock.advance(100);
    expect(session.current?.tag).toBe("human_helper");
    await untilMenu();
    await press("2");
    await untilMenu();
    await press("2");
    expect(session.current?.id).toBe("records_02");
    await press("1");
    await untilMenu();
    await press("4");
    expect(session.current?.id).toBe("four_escape");
    await clock.advance(10000);
    expect(session.phase).toBe("ended");
  });
});
