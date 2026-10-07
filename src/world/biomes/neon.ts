// Neon: a rainy city at night. A robot busker plays the lead, drones arpeggiate, a subway vent
// rumbles the bass, a boombox kicks, a cat flicks the hats, a trash lid clangs, the sign glows the chord.
// The light is the pink moon and the signs, upper left.
import { cyc, P, R } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec, type PaintCtx } from "../types";

const LX = -0.6;
const LY = -0.8;

const robot: CritterSpec = {
  name: "robot busker",
  role: "lead",
  x: 520,
  y: GROUND - 32,
  w: 24,
  h: 32,
  draw(f, sx, sy, a) {
    const bob = a.act > 0.3 ? -1 : 0;
    // Head with a visor, an antenna that lights up.
    f.box(sx + 6, sy + 4 + bob, 12, 9, R.metal, LX);
    f.rect(sx + 8, sy + 7 + bob, 8, 3, P.ink);
    const eye = a.act > 0.2 ? P.goldGlow : cyc(4, Math.floor(a.t * 3));
    f.rect(sx + 9, sy + 8 + bob, 2, 1, eye);
    f.rect(sx + 13, sy + 8 + bob, 2, 1, eye);
    f.line(sx + 12, sy + 4 + bob, sx + 12, sy, P.lavGrey);
    f.set(sx + 12, sy - 1, a.act > 0.2 ? P.white : P.hotPink);
    // Body, legs.
    f.box(sx + 7, sy + 14, 10, 10, R.metal, LX);
    f.rect(sx + 9, sy + 16, 6, 3, P.charcoal);
    f.set(sx + 10, sy + 17, P.green);
    f.set(sx + 12, sy + 17, P.scarlet);
    f.box(sx + 8, sy + 24, 3, 8, R.ink, LX);
    f.box(sx + 13, sy + 24, 3, 8, R.ink, LX);
    // The keytar, slung across.
    f.line(sx + 1, sy + 22, sx + 23, sy + 15, P.hotPink, 3);
    f.line(sx + 1, sy + 23, sx + 23, sy + 16, P.magenta);
    for (let i = 0; i < 7; i++) f.set(sx + 7 + i * 2, sy + 19 - Math.round(i * 0.65), i % 2 ? P.ink : P.white);
    f.line(sx + 5, sy + 16, sx + 9, sy + 20, P.lavGrey, 2);
  },
};

const drone = (x: number, y: number): CritterSpec => ({
  name: "drone",
  role: "arp",
  x,
  y,
  w: 18,
  h: 10,
  glow: 5,
  draw(f, sx, sy, a) {
    const yy = sy + Math.round(Math.sin(a.t * 1.6 + x) * 2);
    const spin = Math.floor(a.t * 20) % 2;
    f.box(sx + 6, yy + 3, 6, 3, R.metal, LX);
    f.line(sx + 2, yy + 2, sx + 6, yy + 3, P.dusk);
    f.line(sx + 15, yy + 2, sx + 11, yy + 3, P.dusk);
    f.line(sx + spin, yy + 1, sx + 4 - spin, yy + 1, P.mist);
    f.line(sx + 13 + spin, yy + 1, sx + 17 - spin, yy + 1, P.mist);
    f.set(sx + 9, yy + 6, a.act > 0.2 ? P.white : cyc(4, Math.floor(a.t * 4)));
    if (a.act > 0.3) for (let i = 1; i < 12; i++) for (let j = -Math.floor(i / 4); j <= Math.floor(i / 4); j++) if (bayer(sx + 9 + j, yy + 6 + i) < 0.8 - i / 14) f.set(sx + 9 + j, yy + 6 + i, P.aqua);
  },
});

const vent: CritterSpec = {
  name: "subway vent",
  role: "bass",
  x: 230,
  y: GROUND - 10,
  w: 28,
  h: 12,
  noOutline: true,
  draw(f, sx, sy, a) {
    f.rect(sx, sy + 8, 28, 4, P.ink);
    for (let i = 0; i < 28; i += 3) f.rect(sx + i, sy + 9, 1, 2, P.dusk);
    f.rect(sx, sy + 8, 28, 1, P.lavGrey);
    const n = 6 + Math.round(a.act * 16);
    for (let i = 0; i < n; i++) {
      const x = sx + 3 + hash(i, Math.floor(a.t * 6)) * 22;
      const y = sy + 7 - hash(i + 9, Math.floor(a.t * 6)) * (6 + a.act * 24);
      f.set(x, y, a.act > 0.3 ? P.white : P.lavGrey);
      if (a.act > 0.3) f.set(x + 1, y, P.mist);
    }
  },
};

const boombox: CritterSpec = {
  name: "boombox",
  role: "kick",
  x: 760,
  y: GROUND - 17,
  w: 28,
  h: 17,
  draw(f, sx, sy, a) {
    f.line(sx + 6, sy + 1, sx + 21, sy + 1, P.lavGrey, 2);
    f.box(sx, sy + 3, 28, 14, R.metal, LX);
    f.rect(sx + 10, sy + 5, 8, 3, cyc(4, Math.floor(a.t * 3)));
    const r = 4 + a.act * 2;
    for (const cx of [sx + 6, sx + 22]) {
      f.blob(cx, sy + 11, r, r, [P.ink, P.charcoal, P.dusk], LX, LY);
      f.rect(cx - 1, sy + 10, 2, 2, P.hotPink);
    }
  },
};

const cat: CritterSpec = {
  name: "cat",
  role: "hat",
  x: 900,
  y: GROUND - 26,
  w: 22,
  h: 26,
  draw(f, sx, sy, a) {
    // A dumpster, and the cat on it.
    f.box(sx, sy + 10, 22, 16, R.stone, LX);
    f.rect(sx - 1, sy + 10, 24, 2, P.sageLight);
    f.rect(sx + 3, sy + 14, 16, 1, P.sageDeep);
    const cx = sx + 9;
    f.blob(cx, sy + 7, 5, 3.5, R.ink, LX, LY);
    f.blob(cx - 3, sy + 3, 3, 3, R.ink, LX, LY);
    f.set(cx - 5, sy, P.ink);
    f.set(cx - 2, sy, P.ink);
    f.set(cx - 4, sy + 3, P.goldGlow);
    f.set(cx - 2, sy + 3, P.goldGlow);
    const flick = a.act > 0.3;
    f.line(cx + 4, sy + 8, cx + 8, flick ? sy : sy + 4, P.ink, 2);
  },
};

const trash: CritterSpec = {
  name: "trash can",
  role: "perc",
  x: 1030,
  y: GROUND - 18,
  w: 16,
  h: 18,
  draw(f, sx, sy, a) {
    f.box(sx + 2, sy + 5, 12, 13, R.metal, LX);
    for (let i = 4; i < 13; i += 3) f.line(sx + i, sy + 6, sx + i, sy + 16, P.dusk);
    const lift = a.act > 0.4 ? -4 : 0;
    f.rect(sx, sy + 3 + lift, 16, 2, P.mist);
    f.rect(sx + 6, sy + 1 + lift, 4, 2, P.lavGrey);
  },
};

const sign: CritterSpec = {
  name: "neon heart",
  role: "pad",
  x: 380,
  y: GROUND - 62,
  w: 22,
  h: 62,
  glow: 12,
  noOutline: true,
  draw(f, sx, sy, a) {
    f.line(sx + 10, sy + 18, sx + 10, sy + 62, P.charcoal, 2);
    f.rect(sx + 2, sy - 2, 18, 20, P.ink);
    const on = a.act > 0.1 || Math.sin(a.t * 0.9) > -0.85;
    const c = on ? (a.act > 0.3 ? P.white : cyc(2, Math.floor(a.t * 2))) : P.magentaDeep;
    f.sprite(sx + 3, sy, [
      "..hhh...hhh....",
      ".h...h.h...h...",
      "h.....h.....h..",
      "h...........h..",
      "h...........h..",
      ".h.........h...",
      "..h.......h....",
      "...h.....h.....",
      "....h...h......",
      ".....h.h.......",
      "......h........",
    ], { h: c });
    f.rect(sx + 4, sy + 14, 14, 2, on ? cyc(4, Math.floor(a.t * 2)) : P.tealDeep);
  },
};

function building(s: Strip, x: number, w: number, top: number, body: number, seed: number, trim: number | null) {
  s.rect(x, top, w, 270 - top, body);
  s.rect(x + w - 2, top, 2, 270 - top, P.ink);
  for (let y = top + 5; y < 222; y += 6)
    for (let i = 3; i < w - 4; i += 5) if (hash(x * 7 + i * 13 + y * 3, seed) < 0.32) s.rect(x + i, y, 3, 3, cyc(5, Math.floor(hash(i, y + seed) * 8)));
  if (trim !== null) for (let i = 0; i < w; i++) s.set(x + i, top + 2, cyc(trim, i));
}

export const neon: BiomeArt = {
  air: P.violet,
  toLight: [LX, LY],
  sky(s, w, h) {
    s.bands(0, w, 0, h, [P.ink, P.plum, P.barkDeep, P.grape, P.violet, P.magentaDeep], 8);
    const mx = Math.round(w * 0.24);
    const my = h - 196;
    for (let r = 30; r > 18; r--) for (let i = 0; i < 360; i += 2) {
      const x = mx + Math.cos((i * Math.PI) / 180) * r;
      const y = my + Math.sin((i * Math.PI) / 180) * r;
      if (bayer(Math.round(x), Math.round(y)) < (30 - r) / 24) s.set(x, y, P.berry);
    }
    s.blob(mx, my, 17, 17, [P.pinkDeep, P.pink, P.salmon, P.peach], LX, LY);
    for (let i = 0; i < w * h * 0.0006; i++) s.set(hash(i, 91) * w, hash(i, 92) * h * 0.45, cyc(3, i));
    // A blimp with an ad.
    const bx = Math.round(w * 0.66);
    const by = h - 220;
    s.blob(bx, by, 22, 7, R.metal, LX, LY);
    s.rect(bx - 10, by - 1, 20, 3, cyc(2, 0));
    for (let i = 0; i < 20; i++) s.set(bx - 10 + i, by, cyc(2, i));
  },
  far({ s, x0, x1 }: PaintCtx) {
    for (let x = Math.floor(x0) - 60; x < x1 + 60; ) {
      const bw = 10 + Math.floor(hash(x, 41) * 18);
      const top = 70 + Math.floor(hash(x, 42) * 90);
      building(s, x, bw, top, P.barkDeep, 43, null);
      if (hash(x, 44) < 0.2) s.line(x + bw / 2, top, x + bw / 2, top - 18, P.barkDeep);
      x += bw + 1;
    }
  },
  mid({ s, x0, x1 }: PaintCtx) {
    for (let x = Math.floor(x0) - 80; x < x1 + 80; ) {
      const bw = 26 + Math.floor(hash(x, 44) * 34);
      const top = 112 + Math.floor(hash(x, 45) * 60);
      building(s, x, bw, top, P.ink, 46, hash(x, 47) < 0.5 ? (hash(x, 48) < 0.5 ? 2 : 4) : null);
      // Vertical neon signs on some.
      if (hash(x, 49) < 0.35) {
        const c = hash(x, 50) < 0.5 ? 2 : 4;
        for (let y = top + 10; y < top + 50; y++) (s.set(x + 3, y, cyc(c, y)), s.set(x + 6, y, cyc(c, y + 2)));
        s.rect(x + 4, top + 10, 2, 40, P.ink);
      }
      x += bw + 3 + Math.floor(hash(x, 51) * 8);
    }
  },
  near({ s, x0, x1 }: PaintCtx) {
    const a = Math.floor(x0) - 200;
    const b = x1 + 200;
    s.rect(a, 222, b - a, 6, P.dusk);
    s.rect(a, 222, b - a, 1, P.lavGrey);
    s.rect(a, 228, b - a, 42, P.charcoal);
    for (let x = a; x < b; x++) {
      if (x % 32 < 16) s.set(x, 248, P.dusk), s.set(x, 249, P.dusk);
      // Puddles reflect the neon.
      if (noise1(x * 0.03, 51) > 0.68) for (let y = 234; y < 244; y++) if (bayer(x, y) < 0.75) s.set(x, y, cyc(hash(Math.floor(x / 40), 3) < 0.5 ? 2 : 4, x + y));
      for (let y = 252; y < 270; y++) if (bayer(x, y) < (y - 252) / 24) s.set(x, y, P.ink);
      // Street lamps.
      if (x % 240 === 0) {
        s.line(x, 222, x, 160, P.dusk, 2);
        s.line(x, 160, x + 9, 160, P.dusk, 2);
        s.rect(x + 7, 161, 5, 2, P.goldGlow);
        for (let y = 163; y < 222; y++) for (let i = -((y - 163) / 4); i < (y - 163) / 4; i++) if (bayer(x + 9 + i, y) < 0.14 - (y - 163) / 900) s.set(x + 9 + i, y, P.honey);
      }
    }
    // The landmark: a subway entrance with a lit sign.
    const ex = Math.round(x0 + (x1 - x0) * 0.62);
    s.box(ex, 192, 40, 30, R.stone, LX);
    s.rect(ex + 6, 200, 28, 22, P.ink);
    for (let i = 0; i < 28; i += 4) s.rect(ex + 6 + i, 214, 2, 8, P.charcoal);
    s.rect(ex + 4, 184, 32, 8, P.ink);
    for (let i = 0; i < 28; i++) s.set(ex + 6 + i, 187, cyc(4, i)), s.set(ex + 6 + i, 188, cyc(4, i + 1));
  },
  front({ s, x0, x1 }: PaintCtx) {
    for (let x = Math.floor(x0); x < x1; x += 420) {
      const cx = x + hash(x, 93) * 200;
      // A railing and a hydrant passing close by.
      s.rect(cx, 246, 90, 2, P.charcoal);
      for (let i = 0; i <= 90; i += 15) s.rect(cx + i, 246, 2, 24, P.charcoal);
      s.box(cx + 120, 248, 8, 22, R.red, LX);
    }
  },
  critters: [robot, drone(120, 90), drone(620, 60), drone(1100, 100), vent, boombox, cat, trash, sign],
  weather: { kind: "rain", rate: 14 },
};
