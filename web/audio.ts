// All sound is synthesized here or spoken by the browser. No samples, no licences to worry about.
// Everything except speech goes through a telephone band filter (300 to 3400 Hz).

import { dtmfPair } from "../engine/signal/dtmf";

export class PhoneAudio {
  ctx: AudioContext;
  private line: GainNode; // earpiece bus, band limited
  private room: GainNode; // bell in the room, full band
  private ringStop: (() => void) | null = null;
  private busyStop: (() => void) | null = null;
  private holdStop: (() => void) | null = null;

  constructor() {
    this.ctx = new AudioContext();
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 300;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3400;
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6);
    }
    shaper.curve = curve;
    this.line = this.ctx.createGain();
    this.line.gain.value = 0.5;
    this.line.connect(hp).connect(lp).connect(shaper).connect(this.ctx.destination);
    this.room = this.ctx.createGain();
    this.room.gain.value = 0.35;
    this.room.connect(this.ctx.destination);
  }

  resume(): Promise<void> {
    return this.ctx.resume();
  }

  /** Electromechanical bell: two detuned gongs struck by a 25 Hz hammer. Cadence 1 s on, 3 s off. */
  startRing(): void {
    if (this.ringStop) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    const gongs = [980, 1240, 2010].map((f, i) => {
      const o = ctx.createOscillator();
      o.type = i === 2 ? "sine" : "triangle";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = i === 2 ? 0.15 : 0.5;
      o.connect(g).connect(out);
      o.start();
      return o;
    });
    // hammer: 25 Hz amplitude modulation
    const hammer = ctx.createOscillator();
    hammer.type = "square";
    hammer.frequency.value = 25;
    const hammerDepth = ctx.createGain();
    hammerDepth.gain.value = 0.35;
    const cadence = ctx.createGain();
    cadence.gain.value = 0.65; // 0.3..1.0 with the hammer
    hammer.connect(hammerDepth).connect(cadence.gain);
    out.connect(cadence).connect(this.room);
    hammer.start();
    let t = ctx.currentTime + 0.05;
    const schedule = () => {
      // keep 8 s of cadence scheduled ahead
      while (t < ctx.currentTime + 8) {
        out.gain.setValueAtTime(0, t);
        out.gain.linearRampToValueAtTime(1, t + 0.02);
        out.gain.setValueAtTime(1, t + 1.0);
        out.gain.linearRampToValueAtTime(0, t + 1.25); // bell rings out
        t += 4;
      }
    };
    schedule();
    const timer = setInterval(schedule, 2000);
    this.ringStop = () => {
      clearInterval(timer);
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.15);
      setTimeout(() => {
        gongs.forEach((o) => o.stop());
        hammer.stop();
        cadence.disconnect();
      }, 300);
    };
  }

  stopRing(): void {
    this.ringStop?.();
    this.ringStop = null;
  }

  /** One dial-pulse click in the earpiece (the loop break). */
  click(): void {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.012);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 5));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.6;
    src.connect(g).connect(this.line);
    src.start();
  }

  /** Short line noise when a voice is cut off. */
  glitch(): void {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.35);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (i % 900 < 450 ? 0.8 : 0.1);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.line);
    src.start();
  }

  dtmf(key: string, ms = 90): void {
    const [f1, f2] = dtmfPair(key);
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = 0.18;
    g.connect(this.line);
    const t = ctx.currentTime;
    for (const f of [f1, f2]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      o.stop(t + ms / 1000);
    }
  }

  /** Disconnect tone: 425 Hz, 0.25 s on, 0.25 s off, until stopped. */
  startBusy(): void {
    if (this.busyStop) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = 425;
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(this.line);
    o.start();
    let t = ctx.currentTime + 0.05;
    const schedule = () => {
      while (t < ctx.currentTime + 4) {
        g.gain.setValueAtTime(0.2, t);
        g.gain.setValueAtTime(0, t + 0.25);
        t += 0.5;
      }
    };
    schedule();
    const timer = setInterval(schedule, 1000);
    this.busyStop = () => {
      clearInterval(timer);
      g.gain.cancelScheduledValues(ctx.currentTime);
      g.gain.value = 0;
      o.stop(ctx.currentTime + 0.05);
    };
  }

  stopBusy(): void {
    this.busyStop?.();
    this.busyStop = null;
  }

  /**
   * Hold music: an original, slightly seasick music-box tune in A minor,
   * played through the phone band with tape wow. Resolves after `seconds` or on stop.
   */
  hold(seconds: number): Promise<void> {
    this.stopHold();
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.32;
    out.connect(this.line);
    const wow = ctx.createOscillator();
    wow.frequency.value = 0.35;
    const wowDepth = ctx.createGain();
    wowDepth.gain.value = 9; // cents-ish, applied to detune
    wow.connect(wowDepth);
    wow.start();
    // scale degrees in A minor, one bar per line; 0 = rest
    const A4 = 440;
    const semis = [
      [0, 3, 7, 12], [10, 7, 3, 0], [-2, 2, 5, 10], [8, 7, 5, 3],
      [0, 3, 7, 12], [15, 14, 12, 7], [5, 3, 2, -2], [0, 0, -5, 0],
    ];
    const beat = 0.42;
    const notes = semis.flat();
    const start = ctx.currentTime + 0.1;
    const end = start + seconds;
    for (let i = 0, t = start; t < end - 0.1; i++, t += beat) {
      const s = notes[i % notes.length]!;
      const f = A4 * Math.pow(2, (s - 12) / 12) * 2;
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      wowDepth.connect(o.detune);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.8);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + beat * 2);
      // bass on the bar
      if (i % 4 === 0) {
        const b = ctx.createOscillator();
        b.type = "sine";
        b.frequency.value = f / 4;
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.35, t);
        bg.gain.exponentialRampToValueAtTime(0.001, t + beat * 3.5);
        b.connect(bg).connect(out);
        b.start(t);
        b.stop(t + beat * 4);
      }
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => finish(), seconds * 1000);
      const finish = () => {
        clearTimeout(timer);
        const now = ctx.currentTime;
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(out.gain.value, now);
        out.gain.linearRampToValueAtTime(0, now + 0.08);
        setTimeout(() => {
          out.disconnect();
          wow.stop();
        }, 150);
        this.holdStop = null;
        resolve();
      };
      this.holdStop = finish;
    });
  }

  stopHold(): void {
    this.holdStop?.();
  }

  private fileStop: (() => void) | null = null;
  private known = new Map<string, boolean>();

  /** Play a recorded line through the phone band. Resolves false if the file is missing. */
  async playFile(url: string): Promise<boolean> {
    this.stopFile();
    if (!this.known.has(url)) {
      try {
        const r = await fetch(url, { method: "HEAD" });
        this.known.set(url, r.ok && (r.headers.get("content-type") ?? "").startsWith("audio"));
      } catch {
        this.known.set(url, false);
      }
    }
    if (!this.known.get(url)) return false;
    const el = new Audio(url);
    const src = this.ctx.createMediaElementSource(el);
    src.connect(this.line);
    return new Promise((resolve) => {
      const finish = () => {
        this.fileStop = null;
        el.pause();
        src.disconnect();
        resolve(true);
      };
      el.onended = finish;
      el.onerror = finish;
      this.fileStop = finish;
      el.play().catch(finish);
    });
  }

  stopFile(): void {
    this.fileStop?.();
  }
}

/** Browser speech synthesis for the robot and (until recordings exist) the human. */
export class Voice {
  private voices: SpeechSynthesisVoice[] = [];
  private pending: (() => void) | null = null;

  constructor() {
    if (!("speechSynthesis" in window)) return;
    const load = () => (this.voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en")));
    load();
    speechSynthesis.addEventListener("voiceschanged", load);
  }

  private pick(kind: "robot" | "human"): SpeechSynthesisVoice | undefined {
    if (this.voices.length === 0) return undefined;
    const prefer =
      kind === "robot"
        ? [/Google UK English Male/, /Daniel/, /David/, /Male/, /en-GB/]
        : [/Google US English/, /Samantha/, /Zira/, /Female/, /en-US/];
    for (const p of prefer) {
      const v = this.voices.find((x) => p.test(x.name) || p.test(x.lang));
      if (v) return v;
    }
    return this.voices[0];
  }

  speak(text: string, kind: "robot" | "human"): Promise<void> {
    this.stop();
    const readMs = 1200 + text.split(/\s+/).length * 380;
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(safety);
        this.pending = null;
        resolve();
      };
      // Some browsers have no voices, or never start or finish speaking.
      // Then the subtitles carry the line for its reading time.
      const safety = setTimeout(finish, readMs * 1.25 + 1500);
      this.pending = finish;
      if (!("speechSynthesis" in window) || speechSynthesis.getVoices().length === 0) {
        clearTimeout(safety);
        setTimeout(finish, readMs);
        return;
      }
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pick(kind);
      if (v) u.voice = v;
      u.rate = kind === "robot" ? 0.9 : 1.08;
      u.pitch = kind === "robot" ? 0.55 : 1.15;
      u.volume = 0.9;
      let started = false;
      u.onstart = () => (started = true);
      u.onend = finish;
      u.onerror = finish;
      setTimeout(() => {
        if (started || done) return;
        speechSynthesis.cancel();
        clearTimeout(safety);
        setTimeout(finish, Math.max(0, readMs - 1500));
      }, 1500);
      speechSynthesis.speak(u);
    });
  }

  stop(): void {
    const p = this.pending;
    this.pending = null;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    p?.();
  }
}
