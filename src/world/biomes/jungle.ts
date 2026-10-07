// Canopy: a sunset jungle. Frogs hold the bass, a monkey drums, fireflies arpeggiate, a
// rafflesia breathes the pad, a toucan clacks, a cricket ticks, a parrot sings the lead.
// The sun sits upper right: everything is lit from there.
import { cyc, P, R } from "../palette";
import { bayer, hash, noise1, type Strip } from "../strip";
import { GROUND, type BiomeArt, type CritterSpec, type LiveCtx, type PaintCtx } from "../types";
import { loopX } from "../live";

const LX = 0.7;
const LY = -0.7;

function cloud(s: Strip, cx: number, cy: number, w: number, seed: number) {
  // Puffy clouds lit from below-right by the low sun.
  const ramp = [P.plumRose, P.rose, P.pinkDeep, P.salmon, P.peach];
  const n = Math.max(3, Math.round(w / 9));
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const r = 5 + Math.sin(t * Math.PI) * (w / 7) * (0.7 + 0.5 * hash(i, seed));
    s.blob(cx - w / 2 + t * w, cy - Math.sin(t * Math.PI) * r * 0.4, r * 1.2, r * 0.75, ramp, 0.6, 0.5, -0.1);
  }
  s.rect(cx - w / 2, cy + 2, w, 3, P.rose);
}

function fern(s: Strip, x: number, y: number, size: number, ramp: readonly number[], flip = 1) {
  for (let k = 0; k < 5; k++) {
    const ang = -Math.PI / 2 + (k - 2) * 0.45;
    const len = size * (1 - Math.abs(k - 2) * 0.18);
    for (let i = 0; i < len; i++) {
      const bend = (i / len) ** 2 * 6;
      const px = x + Math.cos(ang) * i * flip + bend * Math.sign(Math.cos(ang) || 1) * flip;
      const py = y + Math.sin(ang) * i + bend;
      s.set(px, py, ramp[Math.min(ramp.length - 1, 1 + Math.floor((i / len) * (ramp.length - 1)))]);
      if (i % 3 === 0 && i > 2) s.set(px + 1, py + 1, ramp[0]);
    }
  }
}

// ---------- critters ----------

const frog = (x: number, flip = false): CritterSpec => ({
  name: "frog",
  role: "bass",
  x,
  y: GROUND - 15,
  w: 20,
  h: 15,
  draw(f, sx, sy, a) {
    const hop = a.act > 0.75 ? -3 : 0;
    const y = sy + hop;
    const d = flip ? -1 : 1;
    const cx = sx + 10;
    // Back legs, body, belly.
    const body = [P.pineDeep, P.pine, P.green, P.leaf];
    f.blob(cx - 6 * d, y + 11, 4, 3, body, LX, LY);
    f.blob(cx, y + 9, 8, 5.5, body, LX, LY);
    f.blob(cx + 2 * d, y + 12, 5, 2, [P.olive, P.oliveLight, P.lime], LX, LY);
    for (const k of [0, 1, 2]) f.set(cx - 3 + k * 3, y + 6 + (k % 2), P.pineDeep);
    f.rect(cx + 4 * d - (d < 0 ? 2 : 0), y + 13, 3, 2, P.pine);
    // Eyes on top.
    for (const ex of [cx - 1, cx + 5 * d]) {
      f.blob(ex, y + 4, 3, 3, body, LX, LY);
      f.rect(ex - 1, y + 3, 3, 2, P.white);
      f.set(ex + (d > 0 ? 0 : -1), y + 4, P.ink);
    }
    f.line(cx + 2 * d, y + 9, cx + 7 * d, y + 8, P.pineDeep);
    // The throat sac swells on every croak.
    if (a.act > 0.08) f.blob(cx + 6 * d, y + 10, 1.5 + a.act * 3, 1 + a.act * 2.5, R.pink, LX, LY);
  },
});

const fireflies = (x: number, y: number): CritterSpec => ({
  name: "fireflies",
  role: "arp",
  x,
  y,
  w: 24,
  h: 20,
  glow: 9,
  noOutline: true,
  draw(f, sx, sy, a) {
    for (let i = 0; i < 7; i++) {
      const fx = sx + 12 + Math.sin(a.t * (1.3 + i * 0.27) + i * 2) * 10;
      const fy = sy + 10 + Math.cos(a.t * (1.1 + i * 0.19) + i) * 8;
      const on = a.act > 0.2 || Math.sin(a.t * 3 + i * 1.7) > 0.1;
      if (!on) continue;
      f.set(fx, fy, a.act > 0.3 ? P.white : cyc(5, i + 2));
      f.set(fx - 1, fy + 1, P.olive);
      if (a.act > 0.3) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) f.set(fx + dx, fy + dy, P.goldGlow);
    }
  },
});

const monkey: CritterSpec = {
  name: "monkey",
  role: "kick",
  x: 640,
  y: GROUND - 28,
  w: 30,
  h: 28,
  draw(f, sx, sy, a) {
    const hit = a.act > 0.6;
    // Bongo: a wooden drum with a skin and rope.
    f.box(sx + 16, sy + 15, 12, 13, R.fur, LX);
    f.rect(sx + 16, sy + 15, 12, 2, P.blush);
    for (let i = 0; i < 12; i += 3) f.line(sx + 16 + i, sy + 18, sx + 18 + i, sy + 26, P.sand);
    // Tail.
    for (let i = 0; i < 10; i++) f.set(sx + 3 - Math.round(Math.sin(i * 0.5) * 2), sy + 24 - i, P.brownDeep);
    // Body, head, face.
    const hy = sy + 8 + (hit ? 1 : 0);
    f.blob(sx + 10, sy + 19, 7, 8, R.fur, LX, LY);
    f.blob(sx + 10, sy + 21, 4, 5, R.skin, LX, LY);
    f.blob(sx + 3, hy - 1, 2.5, 2.5, R.skin, LX, LY);
    f.blob(sx + 17, hy - 1, 2.5, 2.5, R.skin, LX, LY);
    f.blob(sx + 10, hy, 7, 6.5, R.fur, LX, LY);
    f.blob(sx + 10, hy + 2, 5, 4, R.skin, LX, LY);
    f.rect(sx + 7, hy, 2, 2, P.ink);
    f.rect(sx + 12, hy, 2, 2, P.ink);
    f.set(sx + 7, hy, P.white);
    f.set(sx + 12, hy, P.white);
    f.line(sx + 8, hy + 4, sx + 12, hy + 4, hit ? P.wine : P.rust);
    // Arm: raised, then down on the skin.
    if (hit) f.line(sx + 15, sy + 16, sx + 22, sy + 15, P.rust, 3);
    else f.line(sx + 15, sy + 16, sx + 20, sy + 8, P.rust, 3);
  },
};

const cricket: CritterSpec = {
  name: "cricket",
  role: "hat",
  x: 880,
  y: GROUND - 18,
  w: 16,
  h: 11,
  draw(f, sx, sy, a) {
    // A broad leaf, and the cricket on it.
    for (let i = 0; i < 16; i++) {
      const w = Math.round(Math.sin((i / 15) * Math.PI) * 3);
      for (let j = -w; j <= w; j++) f.set(sx + i, sy + 9 + j - Math.round(i * 0.2), j < 0 ? P.green : j === 0 ? P.leaf : P.pine);
    }
    const up = a.act > 0.3 ? -1 : 0;
    f.blob(sx + 7, sy + 4 + up, 3.5, 1.8, [P.olive, P.oliveLight, P.lime], LX, LY);
    f.blob(sx + 11, sy + 3 + up, 1.6, 1.6, [P.olive, P.oliveLight], LX, LY);
    f.set(sx + 12, sy + 2 + up, P.ink);
    f.line(sx + 4, sy + 6 + up, sx + 2, sy + 8, P.olive);
    f.line(sx + 9, sy + 6 + up, sx + 11, sy + 8, P.olive);
    f.line(sx + 12, sy + 2 + up, sx + 15, sy - 1 + up, P.lime);
    if (a.act > 0.3) (f.set(sx + 6, sy + 1 + up, P.goldGlow), f.set(sx + 8, sy + up, P.goldGlow));
  },
};

const toucan: CritterSpec = {
  name: "toucan",
  role: "perc",
  x: 1010,
  y: GROUND - 74,
  w: 24,
  h: 20,
  draw(f, sx, sy, a) {
    f.line(sx - 6, sy + 19, sx + 28, sy + 18, P.barkDeep, 3);
    f.blob(sx + 8, sy + 11, 6, 7, R.ink, LX, LY);
    f.blob(sx + 8, sy + 6, 4, 4, R.ink, LX, LY);
    f.blob(sx + 9, sy + 9, 3, 3, [P.gold, P.goldGlow], LX, LY);
    f.rect(sx + 8, sy + 4, 2, 2, P.white);
    f.set(sx + 9, sy + 4, P.ink);
    const open = a.act > 0.4 ? 2 : 0;
    // The big beak.
    f.blob(sx + 16, sy + 5 - open / 2, 6, 2.5, [P.flame, P.orange, P.amber, P.gold], LX, LY);
    f.blob(sx + 15, sy + 8 + open / 2, 5, 1.5, [P.crimson, P.scarlet], LX, LY);
    f.set(sx + 22, sy + 5 - open / 2, P.ink);
    f.rect(sx + 5, sy + 17, 2, 3, P.sky);
    f.rect(sx + 10, sy + 17, 2, 3, P.sky);
  },
};

const flower: CritterSpec = {
  name: "rafflesia",
  role: "pad",
  x: 380,
  y: GROUND - 20,
  w: 30,
  h: 20,
  draw(f, sx, sy, a) {
    const open = 1 + a.act * 3 + Math.sin(a.t * 0.8) * 0.6;
    const cx = sx + 15;
    const cy = sy + 13;
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(ang) * (7 + open);
      const py = cy + Math.sin(ang) * (4 + open * 0.6);
      f.blob(px, py, 6, 4, R.red, LX, LY);
      f.set(px - 1, py - 1, P.salmon);
      f.set(px + 2, py, P.blush);
    }
    f.blob(cx, cy, 6, 3.5, [P.wine, P.berry, P.crimson], LX, LY);
    f.blob(cx, cy - 1, 4, 2, a.act > 0.3 ? [P.amber, P.gold, P.goldGlow] : [P.ink, P.wine], LX, LY);
  },
};

const parrot: CritterSpec = {
  name: "parrot",
  role: "lead",
  x: 180,
  y: GROUND - 88,
  w: 20,
  h: 26,
  draw(f, sx, sy, a) {
    f.line(sx - 8, sy + 24, sx + 26, sy + 22, P.barkDeep, 3);
    for (let i = 0; i < 4; i++) f.set(sx + 20 + i * 2, sy + 21 - i, P.pine), f.set(sx + 21 + i * 2, sy + 20 - i, P.green);
    const sing = a.act > 0.25;
    // Tail.
    f.line(sx + 7, sy + 18, sx + 5, sy + 26, P.blue, 2);
    f.line(sx + 8, sy + 18, sx + 8, sy + 26, P.sky, 1);
    // Body and head.
    f.blob(sx + 9, sy + 13, 5, 7, R.red, LX, LY);
    f.blob(sx + 10, sy + 6, 4.5, 4.5, R.red, LX, LY);
    f.blob(sx + 7, sy + 13, 3, 5, [P.navy, P.blue, P.sky], LX, LY);
    f.set(sx + 7, sy + 9, P.gold);
    f.set(sx + 8, sy + 10, P.gold);
    f.rect(sx + 11, sy + 4, 2, 2, P.white);
    f.set(sx + 12, sy + 5, P.ink);
    // Beak: opens to sing.
    f.blob(sx + 15, sy + 7, 2.2, 2, [P.charcoal, P.lavGrey, P.pale], LX, LY);
    if (sing) f.rect(sx + 14, sy + 9, 3, 1, P.ink);
    f.rect(sx + 8, sy + 20, 1, 3, P.charcoal);
    f.rect(sx + 11, sy + 20, 1, 3, P.charcoal);
  },
};

// ---------- scenery ----------

function canopyTree(s: Strip, x: number, top: number, r: number, seed: number) {
  s.rect(x - 2, top + r * 0.6, 4, 230 - top, P.ink);
  s.rect(x - 1, top + r * 0.6, 1, 230 - top, P.barkDeep);
  for (let k = 0; k < 5; k++) {
    const ox = (hash(k, seed) - 0.5) * r * 1.6;
    const oy = (hash(k + 9, seed) - 0.5) * r * 0.7;
    s.blob(x + ox, top + oy, r * (0.6 + 0.4 * hash(k + 3, seed)), r * 0.55, R.leaf, LX, LY, -0.1);
  }
}

function kapok(s: Strip, x: number) {
  // A giant tree with buttress roots: the jungle's landmark.
  for (let y = 40; y < 230; y++) {
    const w = 9 + Math.max(0, (y - 170) * 0.5);
    for (let i = -w; i <= w; i++) {
      const lit = i / w;
      s.set(x + i, y, lit > 0.45 ? P.clay : lit > 0 ? P.rust : lit > -0.6 ? P.brownDeep : P.barkDeep);
    }
  }
  for (const d of [-1, 1]) for (let k = 0; k < 3; k++) s.line(x + d * (6 + k * 5), 170 + k * 12, x + d * (20 + k * 10), 230, k ? P.brownDeep : P.rust, 3);
  for (let y = 60; y < 220; y += 7) s.set(x - 3 + (y % 5), y, P.barkDeep);
  // Vines.
  for (let k = 0; k < 4; k++) for (let y = 40; y < 120 + k * 20; y++) s.set(x - 14 + k * 9 + Math.round(Math.sin(y * 0.1 + k) * 2), y, k % 2 ? P.pine : P.green);
}

function ruins(s: Strip, x: number) {
  // Mossy temple blocks.
  const blocks = [
    [0, 196, 18, 32],
    [18, 184, 22, 44],
    [40, 204, 16, 24],
    [8, 172, 24, 12],
  ];
  for (const [bx, by, bw, bh] of blocks) {
    s.box(x + bx, by, bw, bh, R.stone, LX);
    for (let i = 0; i < bw; i += 2) if (hash(x + bx + i, 70) < 0.7) s.set(x + bx + i, by + (hash(i, 71) < 0.5 ? 1 : 0), hash(i, 72) < 0.5 ? P.green : P.leaf);
    for (let j = 4; j < bh; j += 6) s.line(x + bx + 1, by + j, x + bx + bw - 2, by + j, P.sageDeep);
  }
  // A carved face on the tall block.
  s.rect(x + 23, 194, 3, 2, P.charcoal);
  s.rect(x + 32, 194, 3, 2, P.charcoal);
  s.rect(x + 26, 204, 6, 2, P.charcoal);
}

export const jungle: BiomeArt = {
  air: P.salmon,
  toLight: [LX, LY],
  sky(s, w, h) {
    s.bands(0, w, 0, h, [P.grape, P.plumRose, P.rose, P.pinkDeep, P.salmon, P.peach, P.honey], 8);
    const cx = Math.round(w * 0.7);
    const cy = h - 176;
    for (let r = 46; r > 30; r -= 1) for (let i = 0; i < 360; i += 2) {
      const x = cx + Math.cos((i * Math.PI) / 180) * r;
      const y = cy + Math.sin((i * Math.PI) / 180) * r;
      if (bayer(Math.round(x), Math.round(y)) < (46 - r) / 30) s.set(x, y, P.peach);
    }
    s.disc(cx, cy, 28, P.honey);
    s.disc(cx, cy, 24, P.gold);
    s.disc(cx, cy, 18, P.goldGlow);
    cloud(s, w * 0.2, h - 200, 70, 1);
    cloud(s, w * 0.48, h - 236, 46, 2);
    cloud(s, w * 0.9, h - 214, 58, 3);
    // Birds.
    for (const [bx, by] of [[0.3, 168], [0.33, 176], [0.37, 162]]) {
      const x = Math.round(w * bx);
      const y = h - by;
      s.set(x - 1, y - 1, P.berry), s.set(x, y, P.berry), s.set(x + 1, y - 1, P.berry);
    }
  },
  far({ s, x0, x1 }: PaintCtx) {
    // A volcano and a hazy ridge.
    const vx = (x0 + x1) / 2 + 60;
    s.ridge(x0 - 60, x1 + 60, (x) => {
      const cone = 92 + Math.abs(x - vx) * 0.7;
      const hills = 150 + 22 * noise1(x * 0.03, 3) - 10 * noise1(x * 0.11, 9);
      return Math.min(cone, hills);
    }, P.barkDeep, P.berry, 4);
    // Lava glow at the rim and a lit flank.
    for (let x = vx - 30; x < vx + 30; x++) for (let y = 92; y < 140; y++) if (s.get(x, y) === P.barkDeep && x > vx + (y - 92) * 0.2 && bayer(x, y) < 0.5) s.set(x, y, P.berry);
    s.rect(vx - 5, 90, 10, 2, P.flame);
    s.set(vx - 1, 89, P.amber);
    for (let i = 0; i < 6; i++) s.blob(vx + 8 + i * 9, 78 - i * 6, 5 + i, 3 + i * 0.6, [P.plumRose, P.rose, P.salmon], LX, LY);
  },
  mid({ s, x0, x1 }: PaintCtx) {
    for (let x = Math.floor(x0) - 80; x < x1 + 80; x += 12 + Math.floor(hash(x, 20) * 10)) canopyTree(s, x, 146 + 26 * noise1(x * 0.02, 4) - (hash(x, 22) < 0.12 ? 26 : 0), 12 + 8 * hash(x, 21), x);
    s.ridge(x0 - 80, x1 + 80, (x) => 196 + 6 * noise1(x * 0.05, 8), P.pineDeep, P.pine, 3);
    // A mossy cliff with a waterfall, colour-cycled so it pours.
    const wx = Math.round(x0 + (x1 - x0) * 0.58);
    // Stepped ledges: each band of rock juts out a little differently, lit on top, dark beneath.
    const ledge = (y: number) => Math.floor((y - 90) / 16);
    const halfW = (y: number) => 14 + (y - 90) * 0.22 + 7 * (hash(ledge(y), 18) - 0.5) + 3 * noise1(y * 0.3, 19);
    for (let y = 90; y < 226; y++) {
      const hw = halfW(y);
      const top = (y - 90) % 16 === 0;
      const under = (y - 90) % 16 === 1;
      for (let x = Math.floor(wx - hw); x <= wx + hw; x++) {
        const lit = (x - wx) / hw;
        let c: number = lit > 0.35 ? P.sage : lit > -0.45 ? P.sageDeep : P.charcoal;
        if (hash(x * 7 + y * 13, 16) < 0.06) c = P.charcoal;
        if (top) c = lit > -0.3 ? P.sageLight : P.sage;
        else if (under) c = P.charcoal;
        s.set(x, y, c);
      }
      // Moss on the ledges.
      if (top) for (let x = Math.floor(wx - hw); x <= wx + hw; x++) if (noise1(x * 0.3, ledge(y)) > 0.45) (s.set(x, y - 1, P.green), noise1(x * 0.5, ledge(y) + 3) > 0.5 && s.set(x, y - 2, P.leaf));
    }
    s.blob(wx + 2, 88, 16, 6, R.leaf, LX, LY);
    s.blob(wx - 10, 90, 9, 4, R.leaf, LX, LY);
    for (let y = 92; y < 220; y++) for (let x = wx - 3; x <= wx + 4; x++) s.set(x, y, cyc(0, Math.floor(y * 0.6) - (x - wx)));
    for (let x = wx - 18; x < wx + 20; x++) for (let y = 206; y < 226; y++) if (bayer(x, y) < 0.7 - Math.abs(x - wx) / 26 - (226 - y) / 40) s.set(x, y, y > 218 ? cyc(0, x) : P.white);
  },
  near({ s, x0, x1 }: PaintCtx) {
    const top = (x: number) => 226 + 3 * noise1(x * 0.06, 5);
    const a = Math.floor(x0) - 200;
    const b = x1 + 200;
    // Soil strata, then the grass edge.
    s.ridge(a, b, top, P.brownDeep, P.green, 6);
    for (let x = a; x < b; x++) {
      const t = Math.round(top(x));
      for (let y = t + 6; y < 270; y++) {
        // Thin wavy strata and a darker deep soil.
        const wave = y + 6 * noise1(x * 0.015, 6);
        const band = Math.floor(wave / 9);
        const edge = wave % 9;
        if (band % 3 === 1 && edge < 1.2) s.set(x, y, P.rust);
        else if (band % 3 === 2 && edge < 1) s.set(x, y, P.barkDeep);
        if (y > t + 26 && bayer(x, y) < (y - t - 26) / 30) s.set(x, y, P.barkDeep);
      }
      if (hash(x, 1) < 0.55) s.set(x, t - 1, P.leaf);
      if (hash(x, 2) < 0.25) (s.set(x, t - 2, P.green), s.set(x, t - 3, hash(x, 8) < 0.5 ? P.leaf : P.green));
      if (hash(x, 3) < 0.012) (s.set(x, t - 3, P.hotPink), s.set(x, t - 4, P.pink));
      if (hash(x, 4) < 0.006) fern(s, x, t, 10 + hash(x, 5) * 8, R.leaf, hash(x, 6) < 0.5 ? 1 : -1);
      if (hash(x, 9) < 0.01) s.blob(x, t + 14 + hash(x, 10) * 20, 2 + hash(x, 11) * 3, 1.5 + hash(x, 12) * 2, R.rock, LX, LY);
      if (hash(x, 13) < 0.008) for (let k = 0; k < 14; k++) s.set(x + k * 0.8, t + 8 + k + Math.round(Math.sin(k) * 2), P.barkDeep);
    }
    const span = x1 - x0;
    ruins(s, Math.round(x0 + span * 0.36));
    kapok(s, Math.round(x0 + span * 0.8));
  },
  front({ s, x0, x1 }: PaintCtx) {
    // Big leaves and grass clumps crossing the bottom edge now and then.
    for (let x = Math.floor(x0); x < x1; x += 300) {
      const cx = x + hash(x, 90) * 140;
      const d = hash(x, 92) < 0.5 ? 1 : -1;
      for (let k = 0; k < 3; k++) {
        const ang = -Math.PI / 2 + d * (0.5 + k * 0.35);
        const len = 44 + k * 8;
        for (let i = 0; i < len; i++) {
          const w = Math.sin((i / len) * Math.PI) * (9 - k * 2);
          const px = cx + Math.cos(ang) * i;
          const py = 272 + Math.sin(ang) * i + (i / len) ** 2 * 10;
          for (let j = -w; j <= w; j++) s.set(px - Math.sin(ang) * j, py + Math.cos(ang) * j, j > 0 ? P.pine : P.pineDeep);
          s.set(px, py, P.green);
        }
      }
      for (let k = 0; k < 12; k++) {
        const gx = cx + 40 * d + k * 2 * d;
        const hgt = 10 + hash(k, x) * 14;
        s.line(gx, 270, gx + d * 3, 270 - hgt, k % 2 ? P.pine : P.pineDeep, 2);
      }
    }
  },
  live(f: Strip, c: LiveCtx) {
    // Birds crossing the sunset in a loose V.
    const period = 11;
    const p = (c.t % period) / period;
    if (p < 0.55) {
      const bx = -30 + (p / 0.55) * (c.W + 60);
      const by = c.oy + 40 + hash(Math.floor(c.t / period), 231) * 50;
      const flap = Math.floor(c.t * 5) % 2;
      for (let i = 0; i < 5; i++) {
        const row = Math.ceil(i / 2);
        const x = Math.round(bx - row * 6);
        const y = Math.round(by + (i % 2 ? 1 : -1) * row * 3);
        f.set(x, y, P.berry), f.set(x - 1, y - flap, P.berry), f.set(x + 1, y - flap, P.berry);
      }
    }
    // Butterflies over the grass.
    for (let i = 0; i < 4; i++) {
      const x = Math.round(loopX(c.t * (6 + i * 2) - c.camX + i * 140, c.W, 20) + Math.sin(c.t * 1.7 + i) * 10);
      const y = Math.round(c.oy + 196 + Math.sin(c.t * 2.3 + i * 1.3) * 10);
      const open = Math.floor(c.t * 10 + i) % 2;
      const col = i % 2 ? P.hotPink : P.gold;
      f.set(x, y, P.ink);
      f.set(x - 1, y - open, col), f.set(x + 1, y - open, col);
      if (open) f.set(x - 1, y, col), f.set(x + 1, y, col);
    }
    // Leaves drifting down from the canopy.
    for (let i = 0; i < 6; i++) {
      const life = (c.t * 0.12 + hash(i, 233)) % 1;
      const x = Math.round(loopX(hash(i, 234) * 600 - c.camX * 0.85 + Math.sin(c.t * 1.5 + i) * 8, c.W, 10));
      const y = Math.round(c.oy + 150 + life * 75);
      f.set(x, y, i % 2 ? P.oliveLight : P.amber);
      f.set(x + (Math.floor(c.t * 3 + i) % 2), y + 1, i % 2 ? P.olive : P.rust);
    }
  },
  critters: [frog(90), frog(520, true), frog(1100), fireflies(280, 140), fireflies(740, 120), fireflies(960, 156), monkey, cricket, toucan, flower, parrot],
  weather: { kind: "fireflies", rate: 0.7 },
};
