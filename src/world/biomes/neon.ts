// Neon: a rainy city at night. A robot busker plays the lead, drones arpeggiate, a subway vent
// rumbles the bass, a boombox kicks, a cat flicks the hats, a trash lid clangs, the sign glows the chord.
import { cyc, P } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec } from "../types";

const robot: CritterSpec = {
  name: "robot busker",
  role: "lead",
  x: 330,
  y: GROUND - 20,
  w: 16,
  h: 20,
  draw(f, sx, sy, a) {
    const bob = a.act > 0.3 ? -1 : 0;
    f.rect(sx + 4, sy + 2 + bob, 8, 6, P.mist);
    f.rect(sx + 5, sy + 4 + bob, 6, 2, P.ink);
    f.set(sx + 6, sy + 4 + bob, a.act > 0.2 ? P.goldGlow : P.aqua);
    f.set(sx + 9, sy + 4 + bob, a.act > 0.2 ? P.goldGlow : P.aqua);
    f.line(sx + 8, sy + 2 + bob, sx + 8, sy, P.lavGrey);
    f.set(sx + 8, sy - 1, P.hotPink);
    f.rect(sx + 5, sy + 9, 6, 7, P.lavGrey);
    f.rect(sx + 5, sy + 16, 2, 4, P.dusk);
    f.rect(sx + 9, sy + 16, 2, 4, P.dusk);
    // The keytar, slung across.
    f.line(sx + 1, sy + 14, sx + 15, sy + 10, P.hotPink, 2);
    for (let i = 0; i < 5; i++) f.set(sx + 5 + i * 2, sy + 12 - Math.round(i * 0.55), i % 2 ? P.ink : P.white);
  },
};

const drone = (x: number, y: number): CritterSpec => ({
  name: "drone",
  role: "arp",
  x,
  y,
  w: 12,
  h: 6,
  draw(f, sx, sy, a) {
    const yy = sy + Math.round(Math.sin(a.t * 1.6 + x) * 2);
    const spin = Math.floor(a.t * 20) % 2;
    f.rect(sx + 4, yy + 2, 4, 2, P.charcoal);
    f.line(sx + 1, yy + 1, sx + 4, yy + 2, P.dusk);
    f.line(sx + 11, yy + 1, sx + 8, yy + 2, P.dusk);
    f.line(sx + spin, yy, sx + 3 - spin, yy, P.mist);
    f.line(sx + 9 + spin, yy, sx + 12 - spin, yy, P.mist);
    f.set(sx + 6, yy + 4, a.act > 0.2 ? P.white : cyc(4, Math.floor(a.t * 4)));
    if (a.act > 0.3) for (let i = 1; i < 8; i++) if (bayer(sx + 6, yy + 4 + i) < 1 - i / 8) f.set(sx + 6, yy + 4 + i, P.aqua);
  },
});

const vent: CritterSpec = {
  name: "subway vent",
  role: "bass",
  x: 150,
  y: GROUND - 6,
  w: 18,
  h: 8,
  draw(f, sx, sy, a) {
    f.rect(sx, sy + 5, 18, 3, P.ink);
    for (let i = 0; i < 18; i += 2) f.set(sx + i, sy + 6, P.dusk);
    const n = 3 + Math.round(a.act * 10);
    for (let i = 0; i < n; i++) {
      const x = sx + 2 + hash(i, Math.floor(a.t * 6)) * 14;
      const y = sy + 4 - hash(i + 9, Math.floor(a.t * 6)) * (4 + a.act * 16);
      f.set(x, y, a.act > 0.3 ? P.white : P.lavGrey);
    }
  },
};

const boombox: CritterSpec = {
  name: "boombox",
  role: "kick",
  x: 470,
  y: GROUND - 11,
  w: 18,
  h: 11,
  draw(f, sx, sy, a) {
    f.line(sx + 4, sy + 1, sx + 13, sy + 1, P.lavGrey);
    f.rect(sx, sy + 2, 18, 9, P.charcoal);
    f.rect(sx + 7, sy + 3, 4, 2, cyc(4, Math.floor(a.t * 3)));
    const r = 2.5 + a.act * 1.5;
    f.disc(sx + 4, sy + 7, r, P.dusk, P.ink);
    f.disc(sx + 14, sy + 7, r, P.dusk, P.ink);
    f.set(sx + 4, sy + 7, P.hotPink);
    f.set(sx + 14, sy + 7, P.hotPink);
  },
};

const cat: CritterSpec = {
  name: "cat",
  role: "hat",
  x: 570,
  y: GROUND - 17,
  w: 14,
  h: 17,
  draw(f, sx, sy, a) {
    // A dumpster, and the cat on it.
    f.rect(sx, sy + 7, 14, 10, P.sageDeep);
    f.rect(sx - 1, sy + 7, 16, 2, P.sage);
    const key = { k: P.ink, g: P.goldGlow };
    f.sprite(sx + 3, sy, ["k...k..", "kkkkk..", "kgkgk..", "kkkkk..", ".kkkkk.", ".kkkkkk"], key);
    const flick = a.act > 0.3;
    f.line(sx + 10, sy + 6, sx + 12, flick ? sy + 1 : sy + 4, P.ink);
  },
};

const trash: CritterSpec = {
  name: "trash can",
  role: "perc",
  x: 640,
  y: GROUND - 12,
  w: 10,
  h: 12,
  draw(f, sx, sy, a) {
    f.rect(sx + 1, sy + 3, 8, 9, P.lavGrey);
    for (let i = 2; i < 9; i += 2) f.line(sx + i, sy + 4, sx + i, sy + 11, P.dusk);
    const lift = a.act > 0.4 ? -3 : 0;
    f.rect(sx, sy + 1 + lift, 10, 2, P.mist);
    f.set(sx + 5, sy + lift, P.mist);
  },
};

const sign: CritterSpec = {
  name: "neon heart",
  role: "pad",
  x: 230,
  y: GROUND - 40,
  w: 15,
  h: 40,
  draw(f, sx, sy, a) {
    f.line(sx + 7, sy + 14, sx + 7, sy + 40, P.charcoal, 2);
    const on = a.act > 0.1 || Math.sin(a.t * 0.9) > -0.8;
    const key = { h: on ? (a.act > 0.3 ? P.white : cyc(2, Math.floor(a.t * 2))) : P.magentaDeep };
    f.sprite(sx, sy, [
      "..hhh...hhh....",
      ".h...h.h...h...",
      "h.....h.....h..",
      "h...........h..",
      ".h.........h...",
      "..h.......h....",
      "...h.....h.....",
      "....h...h......",
      ".....h.h.......",
      "......h........",
    ], key);
  },
};

export const neon: BiomeArt = {
  sky(s: Strip, w: number, h: number) {
    s.bands(0, w, 0, h, [P.ink, P.plum, P.barkDeep, P.violet, P.magentaDeep], 6);
    s.disc(Math.round(w * 0.24), h - 140, 13, P.pink, P.pinkDeep, -0.6, -0.6);
    for (let i = 0; i < w * h * 0.0008; i++) s.set(hash(i, 91) * w, hash(i, 92) * h * 0.5, cyc(3, i));
  },
  far({ s, x0, x1 }) {
    for (let x = Math.floor(x0) - 40; x < x1 + 40; ) {
      const bw = 6 + Math.floor(hash(x, 41) * 12);
      const top = 60 + Math.floor(hash(x, 42) * 60);
      s.rect(x, top, bw, 180 - top, P.barkDeep);
      for (let y = top + 3; y < 150; y += 4) for (let i = 1; i < bw - 1; i += 3) if (hash(x * 13 + i * 7 + y, 43) < 0.3) s.set(x + i, y, cyc(5, Math.floor(hash(i + y, x) * 8)));
      x += bw + 1;
    }
  },
  mid({ s, x0, x1 }) {
    for (let x = Math.floor(x0) - 60; x < x1 + 60; ) {
      const bw = 18 + Math.floor(hash(x, 44) * 26);
      const top = 80 + Math.floor(hash(x, 45) * 40);
      s.rect(x, top, bw, 180 - top, P.ink);
      s.rect(x, top, bw, 1, P.plum);
      for (let y = top + 4; y < 146; y += 5) for (let i = 2; i < bw - 2; i += 4) if (hash(x * 7 + i + y * 3, 46) < 0.25) s.rect(x + i, y, 2, 2, cyc(5, Math.floor(hash(i, y) * 8)));
      // Neon trim on some roofs.
      if (hash(x, 47) < 0.5) {
        const c = hash(x, 48) < 0.5 ? 2 : 4;
        for (let i = 0; i < bw; i++) s.set(x + i, top + 2, cyc(c, i));
      }
      if (hash(x, 49) < 0.3) s.line(x + bw / 2, top, x + bw / 2, top - 10, P.dusk);
      x += bw + 2 + Math.floor(hash(x, 50) * 6);
    }
  },
  near({ s, x0, x1 }) {
    s.rect(x0 - 140, 148, x1 - x0 + 280, 4, P.dusk);
    s.rect(x0 - 140, 152, x1 - x0 + 280, 28, P.charcoal);
    for (let x = Math.floor(x0) - 140; x < x1 + 140; x++) {
      if (x % 24 < 12) s.set(x, 165, P.dusk);
      // Puddles reflect the neon.
      if (noise1(x * 0.04, 51) > 0.7) for (let y = 156; y < 162; y++) if (bayer(x, y) < 0.7) s.set(x, y, cyc(2, x + y));
      // Street lamps.
      if (x % 160 === 0) {
        s.line(x, 148, x, 108, P.dusk);
        s.line(x, 108, x + 6, 108, P.dusk);
        s.rect(x + 5, 109, 3, 1, P.goldGlow);
        for (let y = 110; y < 148; y++) for (let i = -((y - 110) / 5); i < (y - 110) / 5; i++) if (bayer(x + 6 + i, y) < 0.12) s.set(x + 6 + i, y, P.honey);
      }
    }
  },
  critters: [robot, drone(80, 50), drone(400, 34), drone(700, 60), vent, boombox, cat, trash, sign],
  weather: { kind: "rain", rate: 14 },
};
