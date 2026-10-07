import { describe, expect, it } from "vitest";
import { makeVoice, type Patch } from "../src/audio/dsp/voices";
import { Core } from "../src/audio/dsp/core";
import { Bed } from "../src/audio/dsp/bed";
import { BUS, Mixer } from "../src/audio/dsp/mix";
import { Studio } from "../src/audio/dsp/studio";

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

const pair = (n: number) => [new Float32Array(n), new Float32Array(n)] as [Float32Array, Float32Array];
/** Fresh bus and send buffers for one core block (the mixer's own clear them after mixing). */
const blocks = (n = 128) => ({ bus: Array.from({ length: 5 }, () => pair(n)), send: pair(n), del: pair(n) });

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
      const b = blocks();
      core.process(start, b);
      const L = b.bus[BUS.music][0];
      for (let i = 0; i < 128; i++) if (L[i] !== 0) { first = start + i; break; }
    }
    expect(first).toBeGreaterThanOrEqual(300);
    expect(first).toBeLessThanOrEqual(301);
  });

  it("caps polyphony and frees finished voices", () => {
    const core = new Core(SR);
    for (let i = 0; i < 80; i++) core.handle({ type: "note", ev: { frame: i, note: { patch: "kick", freq: 50, vel: 0.5, dur: 0.01 } } });
    core.process(0, blocks());
    expect(core.voices).toBeLessThanOrEqual(48);
    for (let f = 128; f < SR * 2; f += 128) core.process(f, blocks());
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
        const b = blocks();
        core.process(f, b);
        if (f >= 4800 && f < 6400) for (const x of b.bus[BUS.music][0]) energy += x * x;
      }
      return energy;
    };
    expect(run(0.8)).toBeLessThan(run(0) * 0.6);
  });

  it("a tape stop drags the pitch down and recovers", () => {
    const core = new Core(SR);
    core.handle({ type: "tapestop", frame: 0, seconds: 0.4 });
    core.process(0, blocks());
    const early = core.mod.pitch;
    for (let f = 128; f < SR * 0.3; f += 128) core.process(f, blocks());
    const mid = core.mod.pitch;
    for (let f = SR * 0.3; f < SR; f += 128) core.process(f, blocks());
    expect(early).toBeGreaterThan(0.95);
    expect(mid).toBeLessThan(0.4);
    expect(core.mod.pitch).toBeCloseTo(1, 1);
  });

  it("the delay send carries only what asks for it", () => {
    const core = new Core(SR);
    core.handle({ type: "notes", evs: [{ frame: 0, note: { patch: "sine", freq: 440, vel: 1, dur: 0.1 }, delay: 1 }] });
    const b = blocks();
    core.process(0, b);
    expect(stats(b.del[0]).rms).toBeGreaterThan(0);
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

describe("sampler", () => {
  // A one-second 440 Hz sine standing in for a recording at 44.1 kHz.
  const sine = new Float32Array(44100).map((_, i) => Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.5);
  const play = (freq: number, sample = "test/0") => {
    const core = new Core(SR);
    core.handle({ type: "sample", id: "test/0", data: sine, sr: 44100 });
    core.handle({ type: "note", ev: { frame: 0, note: { patch: "sample", sample, root: 69, freq, vel: 1, dur: 2 } } });
    const out: number[] = [];
    for (let f = 0; f < SR * 0.2; f += 128) {
      const b = blocks();
      core.process(f, b);
      out.push(...b.bus[BUS.music][0]);
    }
    return Float32Array.from(out);
  };
  const crossings = (x: Float32Array) => {
    let n = 0;
    for (let i = 1; i < x.length; i++) if (x[i - 1] <= 0 && x[i] > 0) n++;
    return n;
  };
  it("plays a recording at its pitch, and an octave up at twice the rate", () => {
    const at = crossings(play(440));
    expect(at).toBeGreaterThan(84); // 440 Hz over 0.2 s
    expect(at).toBeLessThan(92);
    const up = crossings(play(880));
    expect(up / at).toBeCloseTo(2, 1);
  });
  it("stays silent, and ends, when the sample is missing", () => {
    expect(stats(play(440, "nope/1")).peak).toBe(0);
  });
});

describe("mixer", () => {
  const run = (fill: (L: Float32Array, R: Float32Array, i: number) => void, bus = BUS.music, seconds = 1) => {
    const m = new Mixer(SR);
    const outL = new Float32Array(128);
    const outR = new Float32Array(128);
    const all: number[] = [];
    for (let f = 0; f < SR * seconds; f += 128) {
      fill(m.bus[bus][0], m.bus[bus][1], f);
      m.process(f, outL, outR);
      all.push(...outL);
    }
    return Float32Array.from(all);
  };
  it("never lets the master past -1.5 dBFS, however hot the input", () => {
    const y = run((L, R, f) => {
      for (let i = 0; i < 128; i++) L[i] = R[i] = 4 * Math.sin(((f + i) * 2 * Math.PI * 110) / SR);
    });
    expect(stats(y).nan).toBe(false);
    expect(stats(y).peak).toBeLessThanOrEqual(Math.pow(10, -1.5 / 20) + 1e-6);
  });
  it("removes DC: a constant offset on a bus does not reach the output", () => {
    const y = run((L, R) => (L.fill(0.3), R.fill(0.3)), BUS.bass, 2);
    const tail = y.subarray(y.length - 4800);
    expect(Math.abs(tail.reduce((a, b) => a + b, 0) / tail.length)).toBeLessThan(0.002);
  });
  it("the reverbs ring on after the dry signal stops", () => {
    const m = new Mixer(SR);
    m.setFx({ room: 0.5, hall: 0.8, delayTime: 0.3, feedback: 0.3, delayLp: 3000, delayWet: 0, masterLp: 18000, wobble: 0, wobbleHz: 0.3, duck: 0, duckRelease: 0.2 }, 0, 0);
    const outL = new Float32Array(128), outR = new Float32Array(128);
    let late = 0;
    for (let f = 0; f < SR; f += 128) {
      if (f < 1280) for (let i = 0; i < 128; i++) m.send[0][i] = m.send[1][i] = Math.sin(i) * 0.5;
      m.process(f, outL, outR);
      if (f > SR * 0.5) late += stats(outL).rms;
    }
    expect(late).toBeGreaterThan(0);
  });
});

describe("studio", () => {
  it("renders voices, ambience and the mix together, finite and under the ceiling", () => {
    const st = new Studio(SR);
    st.handle({ type: "bed", weights: [0, 0, 0, 1, 0], level: 0.5 });
    st.handle({ type: "notes", evs: [0, 1, 2, 3].map((k) => ({ frame: k * 6000, note: { patch: "kick" as Patch, freq: 50, vel: 1, dur: 0.2 }, bus: BUS.drums })) });
    const L = new Float32Array(128), R = new Float32Array(128);
    const all: number[] = [];
    for (let f = 0; f < SR; f += 128) (st.process(f, L, R), all.push(...L));
    const s = stats(Float32Array.from(all));
    expect(s.nan).toBe(false);
    expect(s.rms).toBeGreaterThan(0.005);
    expect(s.peak).toBeLessThan(0.85);
  });
});
