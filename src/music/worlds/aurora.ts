// Aurora: tintinnabuli under the polar night (Arvo Pärt; Biosphere's arctic ambient). No grid:
// events come on breaths of three to seven pulses, slightly off time. A melody voice (M) moves by
// step around B; every M note brings its T-voice, the nearest tone of the B-minor triad, above
// then below in turn. Every tap comes out sounding like Pärt.
import type { Role } from "../../shared/biomes";
import { SCALES } from "../theory";
import { baseSection, hz, out, type Out, type StepCtx, type WorldMusic } from "../world";

const W = { root: 59, scale: SCALES.minor }; // B Aeolian
const TRIAD = [0, 2, 4]; // B D F#

/** The T-voice: the nearest triad tone strictly above (or below) the M note. */
export function tVoice(m: number, above: boolean): number {
  const len = 7;
  for (let d = 1; d < 8; d++) {
    const c = above ? m + d : m - d;
    if (TRIAD.includes(((c % len) + len) % len)) return c;
  }
  return m;
}

export function aurora(): WorldMusic {
  let m = 4; // the M-voice, in degrees
  let nextBreath = 0;
  let breaths = 0;
  let above = true;

  const bell = (role: Role, deg: number, oct: number, v: number, c: StepCtx, from: Out["from"]): Out =>
    out(role, { patch: "bell", freq: hz(W, deg, oct), vel: v, dur: 0.05, release: 3.5 + c.rng() * 2, bright: 0.25 }, { send: 0.9, delay: 0.25, from, offset: (c.rng() - 0.5) * 0.08 });

  /** One M step plus its T-voice: the whole rule. */
  const pair = (mRole: Role, tRole: Role, c: StepCtx, from: Out["from"], v = 1): Out[] => {
    m = Math.max(-2, Math.min(9, m + (c.rng() < 0.5 ? 1 : -1)));
    const t = tVoice(m, above);
    above = !above;
    return [bell(mRole, m, 0, 0.3 * v, c, from), bell(tRole, t, 0, 0.2 * v, c, from)];
  };

  const w: WorldMusic = {
    id: "tundra",
    genre: "tintinnabuli",
    ...W,
    bpm: 60,
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.5,
    humanize: 0.04,
    barScale: 1.5,
    fx: { room: 0.05, hall: 1, delayTime: 1.5, feedback: 0.4, delayLp: 3200, delayWet: 0.28, masterLp: 14000, wobble: 0, wobbleHz: 0.1, duck: 0, duckRelease: 0.2 },
    reset() {
      m = 4;
      nextBreath = 0;
      breaths = 0;
      above = true;
    },
    write(name) {
      return baseSection(name, w);
    },
    step(c) {
      const outs: Out[] = [];
      const L = c.section.layers;
      const e = c.section.energy;
      // The drone: B and F#, renewed every four bars, breathing in slowly.
      if (L.pad > 0.05 && c.step % 64 === 0)
        for (const [d, o] of [[0, -2], [4, -2], [0, -1]] as const)
          outs.push(out(d === 0 && o === -1 ? "pad" : "bass", { patch: "pad", freq: hz(W, d, o), vel: 0.12 * L.pad, dur: c.stepSec * 60, attack: 3, release: 5, cutoff: 700 + 500 * e }, { send: 0.8, silent: o === -2 && d === 4 }));
      // Breaths: no grid, just a pulse that rests three to seven beats between events.
      if (c.step >= nextBreath) {
        breaths++;
        const pulses = 3 + Math.floor(c.rng() * 5 * (1.2 - e));
        nextBreath = c.step + pulses * 4;
        if (L.arp > 0.05) outs.push(...pair("arp", "pad", c, "band", 0.6 + 0.6 * L.arp));
        if (L.lead > 0.05 && c.rng() < L.lead) outs.push(out("lead", { patch: "tri", freq: hz(W, m, 1), vel: 0.12, dur: c.stepSec * 6, attack: 0.3, release: 2 }, { send: 0.85, offset: 0.2 }));
        // A frame drum every fourth breath, a slow sine sweep.
        if (L.drums > 0.05 && breaths % 4 === 0) outs.push(out("kick", { patch: "tom", freq: 50, f2: 90, sweep: 0.6, vel: 0.5 * L.drums, dur: 0.01, release: 1.2, bright: 0.05 }, { send: 0.5 }));
      }
      // Ice cracks: rare, sharp, high resonators.
      if (L.drums > 0.05 && c.rng() < 0.012 * (0.5 + e)) {
        const base = 2800 + c.rng() * 900;
        outs.push(out(c.rng() < 0.5 ? "perc" : "hat", { patch: "res", freq: base, ratios: [1, 1.84, 2.87], q: 40, vel: 0.35 * L.drums, dur: 0.01, release: 0.09 }, { send: 0.7, offset: c.rng() * 0.1 }));
      }
      // Snow: grains whose density follows the energy.
      if (L.texture > 0.05 && c.rng() < 0.18 * L.texture)
        outs.push(out("hat", { patch: "noise", freq: 9000 + c.rng() * 5000, vel: 0.03, dur: 0.005, release: 0.02, bright: 0.3 }, { send: 0.6, silent: true, offset: c.rng() * c.stepSec }));
      return outs;
    },
    tap(role, c) {
      if (role === "kick") return [out("kick", { patch: "tom", freq: 50, f2: 90, sweep: 0.6, vel: 0.7, dur: 0.01, release: 1.2, bright: 0.05 }, { send: 0.5, from: "player" })];
      if (role === "hat" || role === "perc") return [out(role, { patch: "res", freq: 3000 + c.rng() * 800, ratios: [1, 1.84, 2.87], q: 40, vel: 0.5, dur: 0.01, release: 0.1 }, { send: 0.7, from: "player" })];
      // Any other creature: the M-voice steps and the T-voice answers on the next creature over.
      return pair(role, role === "arp" ? "pad" : "arp", c, "player", 1.4);
    },
    sky(deg, c) {
      // The sky is an M-voice too: the T-voice follows automatically.
      const t = tVoice(deg, above);
      above = !above;
      return [
        out("lead", { patch: "bell", freq: hz(W, deg, 0), vel: 0.3 + 0.15 * c.bright, dur: 0.05, release: c.speed > 300 ? 1.5 : 4, bright: 0.2 + 0.4 * c.bright, pan: c.pan }, { send: 0.9, delay: 0.3, from: "player" }),
        out("pad", { patch: "bell", freq: hz(W, t, 0), vel: 0.18, dur: 0.05, release: 3, bright: 0.2, pan: -c.pan }, { send: 0.9, from: "echo", offset: 0.03 }),
      ];
    },
  };
  return w;
}
