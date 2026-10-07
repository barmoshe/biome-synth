// Canopy: 12/8 at sunset. The only ternary world: the bembe bell timeline (a rotation of
// E(7,12), Toussaint), a kick on the dotted quarters, a shaker on every eighth, a log drum, and
// highlife changes A, D, E every bar. The mechanic is kotekan: the fireflies and the parrot split
// one fast melody between them, on-beat and off-beat, so together they play a line neither plays
// alone. Play a phrase in the sky and the parrot answers it, horn-like, a bar later.
import type { Role } from "../../shared/biomes";
import { SCALES } from "../theory";
import { baseSection, euclid, hz, out, vel, type Out, type StepCtx, type WorldMusic } from "../world";

const W = { root: 57, scale: SCALES.major }; // A major; melodies stay on its pentatonic degrees
const PENT = [0, 1, 2, 4, 5];
const BELL = "x.x.xx.x.x.x";
const KICK = "x..x..x..x..";
const SHAKER = "XooXooXooXoo";
const LOG = "...x.....x.x";
const BASS = "x...x..x....";
const GUITAR = "..x..x..x..x";

const snapPent = (d: number) => {
  const o = Math.floor(d / 7);
  const r = ((d % 7) + 7) % 7;
  let best = PENT[0];
  for (const p of PENT) if (Math.abs(p - r) < Math.abs(best - r)) best = p;
  return o * 7 + best;
};

export function canopy(): WorldMusic {
  let line = 2;
  let phrase: { step: number; deg: number }[] = [];
  let lastPlayer = -1e9;
  const pending = new Map<number, Out[]>();

  const chordRoot = (c: StepCtx) => (c.section.chords.length ? c.section.chords[c.bar % c.section.chords.length] : [0, 3, 4, 3][c.bar % 4]);

  const drum = (role: Role, c: StepCtx, from: Out["from"], v = 1, kind = ""): Out[] => {
    switch (kind || role) {
      case "kick":
        return [out("kick", { patch: "tom", freq: 58, f2: 110, sweep: 0.08, vel: 0.7 * v, dur: 0.01, release: 0.45, bright: 0.25 }, { send: 0.1, from })];
      case "log":
        return [out("kick", { patch: "tom", freq: 150 + (c.pos % 2) * 30, f2: 185, sweep: 0.04, vel: 0.35 * v, dur: 0.01, release: 0.25, bright: 0.6 }, { send: 0.15, from })];
      case "hat":
        return [out("hat", { patch: "noise", freq: 12000, vel: 0.06 * v, dur: 0.02, release: 0.03, bright: 0.25 }, { send: 0.1, from })];
      case "perc":
        return [out("perc", { patch: "res", freq: 1650, ratios: [1, 2.42, 3.9], q: 28, vel: 0.35 * v, dur: 0.01, release: 0.18 }, { send: 0.15, from })];
      case "wood":
        return [out("perc", { patch: "res", freq: 2500, ratios: [1], q: 18, vel: 0.3 * v, dur: 0.01, release: 0.05 }, { send: 0.1, from })];
    }
    return [];
  };

  const pitched = (role: Role, deg: number, c: StepCtx, from: Out["from"], v = 1): Out[] => {
    switch (role) {
      case "arp": // polos: a bright kalimba-like pluck
        return [out(role, { patch: "pluck", freq: hz(W, deg, 1), vel: 0.32 * v, dur: c.stepSec, bright: 0.8, pan: -0.25 }, { send: 0.15, from })];
      case "lead": // sangsih: a short struck bar
        return [out(role, { patch: "bell", freq: hz(W, deg, 1), vel: 0.16 * v, dur: 0.02, release: 0.5, bright: 0.6, pan: 0.25 }, { send: 0.15, from })];
      case "bass":
        return [out(role, { patch: "pluck", freq: hz(W, deg, -2), vel: 0.6 * v, dur: c.stepSec * 2, bright: 0.25 }, { send: 0.05, from })];
      case "pad": // a highlife guitar chop on the chord
        return [0, 2, 4, 5].map((d, i) => out(role, { patch: "pluck", freq: hz(W, deg + d, 0), vel: 0.13 * v, dur: c.stepSec, bright: 0.55, pan: (i - 1.5) * 0.15 }, { send: 0.15, from, offset: i * 0.008, silent: i > 0 }));
    }
    return [];
  };

  const horn = (deg: number, c: StepCtx): Out =>
    out("lead", { patch: "saw", freq: hz(W, deg, 0), vel: 0.18, dur: c.stepSec * 2.5, attack: 0.03, release: 0.18, cutoff: 2200, bend: -1.5, sweep: 0.06 }, { send: 0.25, from: "echo" });

  const w: WorldMusic = {
    id: "jungle",
    genre: "12/8 highlife polyrhythm",
    ...W,
    skyDegrees: PENT,
    bpm: 108, // the beat is the dotted quarter
    stepsPerBar: 12,
    stepsPerBeat: 3,
    swing: 0.5,
    humanize: 0.01,
    barScale: 0.75,
    fx: { room: 0.45, hall: 0.06, delayTime: (60 / 108) / 3 * 2, feedback: 0.18, delayLp: 4000, delayWet: 0.12, masterLp: 17000, wobble: 0, wobbleHz: 0.3, duck: 0, duckRelease: 0.2 },
    reset() {
      line = 2;
      phrase = [];
      lastPlayer = -1e9;
      pending.clear();
    },
    write(name) {
      return baseSection(name, w);
    },
    step(c) {
      const outs: Out[] = [];
      const L = c.section.layers;
      const e = c.section.energy;
      const root = chordRoot(c);
      if (L.drums > 0.05) {
        if (vel(BELL, c.pos)) outs.push(...drum("perc", c, "band", 0.7 + 0.3 * L.drums));
        if (L.drums > 0.3 && vel(KICK, c.pos)) outs.push(...drum("kick", c, "band"));
        if (vel(SHAKER, c.pos)) outs.push(...drum("hat", c, "band", vel(SHAKER, c.pos) * L.drums));
        if (L.drums > 0.6 && vel(LOG, c.pos)) outs.push(...drum("kick", c, "band", 1, "log"));
        if (e > 0.8 && c.pos === 11 && c.bar % 2 === 1) outs.push(...drum("perc", c, "band", 1, "wood"));
      }
      if (L.bass > 0.05 && vel(BASS, c.pos)) outs.push(...pitched("bass", root + (c.pos === 4 ? 4 : 0), c, "band", L.bass));
      if (L.pad > 0.05 && e > 0.25 && vel(GUITAR, c.pos)) outs.push(...pitched("pad", root, c, "band", L.pad));
      // Kotekan: one line, Euclidean onsets that thicken with energy, split on-beat and off-beat.
      const onsets = euclid(Math.round(5 + 6 * e), 12, c.bar % 3);
      if (onsets[c.pos] && (L.arp > 0.05 || L.lead > 0.05)) {
        line = snapPent(Math.max(-1, Math.min(9, line + [-2, -1, 1, 2, 0][Math.floor(c.rng() * 5)])));
        const deg = root + line;
        if (c.pos % 2 === 0 && L.arp > 0.05) outs.push(...pitched("arp", deg, c, "band", L.arp));
        if (c.pos % 2 === 1 && L.lead > 0.05) outs.push(...pitched("lead", deg, c, "band", L.lead));
      }
      // Call and response: a bar after the player's phrase, the parrot answers.
      if (phrase.length >= 2 && c.pos === 0 && c.step - lastPlayer >= 12) {
        const t0 = phrase[0].step;
        for (const n of phrase.slice(0, 8)) {
          const at = c.step + Math.min(11, n.step - t0);
          const list = pending.get(at) ?? [];
          list.push(horn(snapPent(n.deg + 2), c));
          pending.set(at, list);
        }
        phrase = [];
      }
      const due = pending.get(c.step);
      if (due) {
        outs.push(...due);
        pending.delete(c.step);
      }
      return outs;
    },
    tap(role, c) {
      const root = chordRoot(c);
      if (role === "kick") return [...drum("kick", c, "player", 1.2), ...drum("kick", c, "player", 1, "log")];
      if (role === "hat") return drum("hat", c, "player", 2);
      if (role === "perc") return drum("perc", c, "player", 1.3);
      line = snapPent(line + (c.rng() < 0.5 ? 1 : 2));
      return pitched(role, role === "bass" || role === "pad" ? root : root + line, c, "player", 1.3);
    },
    sky(deg, c) {
      phrase.push({ step: c.step, deg });
      if (phrase.length > 12) phrase.shift();
      lastPlayer = c.step;
      return [out("lead", { patch: "pluck", freq: hz(W, deg, 1), vel: 0.38 + 0.2 * c.bright, dur: c.stepSec * 2, bright: 0.5 + 0.4 * c.bright, pan: c.pan }, { send: 0.2, from: "player" })];
    },
  };
  return w;
}
