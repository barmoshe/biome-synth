// Offline listening renders, no browser: `SNAP=render npx vitest run`. Writes WAVs to ./renders
// (git-ignored): one per world, and a journey through all five with their transitions.
// The effects are JS stand-ins for the Web Audio graph (Freeverb-style reverbs, a filtered
// feedback delay, a master low-pass and soft clip), close enough to judge the music.
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { Core } from "../src/audio/dsp/core";
import { Bed } from "../src/audio/dsp/bed";
import type { WorldFx } from "../src/audio/engine";
import { Conductor } from "../src/music/conductor";

const SR = 44100;

class Comb {
  buf: Float32Array;
  i = 0;
  z = 0;
  constructor(n: number, public fb: number, public damp: number) {
    this.buf = new Float32Array(n);
  }
  run(x: number) {
    const y = this.buf[this.i];
    this.z = y * (1 - this.damp) + this.z * this.damp;
    this.buf[this.i] = x + this.z * this.fb;
    this.i = (this.i + 1) % this.buf.length;
    return y;
  }
}
class AllPass {
  buf: Float32Array;
  i = 0;
  constructor(n: number) {
    this.buf = new Float32Array(n);
  }
  run(x: number) {
    const b = this.buf[this.i];
    this.buf[this.i] = x + b * 0.5;
    this.i = (this.i + 1) % this.buf.length;
    return b - x;
  }
}
class Verb {
  combs: Comb[];
  aps: AllPass[];
  constructor(size: number, damp: number, spread: number) {
    this.combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((n) => new Comb(n + spread, size, damp));
    this.aps = [556, 441, 341, 225].map((n) => new AllPass(n + spread));
  }
  run(x: number) {
    let y = 0;
    for (const c of this.combs) y += c.run(x * 0.015);
    for (const a of this.aps) y = a.run(y);
    return y;
  }
}

class Mix {
  core = new Core(SR);
  bed = new Bed(SR);
  room = [new Verb(0.7, 0.2, 0), new Verb(0.7, 0.2, 23)];
  hall = [new Verb(0.93, 0.45, 0), new Verb(0.93, 0.45, 23)];
  dl = [new Float32Array(SR * 2), new Float32Array(SR * 2)];
  di = 0;
  dlz = [0, 0];
  lp = [0, 0];
  fx!: WorldFx;
  out: number[][] = [[], []];
  setFx(fx: WorldFx) {
    this.fx = fx;
    this.core.handle({ type: "mod", mod: { wobble: fx.wobble, wobbleHz: fx.wobbleHz, duck: fx.duck, duckRelease: fx.duckRelease } });
  }
  block(start: number) {
    const n = 128;
    const b = Array.from({ length: 6 }, () => new Float32Array(n));
    this.core.process(start, b[0], b[1], b[2], b[3], b[4], b[5]);
    this.bed.render(b[0], b[1]);
    const fx = this.fx;
    const dN = Math.round(fx.delayTime * SR);
    const dk = 1 - Math.exp((-2 * Math.PI * fx.delayLp) / SR);
    const mk = 1 - Math.exp((-2 * Math.PI * fx.masterLp) / SR);
    for (let i = 0; i < n; i++)
      for (let ch = 0; ch < 2; ch++) {
        const d = this.dl[ch];
        const read = d[(this.di - dN + d.length) % d.length];
        this.dlz[ch] += dk * (read - this.dlz[ch]);
        d[this.di] = b[4 + ch][i] + this.dlz[ch] * fx.feedback;
        const send = b[2 + ch][i] + this.dlz[ch] * fx.delayWet * 0.5;
        let y = b[ch][i] + this.dlz[ch] * fx.delayWet + this.room[ch].run(send) * fx.room + this.hall[ch].run(send) * fx.hall;
        this.lp[ch] += mk * (y - this.lp[ch]);
        y = Math.tanh(this.lp[ch] * 1.3) * 0.8;
        this.out[ch].push(y);
        if (ch === 1) this.di = (this.di + 1) % d.length;
      }
  }
}

function wav(out: number[][]) {
  const n = out[0].length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++)
    for (let ch = 0; ch < 2; ch++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[ch][i] * 32767))), 44 + i * 4 + ch * 2);
  return buf;
}

/** Drive a conductor through time: `plan` says which world the camera is over at each second. */
function render(first: number, seconds: number, plan: (t: number) => number) {
  const mix = new Mix();
  let target = first;
  let fxNow: WorldFx | null = null;
  const c = new Conductor({
    seed: 7,
    target: () => target,
    weightOf: (i) => (i === target ? 1 : 0.1),
    fx: (fx) => (fxNow = fx),
    tapeStop: (at, s) => mix.core.handle({ type: "tapestop", frame: Math.round(at * SR), seconds: s }),
  }, first);
  mix.setFx(c.world.fx);
  let stepSec = c.stepSec;
  let next = 0.1;
  let step = 0;
  const w = [0, 0, 0, 0, 0];
  for (let f = 0; f < seconds * SR; f += 128) {
    const t = f / SR;
    target = plan(t);
    w.fill(0);
    w[target] = 1;
    mix.bed.setWeights(w);
    while (next < t + 0.12) {
      const outs = c.hits(step, next);
      mix.core.handle({ type: "notes", evs: outs.map((o) => ({ frame: Math.round((next + (o.offset ?? 0)) * SR), note: o.note, send: o.send, delay: o.delay, ducks: o.ducks })) });
      const goal = c.pendingStepSec ?? c.stepSec;
      stepSec = c.entered ? goal : stepSec + (goal - stepSec) * 0.06;
      c.entered = false;
      next += stepSec;
      step++;
    }
    if (fxNow) (mix.setFx(fxNow), (fxNow = null));
    mix.block(f);
  }
  return mix.out;
}

it("renders", () => {
  const dir = process.env.RENDER_DIR ?? "renders";
  mkdirSync(dir, { recursive: true });
  const names = ["1-orbit", "2-aurora", "3-deep", "4-canopy", "5-neon"];
  for (let i = 0; i < 5; i++) writeFileSync(`${dir}/${names[i]}.wav`, wav(render(i, 24, () => i)));
  writeFileSync(`${dir}/0-journey.wav`, wav(render(0, 110, (t) => Math.min(4, Math.floor(t / 22)))));
}, 600000);
