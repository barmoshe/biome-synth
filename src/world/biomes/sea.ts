// Deep: under the sea. A whale hums the bass, jellyfish ring the arp, a clam breathes the chord,
// a pufferfish swells on the kick, a shrimp snaps the hats, coral plucks, an angelfish sings.
import { cyc, P } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec } from "../types";

const whale: CritterSpec = {
  name: "whale",
  role: "bass",
  x: 200,
  y: 40,
  w: 40,
  h: 16,
  draw(f, sx, sy, a) {
    const y = sy + Math.round(Math.sin(a.t * 0.4) * 3);
    const flick = a.act > 0.3 ? -2 : 0;
    // Body: a long dark ellipse with a pale belly.
    for (let i = 0; i < 32; i++) {
      const hh = Math.round(Math.sin((i / 32) * Math.PI) * 6 + (i < 10 ? 1 : 0));
      for (let j = -hh; j <= hh; j++) f.set(sx + 6 + i, y + 8 + j, j > hh * 0.3 ? P.mist : j > -hh + 1 ? P.indigo : P.navy);
    }
    // Tail flukes.
    f.line(sx + 6, y + 8, sx, y + 4 + flick, P.navy, 2);
    f.line(sx + 6, y + 8, sx, y + 12 - flick, P.navy, 2);
    f.set(sx + 33, y + 6, P.white);
    f.set(sx + 34, y + 6, P.ink);
    for (let i = 0; i < 5; i++) f.set(sx + 22 + i * 2, y + 11, P.lavGrey);
    if (a.act > 0.4) for (let i = 0; i < 3; i++) f.disc(sx + 30 + i, y - 2 - i * 3, 1, P.foam);
  },
};

const jelly = (x: number, y: number, c: number): CritterSpec => ({
  name: "jellyfish",
  role: "arp",
  x,
  y,
  w: 9,
  h: 14,
  draw(f, sx, sy, a) {
    const pulse = Math.sin(a.t * 2 + x) > 0 ? 1 : 0;
    const yy = sy + Math.round(Math.sin(a.t * 0.8 + x) * 3);
    const glow = a.act > 0.2;
    for (let j = 0; j < 5; j++) {
      const w = j === 0 ? 3 : j < 3 ? 7 : 9 - pulse * 2;
      const x0 = sx + Math.floor((9 - w) / 2);
      for (let i = 0; i < w; i++) f.set(x0 + i, yy + j, glow ? (j < 2 ? P.white : P.pinkPale) : j === 0 ? P.pinkPale : c);
    }
    for (let t = 0; t < 4; t++)
      for (let j = 0; j < 7; j++) f.set(sx + 1 + t * 2 + Math.round(Math.sin(a.t * 3 + j * 0.8 + t) * 0.6), yy + 5 + j, glow ? P.pink : cyc(2, j + t));
  },
});

const clam: CritterSpec = {
  name: "clam",
  role: "pad",
  x: 330,
  y: GROUND - 12,
  w: 16,
  h: 12,
  draw(f, sx, sy, a) {
    const open = Math.round(1 + a.act * 4 + Math.sin(a.t * 0.6) * 0.8);
    // Lower shell.
    for (let i = 0; i < 16; i++) {
      const d = Math.round(Math.sin((i / 15) * Math.PI) * 4);
      for (let j = 0; j <= d; j++) f.set(sx + i, sy + 8 + j, j === d ? P.rust : i % 3 === 0 ? P.clay : P.sand);
    }
    if (open > 1) f.disc(sx + 8, sy + 7, 1.5, a.act > 0.2 ? P.white : P.pinkPale);
    // Upper shell lifts.
    for (let i = 0; i < 16; i++) {
      const d = Math.round(Math.sin((i / 15) * Math.PI) * 4);
      for (let j = 0; j <= d; j++) f.set(sx + i, sy + 8 - open - j, j === d ? P.rust : i % 3 === 0 ? P.clay : P.sand);
    }
  },
};

const puffer: CritterSpec = {
  name: "pufferfish",
  role: "kick",
  x: 470,
  y: GROUND - 30,
  w: 16,
  h: 16,
  draw(f, sx, sy, a) {
    const r = 3.5 + a.act * 3.5;
    const cx = sx + 8;
    const cy = sy + 8 + Math.round(Math.sin(a.t * 1.2) * 2);
    f.disc(cx, cy, r, P.gold, P.amber);
    if (r > 5) for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      f.set(cx + Math.cos(ang) * (r + 1), cy + Math.sin(ang) * (r + 1), P.brownDeep);
    }
    f.set(cx + Math.round(r * 0.5), cy - 1, P.ink);
    f.line(cx - r, cy, cx - r - 3, cy - 2, P.amber);
    f.line(cx - r, cy, cx - r - 3, cy + 2, P.amber);
  },
};

const shrimp: CritterSpec = {
  name: "shrimp",
  role: "hat",
  x: 560,
  y: GROUND - 7,
  w: 10,
  h: 7,
  draw(f, sx, sy, a) {
    const snap = a.act > 0.3;
    f.line(sx + 1, sy + 5, sx + 7, sy + 5, P.flame, 2);
    f.set(sx, sy + 4, P.orange);
    f.set(sx + 7, sy + 3, P.ink);
    f.line(sx + 8, sy + 4, sx + 9, sy + (snap ? 1 : 3), P.flame);
    f.line(sx + 6, sy + 2, sx + 9, sy - 1, P.orange);
    if (snap) f.set(sx + 9, sy, P.white);
  },
};

const coral = (x: number, c1: number, c2: number): CritterSpec => ({
  name: "coral",
  role: "perc",
  x,
  y: GROUND - 18,
  w: 14,
  h: 18,
  draw(f, sx, sy, a) {
    const tip = a.act > 0.25 ? P.white : c2;
    const branch = (x0: number, y0: number, x1: number, y1: number) => {
      f.line(sx + x0, sy + y0, sx + x1, sy + y1, c1, 2);
      f.set(sx + x1, sy + y1 - 1, tip);
    };
    branch(7, 18, 7, 6);
    branch(7, 12, 3, 4);
    branch(7, 10, 11, 2);
    branch(3, 8, 1, 3);
    branch(11, 7, 13, 5);
  },
});

const angel: CritterSpec = {
  name: "angelfish",
  role: "lead",
  x: 640,
  y: 60,
  w: 12,
  h: 14,
  draw(f, sx, sy, a) {
    const x = sx + Math.round(Math.sin(a.t * 0.5) * 6);
    const y = sy + Math.round(Math.cos(a.t * 0.7) * 3);
    const key = { y: P.gold, s: P.ink, w: P.white, t: P.amber, g: P.goldGlow };
    f.sprite(x, y, [
      "....y.......",
      "...yys......",
      "..yysyy.....",
      ".yysyyyy..t.",
      "yysyyywsy.tt",
      "yysyyyyyyttt",
      ".yysyyyy..tt",
      "..yysyy...t.",
      "...yys......",
      "....y.......",
    ].map((r) => (a.act > 0.3 ? r.replace(/y/g, "g") : r)), key, true);
  },
};

export const sea: BiomeArt = {
  sky(s: Strip, w: number, h: number) {
    s.bands(0, w, 4, h, [P.teal, P.tealDeep, P.tealDeep, P.navy, P.navy, P.ink], 6);
    for (let x = 0; x < w; x++) for (let y = 0; y < 4; y++) s.set(x, y, cyc(0, x * 0.3 + y));
    // Light shafts from the surface.
    const lighter: Record<number, number> = { [P.tealDeep]: P.teal, [P.navy]: P.tealDeep, [P.teal]: P.aqua, [P.ink]: P.navy };
    for (let y = 4; y < h * 0.85; y++)
      for (let x = 0; x < w; x++) {
        const k = (((x + y * 0.45) % 64) + 64) % 64;
        if (k < 9 && 1 - y / (h * 0.85) > bayer(x, y)) {
          const c = s.get(x, y);
          if (lighter[c] !== undefined) s.set(x, y, lighter[c]);
        }
      }
  },
  far({ s, x0, x1 }) {
    s.ridge(x0 - 40, x1 + 40, (x) => 112 + 30 * noise1(x * 0.04, 22) - 18 * Math.max(0, noise1(x * 0.11, 23) - 0.6), P.navy, P.tealDeep, 2);
  },
  mid({ s, x0, x1 }) {
    s.ridge(x0 - 60, x1 + 60, (x) => 142 + 6 * noise1(x * 0.05, 24), P.sageDeep, P.charcoal, 2);
    // Kelp.
    for (let x = Math.floor(x0) - 40; x < x1 + 40; x += 5) {
      if (hash(x, 25) > 0.35) continue;
      const top = 60 + hash(x, 26) * 50;
      for (let y = 146; y > top; y--) {
        const sw = Math.round(Math.sin(y * 0.15 + x) * 2);
        s.set(x + sw, y, (y + x) % 7 === 0 ? P.sage : P.pineDeep);
        s.set(x + sw + 1, y, P.pineDeep);
        if (y % 9 === 0) s.set(x + sw + 2, y - 1, P.pine);
      }
    }
  },
  near({ s, x0, x1 }) {
    const top = (x: number) => 151 + 2 * noise1(x * 0.05, 27);
    s.ridge(x0 - 140, x1 + 140, top, P.clay, P.honey, 5);
    for (let x = Math.floor(x0) - 140; x < x1 + 140; x++) {
      const t = Math.round(top(x));
      if (hash(x, 28) < 0.4) s.set(x, t + 3 + hash(x, 29) * 20, P.sand);
      if (hash(x, 30) < 0.012) (s.set(x, t, P.pinkPale), s.set(x + 1, t, P.salmon));
      if (hash(x, 31) < 0.02) s.disc(x, t + 1, 2 + hash(x, 32) * 3, P.sageDeep, P.sage);
    }
  },
  critters: [whale, jelly(110, 60, P.pink), jelly(420, 40, P.lilac), jelly(720, 70, P.pink), clam, puffer, shrimp, coral(40, P.hotPink, P.pink), coral(260, P.orange, P.peach), angel],
  weather: { kind: "bubbles", rate: 1.2 },
};
