// The web phone. A simulated line that produces the same raw signals the
// UNO Q produces (hook-switch edges with timestamps, 8 kHz DTMF audio) and
// feeds them to the same decoders and the same engine.

import nodesYaml from "../content/nodes.yaml?raw";
import { CallSession, type Phase } from "../engine/call";
import { loadNodes } from "../engine/content";
import { Director, initialState } from "../engine/director/director";
import type { HauntState } from "../engine/director/types";
import type { Line, LineEvent, Speaker } from "../engine/line";
import { DtmfDecoder, dtmfSamples, SAMPLE_RATE } from "../engine/signal/dtmf";
import { PulseDecoder } from "../engine/signal/pulse";
import { PhoneAudio, Voice } from "./audio";

const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const SVGNS = "http://www.w3.org/2000/svg";
const STORE = "puhelu.state.v1";

// ---------------------------------------------------------------- state

function loadState(): HauntState {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return initialState();
    const saved = JSON.parse(raw) as { state: HauntState; seen: number };
    const s = { ...initialState(), ...saved.state, callbacksPending: 0 };
    // A new night if you were away for six hours or more.
    if (Date.now() - saved.seen > 6 * 3600 * 1000) s.night += 1;
    return s;
  } catch {
    return initialState();
  }
}

function saveState(s: HauntState): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ state: s, seen: Date.now() }));
  } catch {
    /* private mode: the haunting forgets, which is its own kind of mercy */
  }
}

// ---------------------------------------------------------------- audio and line

let audio: PhoneAudio;
const voice = new Voice();
const phoneEl = $("#phone");
const caption = $("#caption");
let speaking: Speaker | "hold" | null = null;

function showCaption(kind: Speaker | "hold" | "system", text: string): void {
  caption.className = `caption ${kind}`;
  $("#who").textContent =
    kind === "robot" ? "Thirdwatch" : kind === "human" ? "Agent" : kind === "hold" ? "On hold" : "";
  $("#caption-text").textContent = text;
}

const webLine: Line = {
  ring() {
    audio.startRing();
    phoneEl.classList.add("ringing");
    showCaption("system", "The phone is ringing.");
  },
  stopRing() {
    audio.stopRing();
    phoneEl.classList.remove("ringing");
  },
  async say(text, speaker, file) {
    // Handset already down, hang-up not yet confirmed (300 ms): nobody hears this.
    if (!offHook) return new Promise((r) => setTimeout(r, 400));
    speaking = speaker;
    showCaption(speaker, text);
    const played = file ? await audio.playFile(`./${file}`) : false;
    if (!played) await voice.speak(text, speaker);
    speaking = null;
  },
  hold(seconds) {
    if (!offHook) return new Promise((r) => setTimeout(r, 400));
    speaking = "hold";
    showCaption("hold", "♪  hold music  ♪");
    return audio.hold(seconds).finally(() => (speaking = null));
  },
  interrupt() {
    if (speaking === "human") audio.glitch();
    speaking = null;
    voice.stop();
    audio.stopHold();
    audio.stopFile();
  },
  busy() {
    audio.startBusy();
    showCaption("system", "They hung up. The line is dead. You can hang up now.");
  },
};

// ---------------------------------------------------------------- engine

const director = new Director(loadNodes(nodesYaml));
const session = new CallSession(webLine, director, loadState(), {
  onChange: (s, phase) => {
    saveState(s);
    renderMonitor(s, phase);
  },
  onNode: (n) => {
    $("#node").innerHTML = `node <code>${n.id}</code> · tag <code>${n.tag}</code>`;
  },
  onLog: (m) => log(m),
});

const pulse = new PulseDecoder({ profile: "standard" });
const dtmf = new DtmfDecoder();

function deliver(evs: LineEvent[]): void {
  for (const ev of evs) {
    if (ev.type === "DIGIT") addDigitChip(ev.value, ev.source, ev.pps);
    if (ev.type === "ON_HOOK") audio?.stopBusy();
    session.handle(ev);
  }
}

// Raw SHK level, as the MCU would report it. 1 = loop closed (off hook).
// Edges carry their own timestamps, like the MCU's micros(). Dial pulses are
// stamped with their scheduled times, so a busy or throttled browser cannot
// bend a pulse, the same way Bridge delay cannot on the hardware.
let shk: 0 | 1 = 0;
let lastEdgeT = 0;
const trace: { t: number; level: 0 | 1 }[] = [{ t: 0, level: 0 }];
function setShk(level: 0 | 1, at?: number): void {
  if (level === shk) return;
  shk = level;
  const t = Math.max(at ?? performance.now(), lastEdgeT + 1);
  lastEdgeT = t;
  trace.push({ t, level });
  if (trace.length > 400) trace.splice(0, trace.length - 400);
  deliver(pulse.edge(t, level));
}
setInterval(() => deliver(pulse.tick(performance.now())), 10);

// ---------------------------------------------------------------- hook

let offHook = false;
function setHook(off: boolean): void {
  if (off === offHook) return;
  offHook = off;
  phoneEl.classList.toggle("offhook", off);
  $("#hook-btn").textContent = off ? "Hang up" : "Lift handset";
  if (!off) {
    audio.stopBusy();
    webLine.interrupt();
    showCaption("system", "The line is quiet.");
  }
  setShk(off ? 1 : 0);
  drawCord();
}
$("#handset").addEventListener("click", () => setHook(!offHook));
$("#hook-btn").addEventListener("click", () => setHook(!offHook));

function drawCord(): void {
  const end = offHook ? "58 96" : "78 124";
  $("#cord").setAttribute("d", `M52 380 C 0 360, 10 300, 30 250 S 20 150, ${end}`);
}
drawCord();

// ---------------------------------------------------------------- rotary dial

const STOP = 60; // degrees, where a hole lands at the finger stop (SVG angles: 0 = 3 o'clock, clockwise)
const BASE = 56; // rotation needed for one pulse
const STEP = 30; // per extra pulse
const HOLE_R = 72;
const rotFor = (n: number) => BASE + (n - 1) * STEP;
const label = (n: number) => (n === 10 ? "0" : String(n));
const polar = (deg: number, r: number) => [Math.cos((deg * Math.PI) / 180) * r, Math.sin((deg * Math.PI) / 180) * r];

const disc = $<SVGGElement>("#dial-disc");
const numbers = $<SVGGElement>("#dial-numbers");
{
  const defs = $<SVGDefsElement>("#phone-svg defs");
  const mask = document.createElementNS(SVGNS, "mask");
  mask.id = "holes";
  mask.innerHTML = `<rect x="-120" y="-120" width="240" height="240" fill="#fff"/>`;
  for (let n = 1; n <= 10; n++) {
    const [x, y] = polar(STOP - rotFor(n), HOLE_R);
    mask.innerHTML += `<circle cx="${x}" cy="${y}" r="15" fill="#000"/>`;
    numbers.innerHTML += `<text x="${x}" y="${y}">${label(n)}</text>`;
  }
  defs.appendChild(mask);
  disc.innerHTML = `<circle r="98" fill="#d8ccb0" fill-opacity="0.93" mask="url(#holes)" stroke="#9c8f72"/>`;
  for (let n = 1; n <= 10; n++) {
    const [x, y] = polar(STOP - rotFor(n), HOLE_R);
    disc.innerHTML += `<circle class="hole" data-n="${n}" cx="${x}" cy="${y}" r="15" fill="transparent" stroke="#8d7f62" stroke-width="1.5"/>`;
  }
  // finger stop, just past where the holes land
  const a = STOP + 17;
  const [x1, y1] = polar(a - 3, 62);
  const [x2, y2] = polar(a - 3, 108);
  const [x3, y3] = polar(a + 3, 108);
  const [x4, y4] = polar(a + 3, 62);
  $("#finger-stop").setAttribute("d", `M${x1} ${y1} L${x2} ${y2} L${x3} ${y3} L${x4} ${y4} Z`);
}

let dialBusy = false;
let drag: { n: number; last: number; rot: number } | null = null;

function dialCenter(): [number, number] {
  const svg = $<SVGSVGElement>("#phone-svg");
  const m = svg.getScreenCTM()!;
  const p = svg.createSVGPoint();
  p.x = 210;
  p.y = 292;
  const s = p.matrixTransform(m);
  return [s.x, s.y];
}
const angleOf = (e: PointerEvent) => {
  const [cx, cy] = dialCenter();
  return (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI;
};
const norm = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const setRot = (r: number) => disc.setAttribute("transform", `rotate(${r})`);

disc.addEventListener("pointerdown", (e) => {
  const hole = (e.target as Element).closest(".hole");
  if (!hole || dialBusy) return;
  e.preventDefault();
  disc.setPointerCapture(e.pointerId);
  drag = { n: Number(hole.getAttribute("data-n")), last: angleOf(e), rot: 0 };
  phoneEl.classList.add("dragging");
});
disc.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const a = angleOf(e);
  drag.rot = Math.max(0, Math.min(rotFor(drag.n), drag.rot + norm(a - drag.last)));
  drag.last = a;
  setRot(drag.rot);
});
const endDrag = () => {
  if (!drag) return;
  const { n, rot } = drag;
  drag = null;
  phoneEl.classList.remove("dragging");
  release(rot, n);
};
disc.addEventListener("pointerup", endDrag);
disc.addEventListener("pointercancel", endDrag);

/** The dial returns under its governor at 10 pulses per second, breaking the loop once per pulse. */
function release(rot: number, n: number): void {
  const pulses = rot >= rotFor(n) - 6 ? n : rot >= BASE ? Math.floor((rot - BASE) / STEP) + 1 : 0;
  dialBusy = true;
  const speed = 0.3; // degrees per ms (30 degrees per 100 ms pulse period)
  const dur = rot / speed;
  const t0 = performance.now();
  // Visuals ride on animation frames; the dial's state does not depend on them.
  const frame = (now: number) => {
    const k = Math.min(1, (now - t0) / dur);
    setRot(rot * (1 - k));
    if (k < 1 && dialBusy) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  setTimeout(() => {
    dialBusy = false;
    setRot(0);
  }, dur);
  if (!offHook) return; // loop already open: nothing to break
  const start = performance.now() + 40;
  for (let i = 0; i < pulses; i++) {
    const brk = start + i * 100;
    setShk(0, brk);
    setShk(1, brk + 60 + (Math.random() - 0.5) * 6);
    setTimeout(() => offHook && audio.click(), brk - performance.now());
  }
}

/** Dial a digit by keyboard: wind the dial, then release. */
function autoDial(digit: string): void {
  if (dialBusy || drag) return;
  const n = digit === "0" ? 10 : Number(digit);
  dialBusy = true;
  const target = rotFor(n);
  const windMs = 180 + n * 25;
  const t0 = performance.now();
  let wound = false;
  const wind = (now: number) => {
    if (wound) return;
    setRot(target * Math.min(1, (now - t0) / windMs));
    requestAnimationFrame(wind);
  };
  requestAnimationFrame(wind);
  setTimeout(() => {
    wound = true;
    release(target, n);
  }, windMs);
}

// ---------------------------------------------------------------- keypad (DTMF)

const keypad = $("#keypad");
for (const k of "123456789*0#") {
  const b = document.createElement("button");
  b.textContent = k;
  b.setAttribute("aria-label", `Key ${k}`);
  b.addEventListener("click", () => pressKey(k));
  keypad.appendChild(b);
}
function pressKey(k: string): void {
  audio.dtmf(k);
  if (!offHook) return;
  // The same 8 kHz samples a sound card would record from the line, through the same Goertzel decoder.
  const tone = dtmfSamples(k, 90);
  const x = new Float32Array(tone.length + SAMPLE_RATE * 0.06);
  x.set(tone);
  deliver(dtmf.feed(x, performance.now()));
}

let mode: "rotary" | "keypad" = "rotary";
function setMode(m: typeof mode): void {
  mode = m;
  $("#mode-rotary").classList.toggle("on", m === "rotary");
  $("#mode-keypad").classList.toggle("on", m === "keypad");
  keypad.hidden = m !== "keypad";
}
$("#mode-rotary").addEventListener("click", () => setMode("rotary"));
$("#mode-keypad").addEventListener("click", () => setMode("keypad"));

document.addEventListener("keydown", (e) => {
  if (!audio || e.metaKey || e.ctrlKey || e.altKey) return;
  if ((e.target as HTMLElement).tagName === "BUTTON" && e.key === " ") return;
  if (e.key === " ") {
    e.preventDefault();
    setHook(!offHook);
  } else if (/^[0-9]$/.test(e.key)) {
    if (mode === "rotary") autoDial(e.key);
    else pressKey(e.key);
  } else if ((e.key === "*" || e.key === "#") && mode === "keypad") pressKey(e.key);
});

// ---------------------------------------------------------------- monitor

function bar(el: HTMLElement, v: number): void {
  if (el.children.length !== 10) el.innerHTML = "<i></i>".repeat(10);
  [...el.children].forEach((c, i) => c.classList.toggle("on", i < v));
}

function renderMonitor(s: HauntState, phase: Phase): void {
  const ph = $("#phase");
  ph.textContent = phase;
  ph.className = `phase ${phase}`;
  bar($("#m-dread"), s.dread);
  bar($("#m-trust"), s.trust);
  bar($("#m-patience"), s.patience);
  $("#f-night").textContent = String(s.night);
  $("#f-calls").textContent = String(s.calls);
  $("#f-hangups").textContent = String(s.hangups);
  $("#f-pps").textContent = s.avgPps === null ? "–" : `${s.avgPps.toFixed(1)} pps`;
  $("#flags").innerHTML = s.flags.map((f) => `<span>${f}</span>`).join("");
}

function addDigitChip(value: string, source: string, pps?: number): void {
  const el = document.createElement("span");
  el.className = "digit-chip";
  el.innerHTML = `<b>${value}</b><small>${source}${pps ? ` · ${pps.toFixed(1)} pps` : ""}</small>`;
  const box = $("#digits");
  box.appendChild(el);
  while (box.children.length > 8) box.firstElementChild!.remove();
}

function log(msg: string): void {
  const li = document.createElement("li");
  const d = new Date();
  li.innerHTML = `<time>${d.toTimeString().slice(0, 8)}</time>`;
  li.append(msg);
  const ol = $("#log");
  ol.prepend(li);
  while (ol.children.length > 60) ol.lastElementChild!.remove();
}

const scope = $<HTMLCanvasElement>("#scope");
function drawScope(): void {
  const ctx = scope.getContext("2d")!;
  const w = scope.width;
  const h = scope.height;
  const now = performance.now();
  const span = 4000;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "#1c2230";
  ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) {
    const x = (i / 4) * w;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  const y = (lv: number) => (lv ? h * 0.22 : h * 0.8);
  ctx.strokeStyle = "#d9a441";
  ctx.lineWidth = 2;
  ctx.beginPath();
  let level = trace[0]!.level;
  for (const e of trace) if (e.t <= now - span) level = e.level;
  ctx.moveTo(0, y(level));
  for (const e of trace) {
    if (e.t <= now - span) continue;
    const x = ((e.t - (now - span)) / span) * w;
    ctx.lineTo(x, y(level));
    level = e.level;
    ctx.lineTo(x, y(level));
  }
  ctx.lineTo(w, y(level));
  ctx.stroke();
  requestAnimationFrame(drawScope);
}

// ---------------------------------------------------------------- start

renderMonitor(session.state, session.phase);
let autoRings = 0;
function scheduleAutoRing(ms: number): void {
  setTimeout(() => {
    if (session.phase === "idle" && !offHook && autoRings < 3) {
      autoRings++;
      session.ringNow();
    }
    scheduleAutoRing(60000);
  }, ms);
}

$("#ring-btn").addEventListener("click", () => {
  if (offHook) setHook(false);
  setTimeout(() => session.ringNow(), 400);
});
$("#night-btn").addEventListener("click", () => {
  if (offHook) setHook(false);
  session.nextNight();
});
$("#reset-btn").addEventListener("click", () => {
  if (offHook) setHook(false);
  session.reset(initialState());
  $("#digits").innerHTML = "";
  $("#node").textContent = "";
  log("forgotten. for now.");
});

$("#plug").addEventListener("click", async () => {
  audio = new PhoneAudio();
  await audio.resume();
  // Warm up speech on a user gesture (iOS needs this).
  if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  $("#gate").hidden = true;
  log(`night ${session.state.night}. the line is connected.`);
  drawScope();
  scheduleAutoRing(2500);
});
