import { describe, expect, it } from "vitest";
import { Clock } from "../src/audio/clock";
import { Conductor } from "../src/music/conductor";
import { clampSection, SECTION_NAMES } from "../src/music/pattern";
import { rng } from "../src/music/rng";
import { degreeToMidi, inScale, midiToDegree, pc, snap, SCALES } from "../src/music/theory";
import type { Out, StepCtx, WorldMusic } from "../src/music/world";
import { makeWorlds } from "../src/music/worlds";
import { tVoice } from "../src/music/worlds/aurora";

const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);
const PITCHED = new Set(["pulse", "tri", "pluck", "bell", "saw", "pad", "sub", "vox"]);
const MELODIC_ROLES = new Set(["bass", "pad", "arp", "lead"]);

/** Run a world through every section for `bars` bars and collect what it plays. */
function run(w: WorldMusic, bars = 32, seed = 3) {
  const r = rng(seed);
  w.reset(seed);
  const outs: { o: Out; step: number; pos: number }[] = [];
  let step = 0;
  for (const name of SECTION_NAMES) {
    const section = w.write(name, r);
    for (let i = 0; i < Math.ceil(bars / SECTION_NAMES.length) * w.stepsPerBar; i++, step++) {
      const c: StepCtx = { step, bar: Math.floor(step / w.stepsPerBar), pos: step % w.stepsPerBar, stepSec: 60 / w.bpm / w.stepsPerBeat, section, rng: r, playerActive: false, daylight: 0.5 };
      for (const o of w.step(c)) outs.push({ o, step, pos: c.pos });
    }
  }
  return outs;
}

describe("theory", () => {
  it("pitch class works for negatives", () => {
    expect(pc(-1)).toBe(11);
    expect(pc(-13)).toBe(11);
  });
  it("degrees map into the scale in every octave, both directions", () => {
    for (const s of Object.values(SCALES)) for (let d = -20; d <= 20; d++) expect(inScale(degreeToMidi(57, s, d), 57, s)).toBe(true);
  });
  it("snap lands in scale and round-trips degrees", () => {
    for (let m = 30; m < 90; m++) expect(inScale(snap(m, 62, SCALES.lydian), 62, SCALES.lydian)).toBe(true);
    for (let d = -10; d < 10; d++) expect(midiToDegree(degreeToMidi(62, SCALES.minor, d), 62, SCALES.minor)).toBe(d);
  });
});

describe("clampSection (bad Claude output always becomes something playable)", () => {
  const golden: [string, unknown][] = [
    ["null", null],
    ["a string", "play something nice"],
    ["empty object", {}],
    ["wrong types", { name: 7, bars: "lots", energy: "high", chords: "I-IV-V", layers: 3, motif: [] }],
    ["out of range", { name: "surge", bars: 400, energy: 9, chords: [99, -99, 2.6], layers: { drums: 7, bass: -2 } }],
    ["broken motif", { motif: "0:4:0 nonsense 999:2:1 4:0:2 8:2:99" }],
    ["lyria junk", { lyria: { prompts: [{ text: "" }, { text: "rain", weight: 99 }, 5], density: -1 } }],
  ];
  for (const [label, raw] of golden)
    it(label, () => {
      const s = clampSection(raw);
      expect(SECTION_NAMES).toContain(s.name);
      expect(s.bars).toBeGreaterThanOrEqual(2);
      expect(s.bars).toBeLessThanOrEqual(16);
      expect(s.energy).toBeGreaterThanOrEqual(0);
      expect(s.energy).toBeLessThanOrEqual(1);
      for (const v of Object.values(s.layers)) expect(v >= 0 && v <= 1).toBe(true);
      // Every world can play it without throwing.
      for (const w of makeWorlds()) {
        w.reset(1);
        for (let i = 0; i < 48; i++) w.step({ step: i, bar: Math.floor(i / w.stepsPerBar), pos: i % w.stepsPerBar, stepSec: 0.12, section: s, rng: rng(1), playerActive: false, daylight: 0.5 });
      }
    });
  it("keeps the good parts of a mixed motif", () => {
    expect(clampSection({ motif: "0:4:0 nonsense 999:2:1 8:2:99" }).motif).toBe("0:4:0 8:2:21");
  });
});

describe("worlds", () => {
  const worlds = makeWorlds();

  it("every world plays, in key, with finite notes", () => {
    for (const w of worlds) {
      const outs = run(w);
      expect(outs.length).toBeGreaterThan(40);
      for (const { o } of outs) {
        expect(Number.isFinite(o.note.freq) && o.note.freq > 15 && o.note.freq < 20000).toBe(true);
        expect(o.note.vel).toBeGreaterThan(0);
        if (PITCHED.has(o.note.patch) && MELODIC_ROLES.has(o.role)) {
          const m = Math.round(freqToMidi(o.note.freq));
          expect(inScale(m, w.root, w.scale), `${w.id} ${o.role} ${o.note.patch} midi ${m}`).toBe(true);
        }
      }
    }
  });

  it("each world has its own clock: tempo, meter or swing", () => {
    const sig = worlds.map((w) => `${w.bpm}/${w.stepsPerBar}/${w.swing}`);
    expect(new Set(sig).size).toBe(worlds.length);
    expect(worlds.find((w) => w.id === "jungle")!.stepsPerBar).toBe(12);
    expect(worlds.find((w) => w.id === "neon")!.swing).toBeGreaterThan(0.55);
  });

  it("each world has its own kit", () => {
    const kits = worlds.map((w) => new Set(run(w).map(({ o }) => o.note.patch)));
    const [orbit, aurora, deep, canopy, neon] = kits;
    expect(orbit.has("kick") || orbit.has("snare") || orbit.has("clap")).toBe(false); // no drum kit in space
    expect(aurora.has("res") && aurora.has("tom")).toBe(true); // ice cracks and a frame drum
    expect(deep.has("kick") && deep.has("chirp")).toBe(true); // bubble kick and water drops
    expect(canopy.has("res") && canopy.has("tom") && canopy.has("pluck")).toBe(true); // bell, log drum, kalimba
    expect(neon.has("clap") && neon.has("metal") && neon.has("kick")).toBe(true); // 2-step kit
  });

  it("Aurora has no grid: its events land on irregular steps", () => {
    const outs = run(worlds[1], 32).filter(({ o }) => o.role === "arp");
    const gaps = outs.slice(1).map((x, i) => x.step - outs[i].step);
    expect(new Set(gaps).size).toBeGreaterThan(2);
  });

  it("the T-voice is always the nearest triad tone on the asked side", () => {
    for (let m = -7; m < 14; m++) {
      const up = tVoice(m, true);
      const down = tVoice(m, false);
      expect(up).toBeGreaterThan(m);
      expect(down).toBeLessThan(m);
      expect([0, 2, 4]).toContain(((up % 7) + 7) % 7);
      expect([0, 2, 4]).toContain(((down % 7) + 7) % 7);
    }
  });

  it("Neon's kick ducks the sub and pad", () => {
    const outs = run(worlds[4]);
    expect(outs.some(({ o }) => o.ducks)).toBe(true);
    expect(outs.some(({ o }) => o.role === "bass" && o.note.duck)).toBe(true);
  });

  it("Deep's taps are dub throws", () => {
    const w = worlds[2];
    w.reset(1);
    const outs = w.tap("pad", { step: 0, bar: 0, pos: 0, stepSec: 0.12, section: w.write("bloom", rng(1)), rng: rng(1), playerActive: true, daylight: 0.5 });
    expect(outs.every((o) => o.delay === 1)).toBe(true);
    expect(outs.some((o) => (o.throw ?? 0) > 0)).toBe(true);
  });

  it("Orbit taps move a planet to a new orbit", () => {
    const w = worlds[0];
    w.reset(1);
    const sec = w.write("bloom", rng(2));
    const leadSteps = (from: number) => {
      const s: number[] = [];
      for (let i = from; i < from + 64; i++) if (w.step({ step: i, bar: Math.floor(i / 16), pos: i % 16, stepSec: 0.15, section: { ...sec, layers: { ...sec.layers, lead: 1 } }, rng: () => 0, playerActive: false, daylight: 0.5 }).some((o) => o.role === "lead")) s.push(i);
      return s;
    };
    const before = leadSteps(0);
    w.tap("lead", { step: 64, bar: 4, pos: 0, stepSec: 0.15, section: sec, rng: () => 0, playerActive: true, daylight: 0.5 });
    const after = leadSteps(64);
    const gap = (a: number[]) => a[1] - a[0];
    expect(gap(after)).toBeGreaterThan(gap(before));
  });
});

describe("conductor", () => {
  it("crosses into the next world through a drumless bridge, then plays the new world", () => {
    let target = 3;
    const events: string[] = [];
    const c = new Conductor({ seed: 4, target: () => target, weightOf: () => 0.1, tapeStop: () => events.push("tapestop"), onWorld: (w) => events.push(w.id) }, 3);
    let bridgeDrums = 0;
    let t = 0;
    for (let s = 0; s < 12 * 4; s++, t += 0.18) c.hits(s, t);
    target = 4;
    let s = 48;
    for (; s < 48 + 12 * 3; s++, t += 0.18) {
      const outs = c.hits(s, t);
      if (c.transitioning) bridgeDrums += outs.filter((o) => o.role === "kick").length;
    }
    expect(events).toContain("tapestop"); // Canopy to Neon is the power cut
    expect(events).toContain("neon");
    expect(bridgeDrums).toBe(0);
    expect(c.world.id).toBe("neon");
    expect(c.section.name).toBe("bloom");
    let kicks = 0;
    for (let k = 0; k < 64; k++, s++, t += 0.11) kicks += c.hits(s, t).filter((o) => o.note.patch === "kick").length;
    expect(kicks).toBeGreaterThan(2);
  });

  it("uses Claude's section when it arrives in time, the world's own when it does not", async () => {
    const c = new Conductor({ seed: 1, target: () => 4, weightOf: () => 1, composer: async () => ({ name: "pulse", bars: 4, energy: 0.9, layers: { drums: 1 } }) }, 4);
    c.hits(0, 0);
    await new Promise((r) => setTimeout(r, 0));
    for (let s = 1; s <= 9 * 16; s++) c.hits(s, s * 0.11);
    expect(c.section.by).toBe("claude");

    const slow = new Conductor({ seed: 1, target: () => 4, weightOf: () => 1, composer: () => new Promise(() => {}) }, 4);
    for (let s = 0; s <= 9 * 16; s++) slow.hits(s, s * 0.11);
    expect(slow.section.by).toBe("band");
  });

  it("switching Claude on mid-section asks at once, so its section is the very next one", async () => {
    const c = new Conductor({ seed: 2, target: () => 4, weightOf: () => 1 }, 4);
    for (let s = 0; s < 40; s++) c.hits(s, s * 0.11);
    let asked = 0;
    c.setComposer(async () => (asked++, { name: "pulse", bars: 4, energy: 0.8 }));
    await new Promise((r) => setTimeout(r, 0));
    expect(asked).toBe(1);
    for (let s = 40; s <= 8 * 16; s++) c.hits(s, s * 0.11);
    expect(c.section.by).toBe("claude");
  });

  it("sky notes use the playing world's own degrees", () => {
    const c = new Conductor({ seed: 1, target: () => 3, weightOf: () => 1 }, 3);
    for (let x = 0; x <= 1; x += 0.05) expect([0, 1, 2, 4, 5]).toContain(((c.skyDeg(x) % 7) + 7) % 7);
  });
});

describe("clock", () => {
  function fake() {
    let t = 0;
    let fn: (() => void) | null = null;
    return {
      deps: { now: () => t, every: (_ms: number, f: () => void) => ((fn = f), () => (fn = null)) },
      advance(sec: number) {
        for (let i = 0; i < Math.round(sec / 0.025); i++) {
          t += 0.025;
          fn?.();
        }
      },
    };
  }

  it("schedules steps at exact, drift-free times", () => {
    const f = fake();
    const clock = new Clock(f.deps, 0.125);
    const times: number[] = [];
    clock.onStep((_s, time) => times.push(time));
    clock.start(0.1);
    f.advance(60);
    const n = times.length - 1;
    expect(n).toBeGreaterThan(470);
    expect(Math.abs(times[n] - (0.1 + n * 0.125))).toBeLessThan(1e-9);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("glides the step length instead of jumping", () => {
    const f = fake();
    const clock = new Clock(f.deps, 0.25);
    const gaps: number[] = [];
    let last = -1;
    clock.onStep((_s, time) => {
      if (last >= 0) gaps.push(time - last);
      last = time;
    });
    clock.start(0);
    f.advance(2);
    clock.setStepSec(0.11);
    f.advance(20);
    for (let i = 1; i < gaps.length; i++) expect(Math.abs(gaps[i] - gaps[i - 1]) / gaps[i - 1]).toBeLessThan(0.07);
    expect(clock.stepSec).toBeCloseTo(0.11, 3);
  });
});
