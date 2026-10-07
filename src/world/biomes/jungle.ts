// Canopy: a sunset jungle. Frogs hold the bass, a monkey drums, fireflies arpeggiate,
// a giant flower breathes the pad, a parrot sings the lead.
import { cyc, P } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec } from "../types";

const frog = (x: number, flip = false): CritterSpec => ({
  name: "frog",
  role: "bass",
  x,
  y: GROUND - 9,
  w: 12,
  h: 9,
  draw(f, sx, sy, a) {
    const hop = a.act > 0.6 ? -2 : 0;
    const y = sy + 2 + hop;
    const key = { g: P.green, G: P.leaf, d: P.pine, W: P.white, k: P.ink };
    f.sprite(sx, y, [
      "..dd...dd...",
      ".dWkd.dWkd..",
      ".ggggggggg..",
      "gggggggggGg.",
      "gGGGGGGGGgg.",
      ".dd.....dd..",
    ], key, flip);
    // The throat sac swells on every croak.
    if (a.act > 0.1) f.disc(sx + (flip ? 4 : 6), y + 5, 1 + a.act * 2.5, P.pink, P.pinkPale, 0.5, -0.7);
  },
});

const fireflies = (x: number, y: number): CritterSpec => ({
  name: "fireflies",
  role: "arp",
  x,
  y,
  w: 14,
  h: 12,
  draw(f, sx, sy, a) {
    for (let i = 0; i < 5; i++) {
      const fx = sx + 7 + Math.sin(a.t * (1.3 + i * 0.3) + i * 2) * 6;
      const fy = sy + 6 + Math.cos(a.t * (1.1 + i * 0.2) + i) * 5;
      const on = a.act > 0.2 || Math.sin(a.t * 3 + i * 1.7) > 0.2;
      if (!on) continue;
      f.set(fx, fy, a.act > 0.3 ? P.white : cyc(5, i));
      if (a.act > 0.3) {
        f.set(fx + 1, fy, P.goldGlow);
        f.set(fx - 1, fy, P.goldGlow);
        f.set(fx, fy + 1, P.goldGlow);
        f.set(fx, fy - 1, P.goldGlow);
      }
    }
  },
});

const monkey: CritterSpec = {
  name: "monkey",
  role: "kick",
  x: 420,
  y: GROUND - 18,
  w: 18,
  h: 18,
  draw(f, sx, sy, a) {
    const hit = a.act > 0.5;
    // Drum.
    f.rect(sx + 9, sy + 11, 8, 7, P.rust);
    f.rect(sx + 9, sy + 11, 8, 1, P.sand);
    f.rect(sx + 10, sy + 13, 6, 1, P.clay);
    f.rect(sx + 10, sy + 16, 6, 1, P.clay);
    // Body and head.
    f.disc(sx + 6, sy + 12, 4, P.rust, P.brownDeep);
    f.disc(sx + 6, sy + 5 + (hit ? 1 : 0), 4, P.rust, P.brownDeep);
    f.rect(sx + 4, sy + 5 + (hit ? 1 : 0), 5, 3, P.peach);
    f.set(sx + 5, sy + 5 + (hit ? 1 : 0), P.ink);
    f.set(sx + 7, sy + 5 + (hit ? 1 : 0), P.ink);
    f.set(sx + 1, sy + 4, P.peach);
    f.set(sx + 11, sy + 4, P.peach);
    // Arm: up, then down on the hit.
    if (hit) f.line(sx + 9, sy + 9, sx + 12, sy + 10, P.rust, 2);
    else f.line(sx + 9, sy + 9, sx + 12, sy + 5, P.rust, 2);
    // Tail.
    f.line(sx + 2, sy + 15, sx, sy + 10, P.brownDeep);
    f.set(sx + 1, sy + 9, P.brownDeep);
  },
};

const cricket: CritterSpec = {
  name: "cricket",
  role: "hat",
  x: 560,
  y: GROUND - 14,
  w: 10,
  h: 7,
  draw(f, sx, sy, a) {
    // A leaf, and the cricket on it.
    f.line(sx, sy + 6, sx + 9, sy + 4, P.pine, 2);
    const up = a.act > 0.3 ? -1 : 0;
    f.rect(sx + 3, sy + 2 + up, 4, 2, P.olive);
    f.set(sx + 7, sy + 2 + up, P.oliveLight);
    f.line(sx + 2, sy + 4 + up, sx + 1, sy + 5, P.olive);
    f.line(sx + 6, sy + 4 + up, sx + 8, sy + 5, P.olive);
    f.line(sx + 7, sy + 1 + up, sx + 9, sy - 1 + up, P.lime);
    if (a.act > 0.3) f.set(sx + 4, sy + up, P.goldGlow);
  },
};

const toucan: CritterSpec = {
  name: "toucan",
  role: "perc",
  x: 640,
  y: GROUND - 46,
  w: 14,
  h: 12,
  draw(f, sx, sy, a) {
    f.line(sx - 2, sy + 11, sx + 15, sy + 11, P.brownDeep, 2);
    f.disc(sx + 5, sy + 6, 4, P.ink, P.charcoal);
    f.rect(sx + 4, sy + 5, 3, 3, P.white);
    f.set(sx + 6, sy + 5, P.ink);
    const open = a.act > 0.4 ? 1 : 0;
    f.rect(sx + 8, sy + 4 - open, 5, 2, P.amber);
    f.rect(sx + 8, sy + 6 + open, 5, 1, P.flame);
    f.set(sx + 12, sy + 4 - open, P.scarlet);
    f.rect(sx + 3, sy + 10, 1, 2, P.sky);
  },
};

const flower: CritterSpec = {
  name: "flower",
  role: "pad",
  x: 250,
  y: GROUND - 15,
  w: 18,
  h: 15,
  draw(f, sx, sy, a) {
    const open = 2 + Math.round(a.act * 3 + Math.sin(a.t * 0.8) * 0.6);
    f.line(sx + 9, sy + 15, sx + 9, sy + 9, P.pine, 2);
    f.line(sx + 9, sy + 13, sx + 4, sy + 11, P.green, 2);
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      f.disc(sx + 9 + Math.cos(ang) * open, sy + 6 + Math.sin(ang) * open, 2, P.hotPink, P.magenta);
    }
    f.disc(sx + 9, sy + 6, 1.5, a.act > 0.3 ? P.goldGlow : P.gold);
  },
};

const parrot: CritterSpec = {
  name: "parrot",
  role: "lead",
  x: 120,
  y: GROUND - 52,
  w: 12,
  h: 14,
  draw(f, sx, sy, a) {
    f.line(sx - 3, sy + 13, sx + 14, sy + 12, P.brownDeep, 2);
    const sing = a.act > 0.3;
    f.disc(sx + 6, sy + 8, 3, P.scarlet, P.crimson);
    f.disc(sx + 6, sy + 3, 2.5, P.scarlet, P.crimson);
    f.set(sx + 7, sy + 2, P.white);
    f.set(sx + 7, sy + 2, P.ink);
    f.rect(sx + 8, sy + 3, 2, 1, P.gold);
    if (sing) f.set(sx + 9, sy + 5, P.gold);
    // Wing and tail in blue and gold.
    f.rect(sx + 3, sy + 7, 2, 4, sing ? P.sky : P.blue);
    f.rect(sx + 5, sy + 11, 2, 3, P.blue);
    f.set(sx + 4, sy + 6, P.gold);
  },
};

export const jungle: BiomeArt = {
  sky(s: Strip, w: number, h: number) {
    s.bands(0, w, 0, h, [P.grape, P.plumRose, P.rose, P.pinkDeep, P.salmon, P.peach, P.honey], 6);
    const cx = Math.round(w * 0.68);
    const cy = h - 118;
    s.disc(cx, cy, 18, P.honey);
    s.disc(cx, cy, 15, P.gold);
    s.disc(cx, cy, 11, P.goldGlow);
  },
  far({ s, x0, x1 }) {
    s.ridge(x0 - 40, x1 + 40, (x) => 104 + 18 * noise1(x * 0.05, 3) - 8 * noise1(x * 0.17, 9), P.berry, P.rose, 3);
  },
  mid({ s, x0, x1 }) {
    // Canopy: lumpy crowns over dark trunks.
    s.ridge(x0 - 60, x1 + 60, (x) => 112 + 12 * noise1(x * 0.06, 4), P.pineDeep, P.sageDeep, 3);
    for (let x = Math.floor(x0) - 40; x < x1 + 40; x += 9) {
      const r = 6 + 6 * hash(x, 21);
      const y = 106 + 14 * noise1(x * 0.06, 4);
      s.disc(x, y, r, P.pineDeep, P.pine, -0.4, -0.9);
    }
    // A mossy cliff with a waterfall, colour-cycled so it pours.
    const wx = Math.round(x0 + (x1 - x0) * 0.55);
    const cliff = (x: number) => 66 + Math.pow((x - wx - 1) / 20, 2) * 34 + 3 * noise1(x * 0.3, 15);
    s.ridge(wx - 24, wx + 26, cliff, P.sageDeep, P.green, 4, 150);
    for (let x = wx - 24; x < wx + 26; x++)
      for (let y = Math.round(cliff(x)) + 5; y < 150; y++) if (hash(x * 3 + y * 17, 16) < 0.12) s.set(x, y, P.charcoal);
    for (let y = 66; y < 148; y++)
      for (let x = wx - 2; x <= wx + 3; x++) s.set(x, y, cyc(0, Math.floor(y * 0.7) - (x - wx)));
    for (let x = wx - 10; x < wx + 12; x++)
      for (let y = 141; y < 150; y++) if (bayer(x, y) < 0.55 - Math.abs(x - wx) / 24) s.set(x, y, y > 146 ? cyc(0, x) : P.white);
  },
  near({ s, x0, x1 }) {
    const top = (x: number) => 150 + 3 * noise1(x * 0.07, 5);
    s.ridge(x0 - 140, x1 + 140, top, P.brownDeep, P.green, 5);
    for (let x = Math.floor(x0) - 140; x < x1 + 140; x++) {
      const t = Math.round(top(x));
      if (hash(x, 1) < 0.5) s.set(x, t - 1, P.leaf);
      if (hash(x, 2) < 0.18) s.set(x, t - 2, P.green);
      if (hash(x, 3) < 0.02) s.set(x, t - 2, P.hotPink);
      if (hash(x, 4) < 0.025) for (let k = 0; k < 4; k++) s.disc(x + k * 3, t - 4 - (k % 2), 3, P.pine, P.green, -0.4, -0.9);
    }
  },
  critters: [frog(60), frog(330, true), frog(700), fireflies(180, 70), fireflies(470, 58), fireflies(610, 88), monkey, cricket, toucan, flower, parrot],
  weather: { kind: "fireflies", rate: 0.6 },
};
