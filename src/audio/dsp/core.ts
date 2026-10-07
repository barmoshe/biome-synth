// The synth core: a sample-accurate event queue and a voice pool, plus the world-wide modulation
// (tape wobble, tape stop) and the sidechain duck. No Web Audio types, so the AudioWorklet wraps it
// and the tests render it directly.
import { makeVoice, type Mod, type NoteParams, type Voice } from "./voices";

export type NoteEvent = {
  /** Absolute sample frame to start on. */
  frame: number;
  note: NoteParams;
  /** Reverb send 0..1. */
  send?: number;
  /** Dub delay send 0..1. */
  delay?: number;
  /** This note ducks every duckable voice (the sidechain kick). */
  ducks?: boolean;
  /** Optional id so a held note can be released later. */
  id?: number;
};

/** The world's modulation, set by the conductor when the world changes. */
export type ModState = {
  /** Tape wobble depth in cents and rate in Hz. */
  wobble: number;
  wobbleHz: number;
  /** How deep the sidechain duck goes (0 = off, 0.8 = deep pump) and how fast it recovers (s). */
  duck: number;
  duckRelease: number;
};

export type CoreMsg =
  | { type: "note"; ev: NoteEvent }
  | { type: "notes"; evs: NoteEvent[] }
  | { type: "release"; id: number; frame: number }
  | { type: "mod"; mod: Partial<ModState> }
  /** Slow every voice to a stop over `seconds` from `frame` (the power-cut transition), then recover. */
  | { type: "tapestop"; frame: number; seconds: number }
  | { type: "panic" };

const MAX_VOICES = 48;

type Live = { v: Voice; send: number; delay: number; id?: number; born: number; gl: number; gr: number };

export class Core {
  private queue: NoteEvent[] = [];
  private releases: { id: number; frame: number }[] = [];
  private live: Live[] = [];
  private mono: Float32Array;
  private duckBuf: Float32Array;
  private duckLevel = 1;
  private pendingDucks: number[] = [];
  private stop: { frame: number; seconds: number } | null = null;
  private lfo = 0;
  readonly mod: Mod = { pitch: 1 };
  state: ModState = { wobble: 0, wobbleHz: 0.3, duck: 0, duckRelease: 0.22 };
  peak = 0;

  constructor(private sr: number, block = 128) {
    this.mono = new Float32Array(block);
    this.duckBuf = new Float32Array(block);
  }

  handle(msg: CoreMsg) {
    if (msg.type === "note") this.push(msg.ev);
    else if (msg.type === "notes") for (const e of msg.evs) this.push(e);
    else if (msg.type === "release") this.releases.push({ id: msg.id, frame: msg.frame });
    else if (msg.type === "mod") this.state = { ...this.state, ...msg.mod };
    else if (msg.type === "tapestop") this.stop = { frame: msg.frame, seconds: msg.seconds };
    else if (msg.type === "panic") {
      this.queue.length = 0;
      for (const l of this.live) l.v.release();
    }
  }

  private push(ev: NoteEvent) {
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].frame > ev.frame) i--;
    this.queue.splice(i, 0, ev);
  }

  get voices() {
    return this.live.length;
  }

  /** Render one block starting at absolute frame `start` into dry, reverb-send and delay-send stereo buffers. */
  process(start: number, dryL: Float32Array, dryR: Float32Array, sendL: Float32Array, sendR: Float32Array, delL?: Float32Array, delR?: Float32Array) {
    const n = dryL.length;
    if (this.mono.length < n) (this.mono = new Float32Array(n)), (this.duckBuf = new Float32Array(n));
    const end = start + n;

    // World modulation for this block: tape wobble, and the tape stop when one is running.
    this.lfo += (this.state.wobbleHz * n) / this.sr;
    let pitch = Math.pow(2, (this.state.wobble * Math.sin(this.lfo * Math.PI * 2)) / 1200);
    if (this.stop) {
      const t = (start - this.stop.frame) / this.sr;
      if (t >= 0) {
        if (t < this.stop.seconds) pitch *= Math.max(0.02, 1 - t / this.stop.seconds);
        else if (t < this.stop.seconds + 0.05) pitch *= 0.02;
        else this.stop = null;
      }
    }
    this.mod.pitch = pitch;

    for (let i = this.releases.length - 1; i >= 0; i--) {
      const r = this.releases[i];
      if (r.frame < end) {
        for (const l of this.live) if (l.id === r.id) l.v.release();
        this.releases.splice(i, 1);
      }
    }

    const starting: { l: Live; off: number }[] = [];
    while (this.queue.length && this.queue[0].frame < end) {
      const ev = this.queue.shift()!;
      const off = Math.max(0, ev.frame - start);
      if (this.live.length >= MAX_VOICES) this.steal();
      const pan = Math.max(-1, Math.min(1, ev.note.pan ?? 0));
      const a = ((pan + 1) * Math.PI) / 4;
      const l: Live = { v: makeVoice(this.sr, ev.note, this.mod), send: ev.send ?? 0.2, delay: ev.delay ?? 0, id: ev.id, born: ev.frame, gl: Math.cos(a), gr: Math.sin(a) };
      this.live.push(l);
      starting.push({ l, off });
      if (ev.ducks && this.state.duck > 0) this.pendingDucks.push(off);
    }

    // The sidechain envelope: drop on each ducking kick, recover exponentially.
    const rec = 1 - Math.exp(-1 / (this.sr * Math.max(0.02, this.state.duckRelease)));
    this.pendingDucks.sort((a, b) => a - b);
    let di = 0;
    for (let i = 0; i < n; i++) {
      while (di < this.pendingDucks.length && this.pendingDucks[di] <= i) {
        this.duckLevel = 1 - this.state.duck;
        di++;
      }
      this.duckLevel += (1 - this.duckLevel) * rec;
      this.duckBuf[i] = this.duckLevel;
    }
    this.pendingDucks.length = 0;

    for (const l of this.live) {
      const st = starting.find((s) => s.l === l);
      const off = st ? st.off : 0;
      this.mono.fill(0, 0, n);
      l.v.render(this.mono, off, n - off);
      const ducked = l.v.duck;
      for (let i = off; i < n; i++) {
        const s = ducked ? this.mono[i] * this.duckBuf[i] : this.mono[i];
        const L = s * l.gl;
        const R = s * l.gr;
        dryL[i] += L;
        dryR[i] += R;
        sendL[i] += L * l.send;
        sendR[i] += R * l.send;
        if (delL && l.delay) {
          delL[i] += L * l.delay;
          delR![i] += R * l.delay;
        }
      }
    }
    this.live = this.live.filter((l) => !l.v.done);

    let p = this.peak * 0.995;
    for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(dryL[i]), Math.abs(dryR[i]));
    this.peak = p;
  }

  private steal() {
    let oldest = 0;
    for (let i = 1; i < this.live.length; i++) if (this.live[i].born < this.live[oldest].born) oldest = i;
    this.live.splice(oldest, 1);
  }
}
