import { describe, expect, it } from "vitest";
import { chord, chart } from "../src/music/chords";
import { songWorld } from "../src/music/song";
import { parrotTalk } from "../src/music/songs/canopy";
import { rng } from "../src/music/rng";
import { LAYERS, type Layer, type Section } from "../src/music/pattern";
import type { StepCtx } from "../src/music/world";
import { Conductor } from "../src/music/conductor";

const full = Object.fromEntries(LAYERS.map((l) => [l, 1])) as Record<Layer, number>;
const ctx = (step: number, section: Section, playerActive = false): StepCtx => ({
  step, bar: Math.floor(step / 12), pos: step % 12, stepSec: 1 / 6, section: { ...section, layers: full }, rng: rng(1), playerActive, daylight: 0.5,
});

/** Play a song world for `bars` bars; returns the section title at each bar. */
function walk(bars: number, w = songWorld(parrotTalk), onBar?: (bar: number) => void) {
  const titles: string[] = [];
  for (let s = 0; s < bars * 12; s++) {
    w.step(ctx(s, w.section!()));
    if (s % 12 === 0) {
      titles.push(w.section!().title!);
      onBar?.(s / 12);
    }
  }
  return { titles, w };
}

describe("chords", () => {
  it("reads a songwriter's symbols", () => {
    expect(chord("E7").tones).toEqual([4, 8, 11, 2]);
    expect(chord("F#m").tones).toEqual([6, 9, 1]);
    expect(chord("Bm7").tones).toEqual([11, 2, 6, 9]);
    expect(chord("Dmaj9").tones).toEqual([2, 6, 9, 1, 4]);
    expect(chord("A/C#").bass).toBe(1);
    expect(chord("F#m(add9)").tones).toEqual([6, 9, 1, 8]);
    expect(chart("A | D E7").map((c) => c.length)).toEqual([1, 2]);
  });
});

describe("Parrot Talk", () => {
  it("walks its form: intro, two verses, the build, the chorus, the rain, the chorus again", () => {
    const { titles } = walk(4 + 16 + 8 + 8 + 8 + 8);
    const runs = titles.filter((t, i) => t !== titles[i - 1]);
    expect(runs).toEqual(["Dawn Chorus", "Palm Wine", "Under Leaves", "Parrot Talk", "Rainstorm", "Parrot Talk"]);
    expect(titles.filter((t) => t === "Palm Wine")).toHaveLength(16);
  });

  it("every chord in the song parses, and every note the band writes is in A major", () => {
    for (const s of parrotTalk.segments) expect(() => chart(s.chords)).not.toThrow();
    const w = songWorld(parrotTalk);
    const pcs = new Set([9, 11, 1, 2, 4, 6, 8]);
    for (let s = 0; s < 52 * 12; s++)
      for (const o of w.step(ctx(s, w.section!()))) {
        if (o.note.patch === "noise" || o.note.patch === "tom") continue;
        const midi = Math.round(69 + 12 * Math.log2(o.note.freq / 440));
        expect(pcs.has(((midi % 12) + 12) % 12), `${o.role} ${midi}`).toBe(true);
      }
  });

  it("a tap waits for its grid: the monkey on the beat, the fireflies on the next eighth", () => {
    const w = songWorld(parrotTalk);
    walk(1, w);
    expect(w.tap("kick", ctx(13, w.section!()))[0].q).toBe(3);
    expect(w.tap("arp", ctx(13, w.section!()))[0].q).toBe(1);
  });

  it("the monkey in a section's last bar pushes the song on", () => {
    const w = songWorld(parrotTalk);
    // Into the first verse, then tap the monkey in its last bar: the second pass is skipped.
    const { titles } = walk(4 + 8 + 2, w, (bar) => bar === 11 && w.tap("kick", ctx(bar * 12 + 2, w.section!())));
    expect(titles[12]).toBe("Under Leaves");
  });

  it("the parrot plays the player's phrase back", () => {
    const w = songWorld(parrotTalk);
    walk(5, w);
    w.heard!([{ step: 0, len: 2, deg: 2 }, { step: 2, len: 2, deg: 4 }, { step: 4, len: 4, deg: 5 }]);
    const outs = [];
    for (let s = 60; s < 72; s++) outs.push(...w.step(ctx(s, w.section!())));
    const parrot = outs.filter((o) => o.role === "lead" && o.note.freq > 300);
    expect(parrot.length).toBeGreaterThanOrEqual(3);
  });

  it("remembers where it was: the next lap skips ahead after the intro", () => {
    const w = songWorld(parrotTalk);
    walk(4 + 16 + 3, w); // into Under Leaves
    w.reset(1);
    const { titles } = walk(6, w);
    expect(titles[0]).toBe("Dawn Chorus");
    expect(titles[4]).toBe("Parrot Talk");
  });

  it("the conductor shows the song's sections and crosses out of it on a bar line", () => {
    let target = 3;
    const seen: string[] = [];
    const c = new Conductor({ seed: 2, target: () => target, weightOf: () => 0.1, onSection: (s) => seen.push(s.title ?? s.name) }, 3);
    let t = 0;
    for (let s = 0; s < 12 * 6; s++, t += 1 / 6) c.hits(s, t);
    expect(seen).toContain("Palm Wine");
    target = 4;
    for (let s = 72; s < 72 + 12 * 4; s++, t += 1 / 6) c.hits(s, t);
    expect(c.world.id).toBe("neon");
  });
});
