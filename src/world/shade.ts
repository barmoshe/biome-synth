// Shade tables: the indexed-palette way to light things (Doom's COLORMAP, Allegro's light tables),
// matched in OKLab so the steps look even. dark[k][i] / light[k][i] move colour i k steps down or
// up its ramp, hue-shifted the way pixel artists do it: shadows cool toward blue-violet,
// highlights warm toward yellow. fogTable() pulls every colour toward a biome's air colour.
import { CYCLE_BASE, HEX, T } from "./palette";

type Lab = [number, number, number];

function toLab(hex: string): Lab {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const r = lin(parseInt(hex.slice(0, 2), 16) / 255);
  const g = lin(parseInt(hex.slice(2, 4), 16) / 255);
  const b = lin(parseInt(hex.slice(4, 6), 16) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export const LAB = HEX.map(toLab);
const N = HEX.length;

const dist = (a: Lab, b: Lab) => {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl * 1.4 + da * da + db * db; // lightness weighs a little more: it carries the form
};

function nearest(target: Lab, ok: (j: number) => boolean = () => true): number {
  let best = 0;
  let bd = Infinity;
  for (let j = 0; j < N; j++) {
    if (!ok(j)) continue;
    const d = dist(target, LAB[j]);
    if (d < bd) (bd = d), (best = j);
  }
  return best;
}

/** One step down or up from colour i, hue-shifted. Always a different, darker/lighter colour when one exists. */
function step(i: number, dir: 1 | -1): number {
  const [L, a, b] = LAB[i];
  const target: Lab = dir < 0 ? [L - 0.1, a + 0.012, b - 0.03] : [L + 0.09, a - 0.004, b + 0.03];
  const j = nearest(target, (k) => k !== i && (dir < 0 ? LAB[k][0] < L - 0.02 : LAB[k][0] > L + 0.02));
  return Number.isFinite(dist(target, LAB[j])) && (dir < 0 ? LAB[j][0] < L : LAB[j][0] > L) ? j : i;
}

function identity(): Uint8Array {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) t[i] = i;
  return t;
}

/** dark[k] and light[k], k = 1..3: tables over all 256 indices (cycle slots and transparent map to themselves). */
export const dark: Uint8Array[] = [identity()];
export const light: Uint8Array[] = [identity()];
for (let k = 1; k <= 3; k++) {
  const d = identity();
  const l = identity();
  for (let i = 0; i < N; i++) {
    d[i] = step(dark[k - 1][i], -1);
    l[i] = step(light[k - 1][i], 1);
  }
  dark.push(d);
  light.push(l);
}

/** Pull every colour `amount` (0..1) of the way toward `air` in OKLab. Cycle slots are lights: untouched. */
export function fogTable(air: number, amount: number): Uint8Array {
  const t = identity();
  const A = LAB[air];
  for (let i = 0; i < N; i++) {
    const c = LAB[i];
    t[i] = nearest([c[0] + (A[0] - c[0]) * amount, c[1] + (A[1] - c[1]) * amount, c[2] + (A[2] - c[2]) * amount]);
  }
  t[T] = T;
  for (let i = CYCLE_BASE; i < CYCLE_BASE + 64; i++) t[i] = i;
  return t;
}

/** Apply a table to a buffer in place. */
export function remap(px: Uint8Array, table: Uint8Array) {
  for (let i = 0; i < px.length; i++) px[i] = table[px[i]];
}
