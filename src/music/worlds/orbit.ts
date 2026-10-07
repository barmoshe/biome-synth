// Orbit: kosmische sequencer music in zero gravity (Tangerine Dream, Schulze, Eno's Apollo).
// No kick, no snare: the sequencer is the band. A 7-note ostinato drifts against the 16-step bar,
// and every creature is a planet that sounds each time its orbit comes round (Kepler: a wider
// orbit is a slower one). Tap a creature to push it to a wider orbit.
import type { Role } from "../../shared/biomes";
import { SCALES } from "../theory";
import { baseSection, hz, out, type Out, type StepCtx, type WorldMusic } from "../world";
import { formatLine } from "../pattern";

const W = { root: 62, scale: SCALES.lydian }; // D Lydian over a D pedal
const OSTINATO = [0, 4, 7, 9, 4, 11, 7]; // degrees, 7 against 16

type Orbit = { base: number; r: number; deg: number; phase: number };
const RADII = [1, 1.26, 1.59, 0.79];

export function orbit(): WorldMusic {
  let orbits: Record<string, Orbit> = {};
  let chord = 0;
  const period = (o: Orbit) => Math.max(3, Math.round(o.base * Math.pow(o.r, 1.5)));

  const planet = (role: Role, deg: number, c: StepCtx, from: Out["from"] = "band", v = 1): Out[] => {
    const e = c.section.energy;
    switch (role) {
      case "lead": // the comet: a pulse lead that bends up into its note
        return [out(role, { patch: "pulse", freq: hz(W, deg, 0), vel: 0.26 * v, dur: c.stepSec * 6, duty: 0.25, cutoff: 1800 + 2200 * e, bend: -2, sweep: 0.08, release: 0.6 }, { send: 0.5, delay: 0.35, from })];
      case "perc": // the beacon: a high sine ping
        return [out(role, { patch: "sine", freq: hz(W, deg, 2), vel: 0.16 * v, dur: 0.03, release: 0.5 }, { send: 0.6, delay: 0.5, from })];
      case "kick": // the moon: a sub thrum, never a kick drum
        return [out(role, { patch: "sine", freq: hz(W, 0, -3), vel: 0.55 * v, dur: 0.4, attack: 0.02, release: 1.2 }, { send: 0.1, from })];
      case "hat": // the satellite: telemetry blips
        return [out(role, { patch: "pulse", freq: 1500 + Math.floor(c.rng() * 4) * 400, vel: 0.08 * v, dur: 0.03, duty: 0.125, cutoff: 9000, release: 0.02 }, { send: 0.3, delay: 0.25, from })];
      case "bass": // the pulsar: a pedal D an octave under the pad
        return [out(role, { patch: "sub", freq: hz(W, 0, -2), vel: 0.42 * v, dur: c.stepSec * 24, attack: 0.3, release: 1.5, bright: 0.15 }, { send: 0.15, from })];
      case "arp": // the stars: one note of the ostinato
        return [out(role, { patch: "pulse", freq: hz(W, deg, 0), vel: 0.14 * v, dur: c.stepSec * 0.9, duty: 0.25, cutoff: 900 + 2600 * (0.5 + 0.5 * Math.sin(c.step * 0.05)) * (0.4 + e), release: 0.12 }, { send: 0.45, delay: 0.2, from })];
      case "pad": // the ringed planet: Dmaj7#11 or E/D
        return (chord === 0 ? [0, 2, 4, 6, 3] : [1, 3, 5, 0]).map((d, i) =>
          out(role, { patch: "pad", freq: hz(W, d, -1), vel: 0.11 * v, dur: c.stepSec * 30, attack: 1.6, release: 3, cutoff: 1100 + 600 * e, pan: (i % 2 ? 0.3 : -0.3) }, { send: 0.85, from, silent: i > 0 }),
        );
    }
  };

  const w: WorldMusic = {
    id: "space",
    genre: "kosmische sequencer",
    ...W,
    bpm: 96,
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.5,
    humanize: 0,
    barScale: 1,
    level: 0.72,
    // Long rising lines over the pedal, leaning on the raised fourth (degree 3).
    idiom: ["0:3:4 3:3:7 6:3:9 10:4:11 14:2:9", "0:2:7 4:2:9 8:4:11 12:4:14", "0:6:9 6:2:7 8:8:4", "0:4:2 4:4:4 8:4:3 12:4:4"],
    // Dmaj7#11 and E/D, nothing else: the pedal never moves.
    chordGraph: { 0: [0, 1], 1: [0] },
    fx: { room: 0.05, hall: 0.95, delayTime: 0.47, feedback: 0.42, delayLp: 2600, delayWet: 0.35, masterLp: 16000, wobble: 7, wobbleHz: 0.23, duck: 0, duckRelease: 0.2 },
    reset() {
      orbits = {
        lead: { base: 7, r: 1, deg: 9, phase: 3 },
        perc: { base: 9, r: 1, deg: 4, phase: 5 },
        kick: { base: 16, r: 1, deg: 0, phase: 0 },
        hat: { base: 5, r: 1, deg: 0, phase: 2 },
      };
      chord = 0;
    },
    write(name, rng) {
      const s = baseSection(name, w);
      // A motif the comet can sing when Claude is not writing one.
      const notes = [0, 3, 6, 10, 14].filter(() => rng() < 0.7).map((step, i) => ({ step, len: 3, deg: [4, 7, 9, 11, 14][(i + Math.floor(rng() * 5)) % 5] }));
      s.motif = formatLine(notes);
      return s;
    },
    step(c) {
      const outs: Out[] = [];
      const L = c.section.layers;
      const e = c.section.energy;
      if (c.pos === 0 && c.bar % 8 === 0) chord = c.section.chords.length ? (c.section.chords[(c.bar / 8) % c.section.chords.length] === 0 ? 0 : 1) : (c.bar / 8) % 2;
      // The ostinato: one note per 16th, 7 long, so it slides against the bar.
      if (L.arp > 0.05 && (e > 0.3 || c.step % 2 === 0)) outs.push(...planet("arp", OSTINATO[c.step % 7] + (c.step % 14 >= 7 && e > 0.6 ? 7 : 0), c, "band", 0.6 + 0.4 * L.arp));
      // Pad and pedal on long cycles.
      if (L.pad > 0.05 && c.pos === 0 && c.bar % 2 === 0) outs.push(...planet("pad", 0, c, "band", L.pad));
      if (L.bass > 0.05 && c.pos === 0 && c.bar % 2 === 0) outs.push(...planet("bass", 0, c, "band", L.bass));
      // The planets: each sounds when its orbit wraps.
      const roleLayer: Record<string, number> = { lead: L.lead, perc: L.texture, kick: L.drums > 0 ? 1 : L.bass * 0.5, hat: L.drums };
      for (const [role, o] of Object.entries(orbits)) {
        if (roleLayer[role] < 0.05) continue;
        if ((c.step + o.phase) % period(o) !== 0) continue;
        if (c.rng() > 0.4 + 0.6 * roleLayer[role]) continue;
        const deg = role === "lead" && c.section.motif ? o.deg : o.deg + [0, 2, 4, -3][Math.floor(c.step / period(o)) % 4];
        outs.push(...planet(role as Role, deg, c));
      }
      // Solar wind: a slow band-passed sweep every four bars.
      if (L.texture > 0.2 && c.pos === 0 && c.bar % 4 === 0)
        outs.push(out("perc", { patch: "bp", freq: 400, f2: 2400 + 2000 * e, sweep: c.stepSec * 64, dur: c.stepSec * 60, vel: 0.06, attack: 1.5, release: 2, q: 6 }, { send: 0.7, silent: true }));
      return outs;
    },
    tap(role, c) {
      // A tap pushes the planet to the next orbit: it plays now and then keeps a new period.
      const o = orbits[role];
      if (o) {
        const i = RADII.indexOf(o.r);
        o.r = RADII[(i + 1) % RADII.length];
        o.phase = (period(o) - (c.step % period(o))) % period(o);
      }
      const deg = role === "arp" ? OSTINATO[c.step % 7] : (o?.deg ?? 0) + [0, 2, 4][c.step % 3];
      return planet(role, deg, c, "player", 1.3);
    },
    sky(deg, c) {
      return [
        out("lead", { patch: "pulse", freq: hz(W, deg, 0), vel: 0.22 + 0.12 * c.bright, dur: c.stepSec * (c.speed > 300 ? 1.5 : 4), duty: 0.25, cutoff: 1500 + 4000 * c.bright, bend: c.speed > 300 ? 0 : -1, sweep: 0.06, pan: c.pan, release: 0.5 }, { send: 0.55, delay: 0.4, from: "player" }),
      ];
    },
  };
  return w;
}
