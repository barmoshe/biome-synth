// Written songs. A song is a small graph of loopable segments (intro, verse, chorus, bridge,
// outro), each with a chord chart and the parts that play in it; every part belongs to a creature
// role and writes its notes one bar at a time, so a part can vary by pass, by chord and by how
// hard the song is pushing. The player plays inside it: taps land on the grid and on the chord,
// wake a creature's part for a few bars, and at a phrase end can push the song on. Answer slots
// leave the player room, and the echo creature plays their phrase back.
// songWorld() turns a song into the WorldMusic the conductor already drives (bridges, effects,
// the clock), so written worlds and generated worlds cross into each other the same way.
import type { BiomeId, Role } from "../shared/biomes";
import type { NoteParams } from "../audio/dsp/voices";
import { BUS } from "../audio/dsp/mix";
import { sampled } from "../audio/instruments";
import { chart, nearest, pc, snapPc, type Chord } from "./chords";
import { LAYERS, type Layer, type LineNote, type Section, type SectionName } from "./pattern";
import { out, type Out, type SkyCtx, type StepCtx, type WorldMusic } from "./world";
import type { WorldFx } from "../audio/engine";

/** What a part sees when it writes a bar. */
export type BarCtx = {
  /** Bar within the segment, and the segment. */
  bar: number;
  seg: Segment;
  /** Passes through this segment so far on this visit (0 on the first), and laps of the world. */
  pass: number;
  lap: number;
  /** This bar's chords (one or two), the chord at a step, and the next bar's first chord. */
  chords: Chord[];
  chordAt(step: number): Chord;
  next: Chord;
  spb: number;
  rng: () => number;
  /** 0..1: this part's level (the segment's, or a wake from a tap). */
  level: number;
  /** The song's tonic as a MIDI note. */
  tonic: number;
  /** The player played in the last two bars. */
  playerActive: boolean;
  /** The player's last phrase (for the echo creature), cleared once it is played back. */
  heard: LineNote[] | null;
  /** Mark the heard phrase as answered. */
  answered(): void;
};

/** One note or hit, at a step (fractional steps are allowed) within the bar. */
export type Ev = {
  at: number;
  inst: string;
  vel: number;
  /** MIDI note (pitched instruments) or hit name. */
  midi?: number;
  key?: string;
  /** Length in steps (held notes); hits ring out. */
  len?: number;
  pan?: number;
  send?: number;
  delay?: number;
  cutoff?: number;
  bend?: number;
  sweep?: number;
  /** No creature animation for this note (band parts with no creature of their own). */
  silent?: boolean;
  role?: Role;
  /** A synth note instead of a sample (subs, thumps, pads); its vel is scaled by the event's. */
  synth?: NoteParams;
};

export type Part = {
  id: string;
  role: Role;
  /** Mixer bus (default by role). */
  bus?: number;
  /** Reverb send and dub delay send for this part's notes (default 0.2 and 0). */
  send?: number;
  delay?: number;
  /** Seconds of push or drag (negative is early): drummers' feel. */
  feel?: number;
  /** Random timing in seconds, either way. */
  loose?: number;
  bar(c: BarCtx): Ev[];
};

export type Segment = {
  id: string;
  title: string;
  hud: SectionName;
  bars: number;
  chords: string;
  energy: number;
  /** Which parts play, and how loud (0..1). */
  parts: Record<string, number>;
  /** How many passes before moving on (default 1). */
  loops?: number;
  /** Gain for everything in this segment: the arc between sections (verse under chorus). */
  gain?: number;
  /** Where the song can go next (the first is preferred; never straight back to itself unless alone). */
  next: string[];
  /** Bars (0-based) that belong to the player: the band's lead steps out. */
  answer?: number[];
};

/** How a creature tap plays: on what grid, which note, what it wakes, and whether it pushes the form. */
export type TapRule = {
  /** Grid in steps (1 = the next step, a beat, a bar). */
  q: number;
  play(c: TapCtx): Ev[];
  /** Part ids woken for a few bars. */
  wakes?: string[];
  /** Tapped in a segment's last bar, it asks for the next segment. */
  advances?: boolean;
};
export type TapCtx = { chord: Chord; tonic: number; pos: number; spb: number; rng: () => number; count: number };

export type Song = {
  id: BiomeId;
  title: string;
  genre: string;
  tonic: number;
  /** Scale as semitones above the tonic (the sky and the mind use it). */
  scale: readonly number[];
  skyDegrees?: readonly number[];
  bpm: number;
  stepsPerBar: number;
  stepsPerBeat: number;
  swing: number;
  humanize: number;
  barScale?: number;
  level: number;
  fx: WorldFx;
  parts: Part[];
  segments: Segment[];
  start: string;
  /** The segment played on the way out (the pivot to the next world). */
  outro?: string;
  taps: Partial<Record<Role, TapRule>>;
  /** The player's sky voice: a note at MIDI `midi`. */
  sky(midi: number, c: { bright: number; speed: number; pan: number; stepSec: number }): Ev[];
  /** The echo creature's voice for playing back the player's phrase. */
  echo?(midi: number, len: number): Ev[];
  /** Fallback synth notes while the samples load (by instrument). */
  fallback?(e: Ev): NoteParams | null;
  idiom?: readonly string[];
};

const LAYER_OF: Record<Role, Layer> = { kick: "drums", hat: "drums", perc: "drums", bass: "bass", pad: "pad", arp: "arp", lead: "lead" };
const BUS_OF: Record<Role, number> = { kick: BUS.drums, hat: BUS.drums, perc: BUS.drums, bass: BUS.bass, pad: BUS.music, arp: BUS.music, lead: BUS.lead };
const freq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** A plain synth stand-in for a sampled note, so the first seconds before the samples arrive are never silent. */
function stand(e: Ev): NoteParams {
  if (e.midi === undefined) return { patch: "noise", freq: 6000, vel: e.vel * 0.15, dur: 0.01, release: 0.04 };
  return { patch: "pluck", freq: freq(e.midi), vel: e.vel * 0.4, dur: 0.3, bright: 0.5 };
}

export function songWorld(song: Song): WorldMusic & { song: Song } {
  const segs = new Map(song.segments.map((s) => [s.id, s]));
  const charts = new Map(song.segments.map((s) => [s.id, chart(s.chords)]));
  const spb = song.stepsPerBar;
  let seg = segs.get(song.start)!;
  let segBar = -1;
  let pass = 0;
  let lap = 0;
  let begun = false;
  let resume: string | null = null;
  let advance = false;
  let leaving = false;
  const passes = new Map<string, number>();
  let lastSeg = "";
  const wake = new Map<string, number>();
  const pending = new Map<number, Out[]>();
  let heard: LineNote[] | null = null;
  let tapCount = 0;
  let section: Section = toSection(seg);

  function toSection(s: Segment): Section {
    const layers = Object.fromEntries(LAYERS.map((l) => [l, 1])) as Record<Layer, number>;
    return { name: s.hud, title: s.title, bars: s.bars, energy: s.energy, layers, motif: "", chords: [], by: "band" };
  }

  const chordsOf = (s: Segment, bar: number) => {
    const ch = charts.get(s.id)!;
    return ch[bar % ch.length];
  };
  const chordAtPos = (cs: Chord[], step: number) => cs[Math.min(cs.length - 1, Math.floor((step / spb) * cs.length))];

  function pickNext(): Segment {
    if (leaving && song.outro) return segs.get(song.outro)!;
    if (resume && seg.id === song.start) {
      const r = segs.get(resume);
      resume = null;
      if (r) return r;
    }
    const opts = seg.next.map((id) => segs.get(id)!).filter(Boolean);
    // Prefer the first option, but rotate when it has just played, so loops never sit still.
    const fresh = opts.filter((s) => s.id !== lastSeg);
    return (fresh[0] ?? opts[0]) as Segment;
  }

  /** Turn a part's events into outs on the global step grid. */
  function schedule(part: Part | null, evs: Ev[], baseStep: number, c: StepCtx, level: number) {
    for (const e of evs) {
      const role = e.role ?? part?.role ?? "lead";
      const whole = Math.floor(e.at);
      const frac = e.at - whole;
      const len = e.len !== undefined ? e.len * c.stepSec : undefined;
      const vel = Math.max(0, Math.min(1, e.vel * level));
      if (vel <= 0.01) continue;
      const note = e.synth ? { ...e.synth, vel: e.synth.vel * vel, pan: e.pan ?? e.synth.pan } : (sampled(e.inst, { midi: e.midi, key: e.key, vel, dur: len, pan: e.pan, cutoff: e.cutoff, bend: e.bend, sweep: e.sweep }) ?? song.fallback?.(e) ?? stand(e));
      const loose = part?.loose ?? 0;
      const offset = frac * c.stepSec + (part?.feel ?? 0) + (loose ? (c.rng() * 2 - 1) * loose : 0);
      const o = out(role, note, { send: e.send ?? part?.send ?? 0.2, delay: e.delay ?? part?.delay ?? 0, bus: part?.bus ?? BUS_OF[role], silent: e.silent, offset: Math.max(0, offset) });
      const at = baseStep + whole;
      const list = pending.get(at) ?? [];
      list.push(o);
      pending.set(at, list);
    }
  }

  function startBar(c: StepCtx) {
    if (!begun) {
      begun = true;
      segBar = 0;
      pass = 0;
      passes.set(seg.id, (passes.get(seg.id) ?? 0) + 1);
    } else {
      segBar++;
      if (segBar >= seg.bars) {
        segBar = 0;
        pass++;
        if (advance || leaving || pass >= (seg.loops ?? 1)) {
          lastSeg = seg.id;
          seg = pickNext();
          pass = 0;
          advance = false;
          passes.set(seg.id, (passes.get(seg.id) ?? 0) + 1);
        }
        section = toSection(seg);
      }
    }
    const cs = chordsOf(seg, segBar);
    const nextCs = segBar + 1 < seg.bars ? chordsOf(seg, segBar + 1) : chordsOf(seg, 0);
    const playerActive = c.playerActive;
    for (const part of song.parts) {
      const w = wake.get(part.id) ?? 0;
      let level = Math.max(seg.parts[part.id] ?? 0, w > 0 ? Math.min(1, 0.5 + w * 0.15) : 0) * (seg.gain ?? 1);
      // The conductor's bridge thins the band (no drums, no lead, half the bass): respect it.
      level *= c.section.layers[LAYER_OF[part.role]] ?? 1;
      // Answer bars and a playing player: the lead steps out, the arp steps back.
      if (part.role === "lead" && (seg.answer?.includes(segBar) || playerActive)) level *= seg.answer?.includes(segBar) ? 0 : 0.35;
      if (part.role === "arp" && playerActive) level *= 0.7;
      if (level <= 0.01) continue;
      const bc: BarCtx = {
        bar: segBar, seg, pass: pass + (passes.get(seg.id) ?? 1) - 1, lap, chords: cs, chordAt: (s) => chordAtPos(cs, s), next: nextCs[0],
        spb, rng: c.rng, level, tonic: song.tonic, playerActive, heard, answered: () => (heard = null),
      };
      schedule(part, part.bar(bc), c.step, c, level);
    }
    for (const [k, v] of wake) if (v > 0) wake.set(k, v - 1);
  }

  const w: WorldMusic & { song: Song } = {
    song,
    id: song.id,
    genre: song.genre,
    root: song.tonic,
    scale: song.scale,
    skyDegrees: song.skyDegrees,
    bpm: song.bpm,
    stepsPerBar: song.stepsPerBar,
    stepsPerBeat: song.stepsPerBeat,
    swing: song.swing,
    humanize: song.humanize,
    fx: song.fx,
    barScale: song.barScale ?? 1,
    level: song.level,
    idiom: song.idiom,
    ownsTheme: true,
    drivesForm: true,
    reset() {
      // Lap memory: the next visit plays the intro, then picks up after where this one stopped.
      if (begun && seg.id !== song.start && seg.id !== song.outro) resume = seg.next[0] ?? null;
      if (begun) lap++;
      seg = segs.get(song.start)!;
      begun = false;
      segBar = -1;
      pass = 0;
      advance = false;
      leaving = false;
      pending.clear();
      wake.clear();
      section = toSection(seg);
    },
    write() {
      return section;
    },
    section: () => section,
    heard(line) {
      heard = line;
    },
    leaving() {
      leaving = true;
    },
    step(c) {
      if (c.pos === 0) startBar(c);
      const due = pending.get(c.step);
      if (due) pending.delete(c.step);
      return due ?? [];
    },
    tap(role, c) {
      const rule = song.taps[role];
      if (!rule) return [];
      for (const id of rule.wakes ?? []) wake.set(id, 4);
      if (rule.advances && segBar === seg.bars - 1) advance = true;
      const cs = chordsOf(seg, Math.max(0, segBar));
      const evs = rule.play({ chord: chordAtPos(cs, c.pos), tonic: song.tonic, pos: c.pos, spb, rng: c.rng, count: tapCount++ });
      return evs.map((e) => {
        const note = sampled(e.inst, { midi: e.midi, key: e.key, vel: Math.min(1, e.vel), dur: e.len ? e.len * c.stepSec : undefined, pan: e.pan, cutoff: e.cutoff, bend: e.bend, sweep: e.sweep }) ?? song.fallback?.(e) ?? stand(e);
        return out(e.role ?? role, note, { send: e.send ?? 0.25, delay: e.delay ?? 0, bus: BUS_OF[e.role ?? role], from: "player", q: rule.q, offset: e.at * c.stepSec });
      });
    },
    sky(deg, c: SkyCtx) {
      // Degrees to MIDI in the song's scale, then onto the chord on strong steps.
      const len = song.scale.length;
      let midi = song.tonic + 12 * Math.floor(deg / len) + song.scale[((deg % len) + len) % len];
      const cs = chordsOf(seg, Math.max(0, segBar));
      const ch = chordAtPos(cs, c.pos);
      if (c.pos % song.stepsPerBeat === 0) midi = snapPc(midi, ch.tones.slice(0, 4));
      return song.sky(midi, c).map((e) => {
        const note = sampled(e.inst, { midi: e.midi, key: e.key, vel: Math.min(1, e.vel), dur: e.len ? e.len * c.stepSec : undefined, pan: e.pan, cutoff: e.cutoff, bend: e.bend, sweep: e.sweep }) ?? song.fallback?.(e) ?? stand(e);
        return out("lead", note, { send: e.send ?? 0.3, delay: e.delay ?? 0, bus: BUS.lead, from: "player", q: 1 });
      });
    },
  };
  return w;
}

// ---------- helpers for writing parts ----------

/** A rhythm lane: "x.x.xx.x.x.x" (X accent, x normal, o ghost, . rest) → steps and velocities. */
export function lane(pat: string): { at: number; vel: number }[] {
  const r: { at: number; vel: number }[] = [];
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (ch === "X") r.push({ at: i, vel: 1 });
    else if (ch === "x") r.push({ at: i, vel: 0.75 });
    else if (ch === "o") r.push({ at: i, vel: 0.4 });
  }
  return r;
}

/** Notes of a written line: "0:64:3 3:66:2" = step:midi:len, or "-" rests ignored. */
export function line(src: string): { at: number; midi: number; len: number }[] {
  return src
    .trim()
    .split(/\s+/)
    .filter((t) => t && t !== "-")
    .map((t) => {
      const [a, m, l] = t.split(":").map(Number);
      return { at: a, midi: m, len: l ?? 1 };
    });
}

/** The chord tones of `ch` as MIDI notes in a register, from `low` upward. */
export function voicing(ch: Chord, low: number, count = 3): number[] {
  const out: number[] = [];
  let m = low;
  const tones = ch.tones.slice(0, Math.max(count, 3));
  while (out.length < count && m < low + 36) {
    if (tones.includes(pc(m))) out.push(m);
    m++;
  }
  return out;
}

export { nearest, snapPc, pc };
