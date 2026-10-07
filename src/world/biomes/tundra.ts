// Aurora: a polar night. Ice pillars ring like bells, penguins click, a walrus hums the bass,
// a bear stomps the kick, an owl sings, the crystal holds the chord.
import { cyc, P } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec } from "../types";

const pillar = (x: number, h: number): CritterSpec => ({
  name: "ice pillar",
  role: "arp",
  x,
  y: GROUND - h,
  w: 7,
  h,
  draw(f, sx, sy, a) {
    for (let y = 0; y < h; y++) {
      const w = y < 3 ? 3 + y : 7;
      const x0 = sx + Math.floor((7 - w) / 2);
      for (let x = 0; x < w; x++) f.set(x0 + x, sy + y, x === 0 ? P.white : x === w - 1 ? P.blue : cyc(7, Math.floor(y * 0.5 + a.t * (a.act > 0.2 ? 6 : 0.5))));
    }
    if (a.act > 0.4) {
      f.set(sx + 3, sy - 2, P.white);
      f.set(sx + 1, sy - 1, P.skyLight);
      f.set(sx + 5, sy - 1, P.skyLight);
    }
  },
});

const penguin = (x: number, flip: boolean): CritterSpec => ({
  name: "penguin",
  role: "perc",
  x,
  y: GROUND - 11,
  w: 8,
  h: 11,
  draw(f, sx, sy, a) {
    const tilt = a.act > 0.4 ? -1 : Math.round(Math.sin(a.t * 3 + x) * 0.6);
    const key = { k: P.ink, w: P.white, o: P.amber, c: P.charcoal };
    f.sprite(sx, sy + (a.act > 0.5 ? -1 : 0), [
      "..kkk...",
      ".kkwkk..",
      ".kkkkoo.",
      "kkwwwk..",
      "kwwwwwk.",
      "kwwwwwk.",
      "kwwwwwk.",
      ".kwwwk..",
      "..o.o...",
    ].map((r, i) => (i > 2 && i < 8 && tilt ? (tilt > 0 ? r.slice(1) + "." : "." + r.slice(0, -1)) : r)), key, flip);
  },
});

const walrus: CritterSpec = {
  name: "walrus",
  role: "bass",
  x: 300,
  y: GROUND - 13,
  w: 22,
  h: 13,
  draw(f, sx, sy, a) {
    const puff = Math.round(a.act * 2);
    f.disc(sx + 9, sy + 8, 6 + puff * 0.5, P.mauve, P.rust);
    f.disc(sx + 15, sy + 5, 4, P.mauve, P.rust);
    f.rect(sx + 3, sy + 9, 14, 4, P.mauve);
    f.set(sx + 16, sy + 4, P.ink);
    f.rect(sx + 16, sy + 6, 3, 2, P.stone);
    f.line(sx + 16, sy + 8, sx + 16, sy + 11 + puff, P.white);
    f.line(sx + 18, sy + 8, sx + 18, sy + 11 + puff, P.white);
    f.line(sx, sy + 12, sx + 3, sy + 10, P.rust);
  },
};

const bear: CritterSpec = {
  name: "polar bear",
  role: "kick",
  x: 520,
  y: GROUND - 16,
  w: 24,
  h: 16,
  draw(f, sx, sy, a) {
    const up = a.act > 0.5 ? -2 : 0;
    f.rect(sx + 3, sy + 5, 15, 8, P.pale);
    f.disc(sx + 6, sy + 8, 5, P.pale, P.mist);
    f.disc(sx + 15, sy + 8, 5, P.pale, P.mist);
    f.disc(sx + 20, sy + 6 + up, 3.5, P.white, P.pale);
    f.set(sx + 19, sy + 3 + up, P.mist);
    f.set(sx + 21, sy + 5 + up, P.ink);
    f.set(sx + 23, sy + 7 + up, P.ink);
    // Legs; the front paw lifts and stamps.
    f.rect(sx + 4, sy + 12, 3, 4, P.pale);
    f.rect(sx + 9, sy + 12, 3, 4, P.pale);
    f.rect(sx + 16, sy + 12 + up, 3, 4, P.pale);
    if (a.act > 0.5) for (let i = -3; i <= 3; i++) f.set(sx + 17 + i * 2, sy + 16, P.white);
  },
};

const crystal: CritterSpec = {
  name: "crystal",
  role: "pad",
  x: 150,
  y: GROUND - 22,
  w: 16,
  h: 22,
  draw(f, sx, sy, a) {
    const shards = [
      [7, 0, 4, 20],
      [3, 8, 3, 13],
      [12, 6, 3, 15],
    ];
    for (const [x, y, w, h] of shards)
      for (let j = 0; j < h; j++) {
        const ww = j < w ? j + 1 : w;
        for (let i = 0; i < ww; i++) f.set(sx + x + i - Math.floor(ww / 2), sy + y + j, a.act > 0.15 ? cyc(1, j + Math.floor(a.t * 8)) : i === 0 ? P.foam : P.aqua);
      }
  },
};

const owl: CritterSpec = {
  name: "owl",
  role: "lead",
  x: 640,
  y: GROUND - 36,
  w: 10,
  h: 12,
  draw(f, sx, sy, a) {
    // Perched on a crag of ice.
    f.rect(sx - 1, sy + 11, 12, 25, P.mist);
    f.rect(sx - 1, sy + 11, 12, 1, P.white);
    f.disc(sx + 5, sy + 6, 4, P.white, P.pale);
    f.set(sx + 1, sy + 1, P.white);
    f.set(sx + 9, sy + 1, P.white);
    const open = a.act > 0.2;
    f.rect(sx + 3, sy + 4, 1, open ? 2 : 1, P.ink);
    f.rect(sx + 7, sy + 4, 1, open ? 2 : 1, P.ink);
    f.set(sx + 5, sy + 6, P.amber);
    f.set(sx + 3, sy + 8, P.mist);
    f.set(sx + 7, sy + 9, P.mist);
  },
};

const wisp: CritterSpec = {
  name: "wind wisp",
  role: "hat",
  x: 420,
  y: 66,
  w: 18,
  h: 8,
  draw(f, sx, sy, a) {
    const n = 10 + Math.round(a.act * 8);
    for (let i = 0; i < n; i++) {
      const x = sx + i;
      const y = sy + 4 + Math.round(Math.sin(i * 0.6 + a.t * 3) * 2);
      if (bayer(x, y) < 0.6 + a.act * 0.4) f.set(x, y, a.act > 0.3 ? P.white : P.mist);
    }
  },
};

export const tundra: BiomeArt = {
  sky(s: Strip, w: number, h: number) {
    s.bands(0, w, 0, h, [P.ink, P.navy, P.navy, P.indigo, P.blue], 6);
    // Aurora curtains, colour-cycled so they ripple.
    for (let x = 0; x < w; x++) {
      const top = Math.round(h * 0.12 + 10 * Math.sin(x * 0.03) + 6 * Math.sin(x * 0.011 + 2));
      const len = 26 + Math.round(16 * noise1(x * 0.05, 8));
      for (let j = 0; j < len; j++) {
        const fade = j / len;
        if (fade > bayer(x, top + j) * 0.9 + 0.1 && j > 3) continue;
        s.set(x, top + j, cyc(1, Math.floor(x * 0.12 + j * 0.2)));
      }
    }
    for (let i = 0; i < w * h * 0.002; i++) s.set(hash(i, 81) * w, hash(i, 82) * h * 0.6, cyc(3, i));
  },
  far({ s, x0, x1 }) {
    const top = (x: number) => 72 + 40 * Math.abs(((x * 0.03 + noise1(x * 0.02, 3) * 2) % 2) - 1) + 10 * noise1(x * 0.1, 4);
    s.ridge(x0 - 40, x1 + 40, top, P.lavGrey, P.mist, 4);
    // Snow caps on the high ground.
    for (let x = Math.floor(x0) - 40; x < x1 + 40; x++) {
      const t = Math.round(top(x));
      if (t < 92) for (let y = t; y < t + (92 - t) * 0.6; y++) s.set(x, y, bayer(x, y) < 0.85 ? P.white : P.pale);
    }
  },
  mid({ s, x0, x1 }) {
    const top = (x: number) => 122 + Math.round(noise1(x * 0.03, 6) * 4) * 4;
    s.ridge(x0 - 60, x1 + 60, top, P.sky, P.white, 3);
    for (let x = Math.floor(x0) - 60; x < x1 + 60; x++) {
      if (hash(x, 61) < 0.08) s.set(x, top(x) + 4 + hash(x, 62) * 14, cyc(7, x));
      if (hash(x, 63) < 0.3) s.set(x, top(x) + 10 + hash(x, 64) * 20, P.blue);
    }
  },
  near({ s, x0, x1 }) {
    const top = (x: number) => 150 + 2 * noise1(x * 0.06, 14);
    s.ridge(x0 - 140, x1 + 140, top, P.pale, P.white, 5);
    for (let x = Math.floor(x0) - 140; x < x1 + 140; x++) {
      const t = Math.round(top(x));
      for (let y = t + 12; y < 180; y++) if (bayer(x, y) < (y - t - 12) / 20) s.set(x, y, P.mist);
      if (hash(x, 65) < 0.03) s.set(x, t + 2, cyc(7, x));
    }
  },
  critters: [pillar(40, 26), pillar(54, 18), pillar(230, 30), pillar(470, 22), pillar(700, 28), penguin(90, false), penguin(102, true), penguin(600, false), walrus, bear, crystal, owl, wisp],
  weather: { kind: "snow", rate: 3 },
};
