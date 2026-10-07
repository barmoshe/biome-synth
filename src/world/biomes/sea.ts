// Deep: under the sea. A whale hums the bass, jellyfish ring the arp, a clam breathes the chord,
// a pufferfish swells on the kick, a shrimp snaps the hats, coral plucks, an angelfish sings.
// The light comes down from the surface.
import { cyc, P, R } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec, type LiveCtx, type PaintCtx } from "../types";
import { loopX } from "../live";

const LX = 0.2;
const LY = -0.95;

const whale: CritterSpec = {
  name: "whale",
  role: "bass",
  x: 300,
  y: 64,
  w: 64,
  h: 26,
  draw(f, sx, sy, a) {
    const y = sy + Math.round(Math.sin(a.t * 0.4) * 3);
    const flick = a.act > 0.4 ? -3 : 0;
    // Body: a long shaded ellipse with a pale grooved belly.
    f.blob(sx + 36, y + 13, 25, 10, R.indigo, LX, LY);
    f.blob(sx + 15, y + 13, 8, 5, R.indigo, LX, LY);
    for (let i = 0; i < 34; i++) {
      const x = sx + 22 + i;
      const by = y + 17 + Math.round(Math.sin((i / 34) * Math.PI) * 4);
      f.set(x, by, P.mist);
      f.set(x, by + 1, i % 3 ? P.pale : P.lavGrey);
    }
    // Tail flukes and a fin.
    f.line(sx + 8, y + 13, sx + 1, y + 6 + flick, P.navy, 3);
    f.line(sx + 8, y + 13, sx + 1, y + 20 - flick, P.navy, 3);
    f.line(sx + 38, y + 20, sx + 32, y + 26, P.navy, 2);
    f.rect(sx + 53, y + 10, 2, 2, P.white);
    f.set(sx + 54, y + 11, P.ink);
    if (a.act > 0.35) for (let i = 0; i < 4; i++) f.blob(sx + 50 + i * 2, y - 2 - i * 4, 1.5, 1.5, [P.skyLight, P.foam], LX, LY);
  },
};

const jelly = (x: number, y: number, ramp: readonly number[]): CritterSpec => ({
  name: "jellyfish",
  role: "arp",
  x,
  y,
  w: 14,
  h: 22,
  glow: 8,
  draw(f, sx, sy, a) {
    const pulse = Math.sin(a.t * 2 + x) > 0 ? 1 : 0;
    const yy = sy + Math.round(Math.sin(a.t * 0.8 + x) * 3);
    const glow = a.act > 0.2;
    f.blob(sx + 7, yy + 4, 6 - pulse, 4, glow ? [P.pink, P.pinkPale, P.white] : ramp, LX, LY);
    f.rect(sx + 2 + pulse, yy + 7, 10 - pulse * 2, 1, ramp[1]);
    for (let t = 0; t < 4; t++)
      for (let j = 0; j < 12; j++) f.set(sx + 3 + t * 2.5 + Math.round(Math.sin(a.t * 3 + j * 0.7 + t) * 0.8), yy + 8 + j, glow ? P.pink : cyc(2, j + t));
  },
});

const clam: CritterSpec = {
  name: "giant clam",
  role: "pad",
  x: 520,
  y: GROUND - 18,
  w: 26,
  h: 18,
  draw(f, sx, sy, a) {
    const open = Math.round(1 + a.act * 5 + Math.sin(a.t * 0.6) * 0.8);
    const shell = (top: boolean) => {
      for (let i = 0; i < 26; i++) {
        const d = Math.round(Math.sin((i / 25) * Math.PI) * 6);
        for (let j = 0; j <= d; j++) {
          const ridge = i % 4 === 0;
          const c = j === d ? P.rust : ridge ? P.clay : j < 2 ? P.honey : P.sand;
          f.set(sx + i, top ? sy + 11 - open - j : sy + 11 + j, c);
        }
      }
    };
    shell(false);
    if (open > 1) {
      f.rect(sx + 3, sy + 11 - open + 1, 20, open - 1, P.pinkDeep);
      f.blob(sx + 13, sy + 10, 2.5, 2.5, a.act > 0.2 ? [P.pinkPale, P.white] : [P.blush, P.pinkPale], LX, LY);
    }
    shell(true);
  },
};

const puffer: CritterSpec = {
  name: "pufferfish",
  role: "kick",
  x: 760,
  y: GROUND - 44,
  w: 26,
  h: 26,
  draw(f, sx, sy, a) {
    const r = 5 + a.act * 5;
    const cx = sx + 13;
    const cy = sy + 13 + Math.round(Math.sin(a.t * 1.2) * 2);
    f.blob(cx, cy, r, r * 0.9, R.gold, LX, LY);
    f.blob(cx + 1, cy + r * 0.4, r * 0.6, r * 0.35, [P.goldGlow, P.blush], LX, LY);
    if (r > 7) for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      f.set(cx + Math.cos(ang) * (r + 1.5), cy + Math.sin(ang) * (r * 0.9 + 1.5), P.brownDeep);
    }
    f.rect(cx + Math.round(r * 0.45), cy - 2, 2, 2, P.ink);
    f.set(cx + Math.round(r * 0.45), cy - 2, P.white);
    f.line(cx - r, cy, cx - r - 4, cy - 3, P.amber, 2);
    f.line(cx - r, cy, cx - r - 4, cy + 3, P.amber, 2);
  },
};

const shrimp: CritterSpec = {
  name: "pistol shrimp",
  role: "hat",
  x: 880,
  y: GROUND - 10,
  w: 16,
  h: 10,
  draw(f, sx, sy, a) {
    const snap = a.act > 0.3;
    for (let i = 0; i < 10; i++) f.blob(sx + 2 + i, sy + 7 - Math.round(Math.sin(i * 0.3) * 1.5), 1.6, 1.6, R.orange, LX, LY);
    f.set(sx + 11, sy + 4, P.ink);
    f.blob(sx + 14, sy + (snap ? 2 : 4), 2, 1.5, [P.rust, P.flame, P.orange], LX, LY);
    f.line(sx + 11, sy + 3, sx + 15, sy - 2, P.peach);
    f.line(sx + 1, sy + 7, sx - 1, sy + 4, P.flame);
    if (snap) for (const [dx, dy] of [[16, 0], [17, 2], [16, 4]]) f.set(sx + dx, sy + dy, P.white);
  },
};

const coral = (x: number, ramp: readonly number[]): CritterSpec => ({
  name: "coral",
  role: "perc",
  x,
  y: GROUND - 28,
  w: 22,
  h: 28,
  draw(f, sx, sy, a) {
    const tip = a.act > 0.25 ? P.white : ramp[ramp.length - 1];
    const branch = (x0: number, y0: number, x1: number, y1: number, w = 3) => {
      f.line(sx + x0, sy + y0, sx + x1, sy + y1, ramp[1], w);
      f.line(sx + x0 + 1, sy + y0, sx + x1 + 1, sy + y1, ramp[2]);
      f.blob(sx + x1, sy + y1, 1.6, 1.6, [ramp[2], tip], LX, LY);
    };
    branch(11, 28, 11, 10, 4);
    branch(11, 20, 5, 7);
    branch(11, 16, 17, 4);
    branch(5, 12, 2, 4);
    branch(17, 10, 20, 6);
    branch(11, 12, 12, 2);
  },
});

const angel: CritterSpec = {
  name: "angelfish",
  role: "lead",
  x: 1020,
  y: 100,
  w: 18,
  h: 22,
  draw(f, sx, sy, a) {
    const x = sx + Math.round(Math.sin(a.t * 0.5) * 6);
    const y = sy + Math.round(Math.cos(a.t * 0.7) * 3);
    const c = a.act > 0.3 ? [P.amber, P.gold, P.goldGlow] : [P.rust, P.amber, P.gold];
    // A tall diamond body with dark stripes and long fins.
    for (let j = 0; j < 22; j++) {
      const w = Math.round(8 - Math.abs(j - 11) * 0.7);
      for (let i = -w; i <= w; i++) {
        const stripe = i === -3 || i === 2;
        f.set(x + 8 + i, y + j, stripe ? P.ink : c[Math.max(0, Math.min(2, Math.floor((-(i / 8) * LX - ((j - 11) / 11) * LY + 1) * 1.4)))]);
      }
    }
    f.rect(x + 13, y + 9, 2, 2, P.white);
    f.set(x + 14, y + 10, P.ink);
    f.line(x + 1, y + 11, x - 4, y + 7, P.amber, 2);
    f.line(x + 1, y + 11, x - 4, y + 15, P.amber, 2);
  },
};

function wreck(s: Strip, x: number) {
  // A sunken ship, the landmark: a broken hull, a mast, a porthole glinting.
  for (let i = 0; i < 90; i++) {
    const keel = 226 - Math.round(Math.sin((i / 90) * Math.PI) * 6);
    const deck = 186 + Math.round((i - 45) ** 2 / 300) + (i > 60 ? (i - 60) * 0.8 : 0);
    for (let y = Math.round(deck); y < keel; y++) {
      const plank = (y - Math.round(deck)) % 5 === 0;
      s.set(x + i, y, plank ? P.barkDeep : i < 30 ? P.rust : P.brownDeep);
    }
  }
  s.line(x + 40, 186, x + 34, 120, P.barkDeep, 3);
  s.line(x + 22, 140, x + 46, 146, P.brownDeep, 2);
  for (let k = 0; k < 3; k++) s.blob(x + 20 + k * 22, 202, 3, 3, [P.ink, P.tealDeep, P.teal], LX, LY);
  for (let k = 0; k < 40; k++) if (hash(k, x) < 0.5) s.set(x + 5 + k * 2, 186 + Math.round(((k * 2 - 40) ** 2) / 300) - 1, P.pine);
}

export const sea: BiomeArt = {
  air: P.tealDeep,
  toLight: [LX, LY],
  sky(s, w, h) {
    s.bands(0, w, 6, h, [P.teal, P.teal, P.tealDeep, P.tealDeep, P.navy, P.navy, P.ink], 8);
    for (let x = 0; x < w; x++) for (let y = 0; y < 6; y++) s.set(x, y, cyc(0, x * 0.25 + y));
    // Light shafts from the surface, fading with depth.
    const lighter: Record<number, number> = { [P.tealDeep]: P.teal, [P.navy]: P.tealDeep, [P.teal]: P.aqua, [P.ink]: P.navy };
    for (let y = 6; y < h * 0.85; y++)
      for (let x = 0; x < w; x++) {
        const k = (((x + y * 0.45 + 30 * Math.sin(x * 0.01)) % 80) + 80) % 80;
        if (k < 12 && 1 - y / (h * 0.85) > bayer(x, y) + 0.05) {
          const c = s.get(x, y);
          if (lighter[c] !== undefined) s.set(x, y, lighter[c]);
        }
      }
    // Caustic sparkle near the surface.
    for (let i = 0; i < w * 0.4; i++) s.set(hash(i, 51) * w, 8 + hash(i, 52) * 30, cyc(0, i));
  },
  far({ s, x0, x1 }: PaintCtx) {
    s.ridge(x0 - 60, x1 + 60, (x) => 150 + 46 * noise1(x * 0.025, 22) - 30 * Math.max(0, noise1(x * 0.08, 23) - 0.6), P.navy, P.tealDeep, 3);
    // Rock arches.
    const ax = (x0 + x1) / 2;
    for (let i = -40; i <= 40; i++) {
      const y = 130 + (i * i) / 50;
      for (let t = 0; t < 10; t++) s.set(ax + i, y + t, t < 2 ? P.tealDeep : P.navy);
    }
  },
  mid({ s, x0, x1 }: PaintCtx) {
    s.ridge(x0 - 80, x1 + 80, (x) => 212 + 8 * noise1(x * 0.04, 24), P.sageDeep, P.sage, 2);
    // Kelp, swaying in place.
    for (let x = Math.floor(x0) - 60; x < x1 + 60; x += 6) {
      if (hash(x, 25) > 0.3) continue;
      const top = 80 + hash(x, 26) * 80;
      for (let y = 218; y > top; y--) {
        const sw = Math.round(Math.sin(y * 0.12 + x) * 3);
        s.set(x + sw, y, P.pineDeep);
        s.set(x + sw + 1, y, (y + x) % 9 === 0 ? P.pine : P.pineDeep);
        if (y % 11 === 0) s.blob(x + sw + 3, y - 1, 2.5, 1.2, [P.pineDeep, P.pine, P.green], LX, LY);
      }
    }
  },
  near({ s, x0, x1 }: PaintCtx) {
    const top = (x: number) => 226 + 3 * noise1(x * 0.04, 27);
    const a = Math.floor(x0) - 200;
    const b = x1 + 200;
    s.ridge(a, b, top, P.clay, P.honey, 6);
    for (let x = a; x < b; x++) {
      const t = Math.round(top(x));
      // Sand ripples and deeper shade.
      if (Math.sin(x * 0.25 + noise1(x * 0.03, 30) * 6) > 0.85) s.set(x, t + 4, P.sand);
      for (let y = t + 10; y < 270; y++) if (bayer(x, y) < (y - t - 10) / 40) s.set(x, y, P.rust);
      if (hash(x, 31) < 0.014) (s.set(x, t, P.pinkPale), s.set(x + 1, t, P.salmon), s.set(x, t - 1, P.blush));
      if (hash(x, 32) < 0.01) s.blob(x, t + 2, 3 + hash(x, 33) * 4, 2 + hash(x, 34) * 2, R.stone, LX, LY);
      if (hash(x, 35) < 0.006) for (let k = 0; k < 6; k++) s.line(x + k * 2, t, x + k * 2 + Math.sin(k) * 2, t - 6 - (k % 3) * 3, k % 2 ? P.pine : P.green);
    }
    wreck(s, Math.round(x0 + (x1 - x0) * 0.28));
  },
  front({ s, x0, x1 }: PaintCtx) {
    for (let x = Math.floor(x0); x < x1; x += 320) {
      const cx = x + hash(x, 99) * 150;
      for (let k = 0; k < 5; k++) for (let y = 270; y > 200 + hash(k, x) * 30; y--) s.set(cx + k * 5 + Math.round(Math.sin(y * 0.1 + k) * 3), y, P.pineDeep), s.set(cx + k * 5 + 1 + Math.round(Math.sin(y * 0.1 + k) * 3), y, P.pine);
    }
  },
  live(f: Strip, c: LiveCtx) {
    // A school of fish wheeling together.
    const cx = loopX(c.t * 16 - c.camX * 0.8, c.W, 70);
    const cy = c.oy + 130 + Math.sin(c.t * 0.45) * 22;
    for (let i = 0; i < 18; i++) {
      const x = Math.round(cx + (hash(i, 221) - 0.5) * 50 + Math.sin(c.t * 1.3 + i) * 4);
      const y = Math.round(cy + (hash(i, 222) - 0.5) * 24 + Math.cos(c.t * 1.1 + i * 0.7) * 3);
      f.set(x, y, P.skyLight), f.set(x + 1, y, P.white), f.set(x - 1, y, P.sky), f.set(x - 2, y + (i % 2 ? -1 : 1), P.sky);
    }
    // A manta ray gliding through every so often.
    const period = 22;
    const p = (c.t % period) / period;
    if (p < 0.6) {
      const mx = -40 + (p / 0.6) * (c.W + 80);
      const my = c.oy + 70 + Math.sin(c.t * 0.6) * 8;
      const flap = Math.sin(c.t * 2.2) * 3;
      for (let i = -14; i <= 14; i++) {
        const w = Math.max(0, 5 - Math.abs(i) * 0.3);
        const lift = (Math.abs(i) / 14) * flap;
        for (let j = -w; j <= w * 0.4; j++) f.set(mx + i * 0.6, my + j - lift, j < -1 ? P.navy : P.indigo);
      }
      f.line(mx - 9, my + 1, mx - 20, my + 2, P.navy);
    }
  },
  critters: [whale, jelly(170, 90, R.pink), jelly(660, 64, R.violet), jelly(1120, 100, R.pink), clam, puffer, shrimp, coral(70, R.pink), coral(400, R.orange), angel],
  weather: { kind: "bubbles", rate: 1.2 },
};
