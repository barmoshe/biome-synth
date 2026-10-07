// Orbit: a moon field under a ringed giant. Stars arpeggiate, a comet sings the lead,
// a pulsar holds the bass, a little moon is the kick, a satellite ticks the hats, a beacon pings.
// The light comes from a distant sun, upper left.
import { cyc, P, R } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec, type LiveCtx, type PaintCtx } from "../types";
import { loopX, streak } from "../live";

const LX = -0.75;
const LY = -0.65;

function starfield(s: Strip, w: number, h: number, density: number, seed: number) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = hash(x * 7919 + y * 104729, seed);
      if (r < density) s.set(x, y, cyc(3, Math.floor(hash(x + y * 31, seed + 1) * 8)));
      else if (r < density * 2) s.set(x, y, P.indigo);
    }
  // A few bright stars with a cross.
  for (let i = 0; i < (w * h) / 9000; i++) {
    const x = Math.floor(hash(i, seed + 7) * w);
    const y = Math.floor(hash(i, seed + 8) * h * 0.8);
    s.set(x, y, P.white);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) s.set(x + dx, y + dy, P.lavGrey);
  }
}

const star = (x: number, y: number): CritterSpec => ({
  name: "star",
  role: "arp",
  x,
  y,
  w: 13,
  h: 13,
  glow: 7,
  noOutline: true,
  draw(f, sx, sy, a) {
    const c = a.act > 0.3 ? P.white : cyc(3, 4 + Math.floor(a.t * 2 + x));
    const r = 3 + Math.round(a.act * 3);
    const cx = sx + 6;
    const cy = sy + 6;
    for (let i = -r; i <= r; i++) {
      const edge = Math.abs(i) > r - 2;
      f.set(cx + i, cy, edge ? P.skyLight : c);
      f.set(cx, cy + i, edge ? P.skyLight : c);
    }
    f.rect(cx - 1, cy - 1, 3, 3, c);
    if (a.act > 0.4) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.set(cx + dx * 2, cy + dy * 2, P.skyLight);
  },
});

const moon: CritterSpec = {
  name: "moon",
  role: "kick",
  x: 560,
  y: 70,
  w: 28,
  h: 28,
  draw(f, sx, sy, a) {
    const bob = Math.round(Math.sin(a.t * 0.9) * 2);
    const cx = sx + 14;
    const cy = sy + 14 + bob;
    f.blob(cx, cy, 11, 11, [P.charcoal, P.dusk, P.lavGrey, P.mist, P.pale], LX, LY);
    for (const [dx, dy, r] of [[-4, -3, 2.5], [4, 4, 2], [5, -5, 1.5], [-3, 6, 1.5]]) {
      f.blob(cx + dx, cy + dy, r, r, [P.dusk, P.lavGrey], -LX, -LY);
    }
    if (a.act > 0.4)
      for (let i = 0; i < 28; i++) {
        const ang = (i / 28) * Math.PI * 2;
        f.set(cx + Math.cos(ang) * (14 + a.act * 2), cy + Math.sin(ang) * (14 + a.act * 2), i % 2 ? P.white : P.skyLight);
      }
  },
};

const pulsar: CritterSpec = {
  name: "pulsar",
  role: "bass",
  x: 220,
  y: GROUND - 54,
  w: 32,
  h: 32,
  glow: 10,
  draw(f, sx, sy, a) {
    const cx = sx + 16;
    const cy = sy + 16;
    const ring = 10 + Math.round(a.act * 5);
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2 + a.t * 0.6;
      if (Math.sin(ang) < 0) f.set(cx + Math.cos(ang) * ring, cy + Math.sin(ang) * ring * 0.4, i % 2 ? P.violet : P.purple);
    }
    f.blob(cx, cy, 5, 5, R.violet, LX, LY);
    f.rect(cx - 1, cy - 1, 2, 2, a.act > 0.3 ? P.white : P.pinkPale);
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2 + a.t * 0.6;
      if (Math.sin(ang) >= 0) f.set(cx + Math.cos(ang) * ring, cy + Math.sin(ang) * ring * 0.4, i % 2 ? P.purple : P.lilac);
    }
    if (a.act > 0.25) {
      const len = 8 + a.act * 8;
      for (let i = 6; i < len; i++) (f.set(cx, cy - i, P.lilac), f.set(cx, cy + i, P.lilac));
    }
  },
};

const satellite: CritterSpec = {
  name: "satellite",
  role: "hat",
  x: 820,
  y: 50,
  w: 26,
  h: 14,
  draw(f, sx, sy, a) {
    const y = sy + Math.round(Math.sin(a.t * 0.7) * 2);
    for (const px of [sx, sx + 17]) {
      f.rect(px, y + 4, 9, 6, a.act > 0.3 ? P.skyLight : P.blue);
      for (let i = 1; i < 9; i += 3) f.line(px + i, y + 4, px + i, y + 9, P.navy);
      f.rect(px, y + 4, 9, 1, P.sky);
    }
    f.line(sx + 9, y + 7, sx + 17, y + 7, P.lavGrey);
    f.box(sx + 10, y + 2, 6, 9, R.metal, LX);
    f.rect(sx + 11, y + 4, 4, 2, P.gold);
    f.line(sx + 13, y + 2, sx + 13, y - 1, P.mist);
    f.set(sx + 13, y - 2, a.act > 0.2 || Math.sin(a.t * 4) > 0.6 ? P.scarlet : P.wine);
  },
};

const beacon: CritterSpec = {
  name: "beacon",
  role: "perc",
  x: 1010,
  y: GROUND - 34,
  w: 16,
  h: 34,
  draw(f, sx, sy, a) {
    f.line(sx + 8, sy + 9, sx + 8, sy + 33, P.lavGrey);
    f.line(sx + 2, sy + 33, sx + 8, sy + 22, P.dusk);
    f.line(sx + 14, sy + 33, sx + 8, sy + 22, P.dusk);
    f.line(sx + 4, sy + 27, sx + 12, sy + 27, P.dusk);
    f.blob(sx + 8, sy + 6, 3.5, 3.5, a.act > 0.3 ? [P.gold, P.goldGlow, P.white] : [P.rust, P.amber, P.gold], LX, LY);
    if (a.act > 0.3) for (const d of [-1, 1]) for (let i = 6; i < 6 + a.act * 8; i++) f.set(sx + 8 + d * i, sy + 6, P.goldGlow);
  },
};

const ringed: CritterSpec = {
  name: "ringed planet",
  role: "pad",
  x: 390,
  y: 96,
  w: 36,
  h: 22,
  draw(f, sx, sy, a) {
    const cx = sx + 18;
    const cy = sy + 11 + Math.round(Math.sin(a.t * 0.5 + 1) * 2);
    const glow = a.act > 0.2;
    const ringC = (i: number) => (glow ? (i % 3 ? P.goldGlow : P.white) : i % 3 ? P.honey : P.sand);
    for (let i = 0; i < 80; i++) {
      const ang = (i / 80) * Math.PI * 2;
      if (Math.sin(ang) < 0) (f.set(cx + Math.cos(ang) * 16, cy + Math.sin(ang) * 4, ringC(i)), f.set(cx + Math.cos(ang) * 14, cy + Math.sin(ang) * 3.5, P.amber));
    }
    f.blob(cx, cy, 8, 8, R.pink, LX, LY);
    f.line(cx - 7, cy + 2, cx + 7, cy + 2, P.pinkDeep);
    f.line(cx - 6, cy - 3, cx + 6, cy - 3, P.salmon);
    for (let i = 0; i < 80; i++) {
      const ang = (i / 80) * Math.PI * 2;
      if (Math.sin(ang) >= 0) (f.set(cx + Math.cos(ang) * 16, cy + Math.sin(ang) * 4, ringC(i)), f.set(cx + Math.cos(ang) * 14, cy + Math.sin(ang) * 3.5, P.amber));
    }
  },
};

const comet: CritterSpec = {
  name: "comet",
  role: "lead",
  x: 900,
  y: 116,
  w: 40,
  h: 14,
  glow: 6,
  noOutline: true,
  draw(f, sx, sy, a) {
    const y = sy + 6 + Math.round(Math.sin(a.t * 0.4) * 3);
    const len = 22 + Math.round(a.act * 14);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const spread = Math.round(t * 3);
      for (let j = -spread; j <= spread; j++) {
        if (t > bayer(i, y + j) + 0.15 && i > 6) continue;
        f.set(sx + 34 - i, y + j + Math.round(i * 0.12), t < 0.25 ? P.white : t < 0.55 ? P.skyLight : P.sky);
      }
    }
    f.blob(sx + 35, y, 3, 3, [P.skyLight, P.white], LX, LY);
  },
};

const astronaut: CritterSpec = {
  // A small astronaut planting a flag: decoration that also plays the perc when tapped.
  name: "astronaut",
  role: "perc",
  x: 700,
  y: GROUND - 22,
  w: 16,
  h: 22,
  draw(f, sx, sy, a) {
    const hop = a.act > 0.6 ? -2 : 0;
    f.line(sx + 14, sy + 2, sx + 14, sy + 21, P.mist);
    f.rect(sx + 15, sy + 2, 6, 4, P.scarlet);
    f.rect(sx + 15, sy + 4, 6, 1, P.white);
    f.blob(sx + 7, sy + 13 + hop, 5, 6, R.white, LX, LY);
    f.blob(sx + 7, sy + 6 + hop, 4.5, 4.5, R.white, LX, LY);
    f.rect(sx + 5, sy + 5 + hop, 5, 3, P.navy);
    f.rect(sx + 7, sy + 5 + hop, 2, 1, P.skyLight);
    f.rect(sx + 4, sy + 18 + hop, 3, 3, P.mist);
    f.rect(sx + 8, sy + 18 + hop, 3, 3, P.mist);
    f.rect(sx + 2, sy + 11 + hop, 2, 5, P.lavGrey);
  },
};

function dish(s: Strip, x: number, y: number) {
  // A radio dish: the moon field's landmark.
  s.line(x, y, x - 10, y + 30, P.dusk, 2);
  s.line(x, y, x + 10, y + 30, P.dusk, 2);
  s.line(x - 6, y + 18, x + 6, y + 18, P.dusk);
  for (let i = -18; i <= 18; i++) {
    const d = (i * i) / 30;
    for (let j = 0; j < 3; j++) s.set(x + i - 4 + j * 0.5, y - 14 + d + j, j === 0 ? P.pale : j === 1 ? P.mist : P.lavGrey);
  }
  s.line(x - 4, y - 10, x + 4, y - 22, P.lavGrey);
  s.set(x + 4, y - 23, P.scarlet);
}

export const space: BiomeArt = {
  air: P.plum,
  toLight: [LX, LY],
  sky(s, w, h) {
    s.bands(0, w, 0, h, [P.ink, P.ink, P.plum, P.navy, P.plum], 6);
    // A nebula smear, banded and dithered.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const fade = Math.max(0, 1 - y / (h * 0.55));
        const n = noise1(x * 0.015 + noise1(y * 0.03, 2) * 4, 7) * noise1(y * 0.02 + x * 0.004, 5) * (0.4 + 0.6 * fade);
        if (n > 0.32 && n - 0.32 > bayer(x, y) * 0.22) s.set(x, y, n > 0.52 ? P.purple : n > 0.42 ? P.violet : P.grape);
      }
    starfield(s, w, h, 0.005, 1);
  },
  far({ s, x0, x1 }: PaintCtx) {
    const cx = Math.round((x0 + x1) / 2);
    const cy = 150;
    // A giant ringed planet, half below the horizon, banded.
    for (let y = cy - 52; y <= cy + 52; y++)
      for (let x = cx - 52; x <= cx + 52; x++) {
        const dx = (x - cx) / 52;
        const dy = (y - cy) / 52;
        if (dx * dx + dy * dy > 1) continue;
        const band = noise1(y * 0.18 + noise1(x * 0.03, 3) * 1.5, 4);
        const lit = -(dx * LX + dy * LY) * 0.6 + Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy)) * 0.5;
        const ramp = band > 0.55 ? [P.wine, P.rust, P.clay, P.sand] : [P.barkDeep, P.wine, P.rust, P.clay];
        s.set(x, y, ramp[Math.max(0, Math.min(3, Math.floor((lit + 0.3) * 3.2 + (bayer(x, y) - 0.5) * 0.6)))]);
      }
    for (let i = 0; i < 520; i++) {
      const ang = (i / 520) * Math.PI * 2;
      for (const [rr, c] of [[86, P.honey], [80, P.sand], [74, P.clay]] as const) {
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr * 0.16;
        if (Math.sin(ang) > 0 || Math.hypot((x - cx) / 52, (y - cy) / 52) > 1) s.set(x, y, c);
      }
    }
    s.blob(cx - 120, 70, 9, 9, R.rock, LX, LY);
  },
  mid({ s, x0, x1 }: PaintCtx) {
    for (let x = Math.floor(x0) - 40; x < x1 + 40; x += 7) {
      if (hash(x, 31) > 0.16) continue;
      const r = 1.5 + hash(x, 32) * 6;
      s.blob(x, 90 + hash(x, 33) * 90, r, r * 0.8, R.rock, LX, LY);
    }
    s.ridge(x0 - 80, x1 + 80, (x) => 206 + 10 * noise1(x * 0.03, 12) - 14 * Math.max(0, noise1(x * 0.009, 13) - 0.5), P.plum, P.dusk, 3);
  },
  near({ s, x0, x1 }: PaintCtx) {
    const top = (x: number) => 226 + 3 * noise1(x * 0.04, 13);
    const a = Math.floor(x0) - 200;
    const b = x1 + 200;
    s.ridge(a, b, top, P.dusk, P.mist, 3);
    for (let x = a; x < b; x++) {
      const t = Math.round(top(x));
      for (let y = t + 3; y < 270; y++) if (bayer(x, y) < (y - t) / 50) s.set(x, y, P.grape);
      if (hash(x, 40) < 0.2) s.set(x, t + 1 + Math.floor(hash(x, 41) * 4), P.lavGrey);
    }
    // Craters: a shadowed bowl with a lit far rim.
    for (let x = a; x < b; x += 3) {
      if (hash(x, 34) > 0.035) continue;
      const r = 4 + hash(x, 35) * 9;
      const y = top(x) + 8 + hash(x, 36) * 26;
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(1 - (dx / r) ** 2) * r * 0.32;
        for (let dy = -d; dy <= d; dy++) s.set(x + dx, y + dy, dx < 0 ? P.plum : P.grape);
        s.set(x + dx, y + d + 1, P.mist);
        s.set(x + dx, y - d - 1, P.charcoal);
      }
    }
    const span = x1 - x0;
    dish(s, Math.round(x0 + span * 0.15), 192);
  },
  front({ s, x0, x1 }: PaintCtx) {
    // Jagged boulders passing close.
    for (let x = Math.floor(x0); x < x1; x += 380) {
      const cx = x + hash(x, 95) * 180;
      s.ridge(cx - 26, cx + 26, (xx) => 252 + Math.abs(xx - cx) * 0.6 - 8 * noise1(xx * 0.3, 96), P.plum, P.dusk, 2);
    }
  },
  live(f: Strip, c: LiveCtx) {
    // Shooting stars, one every few seconds at a new spot.
    const period = 3.4;
    const k = Math.floor(c.t / period);
    const p = (c.t % period) / period;
    if (p < 0.3) {
      const q = p / 0.3;
      const x = c.W * (0.3 + 0.7 * hash(k, 201)) - q * 120;
      const y = 8 + hash(k, 202) * (c.oy + 70) + q * 50;
      streak(f, x, y, -120, 50, 18, [P.white, P.skyLight, P.sky, P.indigo]);
    }
    // A lunar rover trundling along the far ridge, its beacon blinking.
    const rx = loopX(c.t * 7 - c.camX * 0.7, c.W, 40);
    const ry = c.oy + 200;
    f.rect(rx, ry, 9, 3, P.mist);
    f.rect(rx + 1, ry - 2, 4, 2, P.lavGrey);
    f.set(rx + 1, ry + 3, P.ink), f.set(rx + 4, ry + 3, P.ink), f.set(rx + 7, ry + 3, P.ink);
    f.line(rx + 6, ry, rx + 7, ry - 4, P.lavGrey);
    if (Math.sin(c.t * 5) > 0) f.set(rx + 7, ry - 5, P.scarlet);
  },
  critters: [star(70, 50), star(300, 30), star(660, 40), star(1120, 56), moon, pulsar, satellite, beacon, ringed, comet, astronaut],
  weather: { kind: "dust", rate: 0.5 },
};
