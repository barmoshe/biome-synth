// Neon: rain-soaked UK 2-step with Blade Runner brass (Burial's Untrue; Vangelis). 132 bpm, 58%
// swing, a kick that skips beats, a gated clap on 2 and 4, metallic hats with ghost 16ths, a
// woodblock, and vinyl crackle in the bed. The sub and the brass pad pump under every kick. The
// mechanic: the drones are an arpeggiator on the chord, the kick pattern mutates every two bars,
// and the robot fires a vox chop when tapped.
import type { Role } from "../../shared/biomes";
import { SCALES } from "../theory";
import { baseSection, hz, out, vel, type Out, type StepCtx, type WorldMusic } from "../world";

const W = { root: 54, scale: SCALES.minor }; // F# minor
const PROG = [0, 5, 2, 6]; // i, VI, III, VII
const KICKS = ["x.........x.....", "x.......x..x....", "x....x....x.....", "x.........x..x..", "x.......x.....x."];
const CLAP = "....x.......x...";
const HATS = "..x...x...x...x.";
const WOOD = "...x..x....x..x.";

export function neon(): WorldMusic {
  let kick = KICKS[0];
  let arpI = 0;

  const chord = (c: StepCtx) => (c.section.chords.length ? c.section.chords[c.bar % c.section.chords.length] : PROG[c.bar % 4]);

  const drum = (role: Role, c: StepCtx, from: Out["from"], v = 1, kind = ""): Out[] => {
    switch (kind || role) {
      case "kick":
        return [out("kick", { patch: "kick", freq: 52, vel: 0.85 * v, dur: 0.01, decay: 0.12, release: 0.25, bright: 0.6 }, { send: 0.02, ducks: true, from })];
      case "perc": // the clap, into the gated room
        return [out("perc", { patch: "clap", freq: 1300, vel: 0.5 * v, dur: 0.01, release: 0.2 }, { send: 0.55, from })];
      case "hat":
        return [out("hat", { patch: "metal", freq: 7500, vel: 0.12 * v, dur: 0.01, release: 0.04 }, { send: 0.08, from })];
      case "wood":
        return [out("hat", { patch: "res", freq: 2100, ratios: [1], q: 16, vel: 0.22 * v, dur: 0.01, release: 0.05 }, { send: 0.2, delay: 0.2, from })];
    }
    return [];
  };

  const pitched = (role: Role, deg: number, c: StepCtx, from: Out["from"], v = 1): Out[] => {
    switch (role) {
      case "bass": // the sub, ducked by every kick
        return [out(role, { patch: "sub", freq: hz(W, deg, -2), vel: 0.48 * v, dur: c.stepSec * 6, attack: 0.01, release: 0.1, bright: 0.5, duck: true }, { send: 0.02, from })];
      case "pad": // CS-80 brass: slow attack, a bend into each chord, a long reverb, pumping
        return [0, 2, 4, 6, 8].map((d, i) =>
          out(role, { patch: "saw", freq: hz(W, deg + d, -1), vel: 0.07 * v, dur: c.stepSec * 30, attack: 0.25, release: 1.2, cutoff: 1600 + 1400 * c.section.energy, bend: -0.6, sweep: 0.25, duck: true, pan: (i - 2) * 0.2 }, { send: 0.45, from, silent: i > 0 }),
        );
      case "arp": // the drones: a bit-crushed pulse arpeggio
        return [out(role, { patch: "pulse", freq: hz(W, deg, 1), vel: 0.13 * v, dur: c.stepSec * 0.7, duty: 0.125, cutoff: 5000, release: 0.06, crush: 0.45, pan: (arpI % 2 ? 0.35 : -0.35) }, { send: 0.15, delay: 0.25, from })];
      case "lead": // the robot: a formant vox chop
        return [out(role, { patch: "vox", freq: hz(W, deg, 0), vowel: c.rng(), vel: 0.35 * v, dur: c.stepSec * 1.5, release: 0.08 }, { send: 0.3, delay: 0.35, from })];
    }
    return [];
  };

  const w: WorldMusic = {
    id: "neon",
    genre: "rainy 2-step garage",
    ...W,
    bpm: 132,
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.58,
    humanize: 0.003,
    barScale: 1,
    fx: { room: 0.5, hall: 0.25, delayTime: (60 / 132) * 0.75, feedback: 0.3, delayLp: 3500, delayWet: 0.22, masterLp: 18000, wobble: 0, wobbleHz: 0.3, duck: 0.72, duckRelease: 0.2 },
    reset() {
      kick = KICKS[0];
      arpI = 0;
    },
    write(name) {
      return baseSection(name, w);
    },
    step(c) {
      const outs: Out[] = [];
      const L = c.section.layers;
      const e = c.section.energy;
      const root = chord(c);
      // The skip: every two bars the kick moves within the 2-step library.
      if (c.pos === 0 && c.bar % 2 === 0) kick = KICKS[Math.floor(c.rng() * KICKS.length)];
      if (L.drums > 0.05) {
        if (vel(kick, c.pos)) outs.push(...drum("kick", c, "band"));
        if (L.drums > 0.3 && vel(CLAP, c.pos)) outs.push(...drum("perc", c, "band"));
        if (vel(HATS, c.pos) || (L.drums > 0.6 && c.pos % 2 === 1 && c.rng() < 0.3)) outs.push(...drum("hat", c, "band", vel(HATS, c.pos) ? 1 : 0.45));
        if (e > 0.6 && vel(WOOD, c.pos)) outs.push(...drum("hat", c, "band", 1, "wood"));
      }
      if (L.pad > 0.05 && c.pos === 0) outs.push(...pitched("pad", root, c, "band", L.pad));
      if (L.bass > 0.05 && (c.pos === 0 || (c.pos === 10 && e > 0.4))) outs.push(...pitched("bass", root, c, "band", L.bass));
      // The arpeggiator: chord tones up the m9, 16ths when hot, 8ths when not.
      if (L.arp > 0.05 && c.pos % (e > 0.6 ? 1 : 2) === 0) {
        const tones = [0, 2, 4, 6, 8];
        outs.push(...pitched("arp", root + tones[arpI++ % tones.length], c, "band", L.arp));
      }
      if (L.lead > 0.3 && c.pos === 14 && c.bar % 4 === 3) outs.push(...pitched("lead", root + 4, c, "band", L.lead * 0.8));
      return outs;
    },
    tap(role, c) {
      const root = chord(c);
      if (role === "kick" || role === "perc" || role === "hat") return drum(role, c, "player", 1.2);
      if (role === "lead") return pitched("lead", root + [0, 2, 4, 7][Math.floor(c.rng() * 4)], c, "player", 1.2);
      if (role === "arp") return pitched("arp", root + [0, 2, 4, 6, 8][arpI++ % 5], c, "player", 1.4);
      return pitched(role, root, c, "player", 1.3);
    },
    sky(deg, c) {
      // The sky is Vangelis brass: a bend up into every note.
      return [
        out("lead", { patch: "saw", freq: hz(W, deg, 0), vel: 0.18 + 0.1 * c.bright, dur: c.stepSec * (c.speed > 300 ? 1.5 : 5), attack: c.speed > 300 ? 0.01 : 0.08, release: 0.6, cutoff: 1400 + 3500 * c.bright, bend: -1, sweep: 0.12, pan: c.pan }, { send: 0.6, delay: 0.25, from: "player" }),
      ];
    },
  };
  return w;
}
