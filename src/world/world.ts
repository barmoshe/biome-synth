// The world: three parallax layers painted once (biomes dissolved into each other with Bayer
// dithering), a sky per biome blended by the camera, live critters, weather and sparks, and a
// colour-cycling lookup table driven by the music. One putImageData per frame at art resolution;
// CSS scales it up with image-rendering: pixelated.
import { BIOMES, type Role } from "../shared/biomes";
import { buildLut, CYCLES, P, T } from "./palette";
import { bayer, hash, Strip } from "./strip";
import { AUTHOR_W, BLEND, BW, LAYER_F, NB, STAGE, WORLD, type Anim, type BiomeArt, type CritterSpec } from "./types";
import { ART } from "./biomes";

export type Critter = CritterSpec & { biome: number; wx: number; act: number; flip: boolean };

type Spark = { x: number; y: number; vx: number; vy: number; life: number; c: number; note?: boolean };
type Flake = { x: number; y: number; vx: number; vy: number; c: number; kind: string };

const smooth = (t: number) => t * t * (3 - 2 * t);

/** The two biomes blended at world x, and the right one's weight (0 = all left). */
export function pairAt(x: number): [number, number, number] {
  const wx = ((x % WORLD) + WORLD) % WORLD;
  const i = Math.floor(wx / BW);
  const local = wx - i * BW;
  if (local < BLEND) {
    const t = smooth((local + BLEND) / (2 * BLEND));
    return [(i + NB - 1) % NB, i, t];
  }
  if (local > BW - BLEND) {
    const t = smooth((local - (BW - BLEND)) / (2 * BLEND));
    return [i, (i + 1) % NB, t];
  }
  return [i, i, 0];
}

export function weightsAt(x: number): number[] {
  const w = [0, 0, 0, 0, 0];
  const [a, b, t] = pairAt(x);
  w[a] += 1 - t;
  w[b] += t;
  return w;
}

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
  phases = new Array(CYCLES.length).fill(0);
  private sparks: Spark[] = [];
  private flakes: Flake[] = [];
  private rr: Partial<Record<string, number>> = {};
  private art: BiomeArt[] = ART;

  constructor() {
    this.layers = LAYER_F.map((f) => this.paintLayer(f));
    this.critters = this.art.flatMap((a, biome) =>
      a.critters.map((c, i) => ({ ...c, biome, wx: biome * BW + Math.round((c.x * BW) / AUTHOR_W), act: 0, flip: hash(i, biome) < 0.3 })),
    );
  }

  /** Paint one parallax layer: every biome into its own strip, then dissolve at the borders. */
  private paintLayer(f: number): Strip {
    const len = Math.round(WORLD * f);
    const temps = this.art.map((a, i) => {
      const s = new Strip(len, STAGE);
      const ctx = { s, x0: i * BW * f, x1: (i + 1) * BW * f, f };
      if (f === LAYER_F[0]) a.far(ctx);
      else if (f === LAYER_F[1]) a.mid(ctx);
      else a.near(ctx);
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
    if (sx > WORLD - c.w - 8) sx -= WORLD;
    if (sx < -c.w || sx > this.W) return null;
    return [Math.round(sx), c.y + (this.H - STAGE)];
  }

  /** The critter under an art-pixel point, with a few pixels of slack for fingers. */
  pick(px: number, py: number, slack = 4): Critter | null {
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

  /** A role played: the critter (or the next visible one of that role, in turn) answers. */
  play(role: Role, from: "band" | "player" | "echo", vel: number, who?: Critter) {
    let c = who;
    if (!c) {
      const visible = this.critters.filter((k) => k.role === role && this.screenOf(k));
      if (!visible.length) return;
      const n = (this.rr[role] = ((this.rr[role] ?? -1) + 1) % visible.length);
      c = visible[n];
    }
    c.act = Math.min(1, 0.5 + vel * 0.6);
    const s = this.screenOf(c);
    if (!s) return;
    const wx = this.camX + s[0] + c.w / 2; // camera space, so sparks survive the world wrapping
    const wy = c.y + 2;
    const colors = [P.goldGlow, P.white, P.mint, P.pink, P.skyLight];
    const n = from === "player" ? 7 : 3;
    for (let i = 0; i < n; i++)
      this.sparks.push({ x: wx, y: wy, vx: (Math.random() - 0.5) * 30, vy: -12 - Math.random() * 25, life: 0.6 + Math.random() * 0.5, c: colors[(i + BIOMES.length) % colors.length] });
    if (from !== "echo" && role !== "hat") this.sparks.push({ x: wx, y: wy - 4, vx: (Math.random() - 0.5) * 6, vy: -14, life: 1.4, c: P.white, note: true });
  }

  /** A note from open sky: a ring of sparks where the finger is. */
  burst(px: number, py: number, color: number) {
    const wx = this.camX + px;
    const wy = py - (this.H - STAGE);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.sparks.push({ x: wx, y: wy, vx: Math.cos(a) * 28, vy: Math.sin(a) * 28, life: 0.5, c: color });
    }
    this.sparks.push({ x: wx, y: wy, vx: 0, vy: -16, life: 1.2, c: P.white, note: true });
  }

  update(dt: number, levels: { rms: number; low: number; high: number }, beat: number) {
    // Colour cycling: water and aurora flow with the overall level, stars and windows with the treble.
    const speed = [3 + 10 * levels.rms, 1.5 + 6 * levels.rms, 4 + 8 * levels.high, 1 + 10 * levels.high, 4 + 8 * levels.high, 0.6 + 4 * levels.high, 2 + 5 * levels.low, 1 + 6 * levels.high];
    for (let c = 0; c < this.phases.length; c++) this.phases[c] += dt * speed[c];
    for (const c of this.critters) c.act = Math.max(0, c.act - dt * 2.2);

    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += (s.note ? -2 : 40) * dt;
      s.vx *= 0.97;
      s.life -= dt;
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    if (this.sparks.length > 240) this.sparks.splice(0, this.sparks.length - 240);

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
      let n = rate * area * dt;
      while (n > 0) {
        if (Math.random() < n) this.flakes.push(this.spawn(kind));
        n -= 1;
      }
    }
    for (const f of this.flakes) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.kind === "snow") f.vx = 6 * Math.sin(f.y * 0.05 + f.x);
      if (f.kind === "fireflies") (f.vx += (Math.random() - 0.5) * 30 * dt), (f.vy += (Math.random() - 0.5) * 30 * dt);
    }
    const H = this.H;
    this.flakes = this.flakes.filter((f) => f.y > -10 && f.y < H + 4 && f.x > this.camX - 20 && f.x < this.camX + this.W + 20);
    if (this.flakes.length > 400) this.flakes.splice(0, this.flakes.length - 400);
  }

  private spawn(kind: string): Flake {
    const x = this.camX + Math.random() * this.W;
    switch (kind) {
      case "snow":
        return { x, y: -2, vx: 0, vy: 10 + Math.random() * 10, c: Math.random() < 0.7 ? P.white : P.pale, kind };
      case "rain":
        return { x: x + 20, y: -4, vx: -14, vy: 120 + Math.random() * 40, c: Math.random() < 0.5 ? P.indigo : P.lilac, kind };
      case "bubbles":
        return { x, y: this.H + 2, vx: 0, vy: -(10 + Math.random() * 14), c: Math.random() < 0.6 ? P.skyLight : P.foam, kind };
      case "fireflies":
        return { x, y: this.H - 20 - Math.random() * 120, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, c: P.goldGlow, kind };
      default:
        return { x, y: Math.random() * this.H, vx: -4 - Math.random() * 6, vy: 0, c: Math.random() < 0.5 ? P.lilac : P.mist, kind };
    }
  }

  render(ctx: CanvasRenderingContext2D, t: number, levels: { rms: number }, beat: number) {
    const { W, H, fb } = this;
    const px = fb.px;
    const oy = H - STAGE;

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

    // Parallax layers.
    for (let li = 0; li < this.layers.length; li++) {
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

    // Weather behind the critters.
    for (const f of this.flakes) {
      const sx = Math.round(f.x - this.camX);
      const sy = Math.round(f.y);
      if (f.kind === "rain") {
        fb.set(sx, sy, f.c);
        fb.set(sx, sy - 1, f.c);
        fb.set(sx + 1, sy - 2, f.c);
      } else if (f.kind === "fireflies") {
        if (Math.sin(t * 6 + f.x) > -0.3) fb.set(sx, sy, f.c);
      } else fb.set(sx, sy, f.c);
    }

    // Critters.
    const anim: Anim = { t, act: 0, beat, level: levels.rms };
    for (const c of this.critters) {
      const s = this.screenOf(c);
      if (!s) continue;
      anim.act = c.act;
      c.draw(fb, s[0], s[1], anim);
    }

    // Sparks and floating notes.
    for (const s of this.sparks) {
      const sx = Math.round(s.x - this.camX);
      const sy = Math.round(s.y + oy);
      if (s.note) {
        if (s.life < 0.3 && (s.life * 20) % 2 < 1) continue;
        // A 3x5 eighth note.
        fb.set(sx + 2, sy, s.c);
        fb.set(sx + 2, sy + 1, s.c);
        fb.set(sx + 3, sy + 1, s.c);
        fb.set(sx + 2, sy + 2, s.c);
        fb.set(sx + 2, sy + 3, s.c);
        fb.rect(sx, sy + 3, 2, 2, s.c);
      } else fb.set(sx, sy, s.c);
    }

    buildLut(this.lut, this.phases);
    const lut = this.lut;
    const u = this.u32;
    for (let i = 0; i < px.length; i++) u[i] = lut[px[i]];
    ctx.putImageData(this.img, 0, 0);
  }
}
