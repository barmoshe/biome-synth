// The local band: writes sections from rules (seeded, so a given seed always sounds the same),
// performs any section step by step, and answers the player. Claude writes the same Section type;
// this band is what plays when Claude is off, slow or wrong.
import type { BiomeId, Role } from "../shared/biomes";
import { chordDegrees } from "./theory";
import { drumVel, formatLine, parseLine, type LineNote, type Section, type SectionName } from "./pattern";

/** One thing to play, before it is turned into sound for a biome. */
export type Hit = {
  role: Role;
  /** Scale degree from the biome root (absolute), for pitched roles. */
  deg?: number;
  vel: number;
  /** Length in 16th steps. */
  len: number;
  /** Who played it: the world animates differently for the player. */
  from: "band" | "player" | "echo";
};

// ---------- seeded randomness: one stream per (seed, section, role) ----------

export function rng(seed: number, ...keys: (string | number)[]) {
  let h = seed >>> 0;
  for (const k of keys) {
    const s = String(k);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 2654435761) >>> 0;
  }
  // mulberry32
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- performing ----------

const lineCache = new WeakMap<Section, Partial<Record<"bass" | "arp" | "lead", LineNote[]>>>();
function linesOf(s: Section) {
  let c = lineCache.get(s);
  if (!c) {
    c = {};
    for (const k of ["bass", "arp", "lead"] as const) if (s.lines[k]) c[k] = parseLine(s.lines[k]!, s.lineBars);
    lineCache.set(s, c);
  }
  return c;
}

export type PerformOpts = {
  /** Mute the section's lead (the player is soloing). */
  muteLead?: boolean;
  /** Extra drum hits the player wrote into the grid, by role, per 16th. */
  extra?: Partial<Record<"kick" | "hat" | "perc", number[]>>;
  random?: () => number;
};

/** Everything the section plays on step `s` (0-based within the section). */
export function perform(sec: Section, s: number, opts: PerformOpts = {}): Hit[] {
  const out: Hit[] = [];
  const bar = Math.floor(s / 16);
  const s16 = s % 16;
  const chord = sec.chords[bar % sec.chords.length];
  const e = sec.energy;

  for (const k of ["kick", "hat", "perc"] as const) {
    const pat = sec.drums[k];
    let v = pat ? drumVel(pat[s16]) : 0;
    const x = opts.extra?.[k]?.[s16] ?? 0;
    v = Math.max(v, x);
    if (v > 0) out.push({ role: k, vel: v * (0.6 + 0.4 * e), len: 1, from: x > 0 && x >= v ? "player" : "band" });
  }

  if (sec.padEvery && s16 === 0 && bar % sec.padEvery === 0) {
    for (const d of chordDegrees(chord, sec.voicing)) out.push({ role: "pad", deg: d, vel: 0.5 + 0.3 * e, len: 16 * sec.padEvery, from: "band" });
  }

  const ls = linesOf(sec);
  const lineStep = (bar % sec.lineBars) * 16 + s16;
  for (const k of ["bass", "arp", "lead"] as const) {
    if (k === "lead" && opts.muteLead) continue;
    const notes = ls[k];
    if (!notes) continue;
    for (const n of notes) if (n.step === lineStep) out.push({ role: k, deg: chord + n.deg, vel: k === "lead" ? 0.8 : 0.7, len: n.len, from: "band" });
  }

  if (!ls.arp && sec.arp.rate > 0) {
    const every = 4 / sec.arp.rate;
    if (s16 % every === 0) {
      const tones = chordDegrees(chord, sec.voicing);
      const ring = tones;
      const i = Math.floor(s16 / every);
      let idx: number;
      if (sec.arp.shape === "up") idx = i % ring.length;
      else if (sec.arp.shape === "down") idx = ring.length - 1 - (i % ring.length);
      else if (sec.arp.shape === "updown") {
        const cyc = ring.length * 2 - 2;
        const p = i % cyc;
        idx = p < ring.length ? p : cyc - p;
      } else idx = Math.floor((opts.random ?? Math.random)() * ring.length);
      out.push({ role: "arp", deg: ring[idx], vel: 0.45 + 0.35 * ((i % 4 === 0 ? 1 : 0.6) * e), len: every, from: "band" });
    }
  }
  return out;
}

// ---------- writing sections ----------

type Feel = "half" | "floor" | "tribal" | "sparse" | "float";
const FEEL: Record<BiomeId, Feel> = { space: "half", tundra: "sparse", sea: "float", jungle: "tribal", neon: "floor" };

const ENERGY: Record<SectionName, number> = { drift: 0.15, pulse: 0.45, bloom: 0.7, surge: 1, dissolve: 0.3 };
const BARS: Record<SectionName, number> = { drift: 8, pulse: 8, bloom: 8, surge: 8, dissolve: 4 };
export const NEXT: Record<SectionName, SectionName> = { drift: "pulse", pulse: "bloom", bloom: "surge", surge: "dissolve", dissolve: "pulse" };

function euclid(k: number, n: number, rot = 0): number[] {
  const out: number[] = [];
  let b = 0;
  for (let i = 0; i < n; i++) {
    b += k;
    if (b >= n) {
      b -= n;
      out.push(1);
    } else out.push(0);
  }
  return out.map((_, i) => out[(i + rot + n) % n]);
}
const toDrum = (bits: number[], acc = "X", soft = "x", accentEvery = 4) => bits.map((b, i) => (b ? (i % accentEvery === 0 ? acc : soft) : ".")).join("");

function drumsFor(feel: Feel, e: number, r: () => number): Section["drums"] {
  const d: Section["drums"] = {};
  if (e < 0.2) {
    d.hat = toDrum(euclid(3 + Math.floor(r() * 3), 16, Math.floor(r() * 4)), "o", "o");
    if (feel !== "sparse" && feel !== "float") d.kick = "X...............";
    return d;
  }
  switch (feel) {
    case "floor":
      d.kick = e > 0.6 ? "X...X...X...X..." : "X.......X.......";
      d.hat = e > 0.8 ? "xoXoxoXoxoXoxoXx" : "..x...x...x...x.";
      d.perc = e > 0.5 ? "....X.......X..." : undefined;
      break;
    case "tribal":
      d.kick = toDrum(euclid(e > 0.6 ? 5 : 3, 16), "X", "x");
      d.hat = toDrum(euclid(e > 0.8 ? 11 : 7, 16, 1), "x", "o");
      d.perc = e > 0.4 ? toDrum(euclid(3, 16, 4 + Math.floor(r() * 3)), "x", "x") : undefined;
      break;
    case "half":
      d.kick = e > 0.6 ? "X......x..X....." : "X.........X.....";
      d.hat = toDrum(euclid(e > 0.8 ? 8 : 4, 16, 2), "x", "o");
      d.perc = e > 0.5 ? "........X......." : undefined;
      break;
    case "sparse":
      d.kick = e > 0.5 ? "X.......x......." : undefined;
      d.hat = toDrum(euclid(e > 0.7 ? 5 : 2, 16, 3), "o", "o");
      d.perc = e > 0.6 ? "......x.......x." : undefined;
      break;
    case "float":
      d.kick = e > 0.4 ? "X..........x...." : undefined;
      d.hat = toDrum(euclid(e > 0.7 ? 6 : 3, 16, 1), "o", "o");
      d.perc = e > 0.6 ? toDrum(euclid(2, 16, 6), "x", "x") : undefined;
      break;
  }
  for (const k of Object.keys(d) as (keyof typeof d)[]) if (!d[k]) delete d[k];
  return d;
}

const PROGS = [
  [0, 3, 4, 0],
  [0, 5, 3, 4],
  [0, -2, 3, 4],
  [0, 2, 5, 4],
  [0, 0, 3, 3],
  [0, 4, 5, 3],
];

/** A 2-bar motif, then developed per section (transposed, inverted, fragmented). */
export function motif(r: () => number): LineNote[] {
  const rhythm = [0, 2, 3, 6, 8, 10, 12, 14, 16, 19, 22, 24, 28].filter(() => r() < 0.6).slice(0, 7);
  if (rhythm.length < 3) rhythm.splice(0, rhythm.length, 0, 4, 8, 12);
  let deg = 0;
  return rhythm.map((step, i) => {
    deg = Math.max(-2, Math.min(7, deg + [-2, -1, 1, 2, 3][Math.floor(r() * 5)]));
    const next = rhythm[i + 1] ?? 32;
    return { step, len: Math.max(1, Math.min(6, next - step)), deg };
  });
}

function develop(m: LineNote[], name: SectionName, r: () => number): LineNote[] {
  if (name === "drift" || name === "dissolve") return m.filter((_, i) => i % 2 === 0); // fragment
  if (name === "surge") return m.map((n) => ({ ...n, deg: n.deg + 2 })); // lift
  if (name === "bloom" && r() < 0.5) return m.map((n) => ({ ...n, deg: 4 - n.deg })); // invert
  return m;
}

function bassFor(feel: Feel, e: number): LineNote[] {
  if (e < 0.2) return [{ step: 0, len: 16, deg: 0 }, { step: 16, len: 16, deg: 0 }];
  const out: LineNote[] = [];
  for (let bar = 0; bar < 2; bar++) {
    const o = bar * 16;
    if (feel === "floor") for (let i = 0; i < 16; i += e > 0.7 ? 2 : 4) out.push({ step: o + i, len: 2, deg: i === 8 && e > 0.7 ? 4 : 0 });
    else if (feel === "tribal") out.push({ step: o, len: 3, deg: 0 }, { step: o + 3, len: 3, deg: 0 }, { step: o + 6, len: 2, deg: 4 }, { step: o + 10, len: 4, deg: bar ? 2 : 0 });
    else out.push({ step: o, len: 8, deg: 0 }, { step: o + 10, len: 6, deg: bar ? 4 : 0 });
  }
  return out;
}

export function writeSection(name: SectionName, biome: BiomeId, seed: number, theme: LineNote[]): Section {
  const r = rng(seed, name, biome);
  const feel = FEEL[biome];
  const e = ENERGY[name];
  const lead = develop(theme, name, r);
  return {
    name,
    bars: BARS[name],
    energy: e,
    chords: PROGS[Math.floor(r() * PROGS.length)],
    voicing: feel === "sparse" || feel === "float" ? "open" : r() < 0.3 ? "sus" : "triad",
    padEvery: name === "surge" ? 1 : 2,
    lines: {
      bass: formatLine(bassFor(feel, e)),
      ...(name !== "drift" ? { lead: formatLine(lead) } : {}),
    },
    lineBars: 2,
    arp: { rate: e < 0.2 ? 1 : e < 0.6 ? 2 : 4, shape: (["up", "updown", "down", "random"] as const)[Math.floor(r() * 4)] },
    drums: drumsFor(feel, e, r),
    by: "band",
  };
}

// ---------- answering the player ----------

/**
 * Turn-taking (knowledge/20): the player plays a phrase; after a bar of silence the band answers
 * with a transformed copy, scheduled from the phrase's own rhythm against absolute steps.
 */
export class Responder {
  private phrase: { step: number; deg: number }[] = [];
  private lastStep = -1e9;
  private answered = true;

  notePlayed(step: number, deg: number) {
    if (step - this.lastStep > 32) this.phrase = [];
    this.phrase.push({ step, deg });
    if (this.phrase.length > 12) this.phrase.shift();
    this.lastStep = step;
    this.answered = false;
  }

  /** True while the player is mid-phrase (the band keeps its lead quiet). */
  soloing(step: number) {
    return step - this.lastStep < 32;
  }

  /** Call every step; returns an answer phrase to play from `step` on, once. */
  answer(step: number, r: () => number): { offset: number; deg: number }[] | null {
    if (this.answered || this.phrase.length < 3) return null;
    if (step - this.lastStep < 16 || step % 16 !== 0) return null;
    this.answered = true;
    const t0 = this.phrase[0].step;
    const first = this.phrase[0].deg;
    const mode = r();
    return this.phrase.map((n) => ({
      offset: Math.min(31, n.step - t0),
      // Echo up a third, or invert around the first note: recognisably theirs, not a copy.
      deg: mode < 0.5 ? n.deg + 2 : first - (n.deg - first),
    }));
  }
}
