// Pure DSP voices, no Web Audio types: the worklet runs them, the tests render them in Node.
// Every voice writes mono samples; the core pans and sums. Chip voices (pulse, triangle, LFSR noise)
// carry the pixel-art sound; pluck and bell are small physical models for the "real space" half.

export type Patch =
  | "pulse" // square-ish lead, duty sets the colour
  | "tri" // NES-style stepped triangle
  | "pluck" // Karplus-Strong string
  | "bell" // modal bar: a few inharmonic decaying partials
  | "saw" // three detuned saws, the neon lead
  | "pad" // two detuned pulses through a slow lowpass
  | "sub" // sine sub bass
  | "kick" // sine with a pitch drop
  | "noise" // LFSR noise burst (hats, shakers, rain)
  | "snare"; // noise + tone body

export type NoteParams = {
  patch: Patch;
  freq: number; // Hz
  vel: number; // 0..1
  dur: number; // seconds the key is held
  attack?: number;
  decay?: number;
  sustain?: number;
  release?: number;
  cutoff?: number; // Hz, lowpass
  duty?: number; // pulse width 0.05..0.5
  bright?: number; // 0..1, patch-specific tone
  pan?: number; // -1..1
  bend?: number; // semitones glided over the note (comet swoops)
};

const TAU = Math.PI * 2;

export interface Voice {
  done: boolean;
  pan: number;
  /** Render n samples, adding into out[offset..]. */
  render(out: Float32Array, offset: number, n: number): void;
  /** Start the release now (for held notes cut short or voice stealing). */
  release(): void;
}

// ---------- envelope ----------

class Env {
  private t = 0;
  private level = 0;
  private relFrom = 0;
  private relT = -1;
  constructor(
    private sr: number,
    private a: number,
    private d: number,
    private s: number,
    private r: number,
    private hold: number,
  ) {}
  next(): number {
    const t = this.t / this.sr;
    this.t++;
    if (this.relT < 0 && t >= this.hold) this.startRelease();
    if (this.relT >= 0) {
      const rt = (this.t - this.relT) / this.sr;
      return rt >= this.r ? 0 : this.relFrom * Math.pow(1 - rt / this.r, 2);
    }
    if (t < this.a) this.level = t / this.a;
    else if (t < this.a + this.d) this.level = 1 - (1 - this.s) * ((t - this.a) / this.d);
    else this.level = this.s;
    return this.level;
  }
  startRelease() {
    if (this.relT >= 0) return;
    this.relFrom = this.level;
    this.relT = this.t;
  }
  get finished() {
    return this.relT >= 0 && (this.t - this.relT) / this.sr >= this.r;
  }
}

// A one-pole lowpass is enough for chip voices; the pad uses two in series.
class OnePole {
  private z = 0;
  private k = 1;
  constructor(private sr: number, cutoff: number) {
    this.set(cutoff);
  }
  set(cutoff: number) {
    this.k = 1 - Math.exp((-TAU * Math.min(cutoff, this.sr * 0.45)) / this.sr);
  }
  run(x: number) {
    this.z += this.k * (x - this.z);
    return this.z;
  }
}

// 15-bit LFSR, the NES noise channel. Short mode (tap 6) gives the metallic "tone" noise.
class Lfsr {
  private reg = 1;
  private phase = 0;
  constructor(private rate: number, private short: boolean) {}
  next(sr: number) {
    this.phase += this.rate / sr;
    while (this.phase >= 1) {
      this.phase -= 1;
      const bit = (this.reg ^ (this.reg >> (this.short ? 6 : 1))) & 1;
      this.reg = (this.reg >> 1) | (bit << 14);
    }
    return this.reg & 1 ? 1 : -1;
  }
}

// ---------- voices ----------

abstract class Base implements Voice {
  done = false;
  pan: number;
  protected env: Env;
  protected gain: number;
  protected sr: number;
  protected t = 0;
  constructor(sr: number, p: NoteParams, a: number, d: number, s: number, r: number) {
    this.sr = sr;
    this.pan = p.pan ?? 0;
    this.gain = p.vel;
    this.env = new Env(sr, p.attack ?? a, p.decay ?? d, p.sustain ?? s, p.release ?? r, Math.max(p.dur, 0.001));
  }
  abstract sample(): number;
  render(out: Float32Array, offset: number, n: number) {
    for (let i = 0; i < n; i++) {
      const e = this.env.next();
      out[offset + i] += this.sample() * e * this.gain;
      this.t++;
    }
    if (this.env.finished) this.done = true;
  }
  release() {
    this.env.startRelease();
  }
}

class PulseVoice extends Base {
  private ph = 0;
  private lp: OnePole;
  constructor(sr: number, private p: NoteParams) {
    super(sr, p, 0.005, 0.12, 0.55, 0.18);
    this.lp = new OnePole(sr, p.cutoff ?? 4000);
  }
  sample() {
    const bend = this.p.bend ? Math.pow(2, (this.p.bend * Math.min(1, this.t / this.sr / Math.max(0.05, this.p.dur))) / 12) : 1;
    this.ph = (this.ph + (this.p.freq * bend) / this.sr) % 1;
    return this.lp.run(this.ph < (this.p.duty ?? 0.25) ? 0.5 : -0.5);
  }
}

class TriVoice extends Base {
  private ph = 0;
  constructor(sr: number, private p: NoteParams) {
    super(sr, p, 0.004, 0.2, 0.4, 0.25);
  }
  sample() {
    this.ph = (this.ph + this.p.freq / this.sr) % 1;
    const tri = 1 - 4 * Math.abs(this.ph - 0.5);
    return Math.round(tri * 7.5) / 7.5 * 0.6; // 4-bit steps, the NES triangle
  }
}

class PluckVoice extends Base {
  private buf: Float32Array;
  private i = 0;
  private damp: number;
  constructor(sr: number, p: NoteParams) {
    super(sr, p, 0.001, 0.05, 1, 0.08);
    const len = Math.max(2, Math.round(sr / p.freq));
    this.buf = new Float32Array(len);
    // Excite with filtered noise: brightness decides how much highs the pick carries.
    const lp = new OnePole(sr, 800 + 6000 * (p.bright ?? 0.5));
    for (let k = 0; k < len; k++) this.buf[k] = lp.run(Math.random() * 2 - 1);
    this.damp = 0.4 + 0.1 * (p.bright ?? 0.5);
  }
  sample() {
    const j = (this.i + 1) % this.buf.length;
    const v = this.buf[this.i];
    this.buf[this.i] = (v * this.damp + this.buf[j] * (1 - this.damp)) * 0.996;
    this.i = j;
    return v * 0.9;
  }
}

// Modal bar: partial ratios of a free bar / glass, each with its own decay.
const BELL_RATIOS = [1, 2.756, 5.404, 8.933];
const BELL_AMPS = [1, 0.45, 0.25, 0.12];
const BELL_DECAY = [1, 0.55, 0.3, 0.18];
class BellVoice extends Base {
  private ph = [0, 0, 0, 0];
  private dec: number[];
  private amp: number[];
  constructor(sr: number, private p: NoteParams) {
    super(sr, p, 0.001, 0.01, 1, 1.6);
    const len = Math.max(0.3, p.release ?? 1.6);
    const bright = p.bright ?? 0.5;
    this.dec = BELL_DECAY.map((d) => Math.exp(-1 / (sr * len * d)));
    this.amp = BELL_AMPS.map((a, k) => a * (k === 0 ? 1 : 0.4 + bright));
  }
  sample() {
    let s = 0;
    for (let k = 0; k < 4; k++) {
      this.ph[k] = (this.ph[k] + (this.p.freq * BELL_RATIOS[k]) / this.sr) % 1;
      s += Math.sin(this.ph[k] * TAU) * this.amp[k];
      this.amp[k] *= this.dec[k];
    }
    return s * 0.4;
  }
}

class SawVoice extends Base {
  private ph = [0, 0.33, 0.66];
  private lp: OnePole;
  private det = [1, 1.006, 0.994];
  constructor(sr: number, private p: NoteParams) {
    super(sr, p, 0.01, 0.2, 0.6, 0.3);
    this.lp = new OnePole(sr, p.cutoff ?? 3000);
  }
  sample() {
    let s = 0;
    for (let k = 0; k < 3; k++) {
      this.ph[k] = (this.ph[k] + (this.p.freq * this.det[k]) / this.sr) % 1;
      s += this.ph[k] * 2 - 1;
    }
    return this.lp.run(s * 0.22);
  }
}

class PadVoice extends Base {
  private ph = [0, 0.5];
  private lp1: OnePole;
  private lp2: OnePole;
  constructor(sr: number, private p: NoteParams) {
    super(sr, p, 0.6, 0.8, 0.7, 1.4);
    this.lp1 = new OnePole(sr, p.cutoff ?? 1400);
    this.lp2 = new OnePole(sr, p.cutoff ?? 1400);
  }
  sample() {
    const duty = 0.3 + 0.15 * Math.sin((this.t / this.sr) * TAU * 0.3); // slow PWM, the chip "chorus"
    let s = 0;
    const det = [1, 1.004];
    for (let k = 0; k < 2; k++) {
      this.ph[k] = (this.ph[k] + (this.p.freq * det[k]) / this.sr) % 1;
      s += this.ph[k] < duty ? 0.5 : -0.5;
    }
    return this.lp2.run(this.lp1.run(s * 0.5));
  }
}

class SubVoice extends Base {
  private ph = 0;
  constructor(sr: number, private p: NoteParams) {
    super(sr, p, 0.006, 0.15, 0.7, 0.12);
  }
  sample() {
    this.ph = (this.ph + this.p.freq / this.sr) % 1;
    const s = Math.sin(this.ph * TAU);
    return Math.tanh(s * (1 + 2 * (this.p.bright ?? 0.2))) * 0.8;
  }
}

class KickVoice extends Base {
  private ph = 0;
  constructor(sr: number, private p: NoteParams) {
    super(sr, p, 0.001, 0.01, 1, 0.3);
    this.p = { ...p, dur: 0.01 };
  }
  sample() {
    const t = this.t / this.sr;
    const f = this.p.freq * (1 + 3 * Math.exp(-t * 40));
    this.ph = (this.ph + f / this.sr) % 1;
    return Math.sin(this.ph * TAU) * Math.exp(-t * (6 + 10 * (1 - (this.p.bright ?? 0.5))));
  }
}

class NoiseVoice extends Base {
  private n: Lfsr;
  private hp = 0;
  private prev = 0;
  constructor(sr: number, private p: NoteParams) {
    super(sr, p, 0.001, 0.03, 0.2, 0.06);
    // freq picks the LFSR clock; bright > 0.6 switches to the short, metallic mode.
    this.n = new Lfsr(Math.max(400, p.freq), (p.bright ?? 0) > 0.6);
  }
  sample() {
    const x = this.n.next(this.sr) * 0.35;
    this.hp = 0.9 * (this.hp + x - this.prev); // crude highpass keeps hats out of the bass
    this.prev = x;
    return this.hp;
  }
}

class SnareVoice extends Base {
  private n = new Lfsr(12000, false);
  private ph = 0;
  constructor(sr: number, private p: NoteParams) {
    super(sr, p, 0.001, 0.08, 0.1, 0.12);
  }
  sample() {
    const t = this.t / this.sr;
    this.ph = (this.ph + this.p.freq / this.sr) % 1;
    const body = Math.sin(this.ph * TAU) * Math.exp(-t * 30);
    return (this.n.next(this.sr) * 0.3 + body * 0.5) * 0.8;
  }
}

export function makeVoice(sr: number, p: NoteParams): Voice {
  switch (p.patch) {
    case "pulse":
      return new PulseVoice(sr, p);
    case "tri":
      return new TriVoice(sr, p);
    case "pluck":
      return new PluckVoice(sr, p);
    case "bell":
      return new BellVoice(sr, p);
    case "saw":
      return new SawVoice(sr, p);
    case "pad":
      return new PadVoice(sr, p);
    case "sub":
      return new SubVoice(sr, p);
    case "kick":
      return new KickVoice(sr, p);
    case "noise":
      return new NoiseVoice(sr, p);
    case "snare":
      return new SnareVoice(sr, p);
  }
}
