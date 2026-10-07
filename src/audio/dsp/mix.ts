// The studio: everything after the voices, as plain DSP so the AudioWorklet and the offline renders
// run the same mix. Voices land on five buses (drums, bass, music, lead, ambience), each cleaned and
// shaped; two sends feed a short room and a long hall (feedback delay networks) and a dub delay with
// a filter in its loop; the master is a low-pass, a 24 dB/oct high-pass at 25 Hz, a glue compressor
// and a look-ahead limiter at -1.5 dBFS. Rules from the workshop's mixing notes
// (knowledge/24-audio-engineering.md): high-pass everything but kick and bass, returns high-passed
// at 250 Hz, sends not inserts, the master never clips.
import { Biquad } from "./voices";

export const BUSES = ["drums", "bass", "music", "lead", "amb"] as const;
export type BusId = (typeof BUSES)[number];
export const BUS: Record<BusId, number> = { drums: 0, bass: 1, music: 2, lead: 3, amb: 4 };

/** Each world's room: two reverbs, a dub delay with a filter in its loop, a master filter, modulation. */
export type WorldFx = {
  room: number; // send gain into a short room
  hall: number; // send gain into a long hall
  delayTime: number; // seconds
  feedback: number; // 0..0.9
  delayLp: number; // Hz, the filter inside the delay loop
  delayWet: number; // 0..1
  masterLp: number; // Hz
  wobble: number; // cents of tape wobble
  wobbleHz: number;
  duck: number; // sidechain depth 0..0.9
  duckRelease: number; // seconds
  /** Hall decay in seconds (default 3.2). */
  hallSec?: number;
};

export const DEFAULT_FX: WorldFx = { room: 0.2, hall: 0.3, delayTime: 0.375, feedback: 0.3, delayLp: 3000, delayWet: 0.2, masterLp: 18000, wobble: 0, wobbleHz: 0.3, duck: 0, duckRelease: 0.2 };

const db = (x: number) => Math.pow(10, x / 20);

/** Two cascaded Butterworth sections: a Linkwitz-Riley 24 dB/oct filter. */
class LR4 {
  private a: Biquad;
  private b: Biquad;
  constructor(sr: number, kind: "lp" | "hp", f: number) {
    this.a = new Biquad(sr, kind, f);
    this.b = new Biquad(sr, kind, f);
  }
  set(f: number) {
    this.a.set(f);
    this.b.set(f);
  }
  run(x: number) {
    return this.b.run(this.a.run(x));
  }
}

/** A stereo-linked feed-forward compressor with a soft knee. */
class Comp {
  private env = 0;
  private att: number;
  private rel: number;
  gr = 1;
  constructor(sr: number, private thr: number, private ratio: number, attack: number, release: number, private knee = 6) {
    this.att = Math.exp(-1 / (sr * attack));
    this.rel = Math.exp(-1 / (sr * release));
  }
  /** Gain for this sample, from the louder channel. */
  gain(l: number, r: number) {
    const x = Math.max(Math.abs(l), Math.abs(r));
    const k = x > this.env ? this.att : this.rel;
    this.env = k * this.env + (1 - k) * x;
    const lvl = 20 * Math.log10(this.env + 1e-9);
    const over = lvl - this.thr;
    let red = 0;
    if (over > this.knee / 2) red = over * (1 - 1 / this.ratio);
    else if (over > -this.knee / 2) red = ((over + this.knee / 2) ** 2 / (2 * this.knee)) * (1 - 1 / this.ratio);
    this.gr = db(-red);
    return this.gr;
  }
}

/** Look-ahead peak limiter: a sliding maximum over the look-ahead, a fast smoothed gain, a delayed signal. */
class Limiter {
  private n: number;
  private bl: Float32Array;
  private br: Float32Array;
  private i = 0;
  // Monotonic deque of (index, peak) for the sliding maximum.
  private qi: Int32Array;
  private qv: Float32Array;
  private h = 0;
  private t = 0;
  private count = 0;
  private g = 1;
  private att: number;
  private rel: number;
  constructor(sr: number, private ceil: number, look = 0.002, release = 0.12) {
    this.n = Math.max(8, Math.round(sr * look));
    this.bl = new Float32Array(this.n);
    this.br = new Float32Array(this.n);
    this.qi = new Int32Array(this.n + 1);
    this.qv = new Float32Array(this.n + 1);
    this.att = Math.exp(-1 / (this.n / 3));
    this.rel = Math.exp(-1 / (sr * release));
  }
  run(l: number, r: number, out: [number, number]) {
    const cap = this.n + 1;
    const p = Math.max(Math.abs(l), Math.abs(r));
    const c = this.count++;
    while (this.t !== this.h && this.qv[(this.t - 1 + cap) % cap] <= p) this.t = (this.t - 1 + cap) % cap;
    this.qi[this.t] = c;
    this.qv[this.t] = p;
    this.t = (this.t + 1) % cap;
    while (this.qi[this.h] <= c - this.n) this.h = (this.h + 1) % cap;
    const peak = this.qv[this.h];
    const want = peak > this.ceil ? this.ceil / peak : 1;
    this.g = want < this.g ? this.att * this.g + (1 - this.att) * want : this.rel * this.g + (1 - this.rel) * want;
    const dl = this.bl[this.i];
    const dr = this.br[this.i];
    this.bl[this.i] = l;
    this.br[this.i] = r;
    this.i = (this.i + 1) % this.n;
    // The smoothed gain can lag a sudden peak by a sample or two: a hard ceiling catches it.
    out[0] = Math.max(-this.ceil, Math.min(this.ceil, dl * this.g));
    out[1] = Math.max(-this.ceil, Math.min(this.ceil, dr * this.g));
  }
}

class Allpass {
  private b: Float32Array;
  private i = 0;
  constructor(n: number, private g = 0.6) {
    this.b = new Float32Array(n);
  }
  run(x: number) {
    const d = this.b[this.i];
    const v = x + d * this.g;
    this.b[this.i] = v;
    this.i = (this.i + 1) % this.b.length;
    return d - v * this.g;
  }
}

/**
 * An 8-line feedback delay network reverb (Hadamard mixing, a damping filter per line, gains set
 * for the decay time), with input diffusion and a pre-delay. Stereo in, stereo out.
 */
class Fdn {
  private lines: Float32Array[];
  private idx = new Int32Array(8);
  private damp = new Float32Array(8);
  private dk: number;
  private g = new Float32Array(8);
  private pre: Float32Array[];
  private pi = 0;
  private preN: number;
  private difL: Allpass[];
  private difR: Allpass[];
  private v = new Float32Array(8);
  constructor(private sr: number, size: number, seconds: number, dampHz: number, preSec: number) {
    const base = [1031, 1327, 1523, 1871, 2053, 2311, 2647, 2953];
    this.lines = base.map((n) => new Float32Array(Math.max(64, Math.round(((n * size) / 48000) * sr))));
    this.dk = 1 - Math.exp((-2 * Math.PI * dampHz) / sr);
    this.setDecay(seconds);
    this.preN = Math.max(1, Math.round(preSec * sr));
    this.pre = [new Float32Array(this.preN), new Float32Array(this.preN)];
    const s = sr / 48000;
    this.difL = [new Allpass(Math.round(142 * s)), new Allpass(Math.round(379 * s))];
    this.difR = [new Allpass(Math.round(107 * s)), new Allpass(Math.round(277 * s))];
  }
  setDecay(seconds: number) {
    for (let k = 0; k < 8; k++) this.g[k] = Math.pow(10, (-3 * this.lines[k].length) / (Math.max(0.1, seconds) * this.sr));
  }
  run(inL: number, inR: number, out: [number, number]) {
    const pl = this.pre[0][this.pi];
    const pr = this.pre[1][this.pi];
    this.pre[0][this.pi] = inL;
    this.pre[1][this.pi] = inR;
    this.pi = (this.pi + 1) % this.preN;
    let l = pl;
    let r = pr;
    for (const a of this.difL) l = a.run(l);
    for (const a of this.difR) r = a.run(r);
    const v = this.v;
    for (let k = 0; k < 8; k++) {
      const line = this.lines[k];
      const y = line[this.idx[k]];
      this.damp[k] += this.dk * (y - this.damp[k]);
      v[k] = this.damp[k] * this.g[k];
    }
    // Fast Hadamard transform, normalised.
    for (let h = 1; h < 8; h *= 2)
      for (let i = 0; i < 8; i += h * 2)
        for (let j = i; j < i + h; j++) {
          const a = v[j];
          const b = v[j + h];
          v[j] = a + b;
          v[j + h] = a - b;
        }
    let oL = 0;
    let oR = 0;
    for (let k = 0; k < 8; k++) {
      const line = this.lines[k];
      const fb = v[k] * 0.35355339;
      line[this.idx[k]] = fb + (k < 4 ? l : r);
      this.idx[k] = (this.idx[k] + 1) % line.length;
      if (k % 2 === 0) oL += line[this.idx[k]];
      else oR += line[this.idx[k]];
    }
    out[0] = oL * 0.35;
    out[1] = oR * 0.35;
  }
}

type Glide = { from: WorldFx; to: WorldFx; start: number; frames: number };

/** The studio after the voices. `buses` and the sends are filled by the core each block. */
export class Mixer {
  readonly bus: [Float32Array, Float32Array][];
  readonly send: [Float32Array, Float32Array];
  readonly del: [Float32Array, Float32Array];
  fx: WorldFx = { ...DEFAULT_FX };
  private glide: Glide | null = null;
  private sweep: { start: number; frames: number; from: number; to: number } | null = null;
  private throwAt: { frame: number; hold: number } | null = null;
  private fbNow = DEFAULT_FX.feedback;
  private lpNow = DEFAULT_FX.masterLp;
  private busHp: (LR4 | Biquad)[][];
  private busLp: Biquad[][];
  private drumComp: Comp;
  private glue: Comp;
  private limiter: Limiter;
  private room: Fdn;
  private hall: Fdn;
  private retHp: Biquad[];
  private retLp: Biquad[];
  private dl: Float32Array[];
  private di = 0;
  private dlz = [0, 0];
  private dTime = DEFAULT_FX.delayTime;
  private masterLp: Biquad[];
  private masterHp: LR4[];
  private o: [number, number] = [0, 0];
  private o2: [number, number] = [0, 0];
  private hallSec = 3.2;
  /** Gain of each bus into the master. */
  readonly level: Record<BusId, number> = { drums: 1, bass: 1, music: 1, lead: 1, amb: 1 };
  peak = 0;

  constructor(private sr: number, block = 128) {
    const buf = () => [new Float32Array(block), new Float32Array(block)] as [Float32Array, Float32Array];
    this.bus = BUSES.map(buf);
    this.send = buf();
    this.del = buf();
    // Clean every bus: kick and bass keep their lows, everything else is high-passed into its own range.
    const hp: Record<BusId, number> = { drums: 28, bass: 32, music: 80, lead: 170, amb: 160 };
    const lp: Record<BusId, number> = { drums: 12500, bass: 6000, music: 15000, lead: 13000, amb: 8000 };
    this.busHp = BUSES.map((b) => [0, 1].map(() => (b === "bass" || b === "drums" ? new LR4(sr, "hp", hp[b]) : new Biquad(sr, "hp", hp[b]))));
    this.busLp = BUSES.map((b) => [0, 1].map(() => new Biquad(sr, "lp", lp[b])));
    this.drumComp = new Comp(sr, -16, 4, 0.004, 0.12);
    this.glue = new Comp(sr, -14, 2, 0.01, 0.18);
    this.limiter = new Limiter(sr, db(-1.5));
    this.room = new Fdn(sr, 0.45, 0.9, 7000, 0.008);
    this.hall = new Fdn(sr, 1, this.hallSec, 5000, 0.03);
    this.retHp = [0, 1].map(() => new Biquad(sr, "hp", 250));
    this.retLp = [0, 1].map(() => new Biquad(sr, "lp", 10000));
    this.dl = [new Float32Array(sr * 2), new Float32Array(sr * 2)];
    this.masterLp = [0, 1].map(() => new Biquad(sr, "lp", 18000, 0.6));
    this.masterHp = [0, 1].map(() => new LR4(sr, "hp", 25));
  }

  /** Glide every effect to a world's settings from `frame` over `ramp` seconds. */
  setFx(fx: WorldFx, frame: number, ramp: number) {
    this.glide = { from: { ...this.fx }, to: fx, start: frame, frames: Math.max(1, Math.round(ramp * this.sr)) };
    this.sweep = null;
    if ((fx.hallSec ?? 3.2) !== this.hallSec) this.hall.setDecay((this.hallSec = fx.hallSec ?? 3.2));
  }
  /** A dub throw: the delay feedback jumps, then falls back over `hold` seconds. */
  throwDelay(frame: number, hold: number) {
    this.throwAt = { frame, hold };
  }
  /** Sweep the master filter (submerge, lift-off) until the next world's effects arrive. */
  sweepLp(frame: number, to: number, dur: number) {
    this.sweep = { start: frame, frames: Math.max(1, Math.round(dur * this.sr)), from: this.lpNow, to };
  }

  private params(frame: number) {
    const g = this.glide;
    if (g) {
      const t = Math.max(0, Math.min(1, (frame - g.start) / g.frames));
      if (frame >= g.start) {
        const f = {} as Record<string, number>;
        for (const k of Object.keys(g.to) as (keyof WorldFx)[]) {
          const a = g.from[k] as number | undefined;
          const b = g.to[k] as number | undefined;
          f[k] = a === undefined || b === undefined ? (b ?? a ?? 0) : a + (b - a) * t;
        }
        this.fx = f as unknown as WorldFx;
        if (t >= 1) this.glide = null;
      }
    }
    let lp = this.fx.masterLp;
    const s = this.sweep;
    if (s && frame >= s.start) {
      const t = Math.min(1, (frame - s.start) / s.frames);
      lp = s.from * Math.pow(s.to / Math.max(1, s.from), t);
    }
    this.lpNow = lp;
    for (const f of this.masterLp) f.set(Math.min(19000, Math.max(60, lp)), 0.6);
  }

  /** Mix one block that starts at absolute frame `start` into the output. */
  process(start: number, outL: Float32Array, outR: Float32Array) {
    const n = outL.length;
    this.params(start);
    const fx = this.fx;
    const dN = this.dl[0].length;
    const dk = 1 - Math.exp((-2 * Math.PI * fx.delayLp) / this.sr);
    const throwK = this.throwAt ? Math.exp(-1 / (this.sr * Math.max(0.05, this.throwAt.hold / 3))) : 0;
    let p = this.peak * 0.995;
    for (let i = 0; i < n; i++) {
      const frame = start + i;
      // The delay: a smoothed time (no zipper), a low-pass in the loop, the throw's feedback swell.
      this.dTime += (fx.delayTime - this.dTime) * 0.0005;
      if (this.throwAt && frame >= this.throwAt.frame) {
        if (frame === this.throwAt.frame) this.fbNow = 0.86;
        this.fbNow = fx.feedback + (this.fbNow - fx.feedback) * throwK;
        if (frame - this.throwAt.frame > this.throwAt.hold * this.sr * 2) this.throwAt = null;
      } else this.fbNow += (fx.feedback - this.fbNow) * 0.001;
      const read = this.dTime * this.sr;
      const ri = Math.floor(read);
      const rf = read - ri;
      let mixL = 0;
      let mixR = 0;
      for (let ch = 0; ch < 2; ch++) {
        const d = this.dl[ch];
        const a = d[(this.di - ri + dN) % dN];
        const b = d[(this.di - ri - 1 + dN) % dN];
        this.dlz[ch] += dk * (a + (b - a) * rf - this.dlz[ch]);
        d[this.di] = this.del[ch][i] + this.dlz[ch] * this.fbNow;
      }
      this.di = (this.di + 1) % dN;

      // Buses.
      let dL = 0;
      let dR = 0;
      for (let b = 0; b < 5; b++) {
        const [L, R] = this.bus[b];
        let l = this.busLp[b][0].run(this.busHp[b][0].run(L[i]));
        let r = this.busLp[b][1].run(this.busHp[b][1].run(R[i]));
        if (b === 0) {
          const g = this.drumComp.gain(l, r);
          // Gentle tape-style saturation on the drums after the compressor.
          l = Math.tanh(l * g * 1.4) / 1.4;
          r = Math.tanh(r * g * 1.4) / 1.4;
          dL = l;
          dR = r;
          continue;
        }
        const k = this.level[BUSES[b]];
        mixL += l * k;
        mixR += r * k;
      }
      mixL += dL * this.level.drums;
      mixR += dR * this.level.drums;

      // Returns: the room and the hall share the send, the echoes bloom into the hall.
      const sL = this.send[0][i] + this.dlz[0] * fx.delayWet * 0.4;
      const sR = this.send[1][i] + this.dlz[1] * fx.delayWet * 0.4;
      this.room.run(sL * fx.room, sR * fx.room, this.o);
      let rL = this.o[0];
      let rR = this.o[1];
      this.hall.run(sL * fx.hall, sR * fx.hall, this.o);
      rL += this.o[0];
      rR += this.o[1];
      rL = this.retLp[0].run(this.retHp[0].run(rL));
      rR = this.retLp[1].run(this.retHp[1].run(rR));
      mixL += rL + this.dlz[0] * fx.delayWet;
      mixR += rR + this.dlz[1] * fx.delayWet;

      // Master: filter, high-pass, glue, limit.
      let l = this.masterHp[0].run(this.masterLp[0].run(mixL));
      let r = this.masterHp[1].run(this.masterLp[1].run(mixR));
      const g = this.glue.gain(l, r);
      l *= g;
      r *= g;
      this.limiter.run(l, r, this.o2);
      outL[i] = this.o2[0];
      outR[i] = this.o2[1];
      p = Math.max(p, Math.abs(outL[i]), Math.abs(outR[i]));
    }
    this.peak = p;
    for (const [L, R] of this.bus) (L.fill(0), R.fill(0));
    this.send[0].fill(0);
    this.send[1].fill(0);
    this.del[0].fill(0);
    this.del[1].fill(0);
  }
}
