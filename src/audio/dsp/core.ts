// The synth core: a sample-accurate event queue and a voice pool. No Web Audio types, so the
// AudioWorklet wraps it and the tests render it directly.
import { makeVoice, type NoteParams, type Voice } from "./voices";

export type NoteEvent = {
  /** Absolute sample frame to start on. */
  frame: number;
  note: NoteParams;
  /** Reverb send 0..1. */
  send?: number;
  /** Optional id so a held note can be released later. */
  id?: number;
};

export type CoreMsg =
  | { type: "note"; ev: NoteEvent }
  | { type: "notes"; evs: NoteEvent[] }
  | { type: "release"; id: number; frame: number }
  | { type: "panic" };

const MAX_VOICES = 40;

type Live = { v: Voice; send: number; id?: number; born: number; gl: number; gr: number };

export class Core {
  private queue: NoteEvent[] = [];
  private releases: { id: number; frame: number }[] = [];
  private live: Live[] = [];
  private mono: Float32Array;
  peak = 0;

  constructor(private sr: number, block = 128) {
    this.mono = new Float32Array(block);
  }

  handle(msg: CoreMsg) {
    if (msg.type === "note") this.push(msg.ev);
    else if (msg.type === "notes") for (const e of msg.evs) this.push(e);
    else if (msg.type === "release") this.releases.push({ id: msg.id, frame: msg.frame });
    else if (msg.type === "panic") {
      this.queue.length = 0;
      for (const l of this.live) l.v.release();
    }
  }

  private push(ev: NoteEvent) {
    // Keep the queue sorted by frame; most events arrive in order, so walk from the end.
    let i = this.queue.length;
    while (i > 0 && this.queue[i - 1].frame > ev.frame) i--;
    this.queue.splice(i, 0, ev);
  }

  get voices() {
    return this.live.length;
  }

  /** Render one block starting at absolute frame `start` into dry and send stereo buffers. */
  process(start: number, dryL: Float32Array, dryR: Float32Array, sendL: Float32Array, sendR: Float32Array) {
    const n = dryL.length;
    if (this.mono.length < n) this.mono = new Float32Array(n);
    const end = start + n;

    // Releases due in this block are applied at block granularity (fine for held pads).
    for (let i = this.releases.length - 1; i >= 0; i--) {
      const r = this.releases[i];
      if (r.frame < end) {
        for (const l of this.live) if (l.id === r.id) l.v.release();
        this.releases.splice(i, 1);
      }
    }

    // Start due notes. A note's first sample lands on its exact frame inside the block.
    const starting: { l: Live; off: number }[] = [];
    while (this.queue.length && this.queue[0].frame < end) {
      const ev = this.queue.shift()!;
      const off = Math.max(0, ev.frame - start);
      if (this.live.length >= MAX_VOICES) this.steal();
      const pan = Math.max(-1, Math.min(1, ev.note.pan ?? 0));
      // Equal-power pan.
      const a = ((pan + 1) * Math.PI) / 4;
      const l: Live = { v: makeVoice(this.sr, ev.note), send: ev.send ?? 0.2, id: ev.id, born: ev.frame, gl: Math.cos(a), gr: Math.sin(a) };
      this.live.push(l);
      starting.push({ l, off });
    }

    for (const l of this.live) {
      const st = starting.find((s) => s.l === l);
      const off = st ? st.off : 0;
      this.mono.fill(0, 0, n);
      l.v.render(this.mono, off, n - off);
      for (let i = off; i < n; i++) {
        const s = this.mono[i];
        const L = s * l.gl;
        const R = s * l.gr;
        dryL[i] += L;
        dryR[i] += R;
        sendL[i] += L * l.send;
        sendR[i] += R * l.send;
      }
    }
    this.live = this.live.filter((l) => !l.v.done);

    let p = this.peak * 0.995;
    for (let i = 0; i < n; i++) p = Math.max(p, Math.abs(dryL[i]), Math.abs(dryR[i]));
    this.peak = p;
  }

  private steal() {
    // Oldest voice goes first; it has usually decayed the most.
    let oldest = 0;
    for (let i = 1; i < this.live.length; i++) if (this.live[i].born < this.live[oldest].born) oldest = i;
    this.live.splice(oldest, 1);
  }
}
