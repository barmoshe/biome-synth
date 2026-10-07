// Procedural ambient beds, one per biome, mixed by the camera's biome weights. Synthesized rather
// than sampled: the original's recordings had unclear licences, and the chip world wants chip air.
// Order matches BIOMES in src/shared/biomes.ts: space, tundra, sea, jungle, neon.

const TAU = Math.PI * 2;

class Rng {
  constructor(private s = 0x9e3779b9) {}
  next() {
    // xorshift32
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return this.s / 4294967296;
  }
}

class Lp {
  z = 0;
  run(x: number, k: number) {
    this.z += k * (x - this.z);
    return this.z;
  }
}

export class Bed {
  weights = [0, 0, 0, 0, 0];
  /** Overall bed level, 0..1. */
  level = 0.5;
  private target = [0, 0, 0, 0, 0];
  private rng = new Rng();
  private t = 0;
  private lps = Array.from({ length: 8 }, () => new Lp());
  private ph = [0, 0, 0, 0, 0, 0];
  // Event voices: bubbles, cricket chirps, drips.
  private blips: { f: number; df: number; a: number; d: number; ph: number }[] = [];

  constructor(private sr: number) {}

  setWeights(w: number[]) {
    for (let i = 0; i < 5; i++) this.target[i] = w[i] ?? 0;
  }

  render(outL: Float32Array, outR: Float32Array) {
    const n = outL.length;
    const sr = this.sr;
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      // Weights glide so a camera jump never clicks.
      if ((i & 31) === 0) for (let k = 0; k < 5; k++) this.weights[k] += (this.target[k] - this.weights[k]) * 0.002;
      const w = this.weights;
      const t = this.t / sr;
      const white = r.next() * 2 - 1;
      let L = 0;
      let R = 0;

      if (w[0] > 0.001) {
        // Space: a slow beating drone on D, plus a breath of dark noise.
        this.ph[0] = (this.ph[0] + 36.7 / sr) % 1;
        this.ph[1] = (this.ph[1] + 55.2 / sr) % 1;
        const drone = Math.sin(this.ph[0] * TAU) * 0.5 + Math.sin(this.ph[1] * TAU) * 0.3 * (0.6 + 0.4 * Math.sin(t * 0.21));
        const dust = this.lps[0].run(white, 0.004) * 3;
        L += (drone + dust) * w[0] * 0.35;
        R += (drone - dust) * w[0] * 0.35;
      }
      if (w[1] > 0.001) {
        // Tundra: wind, band-limited noise whose cutoff gusts.
        const gust = 0.5 + 0.5 * Math.sin(t * 0.17) * Math.sin(t * 0.071 + 1);
        const k = 0.01 + 0.05 * gust;
        const wind = this.lps[1].run(white, k) - this.lps[2].run(white, k * 0.2);
        L += wind * w[1] * (1.6 + gust);
        R += this.lps[3].run(wind, 0.5) * w[1] * (1.6 + (1 - gust));
      }
      if (w[2] > 0.001) {
        // Sea: a swell every ~7 s and the odd bubble.
        const swell = Math.pow(0.5 + 0.5 * Math.sin(t * 0.9), 2);
        const surf = this.lps[4].run(white, 0.03 + 0.08 * swell);
        L += surf * swell * w[2] * 1.4;
        R += surf * (1 - swell * 0.5) * w[2] * 1.2;
        if (r.next() < 2.5 / sr) this.blips.push({ f: 300 + r.next() * 500, df: 1.0006, a: 0.05 * w[2], d: 0.9992, ph: 0 });
      }
      if (w[3] > 0.001) {
        // Jungle: crickets pulsing in pairs, a warm leafy hiss.
        const chirp = Math.sin(t * TAU * 28) > 0.6 && Math.sin(t * TAU * 1.3) > 0 ? 1 : 0;
        this.ph[2] = (this.ph[2] + 4300 / sr) % 1;
        const cr = Math.sin(this.ph[2] * TAU) * chirp * 0.06;
        const leaf = this.lps[5].run(white, 0.02) * 0.8;
        L += (cr + leaf) * w[3];
        R += (cr * 0.6 + leaf) * w[3];
        if (r.next() < 0.4 / sr) this.blips.push({ f: 1800 + r.next() * 1200, df: 0.99985, a: 0.04 * w[3], d: 0.9996, ph: 0 });
      }
      if (w[4] > 0.001) {
        // Neon city: rain on metal and the mains hum.
        const rain = white - this.lps[6].run(white, 0.2);
        this.ph[3] = (this.ph[3] + 50 / sr) % 1;
        const hum = Math.sin(this.ph[3] * TAU) * 0.15 + Math.sin(this.ph[3] * TAU * 3) * 0.05;
        // Vinyl crackle, Burial-style.
        const crackle = r.next() < 18 / sr ? (r.next() - 0.5) * 0.5 : 0;
        L += (rain * 0.18 + hum + crackle) * w[4];
        R += (rain * 0.18 + hum * 0.8 + crackle * 0.7) * w[4];
      }

      for (let b = this.blips.length - 1; b >= 0; b--) {
        const bl = this.blips[b];
        bl.ph = (bl.ph + bl.f / sr) % 1;
        bl.f *= bl.df;
        bl.a *= bl.d;
        const s = Math.sin(bl.ph * TAU) * bl.a;
        L += s;
        R += s;
        if (bl.a < 1e-4) this.blips.splice(b, 1);
      }

      outL[i] += L * this.level;
      outR[i] += R * this.level;
      this.t++;
    }
  }
}
