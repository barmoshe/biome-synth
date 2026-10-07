// Hits become notes: each hit plays on every biome blended under the camera, through that biome's
// patch for the role, at a gain that follows its weight. At a border the frog's pluck and the
// neon sub share the bassline; in the middle of a biome only its own voices sound.
import type { NoteEvent } from "./dsp/core";
import type { NoteParams } from "./dsp/voices";
import type { Hit } from "../music/band";
import { BIOMES, type Role } from "../shared/biomes";
import { degreeToMidi, midiToFreq, SCALES } from "../music/theory";

const PAN: Record<Role, number> = { bass: 0, pad: 0, arp: 0.35, lead: -0.1, kick: 0, hat: 0.3, perc: -0.3 };
const PITCHED = new Set<Role>(["bass", "pad", "arp", "lead"]);

let held = 1;
export const nextId = () => ++held;

export type RouteOpts = {
  /** 0..1 per biome, same order as BIOMES. */
  weights: number[];
  time: number;
  stepSec: number;
  sampleRate: number;
  energy: number;
  /** Player sky taps: x and y on screen, 0..1. */
  bright?: number;
  pan?: number;
  /** Hold the note until released (pads under a finger). */
  id?: number;
};

export function route(hit: Hit, o: RouteOpts): NoteEvent[] {
  const out: NoteEvent[] = [];
  const frame = Math.round(o.time * o.sampleRate);
  for (let b = 0; b < BIOMES.length; b++) {
    const w = o.weights[b];
    if (w < 0.06) continue;
    const biome = BIOMES[b];
    const p = biome.roles[hit.role];
    const { octave = 0, hz, gain = 0.5, send = 0.3, ...rest } = p;
    let freq: number;
    if (PITCHED.has(hit.role)) freq = midiToFreq(degreeToMidi(biome.root + 12 * octave, SCALES[biome.scale], hit.deg ?? 0));
    else freq = hz ?? 100;
    // Equal-power weights so a 50/50 border is as loud as the middle of a biome.
    const g = Math.sqrt(w);
    const bright = o.bright ?? 0.35 + 0.65 * o.energy;
    const note: NoteParams = {
      ...rest,
      freq,
      vel: Math.min(1, hit.vel) * gain * g * (hit.from === "echo" ? 0.6 : 1),
      dur: hit.len * o.stepSec,
      pan: o.pan ?? PAN[hit.role] + (hit.role === "arp" ? (Math.random() - 0.5) * 0.4 : 0),
      cutoff: rest.cutoff ? rest.cutoff * (0.45 + 0.9 * bright) : undefined,
      bright: rest.bright ?? bright,
    };
    out.push({ frame, note, send, id: o.id });
  }
  return out;
}
