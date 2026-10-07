// The five biomes as data: musical identity and the patch each band role plays.
// The world side (critters, art) lives in src/world/biomes; this file is shared by audio,
// the conductor and the worker (Claude needs the names and moods).
import type { NoteParams, Patch } from "../audio/dsp/voices";
import { SCALES, type ScaleName } from "../music/theory";

export const ROLES = ["bass", "pad", "arp", "lead", "kick", "hat", "perc"] as const;
export type Role = (typeof ROLES)[number];
export const DRUM_ROLES: Role[] = ["kick", "hat", "perc"];

export type BiomeId = "space" | "tundra" | "sea" | "jungle" | "neon";

export type RolePatch = Partial<NoteParams> & {
  patch: Patch;
  /** Octave offset from the biome root for pitched roles; fixed Hz for drums. */
  octave?: number;
  hz?: number;
  gain?: number;
  send?: number;
};

export type Biome = {
  id: BiomeId;
  name: string;
  /** Root as MIDI note in octave 4; roles shift by octave. */
  root: number;
  scale: ScaleName;
  bpm: number;
  mood: string;
  /** One line for Lyria and Claude. */
  prompt: string;
  roles: Record<Role, RolePatch>;
};

export const BIOMES: Biome[] = [
  {
    id: "space",
    name: "Orbit",
    root: 62, // D
    scale: "minorPent",
    bpm: 94,
    mood: "weightless, glittering, slow wonder",
    prompt: "spacey ambient synthwave, glittering arpeggios, deep sub bass, slow cosmic pads",
    roles: {
      bass: { patch: "sub", octave: -2, bright: 0.3, gain: 0.55 },
      pad: { patch: "pad", octave: -1, cutoff: 1200, gain: 0.32, send: 0.6 },
      arp: { patch: "tri", octave: 1, gain: 0.3, release: 0.4, send: 0.5 },
      lead: { patch: "pulse", octave: 0, duty: 0.125, cutoff: 3200, gain: 0.3, send: 0.45 },
      kick: { patch: "kick", hz: 48, bright: 0.4, gain: 0.8, send: 0.05 },
      hat: { patch: "noise", hz: 9000, bright: 0.8, gain: 0.18, send: 0.3 },
      perc: { patch: "bell", octave: 2, release: 0.8, bright: 0.6, gain: 0.18, send: 0.7 },
    },
  },
  {
    id: "tundra",
    name: "Aurora",
    root: 62, // D
    scale: "minor",
    bpm: 68,
    mood: "cold, vast, glassy, patient",
    prompt: "glacial ambient, crystalline bells, slow aurora pads, icy wind, sparse minor key",
    roles: {
      bass: { patch: "sub", octave: -2, bright: 0.1, gain: 0.5, attack: 0.05 },
      pad: { patch: "pad", octave: -1, cutoff: 900, attack: 1.2, release: 2.4, gain: 0.34, send: 0.75 },
      arp: { patch: "bell", octave: 1, release: 1.8, bright: 0.4, gain: 0.24, send: 0.7 },
      lead: { patch: "tri", octave: 0, gain: 0.3, send: 0.6 },
      kick: { patch: "kick", hz: 44, bright: 0.2, gain: 0.6, send: 0.15 },
      hat: { patch: "noise", hz: 5000, bright: 0.3, gain: 0.14, release: 0.2, send: 0.4 },
      perc: { patch: "pluck", octave: 2, bright: 0.9, gain: 0.22, send: 0.6 },
    },
  },
  {
    id: "sea",
    name: "Deep",
    root: 65, // F
    scale: "lydian",
    bpm: 76,
    mood: "floating, luminous, slow currents",
    prompt: "dreamy underwater ambient, lydian bells, slow whale-like bass, washing pads, gentle pulse",
    roles: {
      bass: { patch: "sub", octave: -2, bright: 0.2, attack: 0.08, release: 0.5, gain: 0.55 },
      pad: { patch: "pad", octave: -1, cutoff: 1000, attack: 0.9, release: 2, gain: 0.32, send: 0.7 },
      arp: { patch: "bell", octave: 1, release: 1.2, bright: 0.3, gain: 0.22, send: 0.75 },
      lead: { patch: "pulse", octave: 0, duty: 0.5, cutoff: 1800, attack: 0.04, gain: 0.3, send: 0.6 },
      kick: { patch: "kick", hz: 40, bright: 0.1, gain: 0.6, send: 0.2 },
      hat: { patch: "noise", hz: 3000, bright: 0.2, gain: 0.12, release: 0.25, send: 0.5 },
      perc: { patch: "pluck", octave: 1, bright: 0.4, gain: 0.26, send: 0.55 },
    },
  },
  {
    id: "jungle",
    name: "Canopy",
    root: 57, // A
    scale: "minorPent",
    bpm: 108,
    mood: "warm, bouncing, wooden, alive",
    prompt: "tropical percussion groove, marimba and kalimba plucks, woody bass, lush and playful",
    roles: {
      bass: { patch: "pluck", octave: -2, bright: 0.25, gain: 0.6, send: 0.1 },
      pad: { patch: "pad", octave: 0, cutoff: 1600, gain: 0.26, send: 0.45 },
      arp: { patch: "tri", octave: 1, release: 0.15, decay: 0.1, sustain: 0.1, gain: 0.3, send: 0.35 },
      lead: { patch: "pulse", octave: 1, duty: 0.25, cutoff: 3600, gain: 0.26, send: 0.35 },
      kick: { patch: "kick", hz: 70, bright: 0.7, gain: 0.75, send: 0.1 },
      hat: { patch: "noise", hz: 14000, bright: 0.3, gain: 0.16, send: 0.2 },
      perc: { patch: "snare", hz: 220, gain: 0.35, send: 0.25 },
    },
  },
  {
    id: "neon",
    name: "Neon",
    root: 57, // A
    scale: "doubleHarmonic",
    bpm: 128,
    mood: "driving, electric, nocturnal, exotic",
    prompt: "dark synthwave, double harmonic supersaw lead, pulsing sub bass, rain, driving four on the floor",
    roles: {
      bass: { patch: "sub", octave: -2, bright: 0.9, gain: 0.5, send: 0.05 },
      pad: { patch: "pad", octave: -1, cutoff: 2000, gain: 0.26, send: 0.4 },
      arp: { patch: "pulse", octave: 1, duty: 0.125, cutoff: 5000, release: 0.08, sustain: 0.2, gain: 0.2, send: 0.3 },
      lead: { patch: "saw", octave: 0, cutoff: 3500, gain: 0.32, send: 0.35 },
      kick: { patch: "kick", hz: 50, bright: 0.8, gain: 0.85, send: 0.03 },
      hat: { patch: "noise", hz: 12000, bright: 0.9, gain: 0.16, send: 0.15 },
      perc: { patch: "snare", hz: 180, gain: 0.38, send: 0.3 },
    },
  },
];

export const BIOME_INDEX: Record<BiomeId, number> = { space: 0, tundra: 1, sea: 2, jungle: 3, neon: 4 };
export const scaleOf = (b: Biome) => SCALES[b.scale];
