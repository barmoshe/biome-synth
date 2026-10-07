import { describe, expect, it } from "vitest";
import { Conductor } from "../src/music/conductor";
import { develop, Melody, Mind, snapTo } from "../src/music/mind";
import { parseLine, SECTION_NAMES, type LineNote, type SectionName } from "../src/music/pattern";
import { rng } from "../src/music/rng";
import { inScale } from "../src/music/theory";
import type { Out } from "../src/music/world";
import { makeWorlds } from "../src/music/worlds";

const freqToMidi = (f: number) => Math.round(69 + 12 * Math.log2(f / 440));
const line = (src: string) => parseLine(src, 32);

/** Drive a conductor in one world; `play(step)` returns a sky x to play there, or null. */
function drive(world: number, steps: number, play: (s: number) => number | null, daylight = 0.5) {
  const sections: SectionName[] = [];
  const c = new Conductor({ seed: 7, target: () => world, weightOf: () => 1, daylight: () => daylight, onSection: (s) => sections.push(s.name) }, world);
  const outs: { o: Out; step: number; listening: boolean }[] = [];
  for (let s = 0; s < steps; s++) {
    for (const o of c.hits(s, s * 0.1)) outs.push({ o, step: s, listening: c.mind.listening(s) });
    const x = play(s);
    if (x !== null) c.sky(s, x, { bright: 0.5, speed: 0, pan: 0 });
  }
  return { c, outs, sections };
}

describe("developing a theme", () => {
  const t: LineNote[] = line("0:2:0 2:2:2 4:2:4");
  it("inverts, reverses, stretches and squeezes exactly", () => {
    expect(develop.invert(t).map((n) => n.deg)).toEqual([0, -2, -4]);
    expect(develop.retrograde(t).map((n) => [n.step, n.deg])).toEqual([[0, 4], [2, 2], [4, 0]]);
    expect(develop.augment(t).map((n) => [n.step, n.len])).toEqual([[0, 4], [4, 4], [8, 4]]);
    expect(develop.diminish(t).map((n) => n.step)).toEqual([0, 1, 2]);
    expect(develop.fragment(t)).toHaveLength(2);
    const seq = develop.sequence(t, 1, 16);
    expect(seq).toHaveLength(6);
    expect(seq[5]).toEqual({ step: 20, len: 2, deg: 5 });
  });
  it("snaps to the nearest allowed degree, ties going down", () => {
    expect(snapTo(3, [0, 1, 2, 4, 5])).toBe(2);
    expect(snapTo(6, [0, 1, 2, 4, 5])).toBe(5);
    expect(snapTo(7, [0, 1, 2, 4, 5])).toBe(7);
    expect(snapTo(-1, [0])).toBe(0);
  });
});

describe("the melody model", () => {
  it("learns the player's moves", () => {
    const m = new Melody();
    m.learn(line("0:2:0 2:2:-1 4:2:-3 6:2:-4"));
    const before = m.weight(2);
    m.learn(line("0:2:0 2:2:2 4:2:4 6:2:6"), 3);
    expect(m.weight(2)).toBeGreaterThan(before);
  });

  it("writes every world's themes in its own language, the same way for the same seed", () => {
    for (const w of makeWorlds()) {
      const write = () => {
        const mind = new Mind({ rng: rng(5, "mind"), daylight: () => 0.5 });
        w.reset(1);
        mind.enter(w);
        return SECTION_NAMES.map((n) => mind.write(n, w));
      };
      const a = write();
      expect(a.map((s) => s.motif)).toEqual(write().map((s) => s.motif));
      for (const s of a) {
        const notes = parseLine(s.motif, w.stepsPerBar * 2);
        expect(notes.length, `${w.id} ${s.name}`).toBeGreaterThan(0);
        for (const n of notes) {
          expect(n.deg).toBeGreaterThanOrEqual(-3);
          expect(n.deg).toBeLessThanOrEqual(11);
          if (w.skyDegrees) expect(w.skyDegrees).toContain(((n.deg % 7) + 7) % 7);
        }
      }
    }
  });

  it("walks each world's chord graph and ends on a chord that leads home", () => {
    for (const w of makeWorlds()) {
      const g = w.chordGraph;
      if (!g) continue;
      const mind = new Mind({ rng: rng(3), daylight: () => 0.5 });
      mind.enter(w);
      for (let k = 0; k < 20; k++) {
        const plan = mind.chords(w, 8);
        for (const ch of plan) expect(Object.keys(g).map(Number)).toContain(ch);
        expect(g[plan[plan.length - 1]]).toContain(0);
      }
    }
  });
});

describe("the band listens", () => {
  // Neon: a four-note phrase on bar 1, then silence.
  const phrase = (s: number) => (s >= 16 && s <= 22 && s % 2 === 0 ? [0.1, 0.3, 0.5, 0.4][(s - 16) / 2] : null);

  it("answers a phrase a bar after it ends, and ends the answer at home", () => {
    const { c, outs } = drive(4, 16 * 6, phrase);
    const echo = outs.filter(({ o }) => o.from === "echo");
    expect(echo.length).toBeGreaterThanOrEqual(3);
    expect(Math.min(...echo.map((e) => e.step))).toBeGreaterThanOrEqual(32);
    const last = echo[echo.length - 1].o.note.freq;
    const w = c.world;
    expect(((freqToMidi(last) - w.root) % 12 + 12) % 12).toBe(0);
  });

  it("makes the phrase the band's theme", () => {
    const { c } = drive(4, 16 * 4, phrase);
    expect(c.mind.themeBy).toBe("you");
    expect(c.section.by).toBe("you");
    expect(c.section.motif.length).toBeGreaterThan(0);
  });

  it("takes a theme from a player who never pauses, without talking over them", () => {
    const { c, outs } = drive(4, 16 * 12, (s) => (s % 4 === 0 ? (s % 9) / 9 : null));
    expect(c.mind.themeBy).toBe("you");
    expect(outs.filter(({ o }) => o.from === "echo").length).toBe(0);
  });

  it("stops answering when the player plays again", () => {
    // The phrase ends at 22; the answer starts at 48 (a full bar of silence first); the player comes back at 49.
    const { outs } = drive(4, 16 * 6, (s) => phrase(s) ?? (s === 49 ? 0.6 : null));
    expect(outs.filter(({ o, step }) => o.from === "echo" && step > 49).length).toBe(0);
  });

  it("never sings its theme over the player, and does sing it when left alone", () => {
    const melody = (o: Out) => o.from === "band" && o.role === "lead" && o.note.patch === "saw";
    const busy = drive(4, 16 * 64, (s) => (s % 3 === 0 ? (s % 7) / 7 : null));
    expect(busy.outs.filter(({ o, listening }) => listening && melody(o)).length).toBe(0);
    const alone = drive(4, 16 * 64, () => null);
    expect(alone.outs.filter(({ o }) => melody(o)).length).toBeGreaterThan(0);
  });

  it("follows the player's energy: a busy player reaches the surge, an idle one never does", () => {
    const busy = drive(4, 16 * 80, (s) => (s % 4 === 0 ? (s % 9) / 9 : null));
    expect(busy.sections).toContain("surge");
    const idle = drive(4, 16 * 80, () => null);
    expect(idle.sections).not.toContain("surge");
    expect(idle.sections).toContain("bloom");
  });

  it("keeps everything it plays in key, the answers and themes too", () => {
    for (let wi = 0; wi < 5; wi++) {
      const { c, outs } = drive(wi, 16 * 24, (s) => (s % 64 < 12 && s % 3 === 0 ? ((s * 7) % 11) / 11 : null));
      const w = c.world;
      for (const { o } of outs) {
        if (o.from === "player" || !["bass", "pad", "arp", "lead"].includes(o.role)) continue;
        if (!["pulse", "tri", "pluck", "bell", "saw", "pad", "sub", "vox"].includes(o.note.patch)) continue;
        expect(inScale(freqToMidi(o.note.freq), w.root, w.scale), `${w.id} ${o.role} ${o.from}`).toBe(true);
      }
    }
  });
});
