// The sampled instruments, from the build's manifest (scripts/samples/build.mjs). Turns "kalimba,
// A4, velocity 0.7" into a note for the sample voice: the nearest zone in that velocity layer,
// round robins in turn, and a few cents and a little level of human variation. The manifest ships
// in the bundle; the audio streams in per world (samples.ts), and `loaded` says what is ready.
import manifest from "../../public/samples/manifest.json";
import type { NoteParams } from "./dsp/voices";

export type Zone = { f: string; root?: number; tune?: number; key?: string; vel: number[]; rr: number; gain: number; len: number };
export type Instrument = { world: string; title: string; src: string; pitched: boolean; zones: Zone[] };
export const MANIFEST = manifest as unknown as { sr: number; instruments: Record<string, Instrument> };

/** Instruments whose audio is in the worklet. */
export const loaded = new Set<string>();

const turn = new Map<string, number>();
let seed = 0x2f6b1;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};

export type PlayOpts = {
  /** MIDI note for pitched instruments. */
  midi?: number;
  /** Hit name for unpitched ones ("high", "down"). */
  key?: string;
  vel: number;
  /** Seconds held before the release; defaults to the zone's length (let it ring). */
  dur?: number;
  release?: number;
  pan?: number;
  cutoff?: number;
  bend?: number;
  sweep?: number;
  /** Cents of random detune either way (default 4 for pitched, 10 for hits). */
  spread?: number;
};

const freqOf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** A sample-voice note, or null when the instrument is unknown or not loaded yet. */
export function sampled(id: string, o: PlayOpts): NoteParams | null {
  const inst = MANIFEST.instruments[id];
  if (!inst || !loaded.has(id)) return null;
  const v = Math.max(0, Math.min(0.999, o.vel));
  const mine = inst.zones.filter((z) => inst.pitched || z.key === o.key);
  let pool = mine.filter((z) => v >= z.vel[0] && v < z.vel[1]);
  if (!pool.length) pool = mine;
  if (!pool.length) return null;
  if (inst.pitched) {
    const m = o.midi ?? 60;
    let best = Infinity;
    for (const z of pool) best = Math.min(best, Math.abs((z.root ?? 60) - m));
    pool = pool.filter((z) => Math.abs((z.root ?? 60) - m) === best);
  }
  const slot = `${id}/${inst.pitched ? pool[0].root : o.key}/${pool[0].vel[0]}`;
  const i = (turn.get(slot) ?? -1) + 1;
  turn.set(slot, i);
  const z = pool[i % pool.length];
  const cents = (rnd() * 2 - 1) * (o.spread ?? (inst.pitched ? 4 : 10));
  const root = (z.root ?? 69) + (z.tune ?? 0) / 100;
  const target = inst.pitched ? (o.midi ?? 60) : root;
  return {
    patch: "sample",
    sample: z.f,
    root,
    freq: freqOf(target + cents / 100),
    // Layers carry the timbre; level still follows velocity within a layer.
    vel: z.gain * (0.35 + 0.65 * v) * (0.94 + rnd() * 0.12),
    dur: o.dur ?? z.len,
    release: o.release ?? 0.08,
    pan: o.pan,
    cutoff: o.cutoff,
    bend: o.bend,
    sweep: o.sweep,
  };
}

/** Every instrument a world needs. */
export const instrumentsFor = (world: string) => Object.keys(MANIFEST.instruments).filter((id) => MANIFEST.instruments[id].world === world);
