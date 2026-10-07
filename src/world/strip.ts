// An indexed pixel buffer with the few primitives the art needs (after vote-tree's Pix in
// ../vote-tree/src/web/pixel/canvas.ts, but indexed and wrapping in x, because the world loops).
import { T, type Ramp } from "./palette";

// 4x4 Bayer thresholds, 0..1.
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const bayer = (x: number, y: number) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export class Strip {
  readonly px: Uint8Array;
  constructor(readonly w: number, readonly h: number, fill = T, readonly wrap = true) {
    this.px = new Uint8Array(w * h).fill(fill);
  }
  private wx(x: number) {
    return ((Math.round(x) % this.w) + this.w) % this.w;
  }
  set(x: number, y: number, c: number) {
    y = Math.round(y);
    if (y < 0 || y >= this.h) return;
    if (!this.wrap) {
      x = Math.round(x);
      if (x < 0 || x >= this.w) return;
      this.px[y * this.w + x] = c;
      return;
    }
    this.px[y * this.w + this.wx(x)] = c;
  }
  get(x: number, y: number) {
    y = Math.round(y);
    if (y < 0 || y >= this.h) return T;
    return this.px[y * this.w + this.wx(x)];
  }
  rect(x: number, y: number, w: number, h: number, c: number) {
    for (let yy = Math.round(y); yy < Math.round(y + h); yy++) for (let xx = Math.round(x); xx < Math.round(x + w); xx++) this.set(xx, yy, c);
  }
  /** Filled disc; with c2, the side away from the light is dithered into c2. */
  disc(cx: number, cy: number, r: number, c: number, c2?: number, lx = -0.7, ly = -0.7) {
    const R = r + 0.5;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++)
      for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy > R * R) continue;
        if (c2 !== undefined) {
          const t = (-(dx * lx + dy * ly) / (R || 1)) * 0.5 + 0.5;
          this.set(x, y, t > bayer(x, y) + 0.2 ? c2 : c);
        } else this.set(x, y, c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number, w = 1) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let k = 0; k <= n; k++) {
      const x = x0 + ((x1 - x0) * k) / n;
      const y = y0 + ((y1 - y0) * k) / n;
      if (w <= 1) this.set(x, y, c);
      else this.disc(x, y, (w - 1) / 2, c);
    }
  }
  /** Fill below a ridge from x0..x1; the top `shade` rows dither from c2 into c. */
  ridge(x0: number, x1: number, top: (x: number) => number, c: number, c2?: number, shade = 4, bottom = this.h) {
    for (let x = Math.floor(x0); x < x1; x++) {
      const t0 = Math.round(top(x));
      for (let y = Math.max(0, t0); y < bottom; y++) {
        const d = y - t0;
        this.set(x, y, c2 !== undefined && d < shade && d / shade < bayer(x, y) ? c2 : c);
      }
    }
  }
  /** Vertical dithered gradient across x0..x1 between rows y0..y1 through colours. */
  bands(x0: number, x1: number, y0: number, y1: number, colors: number[], seam = 4) {
    const n = colors.length;
    const step = (y1 - y0) / n;
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(this.h, Math.round(y1)); y++) {
      const f = (y - y0) / step;
      const i = Math.min(n - 1, Math.floor(f));
      const toNext = step - (f - i) * step;
      for (let x = Math.floor(x0); x < x1; x++) {
        let c = colors[i];
        if (i < n - 1 && toNext < seam && 1 - toNext / seam > bayer(x, y)) c = colors[i + 1];
        this.set(x, y, c);
      }
    }
  }

  /**
   * A shaded ellipse: each pixel takes a ramp step from how much its surface faces the light
   * (lx, ly points toward the light, screen y down). Hard bands, no dither: sprites stay clean.
   */
  blob(cx: number, cy: number, rx: number, ry: number, ramp: Ramp, lx = -0.6, ly = -0.8, bias = 0) {
    const n = ramp.length;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / (rx + 0.5);
        const ny = (y - cy) / (ry + 0.5);
        const r2 = nx * nx + ny * ny;
        if (r2 > 1) continue;
        const nz = Math.sqrt(1 - r2);
        const lit = (nx * lx + ny * ly) * 0.75 + nz * 0.55 + bias;
        const k = Math.max(0, Math.min(n - 1, Math.floor(((lit + 0.35) / 1.4) * n)));
        this.set(x, y, ramp[k]);
      }
  }
  /** A shaded box: lit face, body, shadow face, by the light's side. */
  box(x: number, y: number, w: number, h: number, ramp: Ramp, lx = -0.6) {
    const n = ramp.length;
    const mid = Math.min(n - 1, Math.floor(n / 2));
    this.rect(x, y, w, h, ramp[mid]);
    const litX = lx < 0 ? x : x + w - 1;
    const shX = lx < 0 ? x + w - 1 : x;
    this.rect(litX, y, 1, h, ramp[Math.min(n - 1, mid + 1)]);
    this.rect(shX, y, 1, h, ramp[Math.max(0, mid - 1)]);
    this.rect(x, y, w, 1, ramp[Math.min(n - 1, mid + 1)]);
  }
  /** Copy a rectangle of pixels (non-transparent) from another strip. */
  blit(src: Strip, sx: number, sy: number, w: number, h: number, dx: number, dy: number) {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const c = src.px[(sy + y) * src.w + sx + x];
        if (c !== T) this.set(dx + x, dy + y, c);
      }
  }
  clear(c = T) {
    this.px.fill(c);
  }
  /** Rows of characters through a key; '.' and unknown characters are transparent. */
  sprite(x: number, y: number, rows: readonly string[], key: Record<string, number>, flip = false) {
    for (let j = 0; j < rows.length; j++) {
      const row = rows[j];
      for (let i = 0; i < row.length; i++) {
        const c = key[row[flip ? row.length - 1 - i : i]];
        if (c !== undefined) this.set(x + i, y + j, c);
      }
    }
  }
}

/** Deterministic hash noise in 0..1 for (x, seed): the art is the same on every load. */
export function hash(x: number, seed = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(seed | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth 1-D value noise. */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}
