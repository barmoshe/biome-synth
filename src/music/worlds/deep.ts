// Deep: dub techno in a sunken cathedral (Basic Channel; Debussy's open fifths; Yoshimura's water).
// A muffled 4/4 at 118 with a light swing: offbeat chord stabs smeared by a tape delay whose
// echoes darken, hiss hats, water drops, a sonar ping every four bars. The mechanic is the mixing
// desk: tap a creature and its note is thrown into the delay, which swells and decays over two bars.
import type { Role } from "../../shared/biomes";
import { SCALES } from "../theory";
import { baseSection, hz, out, vel, type Out, type StepCtx, type WorldMusic } from "../world";

const W = { root: 52, scale: SCALES.dorian }; // E Dorian
const STAB = "..x...x...x...x.";
const KICK = "x...x...x...x...";
const HATS = "o.x.o.x.o.x.o.x.";

export function deep(): WorldMusic {
  let root = 0;

  const stab = (c: StepCtx, v: number, from: Out["from"] = "band", throwIt = 0): Out[] =>
    // Em11 (E G B D F# A) or A13, voiced as a muted chord stab.
    [0, 2, 4, 6, 8].map((d, i) =>
      out("pad", { patch: "saw", freq: hz(W, root + d, 0), vel: 0.07 * v, dur: c.stepSec * 0.8, attack: 0.004, release: 0.12, cutoff: 700 + 500 * c.section.energy, pan: (i - 2) * 0.15 }, { send: 0.35, delay: 0.75, from, silent: i > 0, throw: i === 0 ? throwIt : 0, offset: 0.015 }),
    );

  const voice = (role: Role, c: StepCtx, from: Out["from"], v = 1): Out[] => {
    const e = c.section.energy;
    switch (role) {
      case "kick": // the bubble kick: round, no click, low-passed
        return [out(role, { patch: "kick", freq: 52, vel: 0.75 * v, dur: 0.01, decay: 0.3, release: 0.35, bright: 0 }, { send: 0.05, from })];
      case "hat": // hiss
        return [out(role, { patch: "noise", freq: 14000, vel: 0.07 * v, dur: 0.012, release: 0.03, bright: 0.2 }, { send: 0.2, delay: 0.15, from })];
      case "perc": // a water drop chirping up
        return [out(role, { patch: "chirp", freq: 300 + c.rng() * 200, f2: 1400 + c.rng() * 600, sweep: 0.04, vel: 0.16 * v, dur: 0.05, release: 0.06 }, { send: 0.4, delay: 0.6, from, offset: c.rng() * 0.02 })];
      case "lead": // the sonar ping
        return [out(role, { patch: "sine", freq: 1200, vel: 0.18 * v, dur: 0.06, release: 0.5 }, { send: 0.5, delay: 0.9, from })];
      case "bass": // the whale: a deep sub on the root
        return [out(role, { patch: "sub", freq: hz(W, root, -1), vel: 0.5 * v, dur: c.stepSec * 6, attack: 0.02, release: 0.4, bright: 0.25 }, { send: 0.05, from })];
      case "arp": // jellyfish bells in parallel fifths, after Debussy
        {
          const d = root + [0, 1, 2, 4, 5][Math.floor(c.rng() * 5)];
          return [d, d + 4].map((x, i) => out(role, { patch: "bell", freq: hz(W, x, 1), vel: (i ? 0.08 : 0.12) * v, dur: 0.05, release: 2.2, bright: 0.2 }, { send: 0.7, delay: 0.5, from, silent: i > 0 }));
        }
      case "pad":
        return stab(c, v, from);
    }
  };

  const w: WorldMusic = {
    id: "sea",
    genre: "dub techno",
    ...W,
    bpm: 118,
    stepsPerBar: 16,
    stepsPerBeat: 4,
    swing: 0.54,
    humanize: 0.004,
    barScale: 1.25,
    level: 1.6,
    // Few notes, wide apart, fifths and fourths: the delay fills the rest.
    idiom: ["0:2:0 6:2:4 12:4:2", "2:2:4 6:2:4 10:4:3 16:6:0", "0:4:7 8:4:4 16:8:2", "0:2:4 3:2:3 6:6:0"],
    // Em11, A13 and Dmaj9, after Basic Channel's two-chord loops with a third for colour.
    chordGraph: { 0: [3, 6], 3: [0, 6], 6: [0, 3] },
    fx: { room: 0.15, hall: 0.55, delayTime: (60 / 118) * 0.75, feedback: 0.55, delayLp: 1800, delayWet: 0.55, masterLp: 6500, wobble: 4, wobbleHz: 0.4, duck: 0, duckRelease: 0.2 },
    reset() {
      root = 0;
    },
    write(name) {
      return baseSection(name, w);
    },
    step(c) {
      const outs: Out[] = [];
      const L = c.section.layers;
      // The root moves once every eight bars: Em11, then A13.
      if (c.pos === 0 && c.bar % 8 === 0) root = c.section.chords.length ? c.section.chords[(c.bar / 8) % c.section.chords.length] : (c.bar / 8) % 2 ? 3 : 0;
      if (L.pad > 0.05 && vel(STAB, c.pos) && (c.section.energy > 0.2 || c.pos === 6)) outs.push(...stab(c, L.pad));
      if (L.drums > 0.3 && vel(KICK, c.pos)) outs.push(...voice("kick", c, "band"));
      if (L.drums > 0.5 && vel(HATS, c.pos)) outs.push(...voice("hat", c, "band", vel(HATS, c.pos)));
      if (L.bass > 0.05 && (c.pos === 0 || (c.pos === 10 && c.section.energy > 0.5))) outs.push(...voice("bass", c, "band", L.bass));
      if (L.texture > 0.05 && c.rng() < 0.03 * L.texture) outs.push(...voice("perc", c, "band"));
      if (L.lead > 0.05 && c.pos === 0 && c.bar % 4 === 2) outs.push(...voice("lead", c, "band"));
      if (L.arp > 0.05 && c.pos % 4 === 2 && c.rng() < 0.18 * L.arp) outs.push(...voice("arp", c, "band"));
      return outs;
    },
    tap(role, c) {
      // The dub throw: this note goes fully into the delay, and the delay opens for two bars.
      const hold = c.stepSec * 32;
      const notes = role === "pad" ? stab(c, 1.6, "player", hold) : voice(role, c, "player", 1.3);
      return notes.map((n, i) => ({ ...n, delay: 1, throw: i === 0 ? hold : 0 }));
    },
    sky(deg, c) {
      return [
        out("lead", { patch: "saw", freq: hz(W, deg, 0), vel: 0.12 + 0.08 * c.bright, dur: c.stepSec * (c.speed > 300 ? 1 : 2), attack: 0.004, release: 0.2, cutoff: 600 + 2400 * c.bright, pan: c.pan }, { send: 0.4, delay: 0.85, from: "player" }),
      ];
    },
  };
  return w;
}
