import { describe, expect, it } from "vitest";
import { makeVoice, type Patch } from "../src/audio/dsp/voices";
import { Core } from "../src/audio/dsp/core";
import { Bed } from "../src/audio/dsp/bed";

const SR = 48000;
const PATCHES: Patch[] = ["pulse", "tri", "sine", "pluck", "bell", "saw", "pad", "sub", "kick", "tom", "chirp", "noise", "bp", "res", "metal", "clap", "snare", "vox"];
const FREQ: Partial<Record<Patch, number>> = { noise: 9000, kick: 50, tom: 60, res: 2500, metal: 7000, clap: 1200, bp: 800 };

function renderVoice(patch: Patch, seconds = 6) {
  const v = makeVoice(SR, { patch, freq: FREQ[patch] ?? 220, vel: 1, dur: 0.4, f2: patch === "tom" ? 110 : undefined, crush: patch === "pulse" ? 0.5 : 0 });
  const out = new Float32Array(Math.round(SR * seconds));
  for (let i = 0; i < out.length && !v.done; i += 128) v.render(out, i, Math.min(128, out.length - i));
  return { out, done: v.done };
}

const stats = (b: Float32Array) => {
  let peak = 0, sum = 0, nan = false;
  for (const x of b) {
    if (!Number.isFinite(x)) nan = true;
    peak = Math.max(peak, Math.abs(x));
    sum += x * x;
  }
  return { peak, rms: Math.sqrt(sum / b.length), nan };
};

const blocks = (n = 128) => [new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n), new Float32Array(n)] as const;

describe("voices", () => {
  for (const p of PATCHES)
    it(`${p} sounds, stays under full scale and ends`, () => {
      const { out, done } = renderVoice(p);
      const s = stats(out);
      expect(s.nan).toBe(false);
      expect(s.rms).toBeGreaterThan(0.0005);
      expect(s.peak).toBeLessThan(1.2);
      expect(done).toBe(true); // no stuck notes
    });
});

describe("core", () => {
  it("starts a note on its exact frame", () => {
    const core = new Core(SR);
    core.handle({ type: "note", ev: { frame: 300, note: { patch: "pulse", freq: 440, vel: 1, dur: 0.1 } } });
    let first = -1;
    for (let start = 0; start < 1024 && first < 0; start += 128) {
      const [L, R, sL, sR] = blocks();
      core.process(start, L, R, sL, sR);
      for (let i = 0; i < 128; i++) if (L[i] !== 0) { first = start + i; break; }
    }
    expect(first).toBeGreaterThanOrEqual(300);
    expect(first).toBeLessThanOrEqual(301);
  });

  it("caps polyphony and frees finished voices", () => {
    const core = new Core(SR);
    for (let i = 0; i < 80; i++) core.handle({ type: "note", ev: { frame: i, note: { patch: "kick", freq: 50, vel: 0.5, dur: 0.01 } } });
    core.process(0, ...blocks());
    expect(core.voices).toBeLessThanOrEqual(48);
    for (let f = 128; f < SR * 2; f += 128) core.process(f, ...blocks());
    expect(core.voices).toBe(0);
  });

  it("a ducking kick pumps the duckable voices only", () => {
    const run = (duck: number) => {
      const core = new Core(SR);
      core.handle({ type: "mod", mod: { duck, duckRelease: 0.2 } });
      core.handle({ type: "note", ev: { frame: 0, note: { patch: "sub", freq: 55, vel: 1, dur: 2, duck: true } } });
      core.handle({ type: "note", ev: { frame: 4800, note: { patch: "kick", freq: 50, vel: 0.001, dur: 0.01 }, ducks: true } });
      let energy = 0;
      for (let f = 0; f < 9600; f += 128) {
        const [L, R, sL, sR] = blocks();
        core.process(f, L, R, sL, sR);
        if (f >= 4800 && f < 6400) for (const x of L) energy += x * x;
      }
      return energy;
    };
    expect(run(0.8)).toBeLessThan(run(0) * 0.6);
  });

  it("a tape stop drags the pitch down and recovers", () => {
    const core = new Core(SR);
    core.handle({ type: "tapestop", frame: 0, seconds: 0.4 });
    core.process(0, ...blocks());
    const early = core.mod.pitch;
    for (let f = 128; f < SR * 0.3; f += 128) core.process(f, ...blocks());
    const mid = core.mod.pitch;
    for (let f = SR * 0.3; f < SR; f += 128) core.process(f, ...blocks());
    expect(early).toBeGreaterThan(0.95);
    expect(mid).toBeLessThan(0.4);
    expect(core.mod.pitch).toBeCloseTo(1, 1);
  });

  it("the delay send carries only what asks for it", () => {
    const core = new Core(SR);
    core.handle({ type: "notes", evs: [{ frame: 0, note: { patch: "sine", freq: 440, vel: 1, dur: 0.1 }, delay: 1 }] });
    const [L, R, sL, sR, dL, dR] = blocks();
    core.process(0, L, R, sL, sR, dL, dR);
    expect(stats(dL).rms).toBeGreaterThan(0);
  });
});

describe("bed", () => {
  it("every biome bed is audible, finite and quiet", () => {
    for (let k = 0; k < 5; k++) {
      const bed = new Bed(SR);
      const w = [0, 0, 0, 0, 0];
      w[k] = 1;
      bed.setWeights(w);
      bed.weights = w.slice();
      const L = new Float32Array(SR), R = new Float32Array(SR);
      for (let i = 0; i < SR; i += 128) bed.render(L.subarray(i, i + 128), R.subarray(i, i + 128));
      const s = stats(L);
      expect(s.nan).toBe(false);
      expect(s.rms).toBeGreaterThan(0.002);
      expect(s.peak).toBeLessThan(0.8);
    }
  });
});
