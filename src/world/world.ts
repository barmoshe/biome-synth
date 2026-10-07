// The world: four parallax layers painted once (biomes dissolved into each other with Bayer
// dithering, distant layers pulled toward each biome's air colour, fog pooled at their feet), a sky
// per biome blended by the camera, live critters run through a small compositor (selective
// outline, rim light, squash and stretch), glows done with shade tables instead of blur, weather,
// sparks and a colour-cycling lookup table driven by the music. One putImageData per frame at art
// resolution; CSS scales it up by an integer with image-rendering: pixelated.
import { BIOMES, type Role } from "../shared/biomes";
import { buildLut, cyc, CYCLES, P, T } from "./palette";
import { dark, fogTable, light } from "./shade";
import { bayer, hash, Strip } from "./strip";
import { AUTHOR_W, BLEND, BW, GROUND, LAYER_F, LAYER_FOG, LAYER_POOL, NB, STAGE, WORLD, type Anim, type BiomeArt, type CritterSpec } from "./types";
import { ART } from "./biomes";

export type Critter = CritterSpec & { biome: number; wx: number; act: number; pre: number; hover: boolean; flip: boolean };

type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: number; note?: boolean };
type Flake = { x: number; y: number; vx: number; vy: number; c: number; kind: string };
type Light = { x: number; y: number; r: number; k: number };
type TrailPt = { x: number; y: number; c: number; age: number; w: number };
type Trail = { pts: TrailPt[]; live: boolean };
type Comet = { id: number; x: number; y: number; vx: number; vy: number; colors: number[]; i: number; timer: number; interval: number };

const TRAIL_LIFE = 0.75;

const smooth = (t: number) => t * t * (3 - 2 * t);

/** The two biomes blended at world x, and the right one's weight (0 = all left). */
export function pairAt(x: number): [number, number, number] {
  const wx = ((x % WORLD) + WORLD) % WORLD;
  const i = Math.floor(wx / BW);
  const local = wx - i * BW;
  if (local < BLEND) return [(i + NB - 1) % NB, i, smooth((local + BLEND) / (2 * BLEND))];
  if (local > BW - BLEND) return [i, (i + 1) % NB, smooth((local - (BW - BLEND)) / (2 * BLEND))];
  return [i, i, 0];
}

export function weightsAt(x: number): number[] {
  const w = [0, 0, 0, 0, 0];
  const [a, b, t] = pairAt(x);
  w[a] += 1 - t;
  w[b] += t;
  return w;
}

const FRONT = LAYER_F.length - 1;
const PAD = 3; // compositor margin around a critter for its outline and stretch

export class World {
  W = 0;
  H = 0;
  fb!: Strip;
  private img!: ImageData;
  private u32!: Uint32Array;
  private lut = new Uint32Array(256);
  private layers: Strip[] = [];
  private skies: Strip[] = [];
  critters: Critter[] = [];
  camX = 0;
  /** Reduced motion: fewer particles, slower colour cycling, less weather. */
  reduced = false;
  phases = new Array(CYCLES.length).fill(0);
  private sparks: Spark[] = [];
  private flakes: Flake[] = [];
  private rr: Partial<Record<string, number>> = {};
  private art: BiomeArt[] = ART;
  private scratch = new Strip(96, 96, T, false);
  private scratch2 = new Strip(96, 96, T, false);
  private lights: Light[] = [];
  private trails = new Map<number, Trail>();
  private comets: Comet[] = [];
  private cometId = -1;
  private retired = 1e9;

  constructor() {
    this.layers = LAYER_F.map((f, i) => this.paintLayer(f, i));
    this.critters = this.art.flatMap((a, biome) =>
      a.critters.map((c, i) => ({ ...c, biome, wx: biome * BW + Math.round((c.x * BW) / AUTHOR_W), act: 0, pre: 0, hover: false, flip: hash(i, biome) < 0.3 })),
    );
  }

  /** Paint one parallax layer: every biome into its own strip, fogged, then dissolved at the borders. */
  private paintLayer(f: number, li: number): Strip {
    const len = Math.round(WORLD * f);
    const temps = this.art.map((a, i) => {
      const s = new Strip(len, STAGE);
      const ctx = { s, x0: i * BW * f, x1: (i + 1) * BW * f, f };
      if (li === 0) a.far(ctx);
      else if (li === 1) a.mid(ctx);
      else if (li === 2) a.near(ctx);
      else a.front?.(ctx);
      this.atmosphere(s, a, li, ctx.x0, ctx.x1);
      return s;
    });
    const out = new Strip(len, STAGE);
    for (let x = 0; x < len; x++) {
      const [a, b, t] = pairAt(x / f);
      for (let y = 0; y < STAGE; y++) {
        const src = t > bayer(x, y) ? b : a;
        out.px[y * len + x] = temps[src].px[y * len + x];
      }
    }
    return out;
  }

  /**
   * Atmospheric perspective, baked: distant layers lose contrast toward the air colour, with more
   * fog pooled near the ground; the foreground goes almost to silhouette.
   */
  private atmosphere(s: Strip, a: BiomeArt, li: number, x0: number, x1: number) {
    const base = LAYER_FOG[li];
    let tables: Uint8Array[];
    if (li === FRONT) tables = [fogTable(P.ink, 0.72), fogTable(P.ink, 0.72)];
    else if (base > 0) tables = [fogTable(a.air, base), fogTable(a.air, Math.min(0.9, base + LAYER_POOL[li]))];
    else return;
    const m = BLEND + 40;
    for (let y = 0; y < STAGE; y++) {
      // Fog thickens over the lower part of distant layers.
      const pool = li === FRONT ? 0 : smooth(Math.max(0, Math.min(1, (y - STAGE * 0.5) / (STAGE * 0.38))));
      for (let x = Math.floor(x0 - m); x < x1 + m; x++) {
        const c = s.get(x, y);
        if (c === T) continue;
        s.set(x, y, tables[pool > bayer(x, y) ? 1 : 0][c]);
      }
    }
  }

  resize(w: number, h: number) {
    if (w === this.W && h === this.H) return;
    this.W = w;
    this.H = h;
    this.fb = new Strip(w, h, P.ink, false);
    this.img = new ImageData(w, h);
    this.u32 = new Uint32Array(this.img.data.buffer);
    this.skies = this.art.map((a) => {
      const s = new Strip(w, h, P.ink, false);
      a.sky(s, w, h);
      return s;
    });
  }

  /**
   * The stage's top row on screen. Tall screens split the extra height: most becomes sky above, a
   * third becomes underground below, so the creatures sit in the middle of a phone, not at its foot.
   */
  get oy() {
    const extra = this.H - STAGE;
    return extra > 0 ? Math.round(extra * 0.66) : extra;
  }

  /** Below the stage on tall screens: the soil continues and darkens with depth. */
  private underground() {
    const { W, H, fb } = this;
    const px = fb.px;
    const top = this.oy + STAGE;
    if (top >= H) return;
    const band = 24; // the stage's deepest rows, repeated downward
    for (let y = top; y < H; y++) {
      const d = y - top;
      const src = (top - band + (d % band)) * W;
      const dst = y * W;
      const k = Math.min(3, 1 + Math.floor(d / 14));
      const t1 = dark[k];
      const t2 = dark[Math.min(3, k + 1)];
      const f = (d % 14) / 14;
      for (let x = 0; x < W; x++) px[dst + x] = (f > bayer(x, y) ? t2 : t1)[px[src + x]];
    }
  }

  get centerX() {
    return this.camX + this.W / 2;
  }
  weights() {
    return weightsAt(this.centerX);
  }
  dominant() {
    const w = this.weights();
    return w.indexOf(Math.max(...w));
  }

  /** Screen art coords of a critter, or null when it is off screen. */
  screenOf(c: Critter): [number, number] | null {
    let sx = c.wx - this.camX;
    sx = ((sx % WORLD) + WORLD) % WORLD;
    if (sx > WORLD - c.w - 16) sx -= WORLD;
    if (sx < -c.w - PAD || sx > this.W + PAD) return null;
    return [Math.round(sx), c.y + this.oy];
  }

  /** The critter under an art-pixel point, with a few pixels of slack for fingers. */
  pick(px: number, py: number, slack = 5): Critter | null {
    let best: Critter | null = null;
    let bestD = 1e9;
    for (const c of this.critters) {
      const s = this.screenOf(c);
      if (!s) continue;
      const [sx, sy] = s;
      if (px < sx - slack || px > sx + c.w + slack || py < sy - slack || py > sy + c.h + slack) continue;
      const d = Math.hypot(px - (sx + c.w / 2), py - (sy + c.h / 2));
      if (d < bestD) (bestD = d), (best = c);
    }
    return best;
  }

  setHover(c: Critter | null) {
    for (const k of this.critters) k.hover = k === c;
  }

  /** The next visible critter of a role, in turn: who will play the coming note. */
  nextFor(role: Role): Critter | null {
    const visible = this.critters.filter((k) => k.role === role && this.screenOf(k));
    if (!visible.length) return null;
    const n = (this.rr[role] = ((this.rr[role] ?? -1) + 1) % visible.length);
    return visible[n];
  }

  /** A role played: the critter answers with a stretch, sparks and a floating note. */
  play(role: Role, from: "band" | "player" | "echo", vel: number, who?: Critter | null) {
    const c = who ?? this.nextFor(role);
    if (!c) return;
    c.act = 1;
    c.pre = 0;
    const s = this.screenOf(c);
    if (!s) return;
    const wx = this.camX + s[0] + c.w / 2; // camera space, so sparks survive the world wrapping
    const wy = c.y + 2;
    const colors = [P.goldGlow, P.white, P.mint, P.pink, P.skyLight];
    const n = Math.round((from === "player" ? 8 : 2 + vel * 3) * (this.reduced ? 0.4 : 1));
    for (let i = 0; i < n; i++)
      this.sparks.push({ x: wx, y: wy, vx: (Math.random() - 0.5) * 40, vy: -16 - Math.random() * 30, life: 0.6 + Math.random() * 0.5, c: colors[i % colors.length] });
    if (from !== "echo" && role !== "hat") this.sparks.push({ x: wx, y: wy - 6, vx: (Math.random() - 0.5) * 8, vy: -18, life: 1.5, c: P.white, note: true });
  }

  /** A note from open sky: a ring of sparks where the finger is. */
  burst(px: number, py: number, color: number, size = 1) {
    const wx = this.camX + px;
    const wy = py - this.oy;
    const n = Math.round(6 + 10 * size);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = 22 + 26 * size;
      this.sparks.push({ x: wx, y: wy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + 0.25 * size, c: color });
    }
    if (size > 0.6) this.sparks.push({ x: wx, y: wy, vx: 0, vy: -22, life: 1.3, c: P.white, note: true });
    this.lights.push({ x: px, y: py, r: 12 + 16 * size, k: 1 });
  }

  /** The finger's ribbon: a point every pixel or so along the drag, fading in about half a second. */
  trail(id: number, x: number, y: number, c: number, speed = 0) {
    let t = this.trails.get(id);
    if (!t || !t.live) {
      t = { pts: [], live: true };
      this.trails.set(id, t);
    }
    const w = 1.6 + Math.min(2.6, speed / 220);
    const last = t.pts[t.pts.length - 1];
    if (last) {
      const d = Math.hypot(x - last.x, y - last.y);
      const n = Math.min(60, Math.floor(d / 1.2));
      for (let i = 1; i <= n; i++) t.pts.push({ x: last.x + ((x - last.x) * i) / (n + 1), y: last.y + ((y - last.y) * i) / (n + 1), c, age: 0, w });
    }
    t.pts.push({ x, y, c, age: 0, w });
    // The head sheds a sparkle now and then, more the faster it goes.
    if (Math.random() < 0.15 + Math.min(0.5, speed / 900))
      this.sparks.push({ x: this.camX + x, y: y - this.oy, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 20, life: 0.4 + Math.random() * 0.3, c: Math.random() < 0.5 ? P.white : c });
    if (t.pts.length > 400) t.pts.splice(0, t.pts.length - 400);
  }

  trailEnd(id: number) {
    const t = this.trails.get(id);
    if (!t) return;
    t.live = false;
    this.trails.delete(id);
    this.trails.set(this.retired++, t); // keeps fading under a retired key
  }

  /** The finger stirs the air: snow swirls, bubbles scatter, rain bends, fireflies flee. */
  stir(x: number, y: number, vx: number, vy: number) {
    const R2 = 46 * 46;
    for (const f of this.flakes) {
      const dx = f.x - this.camX - x;
      const dy = f.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 > R2) continue;
      const k = (1 - d2 / R2) * 0.18;
      f.vx += vx * k;
      f.vy += vy * k;
    }
    for (const sp of this.sparks) {
      const dx = sp.x - this.camX - x;
      const dy = sp.y + this.oy - y;
      if (dx * dx + dy * dy < R2) (sp.vx += vx * 0.05), (sp.vy += vy * 0.05);
    }
  }

  /** A shooting star thrown by a flick: it flies on and bursts once per note of its cascade. */
  fling(x: number, y: number, vx: number, vy: number, colors: number[], interval: number) {
    const sp = Math.hypot(vx, vy) || 1;
    const v = Math.min(420, sp);
    this.comets.push({ id: this.cometId--, x, y, vx: (vx / sp) * v, vy: (vy / sp) * v, colors, i: 0, timer: 0.02, interval });
  }

  update(dt: number, levels: { rms: number; low: number; high: number }, beat: number) {
    // Colour cycling: water and aurora flow with the overall level, stars and windows with the treble.
    const speed = [3 + 10 * levels.rms, 1.5 + 6 * levels.rms, 4 + 8 * levels.high, 1 + 10 * levels.high, 4 + 8 * levels.high, 0.6 + 4 * levels.high, 2 + 5 * levels.low, 1 + 6 * levels.high];
    for (let c = 0; c < this.phases.length; c++) this.phases[c] += dt * speed[c] * (this.reduced ? 0.4 : 1);
    for (const c of this.critters) {
      c.act = Math.max(0, c.act - dt * 2.4);
      c.pre = Math.max(0, c.pre - dt * 8);
    }
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += (s.note ? -2 : 60) * dt;
      s.vx *= 0.97;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.sparks.length > 300) this.sparks.splice(0, this.sparks.length - 300);
    for (const l of this.lights) l.k -= dt * 2;
    this.lights = this.lights.filter((l) => l.k > 0);
    for (const [id, t] of this.trails) {
      for (const p of t.pts) p.age += dt;
      while (t.pts.length && t.pts[0].age > TRAIL_LIFE) t.pts.shift();
      if (!t.live && !t.pts.length) this.trails.delete(id);
    }
    for (const c of this.comets) {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.vx *= 0.985;
      c.vy = c.vy * 0.985 + 30 * dt;
      // Bounce off the screen edges so the cascade stays in view.
      if (c.x < 4 || c.x > this.W - 4) c.vx = -c.vx;
      if (c.y < 4 || c.y > this.H - 30) c.vy = -Math.abs(c.vy) * (c.y < 4 ? -1 : 1);
      if (c.i < c.colors.length) {
        this.trail(c.id, c.x, c.y, c.colors[c.i], 300);
        c.timer -= dt;
        if (c.timer <= 0) {
          this.burst(c.x, c.y, c.colors[c.i], c.i === c.colors.length - 1 ? 1 : 0.55);
          c.i++;
          c.timer += c.interval;
          if (c.i >= c.colors.length) this.trailEnd(c.id);
        }
      }
    }
    this.comets = this.comets.filter((c) => c.i < c.colors.length);
    this.updateWeather(dt, beat);
  }

  private updateWeather(dt: number, _beat: number) {
    const w = this.weights();
    const kinds: Record<string, number> = {};
    this.art.forEach((a, i) => {
      if (a.weather && w[i] > 0.05) kinds[a.weather.kind] = (kinds[a.weather.kind] ?? 0) + a.weather.rate * w[i];
    });
    const area = this.W / 300;
    for (const [kind, rate] of Object.entries(kinds)) {
      let n = rate * area * dt * (this.reduced ? 0.4 : 1);
      while (n > 0) {
        if (Math.random() < n) this.flakes.push(this.spawn(kind));
        n -= 1;
      }
    }
    for (const f of this.flakes) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      // Each kind drifts back to its own motion after the finger has stirred it.
      const relax = Math.min(1, dt * 1.5);
      if (f.kind === "snow") (f.vx += (8 * Math.sin(f.y * 0.04 + f.x * 0.01) - f.vx) * relax), (f.vy += (18 - f.vy) * relax);
      else if (f.kind === "rain") (f.vx += (-20 - f.vx) * relax * 2), (f.vy += (190 - f.vy) * relax * 2);
      else if (f.kind === "bubbles") (f.vx *= 1 - relax), (f.vy += (-20 - f.vy) * relax);
      else if (f.kind === "dust") (f.vx += (-8 - f.vx) * relax), (f.vy *= 1 - relax);
      if (f.kind === "fireflies") (f.vx += (Math.random() - 0.5) * 40 * dt), (f.vy += (Math.random() - 0.5) * 40 * dt);
    }
    const H = this.H;
    this.flakes = this.flakes.filter((f) => f.y > -10 && f.y < H + 4 && f.x > this.camX - 30 && f.x < this.camX + this.W + 30);
    if (this.flakes.length > 500) this.flakes.splice(0, this.flakes.length - 500);
  }

  private spawn(kind: string): Flake {
    const x = this.camX + Math.random() * this.W;
    const H = this.H;
    switch (kind) {
      case "snow":
        return { x, y: -2, vx: 0, vy: 12 + Math.random() * 14, c: Math.random() < 0.7 ? P.white : P.pale, kind };
      case "rain":
        return { x: x + 30, y: -4, vx: -20, vy: 170 + Math.random() * 60, c: Math.random() < 0.5 ? P.indigo : P.lilac, kind };
      case "bubbles":
        return { x, y: H + 2, vx: 0, vy: -(14 + Math.random() * 18), c: Math.random() < 0.6 ? P.skyLight : P.foam, kind };
      case "fireflies":
        return { x, y: H - 30 - Math.random() * 170, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, c: P.goldGlow, kind };
      default:
        return { x, y: Math.random() * H, vx: -5 - Math.random() * 8, vy: 0, c: Math.random() < 0.5 ? P.lilac : P.mist, kind };
    }
  }

  // ---------- rendering ----------

  private drawLayer(li: number) {
    const { W, fb } = this;
    const px = fb.px;
    const oy = this.oy;
    const L = this.layers[li];
    const lw = L.w;
    // Every layer is centred on the same world point, so the biome behind matches the one in front.
    const lx = Math.floor(this.centerX * LAYER_F[li] - W / 2);
    for (let y = 0; y < STAGE; y++) {
      const sy = y + oy;
      if (sy < 0) continue;
      const src = y * lw;
      const dst = sy * W;
      let xx = ((lx % lw) + lw) % lw;
      for (let x = 0; x < W; x++) {
        const c = L.px[src + xx];
        if (c !== T) px[dst + x] = c;
        if (++xx === lw) xx = 0;
      }
    }
  }

  /**
   * Glow without blur: around each light, pixels step up the shade table with a Bayer-quantised
   * falloff. Two rings: an inner one two steps brighter, an outer one a single step.
   */
  private glow() {
    const { W, H, fb } = this;
    const px = fb.px;
    const l1 = light[1];
    const l2 = light[2];
    for (const l of this.lights) {
      const r = l.r;
      const x0 = Math.max(0, Math.floor(l.x - r));
      const x1 = Math.min(W - 1, Math.ceil(l.x + r));
      const y0 = Math.max(0, Math.floor(l.y - r));
      const y1 = Math.min(H - 1, Math.ceil(l.y + r));
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const d = Math.hypot(x - l.x, y - l.y) / r;
          if (d >= 1) continue;
          const v = (1 - d) * (1 - d) * l.k * 1.6;
          const b = bayer(x, y);
          const i = y * W + x;
          if (v - 0.6 > b) px[i] = l2[px[i]];
          else if (v > b) px[i] = l1[px[i]];
        }
    }
  }

  /**
   * Draw a critter through the compositor: into a scratch buffer, stretched or squashed around its
   * feet, rim-lit on the side facing the biome's light, then a selective outline (each edge pixel
   * outlined in a darker shade of itself, or a cycling highlight when hovered).
   */
  private drawCritter(c: Critter, sx: number, sy: number, anim: Anim) {
    const w = c.w + PAD * 2;
    const h = c.h + PAD * 2;
    if (w > this.scratch.w || h > this.scratch.h) {
      this.scratch = new Strip(Math.max(w, this.scratch.w), Math.max(h, this.scratch.h), T, false);
      this.scratch2 = new Strip(this.scratch.w, this.scratch.h, T, false);
    }
    const A = this.scratch;
    A.clear();
    anim.act = c.act;
    c.draw(A, PAD, PAD, anim);

    // Anticipation squashes, the hit stretches, then it settles.
    const hit = c.act > 0.72 ? (c.act - 0.72) / 0.28 : 0;
    const sv = 1 + 0.16 * hit - 0.1 * c.pre;
    let src = A;
    if (Math.abs(sv - 1) > 0.02) {
      const B = this.scratch2;
      B.clear();
      const sh = 1 / Math.sqrt(sv);
      const cx = PAD + c.w / 2;
      const bottom = PAD + c.h;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const ux = Math.round(cx + (x - cx) / sh);
          const uy = Math.round(bottom - (bottom - y) / sv);
          if (ux < 0 || uy < 0 || ux >= w || uy >= h) continue;
          const v = A.px[uy * A.w + ux];
          if (v !== T) B.px[y * B.w + x] = v;
        }
      src = B;
    }

    const art = this.art[c.biome];
    const [lx, ly] = art.toLight;
    const dx = Math.round(lx * 1.4);
    const dy = Math.round(ly * 1.4);
    const sw = src.w;
    const sp = src.px;
    const fb = this.fb;
    const ox = sx - PAD;
    const oy = sy - PAD;
    const hoverC = cyc(3, 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = sp[y * sw + x];
        if (v !== T) {
          // Rim light: the pixel's neighbour toward the light is empty.
          const nx = x + dx;
          const ny = y + dy;
          const open = nx < 0 || ny < 0 || nx >= w || ny >= h || sp[ny * sw + nx] === T;
          fb.set(ox + x, oy + y, open ? light[1][v] : v);
          continue;
        }
        if (c.noOutline && !c.hover) continue;
        // Selective outline: darker shade of the neighbouring sprite pixel.
        let nb = T;
        if (x > 0 && sp[y * sw + x - 1] !== T) nb = sp[y * sw + x - 1];
        else if (x < w - 1 && sp[y * sw + x + 1] !== T) nb = sp[y * sw + x + 1];
        else if (y > 0 && sp[(y - 1) * sw + x] !== T) nb = sp[(y - 1) * sw + x];
        else if (y < h - 1 && sp[(y + 1) * sw + x] !== T) nb = sp[(y + 1) * sw + x];
        if (nb === T) continue;
        fb.set(ox + x, oy + y, c.hover ? hoverC : nb >= 64 ? P.ink : dark[2][nb]);
      }
  }

  /** Ribbons: bright at the head, the note colour in the middle, dissolving with dither at the tail. */
  private drawTrails() {
    const fb = this.fb;
    for (const t of this.trails.values())
      for (const p of t.pts) {
        const f = p.age / TRAIL_LIFE;
        const x = Math.round(p.x);
        const y = Math.round(p.y);
        if (bayer(x, y) < f * f) continue;
        const r = p.w * (1 - f * 0.7);
        const c = f < 0.12 ? P.white : f < 0.55 ? p.c : dark[1][p.c];
        if (r < 1.2) fb.set(x, y, c);
        else fb.disc(x, y, r - 0.7, c);
      }
  }

  render(ctx: CanvasRenderingContext2D, t: number, levels: { rms: number }, beat: number) {
    const { W, H, fb } = this;
    const px = fb.px;
    const oy = this.oy;

    // Sky: the two skies under the camera, dissolved by weight.
    const [a, b, wb] = pairAt(this.centerX);
    const sa = this.skies[a].px;
    const sb = this.skies[b].px;
    if (wb <= 0) px.set(sa);
    else if (wb >= 1) px.set(sb);
    else
      for (let y = 0; y < H; y++) {
        const row = y * W;
        for (let x = 0; x < W; x++) px[row + x] = wb > bayer(x, y) ? sb[row + x] : sa[row + x];
      }

    for (let li = 0; li < FRONT; li++) this.drawLayer(li);
    this.underground();

    // Living scenery of the biomes under the camera, dissolved by weight at a border.
    {
      const live = { t, W, H, oy, camX: this.camX, level: levels.rms };
      const [la, lb, lw] = pairAt(this.centerX);
      if (lw < 0.97) this.art[la].live?.(this.fb, live);
      if (lb !== la && lw > 0.03) this.art[lb].live?.(this.fb, live);
    }

    // Lights for this frame: critters that glow, critters that just played, fireflies.
    const frameLights: Light[] = [];
    for (const c of this.critters) {
      if (!c.glow && c.act < 0.15) continue;
      const s = this.screenOf(c);
      if (!s) continue;
      const r = (c.glow ?? 0) + c.act * 22;
      frameLights.push({ x: s[0] + c.w / 2, y: s[1] + c.h / 2, r, k: Math.min(1, 0.45 + c.act) });
    }
    for (const f of this.flakes) if (f.kind === "fireflies") frameLights.push({ x: f.x - this.camX, y: f.y, r: 5, k: 0.7 });
    for (const t of this.trails.values()) {
      const head = t.pts[t.pts.length - 1];
      if (head && t.live) frameLights.push({ x: head.x, y: head.y, r: 18, k: 0.8 });
    }
    const persistent = this.lights;
    this.lights = persistent.concat(frameLights);
    this.glow();
    this.lights = persistent;

    // Weather behind the critters.
    for (const f of this.flakes) {
      const sx = Math.round(f.x - this.camX);
      const sy = Math.round(f.y);
      if (f.kind === "rain") {
        fb.set(sx, sy, f.c);
        fb.set(sx, sy - 1, f.c);
        fb.set(sx + 1, sy - 3, f.c);
        fb.set(sx + 1, sy - 4, f.c);
      } else if (f.kind === "fireflies") {
        if (Math.sin(t * 6 + f.x) > -0.3) fb.set(sx, sy, f.c);
      } else if (f.kind === "bubbles") {
        fb.set(sx, sy, f.c);
        if (f.x % 3 < 1) (fb.set(sx + 1, sy, f.c), fb.set(sx, sy - 1, f.c), fb.set(sx + 1, sy - 1, P.white));
      } else fb.set(sx, sy, f.c);
    }

    // Critters, with a contact shadow under the ones standing on the ground.
    const anim: Anim = { t, act: 0, beat, level: levels.rms };
    for (const c of this.critters) {
      const s = this.screenOf(c);
      if (!s) continue;
      if (c.y + c.h >= GROUND - 2) {
        const y = s[1] + c.h;
        for (let x = s[0] + 1; x < s[0] + c.w - 1; x++) fb.set(x, y, dark[1][fb.get(x, y)]);
      }
      this.drawCritter(c, s[0], s[1], anim);
    }

    this.drawLayer(FRONT);
    this.drawTrails();

    // Sparks and floating notes.
    for (const s of this.sparks) {
      const sx = Math.round(s.x - this.camX);
      const sy = Math.round(s.y + oy);
      if (s.note) {
        if (s.life < 0.3 && (s.life * 20) % 2 < 1) continue;
        // A 4x6 eighth note with a flag.
        fb.rect(sx + 2, sy, 1, 5, s.c);
        fb.set(sx + 3, sy + 1, s.c);
        fb.set(sx + 4, sy + 2, s.c);
        fb.rect(sx, sy + 4, 3, 2, s.c);
      } else {
        fb.set(sx, sy, s.c);
        if (s.life > 0.5) fb.set(sx + 1, sy, s.c);
      }
    }

    buildLut(this.lut, this.phases);
    const lut = this.lut;
    const u = this.u32;
    for (let i = 0; i < px.length; i++) u[i] = lut[px[i]];
    ctx.putImageData(this.img, 0, 0);
  }
}
