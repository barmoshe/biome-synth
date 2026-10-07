// Aurora: a polar night. Ice pillars ring like bells, penguins click, a walrus hums the bass,
// a bear stomps the kick, an owl sings, a crystal holds the chord, the wind ticks the hats.
// The light is the aurora, high and to the left.
import { cyc, P, R } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec, type LiveCtx, type PaintCtx } from "../types";
import { loopX } from "../live";

const LX = -0.5;
const LY = -0.85;

const pillar = (x: number, h: number): CritterSpec => ({
  name: "ice pillar",
  role: "arp",
  x,
  y: GROUND - h,
  w: 10,
  h,
  glow: 4,
  draw(f, sx, sy, a) {
    for (let y = 0; y < h; y++) {
      const w = y < 5 ? 3 + y : 10 - (y > h - 3 ? 1 : 0);
      const x0 = sx + Math.floor((10 - w) / 2);
      for (let x = 0; x < w; x++) {
        const t = x / (w - 1);
        const c = t < 0.2 ? P.white : t < 0.45 ? P.skyLight : t > 0.85 ? P.blue : cyc(7, Math.floor(y * 0.4 + a.t * (a.act > 0.2 ? 7 : 0.6)));
        f.set(x0 + x, sy + y, c);
      }
    }
    for (let y = 6; y < h; y += 9) f.line(sx + 3, sy + y, sx + 6, sy + y + 2, P.skyLight);
    if (a.act > 0.4) for (const [dx, dy] of [[5, -3], [2, -1], [8, -1], [5, -5]]) f.set(sx + dx, sy + dy, P.white);
  },
});

const penguin = (x: number, flip: boolean): CritterSpec => ({
  name: "penguin",
  role: "perc",
  x,
  y: GROUND - 17,
  w: 12,
  h: 17,
  draw(f, sx, sy, a) {
    const hop = a.act > 0.6 ? -2 : 0;
    const lean = Math.round(Math.sin(a.t * 3 + x) * 0.8);
    const d = flip ? -1 : 1;
    const cx = sx + 6 + lean;
    f.blob(cx, sy + 11 + hop, 5, 6, R.ink, LX, LY);
    f.blob(cx + d, sy + 12 + hop, 3.5, 4.5, R.white, LX, LY);
    f.blob(cx, sy + 4 + hop, 3.5, 3.5, R.ink, LX, LY);
    f.set(cx + d, sy + 3 + hop, P.white);
    f.set(cx + 2 * d, sy + 3 + hop, P.ink);
    f.rect(cx + 3 * d - (d < 0 ? 1 : 0), sy + 4 + hop, 2, 1, P.amber);
    f.set(cx + 2 * d, sy + 6 + hop, P.gold);
    // Flippers flap on a click.
    const flap = a.act > 0.4 ? -3 : 0;
    f.line(cx - 5 * d, sy + 9 + hop, cx - 7 * d, sy + 13 + hop + flap, P.plum, 2);
    f.rect(cx - 3, sy + 16, 2, 1, P.amber);
    f.rect(cx + 1, sy + 16, 2, 1, P.amber);
  },
});

const walrus: CritterSpec = {
  name: "walrus",
  role: "bass",
  x: 470,
  y: GROUND - 20,
  w: 34,
  h: 20,
  draw(f, sx, sy, a) {
    const puff = a.act * 1.5;
    const body = [P.wine, P.rust, P.mauve, P.stone];
    f.blob(sx + 12, sy + 13, 11 + puff, 7, body, LX, LY);
    f.blob(sx + 24, sy + 9, 7, 6.5, body, LX, LY);
    f.blob(sx + 27, sy + 12, 4, 2.5, [P.stone, P.sand, P.blush], LX, LY);
    f.rect(sx + 24, sy + 6, 2, 2, P.ink);
    // Tusks.
    f.line(sx + 25, sy + 14, sx + 25, sy + 18 + Math.round(puff), P.white);
    f.line(sx + 29, sy + 14, sx + 29, sy + 18 + Math.round(puff), P.pale);
    f.line(sx + 2, sy + 18, sx + 6, sy + 14, P.rust, 2);
    for (const wx of [26, 28, 30]) f.set(sx + wx, sy + 12, P.wine);
  },
};

const bear: CritterSpec = {
  name: "polar bear",
  role: "kick",
  x: 810,
  y: GROUND - 24,
  w: 38,
  h: 24,
  draw(f, sx, sy, a) {
    const up = a.act > 0.6 ? -3 : 0;
    const fur = [P.lavGrey, P.mist, P.pale, P.white];
    f.blob(sx + 16, sy + 12, 14, 8, fur, LX, LY);
    f.blob(sx + 31, sy + 9 + up, 6, 5.5, fur, LX, LY);
    f.blob(sx + 35, sy + 11 + up, 3, 2.5, fur, LX, LY);
    f.blob(sx + 28, sy + 4 + up, 1.8, 1.8, fur, LX, LY);
    f.rect(sx + 31, sy + 8 + up, 2, 1, P.ink);
    f.rect(sx + 37, sy + 10 + up, 2, 2, P.ink);
    // Legs; the front paw lifts and stamps.
    for (const [lx, lift] of [[5, 0], [12, 0], [20, 0], [26, up]] as const) f.box(sx + lx, sy + 17 + lift, 5, 7, fur, LX);
    if (a.act > 0.6) for (let i = -4; i <= 4; i++) f.set(sx + 28 + i * 2, sy + 24, i % 2 ? P.white : P.pale);
  },
};

const crystal: CritterSpec = {
  name: "crystal",
  role: "pad",
  x: 240,
  y: GROUND - 34,
  w: 26,
  h: 34,
  glow: 8,
  draw(f, sx, sy, a) {
    const shards = [
      [13, 0, 7, 33],
      [6, 12, 5, 21],
      [20, 9, 5, 24],
      [2, 22, 4, 11],
    ];
    for (const [x, y, w, h] of shards)
      for (let j = 0; j < h; j++) {
        const ww = j < w ? j + 1 : w;
        for (let i = 0; i < ww; i++) {
          const t = i / Math.max(1, ww - 1);
          const c = a.act > 0.12 ? cyc(1, j + Math.floor(a.t * 8)) : t < 0.3 ? P.foam : t < 0.7 ? P.mint : P.aqua;
          f.set(sx + x + i - Math.floor(ww / 2), sy + y + j, c);
        }
      }
  },
};

const owl: CritterSpec = {
  name: "snowy owl",
  role: "lead",
  x: 1030,
  y: GROUND - 64,
  w: 16,
  h: 20,
  draw(f, sx, sy, a) {
    // Perched on a crag of ice.
    f.box(sx - 3, sy + 19, 22, 45, R.ice, LX);
    f.rect(sx - 3, sy + 19, 22, 2, P.white);
    f.blob(sx + 8, sy + 11, 7, 8, R.snow, LX, LY);
    f.blob(sx + 8, sy + 5, 6, 5, R.snow, LX, LY);
    f.set(sx + 3, sy, P.white);
    f.set(sx + 13, sy, P.white);
    const open = a.act > 0.2;
    f.rect(sx + 4, sy + 4, 3, open ? 3 : 2, P.gold);
    f.rect(sx + 10, sy + 4, 3, open ? 3 : 2, P.gold);
    f.set(sx + 5, sy + 5, P.ink);
    f.set(sx + 11, sy + 5, P.ink);
    f.set(sx + 8, sy + 7, P.charcoal);
    for (const [dx, dy] of [[4, 11], [9, 13], [12, 10], [6, 15], [11, 16]]) f.set(sx + dx, sy + dy, P.dusk);
  },
};

const wisp: CritterSpec = {
  name: "wind wisp",
  role: "hat",
  x: 640,
  y: 110,
  w: 28,
  h: 12,
  noOutline: true,
  draw(f, sx, sy, a) {
    const n = 16 + Math.round(a.act * 12);
    for (let k = 0; k < 2; k++)
      for (let i = 0; i < n; i++) {
        const x = sx + i;
        const y = sy + 4 + k * 4 + Math.round(Math.sin(i * 0.5 + a.t * 3 + k) * 2);
        if (bayer(x, y) < 0.55 + a.act * 0.45) f.set(x, y, a.act > 0.3 ? P.white : k ? P.mist : P.pale);
      }
  },
};

function igloo(s: Strip, x: number) {
  // The landmark: an igloo with a warm doorway.
  for (let y = 0; y < 26; y++) {
    const w = Math.sqrt(Math.max(0, 1 - (y / 26) ** 2)) * 30;
    for (let i = -w; i <= w; i++) {
      const lit = -(i / 30) * LX;
      const row = Math.floor((26 - y) / 5);
      const brick = (y % 5 === 0 || Math.floor(i + row * 4) % 9 === 0) && y > 1;
      s.set(x + i, 226 - 26 + y + 0, brick ? P.mist : lit > 0.2 ? P.white : lit > -0.3 ? P.pale : P.mist);
    }
  }
  for (let y = 0; y < 12; y++) for (let i = -5; i <= 5; i++) if (i * i + (y - 12) ** 2 * 0.3 < 30) s.set(x + 14 + i, 214 + y, y < 3 ? P.amber : P.gold);
}

export const tundra: BiomeArt = {
  air: P.indigo,
  toLight: [LX, LY],
  sky(s, w, h) {
    s.bands(0, w, 0, h, [P.ink, P.navy, P.navy, P.indigo, P.indigo, P.blue], 8);
    // Aurora curtains, colour-cycled so they ripple, fading downward with dither.
    for (let x = 0; x < w; x++) {
      const top = Math.round(h * 0.1 + 16 * Math.sin(x * 0.022) + 9 * Math.sin(x * 0.009 + 2));
      const len = 40 + Math.round(28 * noise1(x * 0.04, 8));
      for (let j = 0; j < len; j++) {
        const fade = j / len;
        if (fade > bayer(x, top + j) * 0.9 + 0.1 && j > 4) continue;
        s.set(x, top + j, cyc(1, Math.floor(x * 0.1 + j * 0.18)));
      }
      // A second, fainter curtain.
      const top2 = Math.round(h * 0.28 + 10 * Math.sin(x * 0.03 + 1));
      for (let j = 0; j < 24; j++) if (bayer(x, top2 + j) < 0.35 - j / 70) s.set(x, top2 + j, cyc(1, Math.floor(x * 0.1 + j * 0.2) + 3));
    }
    for (let i = 0; i < w * h * 0.0015; i++) s.set(hash(i, 81) * w, hash(i, 82) * h * 0.7, cyc(3, i));
  },
  far({ s, x0, x1 }: PaintCtx) {
    const top = (x: number) => 104 + 58 * Math.abs(((x * 0.022 + noise1(x * 0.015, 3) * 2) % 2) - 1) + 12 * noise1(x * 0.08, 4);
    for (let x = Math.floor(x0) - 60; x < x1 + 60; x++) {
      const t = Math.round(top(x));
      const slope = top(x + 1) - top(x - 1);
      for (let y = t; y < 230; y++) {
        const snow = y < t + (150 - t) * 0.5 && t < 150;
        const lit = slope > 0 ? 1 : 0;
        s.set(x, y, snow ? (lit ? P.white : P.pale) : lit ? P.mist : P.lavGrey);
      }
    }
  },
  mid({ s, x0, x1 }: PaintCtx) {
    // Glacier shelves: flat tops, sheer blue faces.
    const top = (x: number) => 176 + Math.round(noise1(x * 0.02, 6) * 4) * 6;
    for (let x = Math.floor(x0) - 80; x < x1 + 80; x++) {
      const t = top(x);
      const step = top(x - 1) !== t;
      for (let y = t; y < 230; y++) {
        const d = y - t;
        // Snow cap, a bright lip, then ice that deepens downward, with crevasses.
        const deep = d / (230 - t);
        let c: number = d < 2 ? P.white : step ? P.skyLight : d < 5 ? P.skyLight : deep > bayer(x, y) * 0.8 + 0.35 ? P.blue : P.sky;
        if (noise1(y * 0.25 + x * 0.02, 8) > 0.72 && d > 4) c = P.skyLight;
        if (hash(x, 66) < 0.012 && d > 3 && d < 14) c = P.indigo;
        s.set(x, y, c);
      }
      if (hash(x, 61) < 0.05) s.set(x, t + 6 + hash(x, 62) * 20, cyc(7, x));
    }
  },
  near({ s, x0, x1 }: PaintCtx) {
    const top = (x: number) => 225 + 3 * noise1(x * 0.05, 14);
    const a = Math.floor(x0) - 200;
    const b = x1 + 200;
    s.ridge(a, b, top, P.pale, P.white, 6);
    for (let x = a; x < b; x++) {
      const t = Math.round(top(x));
      for (let y = t + 14; y < 270; y++) if (bayer(x, y) < (y - t - 14) / 26) s.set(x, y, P.mist);
      // Wind-carved drift lines and ice glints.
      if (noise1(x * 0.05, 15) > 0.62) s.set(x, t + 6 + Math.round(noise1(x * 0.2, 16) * 3), P.mist);
      if (hash(x, 65) < 0.02) s.set(x, t + 2, cyc(7, x));
    }
    igloo(s, Math.round(x0 + (x1 - x0) * 0.62));
  },
  live(f: Strip, c: LiveCtx) {
    // A caribou herd crossing the far snowfield.
    const hx = loopX(-c.t * 5 - c.camX * 0.7, c.W, 80);
    for (let i = 0; i < 5; i++) {
      const x = Math.round(hx + i * 13 + Math.sin(i * 2.1) * 3);
      const y = c.oy + 172 + (i % 2);
      const step = Math.floor(c.t * 4 + i) % 2;
      f.rect(x, y, 7, 3, P.dusk);
      f.rect(x - 2, y - 2, 3, 2, P.dusk);
      f.set(x - 2, y - 4, P.lavGrey), f.set(x - 1, y - 3, P.lavGrey);
      f.set(x + step, y + 3, P.dusk), f.set(x + 5 - step, y + 3, P.dusk);
    }
    // Geese in a V, now and then.
    const period = 16;
    const p = (c.t % period) / period;
    if (p < 0.5) {
      const gx = c.W + 20 - p * 2 * (c.W + 80);
      const gy = c.oy + 60 + hash(Math.floor(c.t / period), 211) * 40;
      const flap = Math.floor(c.t * 6) % 2;
      for (let i = 0; i < 7; i++) {
        const side = i % 2 ? 1 : -1;
        const row = Math.ceil(i / 2);
        const x = Math.round(gx + row * 5);
        const y = Math.round(gy + side * row * 3);
        f.set(x, y, P.ink), f.set(x - 1, y - flap, P.ink), f.set(x + 1, y - flap, P.ink);
      }
    }
  },
  critters: [pillar(70, 40), pillar(88, 28), pillar(360, 46), pillar(730, 34), pillar(1150, 42), penguin(140, false), penguin(158, true), penguin(940, false), walrus, bear, crystal, owl, wisp],
  weather: { kind: "snow", rate: 3 },
};
