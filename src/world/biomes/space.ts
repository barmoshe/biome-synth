// Orbit: a moon field under a ringed planet. Stars arpeggiate, a comet sings the lead,
// a pulsar holds the bass, a little moon is the kick.
import { cyc, P } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec } from "../types";

function starfield(s: Strip, w: number, h: number, density: number, seed: number) {
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const r = hash(x * 7919 + y * 104729, seed);
      if (r < density) s.set(x, y, cyc(3, Math.floor(hash(x + y * 31, seed + 1) * 8)));
      else if (r < density * 1.6) s.set(x, y, P.indigo);
    }
}

const star = (x: number, y: number): CritterSpec => ({
  name: "star",
  role: "arp",
  x,
  y,
  w: 9,
  h: 9,
  draw(f, sx, sy, a) {
    const c = a.act > 0.3 ? P.white : cyc(3, 4 + Math.floor(a.t * 2 + x));
    const r = a.act > 0.4 ? 4 : a.act > 0.1 ? 3 : 2;
    const cx = sx + 4;
    const cy = sy + 4;
    for (let i = -r; i <= r; i++) {
      f.set(cx + i, cy, Math.abs(i) === r ? P.skyLight : c);
      f.set(cx, cy + i, Math.abs(i) === r ? P.skyLight : c);
    }
    if (a.act > 0.4) for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) f.set(cx + dx * 2, cy + dy * 2, P.skyLight);
  },
});

const moon: CritterSpec = {
  name: "moon",
  role: "kick",
  x: 360,
  y: 48,
  w: 18,
  h: 18,
  draw(f, sx, sy, a) {
    const r = 7 + Math.round(a.act * 2);
    const bob = Math.round(Math.sin(a.t * 0.9) * 2);
    f.disc(sx + 9, sy + 9 + bob, r, P.mist, P.lavGrey);
    f.disc(sx + 6, sy + 7 + bob, 1.5, P.lavGrey);
    f.disc(sx + 11, sy + 12 + bob, 1, P.lavGrey);
    f.set(sx + 12, sy + 6 + bob, P.lavGrey);
    if (a.act > 0.5) for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      f.set(sx + 9 + Math.cos(ang) * (r + 3), sy + 9 + bob + Math.sin(ang) * (r + 3), P.white);
    }
  },
};

const pulsar: CritterSpec = {
  name: "pulsar",
  role: "bass",
  x: 140,
  y: GROUND - 34,
  w: 20,
  h: 20,
  draw(f, sx, sy, a) {
    const cx = sx + 10;
    const cy = sy + 10;
    const ring = 6 + Math.round(a.act * 4);
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2 + a.t * 0.6;
      f.set(cx + Math.cos(ang) * ring, cy + Math.sin(ang) * ring * 0.45, i % 2 ? P.purple : P.lilac);
    }
    f.disc(cx, cy, 3, P.violet, P.purple);
    f.set(cx - 1, cy - 1, a.act > 0.3 ? P.white : P.lilac);
    // Beams on the beat.
    if (a.act > 0.3) {
      f.line(cx, cy - 4, cx, cy - 9, P.lilac);
      f.line(cx, cy + 4, cx, cy + 9, P.lilac);
    }
  },
};

const satellite: CritterSpec = {
  name: "satellite",
  role: "hat",
  x: 520,
  y: 30,
  w: 16,
  h: 8,
  draw(f, sx, sy, a) {
    const y = sy + Math.round(Math.sin(a.t * 0.7) * 2);
    const panel = a.act > 0.3 ? P.skyLight : P.blue;
    f.rect(sx, y + 2, 5, 3, panel);
    f.rect(sx + 11, y + 2, 5, 3, panel);
    f.line(sx + 5, y + 3, sx + 11, y + 3, P.mist);
    f.rect(sx + 6, y + 1, 4, 5, P.mist);
    f.set(sx + 7, y + 2, P.lavGrey);
    f.set(sx + 8, y, a.act > 0.2 || Math.sin(a.t * 4) > 0.6 ? P.scarlet : P.wine);
  },
};

const beacon: CritterSpec = {
  name: "beacon",
  role: "perc",
  x: 640,
  y: GROUND - 22,
  w: 10,
  h: 22,
  draw(f, sx, sy, a) {
    f.line(sx + 5, sy + 6, sx + 5, sy + 21, P.lavGrey);
    f.line(sx + 2, sy + 21, sx + 5, sy + 15, P.dusk);
    f.line(sx + 8, sy + 21, sx + 5, sy + 15, P.dusk);
    f.disc(sx + 5, sy + 4, 2, a.act > 0.3 ? P.goldGlow : P.amber);
    if (a.act > 0.3) for (const d of [-4, 4]) f.line(sx + 5 + d, sy + 4, sx + 5 + d * 1.6, sy + 4, P.gold);
  },
};

const ringed: CritterSpec = {
  name: "ringed planet",
  role: "pad",
  x: 250,
  y: 60,
  w: 22,
  h: 14,
  draw(f, sx, sy, a) {
    const cx = sx + 11;
    const cy = sy + 7 + Math.round(Math.sin(a.t * 0.5 + 1) * 2);
    const glow = a.act > 0.2;
    // Back half of the ring, the planet, then the front half.
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      if (Math.sin(ang) < 0) f.set(cx + Math.cos(ang) * 10, cy + Math.sin(ang) * 3, glow ? P.goldGlow : P.honey);
    }
    f.disc(cx, cy, 5, P.pink, P.pinkDeep);
    f.line(cx - 4, cy + 1, cx + 4, cy + 1, P.salmon);
    for (let i = 0; i < 40; i++) {
      const ang = (i / 40) * Math.PI * 2;
      if (Math.sin(ang) >= 0) f.set(cx + Math.cos(ang) * 10, cy + Math.sin(ang) * 3, glow ? P.goldGlow : P.honey);
    }
  },
};

const comet: CritterSpec = {
  name: "comet",
  role: "lead",
  x: 560,
  y: 70,
  w: 26,
  h: 10,
  draw(f, sx, sy, a) {
    const y = sy + 4 + Math.round(Math.sin(a.t * 0.4) * 3);
    const len = 12 + Math.round(a.act * 10);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      if (t > bayer(i, y) + 0.1 && i > 4) continue;
      f.set(sx + 22 - i, y + Math.round(i * 0.15), t < 0.3 ? P.white : t < 0.6 ? P.skyLight : P.sky);
      if (i < len * 0.5) f.set(sx + 22 - i, y + 1 + Math.round(i * 0.15), P.sky);
    }
    f.disc(sx + 23, y, 2, P.white);
  },
};

export const space: BiomeArt = {
  sky(s: Strip, w: number, h: number) {
    s.bands(0, w, 0, h, [P.ink, P.ink, P.plum, P.navy, P.plum], 5);
    // A nebula smear.
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const n = noise1(x * 0.02 + noise1(y * 0.04, 2) * 4, 7) * noise1(y * 0.03, 5);
        if (n > 0.38 && n - 0.38 > bayer(x, y) * 0.25) s.set(x, y, n > 0.5 ? P.violet : P.grape);
      }
    starfield(s, w, h, 0.006, 1);
  },
  far({ s, x0, x1 }) {
    const cx = Math.round((x0 + x1) / 2);
    // A giant ringed planet, half below the horizon.
    s.disc(cx, 92, 34, P.rust, P.wine, -0.8, -0.5);
    for (let y = 70; y < 120; y += 7) for (let x = cx - 34; x <= cx + 34; x++) if (s.get(x, y) === P.rust) s.set(x, y, P.clay);
    for (let i = 0; i < 260; i++) {
      const ang = (i / 260) * Math.PI * 2;
      const x = cx + Math.cos(ang) * 58;
      const y = 92 + Math.sin(ang) * 9;
      if (Math.sin(ang) > 0 || Math.abs(Math.cos(ang)) > 0.6) s.set(x, y, P.honey), s.set(x, y + 1, P.sand);
    }
    s.disc(cx - 70, 44, 5, P.mist, P.lavGrey);
  },
  mid({ s, x0, x1 }) {
    for (let x = Math.floor(x0) - 30; x < x1 + 30; x += 6) {
      if (hash(x, 31) > 0.22) continue;
      const r = 1 + Math.floor(hash(x, 32) * 5);
      s.disc(x, 70 + hash(x, 33) * 60, r, P.dusk, P.plum);
    }
    s.ridge(x0 - 60, x1 + 60, (x) => 138 + 8 * noise1(x * 0.04, 12), P.plum, P.dusk, 2);
  },
  near({ s, x0, x1 }) {
    const top = (x: number) => 150 + 3 * noise1(x * 0.05, 13);
    s.ridge(x0 - 140, x1 + 140, top, P.dusk, P.lavGrey, 4);
    // Craters: a dark bowl with a lit rim.
    for (let x = Math.floor(x0) - 120; x < x1 + 120; x += 3) {
      if (hash(x, 34) > 0.05) continue;
      const r = 3 + hash(x, 35) * 6;
      const y = top(x) + 6 + hash(x, 36) * 16;
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(1 - (dx / r) ** 2) * r * 0.35;
        for (let dy = -d; dy <= d; dy++) s.set(x + dx, y + dy, dy < 0 ? P.plum : P.grape);
        s.set(x + dx, y + d + 1, P.lavGrey);
      }
    }
  },
  critters: [star(40, 40), star(200, 24), star(470, 54), star(700, 36), moon, pulsar, satellite, beacon, ringed, comet],
  weather: { kind: "dust", rate: 0.5 },
};
