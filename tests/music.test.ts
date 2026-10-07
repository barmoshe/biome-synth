import { describe, expect, it } from "vitest";
import { Clock } from "../src/audio/clock";
import { perform, writeSection, motif, rng } from "../src/music/band";
import { Conductor } from "../src/music/conductor";
import { clampSection, SECTION_NAMES } from "../src/music/pattern";
import { degreeToMidi, inScale, midiToDegree, pc, snap, SCALES } from "../src/music/theory";
import { BIOMES } from "../src/shared/biomes";

describe("theory", () => {
  it("pitch class works for negatives", () => {
    expect(pc(-1)).toBe(11);
    expect(pc(-13)).toBe(11);
  });
  it("degrees map into the scale in every octave, both directions", () => {
    for (const s of Object.values(SCALES))
      for (let d = -20; d <= 20; d++) expect(inScale(degreeToMidi(57, s, d), 57, s)).toBe(true);
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
    ["wrong types", { name: 7, bars: "lots", energy: "high", chords: "I-IV-V", lines: 3, drums: [] }],
    ["out of range", { name: "surge", bars: 400, energy: 9, chords: [99, -99, 2.6], lineBars: 3, padEvery: 5 }],
    ["broken lines", { lines: { bass: "0:4:0 nonsense 999:2:1 4:0:2 8:2:99", lead: "", arp: 42 } }],
    ["drum junk", { drums: { kick: "X--x--X--x", hat: "🥁🥁", perc: "XxoXxoXxoXxoXxoXxoXxo" } }],
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
      expect(s.chords.length).toBeGreaterThan(0);
      for (const d of Object.values(s.drums)) expect(d).toMatch(/^[Xxo.]{16}$/);
      // It performs without throwing for the whole section.
      for (let i = 0; i < s.bars * 16; i++) perform(s, i);
    });

  it("keeps the good parts of a mixed line", () => {
    const s = clampSection({ lines: { bass: "0:4:0 nonsense 999:2:1 8:2:99" } });
    expect(s.lines.bass).toBe("0:4:0 8:2:14");
  });
  it("keeps a valid Lyria steer, clamped", () => {
    const s = clampSection({ lyria: { prompts: [{ text: "rain", weight: 99 }], density: 2, brightness: 0.4 } });
    expect(s.lyria).toEqual({ prompts: [{ text: "rain", weight: 2 }], density: 1, brightness: 0.4 });
  });
});

describe("band", () => {
  it("is deterministic for a seed", () => {
    expect(motif(rng(7, "t"))).toEqual(motif(rng(7, "t")));
    expect(writeSection("bloom", "jungle", 3, motif(rng(3)))).toEqual(writeSection("bloom", "jungle", 3, motif(rng(3))));
  });

  it("every note of every section in every biome is in key", () => {
    for (const b of BIOMES)
      for (const name of SECTION_NAMES) {
        const s = writeSection(name, b.id, 11, motif(rng(11)));
        for (let i = 0; i < s.bars * 16; i++)
          for (const h of perform(s, i))
            if (h.deg !== undefined) expect(inScale(degreeToMidi(b.root, SCALES[b.scale], h.deg), b.root, SCALES[b.scale])).toBe(true);
      }
  });

  it("the conductor walks the arc and answers a phrase", async () => {
    const seen: string[] = [];
    const c = new Conductor({ seed: 5, dominant: () => "sea", blend: () => [{ biome: "sea", weight: 1 }], onSection: (s) => seen.push(s.name) });
    let answered = 0;
    for (let step = 0; step < 16 * 60; step++) {
      if (step === 200 || step === 204 || step === 208) c.playerLead(step, 3);
      for (const h of c.hits(step)) if (h.from === "echo" && h.role === "lead") answered++;
    }
    expect(seen.slice(0, 4)).toEqual(["pulse", "bloom", "surge", "dissolve"]);
    expect(answered).toBe(3);
  });

  it("uses Claude's section when it arrives in time, the band's when it does not", async () => {
    const c = new Conductor({
      seed: 1,
      dominant: () => "neon",
      blend: () => [{ biome: "neon", weight: 1 }],
      composer: async () => ({ name: "pulse", bars: 4, energy: 0.9, chords: [0, 3], drums: { kick: "X...X...X...X..." } }),
    });
    c.hits(0);
    await new Promise((r) => setTimeout(r, 0));
    for (let s = 1; s <= 8 * 16; s++) c.hits(s);
    expect(c.section.by).toBe("claude");
    expect(c.section.bars).toBe(4);

    const slow = new Conductor({ seed: 1, dominant: () => "neon", blend: () => [], composer: () => new Promise(() => {}) });
    for (let s = 0; s <= 8 * 16; s++) slow.hits(s);
    expect(slow.section.by).toBe("band");
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
    const clock = new Clock(f.deps, 120);
    const times: number[] = [];
    clock.onStep((_s, time) => times.push(time));
    clock.start(0.1);
    f.advance(60);
    const sec = 60 / 120 / 4;
    // 60 s at 120 bpm is 480 sixteenths; the last scheduled time is exactly n * step from the start.
    expect(times.length).toBeGreaterThan(480);
    const n = times.length - 1;
    expect(Math.abs(times[n] - (0.1 + n * sec))).toBeLessThan(1e-9);
    // Strictly increasing, never scheduled in the past beyond the lookahead.
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
  });

  it("glides tempo instead of jumping", () => {
    const f = fake();
    const clock = new Clock(f.deps, 68);
    const gaps: number[] = [];
    let last = -1;
    clock.onStep((_s, time) => {
      if (last >= 0) gaps.push(time - last);
      last = time;
    });
    clock.start(0);
    f.advance(2);
    clock.setTempo(128);
    f.advance(20);
    for (let i = 1; i < gaps.length; i++) expect(Math.abs(gaps[i] - gaps[i - 1]) / gaps[i - 1]).toBeLessThan(0.05);
    expect(clock.bpm).toBeCloseTo(128, 0);
  });
});
