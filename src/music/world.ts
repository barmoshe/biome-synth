// What a world is, musically: its own clock (tempo, steps per bar, swing, humanised timing), its own
// effects, and a generator that decides every step what plays, how creatures answer a tap, and what
// the sky does. Worlds share nothing but this shape: no common kit, no common patterns.
import type { WorldFx } from "../audio/engine";
import type { NoteParams } from "../audio/dsp/voices";
import type { BiomeId, Role } from "../shared/biomes";
import { degreeToMidi, midiToFreq } from "./theory";
import type { LineNote, Section, SectionName } from "./pattern";

/** One sound to make, relative to the step it was asked for. */
export type Out = {
  role: Role;
  note: NoteParams;
  /** Seconds after the step's time (swing, jitter, hocket offsets). */
  offset?: number;
  send?: number;
  delay?: number;
  ducks?: boolean;
  id?: number;
  /** A dub throw: the engine opens the delay feedback for `throw` seconds. */
  throw?: number;
  from: "band" | "player" | "echo";
  /** Skip the creature animation (textures, risers). */
  silent?: boolean;
  /** Mixer bus (0 drums, 1 bass, 2 music, 3 lead, 4 ambience); by role when absent. */
  bus?: number;
  /** A player note waits for the next grid line this many steps apart (1 = the next step). */
  q?: number;
};

export type StepCtx = {
  /** Steps since this world began. */
  step: number;
  bar: number;
  /** Step within the bar. */
  pos: number;
  stepSec: number;
  section: Section;
  rng: () => number;
  /** The player played within the last two bars. */
  playerActive: boolean;
  /** 0..1 local hour brightness (night is low). */
  daylight: number;
};

export type SkyCtx = StepCtx & { bright: number; speed: number; pan: number };

export interface WorldMusic {
  id: BiomeId;
  /** Genre line for the HUD. */
  genre: string;
  root: number;
  scale: readonly number[];
  /** Degrees the sky lead uses (a pentatonic subset, say). */
  skyDegrees?: readonly number[];
  bpm: number;
  /** Steps per bar (16 for 4/4 sixteenths, 12 for 12/8 eighths). */
  stepsPerBar: number;
  /** Steps per beat (4 for sixteenths, 3 for 12/8). */
  stepsPerBeat: number;
  /** 0.5 = straight; 0.58 = swung 16ths. */
  swing: number;
  /** Random timing in seconds, either way. */
  humanize: number;
  fx: WorldFx;
  /** How long each section runs here, relative to the default. */
  barScale: number;
  /** Loudness trim so crossing a border never jumps in volume (measured from offline renders). */
  level: number;
  /** Example lines in the genre's melodic language (step grammar): the mind learns from them. */
  idiom?: readonly string[];
  /** Which chord (a scale degree) may follow which. Absent: the world keeps its own harmony. */
  chordGraph?: Record<number, number[]>;
  /** The band's melody voice, for themes and answers. Absent: the sky voice, played softer. */
  voice?(deg: number, c: StepCtx): Out[];
  /** The world performs the theme itself (through `section.motif`), so the conductor does not. */
  ownsTheme?: boolean;
  /** A written song: the world picks its own sections; the conductor reads them from section(). */
  drivesForm?: boolean;
  section?(): Section;
  /** The player finished a phrase (from the mind), for the echo creature. */
  heard?(line: LineNote[]): void;
  /** The camera has moved on: play the way out. */
  leaving?(): void;
  /** Reset state (on entering the world). */
  reset(seed: number): void;
  /** Write a section of the local band's arc. */
  write(name: SectionName, rng: () => number): Section;
  step(c: StepCtx): Out[];
  tap(role: Role, c: StepCtx): Out[];
  sky(deg: number, c: SkyCtx): Out[];
}

// ---------- shared helpers ----------

export function euclid(k: number, n: number, rot = 0): number[] {
  const out: number[] = [];
  let b = 0;
  for (let i = 0; i < n; i++) {
    b += k;
    if (b >= n) {
      b -= n;
      out.push(1);
    } else out.push(0);
  }
  return out.map((_, i) => out[(((i + rot) % n) + n) % n]);
}

/** A pattern string: X accent, x hit, o ghost, . rest. */
export const vel = (pat: string, i: number) => {
  const ch = pat[i % pat.length];
  return ch === "X" ? 1 : ch === "x" ? 0.7 : ch === "o" ? 0.35 : 0;
};

export function hz(w: { root: number; scale: readonly number[] }, deg: number, octave = 0) {
  return midiToFreq(degreeToMidi(w.root + 12 * octave, w.scale, deg));
}

export const out = (role: Role, note: NoteParams, extra: Partial<Out> = {}): Out => ({ role, note, from: "band", ...extra });

const BUS_BY_ROLE: Record<Role, number> = { kick: 0, hat: 0, perc: 0, bass: 1, pad: 2, arp: 2, lead: 3 };
/** The mixer bus an out plays on. */
export const busOf = (o: Out) => o.bus ?? (o.silent && o.role !== "bass" && o.role !== "kick" ? (o.role === "hat" || o.role === "perc" ? 4 : 2) : BUS_BY_ROLE[o.role]);

/** Default layer densities for an energy level: worlds scale these to taste. */
export function layersFor(energy: number) {
  return {
    bass: energy > 0.25 ? 1 : 0.4,
    pad: 1,
    arp: Math.min(1, 0.3 + energy),
    lead: energy > 0.35 ? Math.min(1, energy + 0.2) : 0,
    drums: energy < 0.2 ? 0 : Math.min(1, energy * 1.2),
    texture: 1 - energy * 0.5,
  };
}

export const ENERGY: Record<SectionName, number> = { drift: 0.15, pulse: 0.45, bloom: 0.7, surge: 1, dissolve: 0.3 };
export const BARS: Record<SectionName, number> = { drift: 8, pulse: 8, bloom: 8, surge: 8, dissolve: 4 };

export function baseSection(name: SectionName, w: WorldMusic, motif = ""): Section {
  const e = ENERGY[name];
  return { name, bars: Math.max(2, Math.round(BARS[name] * w.barScale)), energy: e, layers: layersFor(e), motif, chords: [], by: "band" };
}
