// Offline listening renders, no browser: `SNAP=render npx vitest run`. Writes WAVs to ./renders
// (git-ignored): one per world, and a journey through all five with their transitions.
// It runs the same studio as the AudioWorklet (voices, samples, ambience, the whole mix), so a
// render is what the browser plays.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { Studio } from "../src/audio/dsp/studio";
import { loaded, MANIFEST } from "../src/audio/instruments";
import { Conductor } from "../src/music/conductor";
import { busOf } from "../src/music/world";

const SR = 48000;

/** Decode every shipped sample (the Opus files, as the browser gets them) into a studio's bank. */
function loadSamples(st: Studio) {
  for (const [id, inst] of Object.entries(MANIFEST.instruments)) {
    for (const z of inst.zones) {
      const buf = execFileSync("ffmpeg", ["-v", "error", "-i", `public/samples/${z.f}.webm`, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 26 });
      st.handle({ type: "sample", id: z.f, data: new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice(), sr: SR });
    }
    loaded.add(id);
  }
}

class Mix {
  st = new Studio(SR);
  out: number[][] = [[], []];
  private L = new Float32Array(128);
  private R = new Float32Array(128);
  constructor() {
    loadSamples(this.st);
  }
  block(start: number) {
    this.st.process(start, this.L, this.R);
    for (let i = 0; i < 128; i++) (this.out[0].push(this.L[i]), this.out[1].push(this.R[i]));
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
  const c = new Conductor({
    seed: 7,
    target: () => target,
    weightOf: (i) => (i === target ? 1 : 0.1),
    fx: (fx, at, ramp) => mix.st.handle({ type: "fx", fx, frame: Math.round(at * SR), ramp }),
    sweep: (to, at, dur) => mix.st.handle({ type: "sweep", frame: Math.round(at * SR), to, dur }),
    tapeStop: (at, s) => mix.st.handle({ type: "tapestop", frame: Math.round(at * SR), seconds: s }),
  }, first);
  mix.st.handle({ type: "fx", fx: c.world.fx, frame: 0, ramp: 0 });
  let stepSec = c.stepSec;
  let next = 0.1;
  let step = 0;
  const w = [0, 0, 0, 0, 0];
  for (let f = 0; f < seconds * SR; f += 128) {
    const t = f / SR;
    target = plan(t);
    w.fill(0);
    w[target] = 1;
    mix.st.handle({ type: "bed", weights: w, level: 0.5 });
    while (next < t + 0.12) {
      const outs = c.hits(step, next);
      mix.st.handle({ type: "notes", evs: outs.map((o) => ({ frame: Math.round((next + (o.offset ?? 0)) * SR), note: o.note, send: o.send, delay: o.delay, ducks: o.ducks, bus: busOf(o) })) });
      for (const o of outs) if (o.throw) mix.st.handle({ type: "throw", frame: Math.round((next + (o.offset ?? 0)) * SR), hold: o.throw });
      const goal = c.pendingStepSec ?? c.stepSec;
      stepSec = c.entered ? goal : stepSec + (goal - stepSec) * 0.06;
      c.entered = false;
      next += stepSec;
      step++;
    }
    mix.block(f);
  }
  return mix.out;
}

it("renders", () => {
  const dir = process.env.RENDER_DIR ?? "renders";
  mkdirSync(dir, { recursive: true });
  const names = ["1-orbit", "2-aurora", "3-deep", "4-canopy", "5-neon"];
  // WORLD=3 SECONDS=90 renders one world for longer (a written song needs time to show its form).
  if (process.env.WORLD) {
    const i = Number(process.env.WORLD);
    writeFileSync(`${dir}/${names[i]}.wav`, wav(render(i, Number(process.env.SECONDS ?? 60), () => i)));
    return;
  }
  for (let i = 0; i < 5; i++) writeFileSync(`${dir}/${names[i]}.wav`, wav(render(i, 24, () => i)));
  writeFileSync(`${dir}/0-journey.wav`, wav(render(0, 110, (t) => Math.min(4, Math.floor(t / 22)))));
}, 600000);
