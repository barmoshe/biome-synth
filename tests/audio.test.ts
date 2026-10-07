import { describe, expect, it } from "vitest";
import { makeVoice, type Patch } from "../src/audio/dsp/voices";
import { Core } from "../src/audio/dsp/core";
import { Bed } from "../src/audio/dsp/bed";
import { route } from "../src/audio/router";
import { BIOMES, ROLES } from "../src/shared/biomes";

const SR = 48000;
const PATCHES: Patch[] = ["pulse", "tri", "pluck", "bell", "saw", "pad", "sub", "kick", "noise", "snare"];

function renderVoice(patch: Patch, freq = 220, seconds = 1.5) {
  const v = makeVoice(SR, { patch, freq, vel: 1, dur: 0.4 });
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

describe("voices", () => {
  for (const p of PATCHES)
    it(`${p} sounds, stays under full scale and ends`, () => {
      const { out, done } = renderVoice(p, p === "noise" ? 9000 : p === "kick" ? 50 : 220, 6);
      const s = stats(out);
      expect(s.nan).toBe(false);
      expect(s.rms).toBeGreaterThan(0.001);
      expect(s.peak).toBeLessThan(1);
      expect(done).toBe(true); // no stuck notes
    });
});

describe("core", () => {
  it("starts a note on its exact frame", () => {
    const core = new Core(SR);
    core.handle({ type: "note", ev: { frame: 300, note: { patch: "pulse", freq: 440, vel: 1, dur: 0.1 } } });
    const L = new Float32Array(128), R = new Float32Array(128), sL = new Float32Array(128), sR = new Float32Array(128);
    let first = -1;
    for (let start = 0; start < 1024 && first < 0; start += 128) {
      L.fill(0); R.fill(0);
      core.process(start, L, R, sL, sR);
      for (let i = 0; i < 128; i++) if (L[i] !== 0) { first = start + i; break; }
    }
    expect(first).toBeGreaterThanOrEqual(300);
    expect(first).toBeLessThanOrEqual(301);
  });

  it("caps polyphony and frees finished voices", () => {
    const core = new Core(SR);
    for (let i = 0; i < 80; i++) core.handle({ type: "note", ev: { frame: i, note: { patch: "kick", freq: 50, vel: 0.5, dur: 0.01 } } });
    const b = () => new Float32Array(128);
    core.process(0, b(), b(), b(), b());
    expect(core.voices).toBeLessThanOrEqual(40);
    for (let f = 128; f < SR * 2; f += 128) core.process(f, b(), b(), b(), b());
    expect(core.voices).toBe(0);
  });
});

describe("bed", () => {
  it("every biome bed is audible, finite and quiet", () => {
    for (let k = 0; k < 5; k++) {
      const bed = new Bed(SR);
      const w = [0, 0, 0, 0, 0];
      w[k] = 1;
      bed.setWeights(w);
      bed.weights = w.slice(); // skip the glide
      const L = new Float32Array(SR), R = new Float32Array(SR);
      for (let i = 0; i < SR; i += 128) bed.render(L.subarray(i, i + 128), R.subarray(i, i + 128));
      const s = stats(L);
      expect(s.nan).toBe(false);
      expect(s.rms).toBeGreaterThan(0.002);
      expect(s.peak).toBeLessThan(0.8);
    }
  });
});

describe("router", () => {
  it("plays only the biomes under the camera, louder where they weigh more", () => {
    const evs = route({ role: "bass", deg: 0, vel: 1, len: 4, from: "band" }, { weights: [0, 0, 0, 0.7, 0.3], time: 1, stepSec: 0.1, sampleRate: SR, energy: 0.5 });
    expect(evs).toHaveLength(2);
    expect(evs[0].note.vel).toBeGreaterThan(evs[1].note.vel * 0.9 * (BIOMES[4].roles.bass.gain! / BIOMES[3].roles.bass.gain!) * 0.5);
    expect(evs.every((e) => e.frame === SR)).toBe(true);
  });
  it("every role in every biome makes a valid note", () => {
    for (let b = 0; b < 5; b++)
      for (const role of ROLES) {
        const w = [0, 0, 0, 0, 0];
        w[b] = 1;
        const [ev] = route({ role, deg: 3, vel: 1, len: 2, from: "band" }, { weights: w, time: 0, stepSec: 0.1, sampleRate: SR, energy: 1 });
        expect(ev.note.freq).toBeGreaterThan(20);
        expect(ev.note.freq).toBeLessThan(16000);
        expect(ev.note.vel).toBeGreaterThan(0);
      }
  });
});
