// Pure DSP voices, no Web Audio types: the worklet runs them, the tests render them in Node.
// Chip voices (pulse, stepped triangle, LFSR noise) carry the pixel-art sound; plucks, modal bells
// and resonators are small physical models; the rest are the kits each world needs (ice cracks,
// water drops, frame drums, metallic hats, gated claps, a formant vox).

export type Patch =
  | "pulse" // square-ish lead, duty sets the colour
  | "tri" // NES-style stepped triangle
  | "sine" // pure sine: sonar pings, thrums
  | "pluck" // Karplus-Strong string
  | "bell" // modal bar: a few inharmonic decaying partials
  | "saw" // three detuned saws: neon lead, brass with attack and bend
  | "pad" // two detuned pulses through a slow lowpass
  | "sub" // sine sub bass
  | "kick" // sine with a pitch drop and a click
  | "tom" // sine falling from f2 to freq: frame drum, log drum
  | "chirp" // sine gliding from freq to f2: water drops, sonar sweeps
  | "noise" // LFSR noise burst (hats, shakers, rain)
  | "bp" // band-passed noise swept from freq to f2: solar wind, risers
  | "res" // noise burst into three resonators: ice cracks, woodblocks, bells
  | "metal" // six inharmonic squares, high-passed: 808-style hats
  | "clap" // three noise bursts and a tail
  | "snare" // noise + tone body
  | "vox"; // saw through two formants: vox chops

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
  bend?: number; // semitones glided over the note
  f2?: number; // second frequency: chirp target, tom start, bp sweep end
  sweep?: number; // seconds for the f2 glide
  q?: number; // resonance for res / bp
  ratios?: number[]; // partial ratios for res
  vowel?: number; // 0..1 for vox (a .. e .. i .. o)
  crush?: number; // 0..1 bitcrush amount
  duck?: boolean; // this voice dips when a ducking kick plays (sidechain)
};

/** Global modulation shared by every voice: tape wobble and tape stop live here. */
export type Mod = { pitch: number };

const TAU = Math.PI * 2;

export interface Voice {
  done: boolean;
  pan: number;
  duck: boolean;
  /** Render n samples, adding into out[offset..]. */
  render(out: Float32Array, offset: number, n: number): void;
  /** Start the release now (for held notes cut short or voice stealing). */
  release(): void;
}

// ---------- building blocks ----------

class Env {
  private t = 0;
  private level = 0;
  private relFrom = 0;
  private relT = -1;
  constructor(private sr: number, private a: number, private d: number, private s: number, private r: number, private hold: number) {}
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

/** RBJ biquad: low-pass, high-pass or band-pass (constant 0 dB peak). */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;
  constructor(private sr: number, private kind: "lp" | "hp" | "bp", f: number, q = 0.707) {
    this.set(f, q);
  }
  set(f: number, q = 0.707) {
    const w = (TAU * Math.max(20, Math.min(f, this.sr * 0.45))) / this.sr;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * Math.max(0.1, q));
    const a0 = 1 + al;
    let b0: number, b1: number, b2: number;
    if (this.kind === "lp") (b0 = (1 - cs) / 2), (b1 = 1 - cs), (b2 = (1 - cs) / 2);
    else if (this.kind === "hp") (b0 = (1 + cs) / 2), (b1 = -(1 + cs)), (b2 = (1 + cs) / 2);
    else (b0 = al), (b1 = 0), (b2 = -al);
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - al) / a0;
  }
  run(x: number) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
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

let seed = 0x1234567;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 4294967296) * 2 - 1;
};

// ---------- voices ----------

abstract class Base implements Voice {
  done = false;
  pan: number;
  duck: boolean;
  protected env: Env;
  protected gain: number;
  protected t = 0;
  private held = 0;
  private holdN = 0;
  private crushStep: number;
  private crushQ: number;
  constructor(protected sr: number, protected p: NoteParams, protected mod: Mod, a: number, d: number, s: number, r: number) {
    this.pan = p.pan ?? 0;
    this.duck = !!p.duck;
    this.gain = p.vel;
    this.env = new Env(sr, p.attack ?? a, p.decay ?? d, p.sustain ?? s, p.release ?? r, Math.max(p.dur, 0.001));
    const c = p.crush ?? 0;
    this.crushStep = c > 0 ? 1 + Math.round(c * 7) : 1;
    this.crushQ = c > 0 ? Math.pow(2, 8 - Math.round(c * 5)) : 0;
  }
  abstract sample(): number;
  protected get sec() {
    return this.t / this.sr;
  }
  render(out: Float32Array, offset: number, n: number) {
    for (let i = 0; i < n; i++) {
      const e = this.env.next();
      let s = this.sample();
      if (this.crushQ) {
        // Sample-and-hold plus quantise: the neon signs' bitcrush.
        if (this.holdN++ % this.crushStep === 0) this.held = Math.round(s * this.crushQ) / this.crushQ;
        s = this.held;
      }
      out[offset + i] += s * e * this.gain;
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
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.005, 0.12, 0.55, 0.18);
    this.lp = new OnePole(sr, p.cutoff ?? 4000);
  }
  sample() {
    const p = this.p;
    const bend = p.bend ? Math.pow(2, (p.bend * Math.min(1, this.sec / Math.max(0.05, p.sweep ?? p.dur))) / 12) : 1;
    this.ph = (this.ph + (p.freq * bend * this.mod.pitch) / this.sr) % 1;
    return this.lp.run(this.ph < (p.duty ?? 0.25) ? 0.5 : -0.5);
  }
}

class TriVoice extends Base {
  private ph = 0;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.004, 0.2, 0.4, 0.25);
  }
  sample() {
    this.ph = (this.ph + (this.p.freq * this.mod.pitch) / this.sr) % 1;
    const tri = 1 - 4 * Math.abs(this.ph - 0.5);
    return (Math.round(tri * 7.5) / 7.5) * 0.6; // 4-bit steps, the NES triangle
  }
}

class SineVoice extends Base {
  private ph = 0;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.004, 0.3, 0.3, 0.4);
  }
  sample() {
    this.ph = (this.ph + (this.p.freq * this.mod.pitch) / this.sr) % 1;
    return Math.sin(this.ph * TAU) * 0.7;
  }
}

class PluckVoice extends Base {
  private buf: Float32Array;
  private i = 0;
  private damp: number;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.001, 0.05, 1, 0.08);
    const len = Math.max(2, Math.round(sr / p.freq));
    this.buf = new Float32Array(len);
    const lp = new OnePole(sr, 800 + 6000 * (p.bright ?? 0.5));
    for (let k = 0; k < len; k++) this.buf[k] = lp.run(rand());
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

const BELL_RATIOS = [1, 2.756, 5.404, 8.933];
const BELL_AMPS = [1, 0.45, 0.25, 0.12];
const BELL_DECAY = [1, 0.55, 0.3, 0.18];
class BellVoice extends Base {
  private ph = [0, 0, 0, 0];
  private dec: number[];
  private amp: number[];
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.001, 0.01, 1, Math.max(0.3, p.release ?? 1.6));
    const len = Math.max(0.3, p.release ?? 1.6);
    const bright = p.bright ?? 0.5;
    this.dec = BELL_DECAY.map((d) => Math.exp(-1 / (sr * len * d)));
    this.amp = BELL_AMPS.map((a, k) => a * (k === 0 ? 1 : 0.4 + bright));
  }
  sample() {
    let s = 0;
    const f = this.p.freq * this.mod.pitch;
    for (let k = 0; k < 4; k++) {
      this.ph[k] = (this.ph[k] + (f * BELL_RATIOS[k]) / this.sr) % 1;
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
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.01, 0.2, 0.6, 0.3);
    this.lp = new OnePole(sr, p.cutoff ?? 3000);
  }
  sample() {
    const p = this.p;
    // Brass-style bend: start below the note and slide up into it.
    const bend = p.bend ? Math.pow(2, (p.bend * Math.max(0, 1 - this.sec / Math.max(0.03, p.sweep ?? 0.12))) / 12) : 1;
    let s = 0;
    for (let k = 0; k < 3; k++) {
      this.ph[k] = (this.ph[k] + (p.freq * bend * this.det[k] * this.mod.pitch) / this.sr) % 1;
      s += this.ph[k] * 2 - 1;
    }
    return this.lp.run(s * 0.22);
  }
}

class PadVoice extends Base {
  private ph = [0, 0.5];
  private lp1: OnePole;
  private lp2: OnePole;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.6, 0.8, 0.7, 1.4);
    this.lp1 = new OnePole(sr, p.cutoff ?? 1400);
    this.lp2 = new OnePole(sr, p.cutoff ?? 1400);
  }
  sample() {
    const duty = 0.3 + 0.15 * Math.sin(this.sec * TAU * 0.3); // slow PWM, the chip "chorus"
    let s = 0;
    const det = [1, 1.004];
    for (let k = 0; k < 2; k++) {
      this.ph[k] = (this.ph[k] + (this.p.freq * det[k] * this.mod.pitch) / this.sr) % 1;
      s += this.ph[k] < duty ? 0.5 : -0.5;
    }
    return this.lp2.run(this.lp1.run(s * 0.5));
  }
}

class SubVoice extends Base {
  private ph = 0;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.006, 0.15, 0.7, 0.12);
  }
  sample() {
    this.ph = (this.ph + (this.p.freq * this.mod.pitch) / this.sr) % 1;
    return Math.tanh(Math.sin(this.ph * TAU) * (1 + 2 * (this.p.bright ?? 0.2))) * 0.8;
  }
}

class KickVoice extends Base {
  private ph = 0;
  private decayRate: number;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, { ...p, dur: 0.01 }, m, 0.001, 0.01, 1, Math.max(0.12, p.release ?? 0.3));
    this.decayRate = 1 / Math.max(0.05, p.decay ?? 0.18);
  }
  sample() {
    const t = this.sec;
    const f = this.p.freq * (1 + 3 * Math.exp(-t * 40)) * this.mod.pitch;
    this.ph = (this.ph + f / this.sr) % 1;
    const click = t < 0.004 ? rand() * (this.p.bright ?? 0.3) * (1 - t / 0.004) : 0;
    return Math.sin(this.ph * TAU) * Math.exp(-t * this.decayRate * 2.5) + click;
  }
}

class TomVoice extends Base {
  private ph = 0;
  private knock: Biquad;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, { ...p, dur: 0.01 }, m, 0.001, 0.01, 1, Math.max(0.1, p.release ?? 0.6));
    this.knock = new Biquad(sr, "bp", (p.f2 ?? p.freq * 1.8) * 4, 3);
  }
  sample() {
    const t = this.sec;
    const p = this.p;
    const f0 = p.f2 ?? p.freq * 1.8;
    const k = Math.min(1, t / Math.max(0.02, p.sweep ?? 0.15));
    const f = (f0 * Math.pow(p.freq / f0, k)) * this.mod.pitch;
    this.ph = (this.ph + f / this.sr) % 1;
    const knock = t < 0.02 ? this.knock.run(rand()) * (p.bright ?? 0.3) * 2 : 0;
    return Math.sin(this.ph * TAU) * Math.exp(-t * (3 / Math.max(0.1, p.release ?? 0.6))) + knock;
  }
}

class ChirpVoice extends Base {
  private ph = 0;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.002, 0.05, 0.6, 0.06);
  }
  sample() {
    const p = this.p;
    const k = Math.min(1, this.sec / Math.max(0.01, p.sweep ?? 0.04));
    const f = p.freq * Math.pow((p.f2 ?? p.freq * 4) / p.freq, k) * this.mod.pitch;
    this.ph = (this.ph + f / this.sr) % 1;
    return Math.sin(this.ph * TAU) * 0.7;
  }
}

class NoiseVoice extends Base {
  private n: Lfsr;
  private hp = 0;
  private prev = 0;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.001, 0.03, 0.2, 0.06);
    this.n = new Lfsr(Math.max(400, p.freq), (p.bright ?? 0) > 0.6);
  }
  sample() {
    const x = this.n.next(this.sr) * 0.35;
    this.hp = 0.9 * (this.hp + x - this.prev);
    this.prev = x;
    return this.hp;
  }
}

class BpVoice extends Base {
  private bp: Biquad;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.3, 0.3, 0.8, 0.6);
    this.bp = new Biquad(sr, "bp", p.freq, p.q ?? 4);
  }
  sample() {
    const p = this.p;
    if ((this.t & 63) === 0) {
      const k = Math.min(1, this.sec / Math.max(0.05, p.sweep ?? p.dur));
      this.bp.set(p.freq * Math.pow((p.f2 ?? p.freq) / p.freq, k), p.q ?? 4);
    }
    return this.bp.run(rand()) * 0.9;
  }
}

/** A short noise strike into resonators: ice, wood, bells, depending on the ratios and Q. */
class ResVoice extends Base {
  private bps: Biquad[];
  private amps: number[];
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.001, 0.01, 1, Math.max(0.05, p.release ?? 0.12));
    const ratios = p.ratios ?? [1, 1.84, 2.87];
    this.bps = ratios.map((r) => new Biquad(sr, "bp", p.freq * r, p.q ?? 30));
    this.amps = ratios.map((_, i) => 1 / (1 + i * 0.6));
  }
  sample() {
    const ex = this.t < this.sr * 0.003 ? rand() : 0;
    let s = 0;
    for (let i = 0; i < this.bps.length; i++) s += this.bps[i].run(ex) * this.amps[i];
    return s * 6;
  }
}

const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
class MetalVoice extends Base {
  private ph = METAL.map(() => Math.random());
  private hp: Biquad;
  private hp2: Biquad;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.001, 0.02, 0.15, Math.max(0.02, p.release ?? 0.05));
    this.hp = new Biquad(sr, "hp", p.freq || 7000, 0.9);
    this.hp2 = new Biquad(sr, "hp", p.freq || 7000, 0.9);
  }
  sample() {
    let s = 0;
    for (let k = 0; k < METAL.length; k++) {
      this.ph[k] = (this.ph[k] + (METAL[k] * 3.1) / this.sr) % 1;
      s += this.ph[k] < 0.5 ? 1 : -1;
    }
    return this.hp2.run(this.hp.run(s / METAL.length)) * 1.4;
  }
}

class ClapVoice extends Base {
  private bp: Biquad;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, { ...p, dur: 0.01 }, m, 0.001, 0.01, 1, Math.max(0.1, p.release ?? 0.22));
    this.bp = new Biquad(sr, "bp", p.freq || 1200, 1.4);
  }
  sample() {
    const t = this.sec;
    // Three quick bursts, then the tail.
    const b = t < 0.03 ? (Math.floor(t / 0.01) % 1 === 0 ? Math.exp(-((t % 0.01) * 400)) : 0) : Math.exp(-(t - 0.03) * 18) * 0.6;
    return this.bp.run(rand()) * b * 2.2;
  }
}

class SnareVoice extends Base {
  private n = new Lfsr(12000, false);
  private ph = 0;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.001, 0.08, 0.1, 0.12);
  }
  sample() {
    const t = this.sec;
    this.ph = (this.ph + (this.p.freq * this.mod.pitch) / this.sr) % 1;
    const body = Math.sin(this.ph * TAU) * Math.exp(-t * 30);
    return (this.n.next(this.sr) * 0.3 + body * 0.5) * 0.8;
  }
}

// Formant pairs (F1, F2) for a, e, i, o.
const VOWELS = [
  [800, 1150],
  [400, 1600],
  [300, 2300],
  [450, 800],
];
class VoxVoice extends Base {
  private ph = 0;
  private f1: Biquad;
  private f2: Biquad;
  constructor(sr: number, p: NoteParams, m: Mod) {
    super(sr, p, m, 0.01, 0.1, 0.7, 0.12);
    const v = Math.max(0, Math.min(0.999, p.vowel ?? 0)) * (VOWELS.length - 1);
    const i = Math.floor(v);
    const fr = v - i;
    const a = VOWELS[i];
    const b = VOWELS[Math.min(VOWELS.length - 1, i + 1)];
    this.f1 = new Biquad(sr, "bp", a[0] + (b[0] - a[0]) * fr, 6);
    this.f2 = new Biquad(sr, "bp", a[1] + (b[1] - a[1]) * fr, 8);
  }
  sample() {
    this.ph = (this.ph + (this.p.freq * this.mod.pitch) / this.sr) % 1;
    const src = this.ph * 2 - 1;
    return (this.f1.run(src) * 1.6 + this.f2.run(src)) * 0.9;
  }
}

const IDENT: Mod = { pitch: 1 };

export function makeVoice(sr: number, p: NoteParams, mod: Mod = IDENT): Voice {
  switch (p.patch) {
    case "pulse":
      return new PulseVoice(sr, p, mod);
    case "tri":
      return new TriVoice(sr, p, mod);
    case "sine":
      return new SineVoice(sr, p, mod);
    case "pluck":
      return new PluckVoice(sr, p, mod);
    case "bell":
      return new BellVoice(sr, p, mod);
    case "saw":
      return new SawVoice(sr, p, mod);
    case "pad":
      return new PadVoice(sr, p, mod);
    case "sub":
      return new SubVoice(sr, p, mod);
    case "kick":
      return new KickVoice(sr, p, mod);
    case "tom":
      return new TomVoice(sr, p, mod);
    case "chirp":
      return new ChirpVoice(sr, p, mod);
    case "noise":
      return new NoiseVoice(sr, p, mod);
    case "bp":
      return new BpVoice(sr, p, mod);
    case "res":
      return new ResVoice(sr, p, mod);
    case "metal":
      return new MetalVoice(sr, p, mod);
    case "clap":
      return new ClapVoice(sr, p, mod);
    case "snare":
      return new SnareVoice(sr, p, mod);
    case "vox":
      return new VoxVoice(sr, p, mod);
  }
}
