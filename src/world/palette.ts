// Resurrect 64 by Kerrie Lake (lospec.com/palette-list/resurrect-64), the palette vote-tree uses.
// Every pixel on screen is an index: 0..63 the palette, 64..127 colour-cycling slots whose colour
// moves every frame (water, aurora, neon, twinkling stars), 255 transparent in layers.

export const HEX = [
  "2e222f", "3e3546", "625565", "966c6c", "ab947a", "694f62", "7f708a", "9babb2",
  "c7dcd0", "ffffff", "6e2727", "b33831", "ea4f36", "f57d4a", "ae2334", "e83b3b",
  "fb6b1d", "f79617", "f9c22b", "7a3045", "9e4539", "cd683d", "e6904e", "fbb954",
  "4c3e24", "676633", "a2a947", "d5e04b", "fbff86", "165a4c", "239063", "1ebc73",
  "91db69", "cddf6c", "313638", "374e4a", "547e64", "92a984", "b2ba90", "0b5e65",
  "0b8a8f", "0eaf9b", "30e1b9", "8ff8e2", "323353", "484a77", "4d65b4", "4d9be6",
  "8fd3ff", "45293f", "6b3e75", "905ea9", "a884f3", "eaaded", "753c54", "a24b6f",
  "cf657f", "ed8099", "831c5d", "c32454", "f04f78", "f68181", "fca790", "fdcbb0",
];

// Names for the indices the art uses, so the biome painters read like a paint box.
export const P = {
  ink: 0, plum: 1, dusk: 2, mauve: 3, stone: 4, grape: 5, lavGrey: 6, mist: 7,
  pale: 8, white: 9, wine: 10, red: 11, anemone: 12, orange: 13, crimson: 14, scarlet: 15,
  flame: 16, amber: 17, gold: 18, berry: 19, rust: 20, clay: 21, sand: 22, honey: 23,
  brownDeep: 24, olive: 25, oliveLight: 26, lime: 27, goldGlow: 28, pineDeep: 29, pine: 30, green: 31,
  leaf: 32, chartreuse: 33, charcoal: 34, sageDeep: 35, sage: 36, sageLight: 37, sagePale: 38, tealDeep: 39,
  teal: 40, aqua: 41, mint: 42, foam: 43, navy: 44, indigo: 45, blue: 46, sky: 47,
  skyLight: 48, barkDeep: 49, violet: 50, purple: 51, lilac: 52, pinkPale: 53, plumRose: 54, rose: 55,
  pinkDeep: 56, pink: 57, magentaDeep: 58, magenta: 59, hotPink: 60, salmon: 61, peach: 62, blush: 63,
} as const;

export const T = 255; // transparent
export const CYCLE_BASE = 64;

/** Colour-cycling ramps. A layer pixel 64 + c*8 + k shows ramp[(k + phase) % len]. */
export const CYCLES: number[][] = [
  [P.navy, P.blue, P.sky, P.skyLight, P.foam, P.skyLight, P.sky, P.blue], // 0 water
  [P.pineDeep, P.pine, P.green, P.mint, P.foam, P.mint, P.aqua, P.lilac], // 1 aurora
  [P.magentaDeep, P.magenta, P.hotPink, P.pink, P.blush, P.pink, P.hotPink, P.magenta], // 2 neon pink
  [P.indigo, P.indigo, P.lavGrey, P.mist, P.white, P.mist, P.indigo, P.indigo], // 3 twinkle
  [P.tealDeep, P.teal, P.aqua, P.mint, P.foam, P.mint, P.aqua, P.teal], // 4 neon cyan
  [P.brownDeep, P.amber, P.gold, P.goldGlow, P.gold, P.amber, P.brownDeep, P.brownDeep], // 5 windows / fireflies
  [P.tealDeep, P.tealDeep, P.teal, P.aqua, P.teal, P.tealDeep, P.navy, P.navy], // 6 deep shimmer
  [P.indigo, P.blue, P.sky, P.white, P.sky, P.blue, P.indigo, P.navy], // 7 ice glint
];
export const cyc = (c: number, k: number) => CYCLE_BASE + c * 8 + (((k % 8) + 8) % 8);

const rgba = (hex: string) => {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0; // little-endian ImageData word
};
export const RGBA = HEX.map(rgba);

const lerpWord = (a: number, b: number, t: number) => {
  const r = (a & 255) + ((b & 255) - (a & 255)) * t;
  const g = ((a >>> 8) & 255) + (((b >>> 8) & 255) - ((a >>> 8) & 255)) * t;
  const bl = ((a >>> 16) & 255) + (((b >>> 16) & 255) - ((a >>> 16) & 255)) * t;
  return ((255 << 24) | (Math.round(bl) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
};

/**
 * The per-frame lookup table: palette + cycle slots at their current phase. Between whole steps
 * the slot colour blends to the next ramp colour (Huckaby's BlendShift for Ferrari's scenes), so
 * slow cycles glide instead of ticking.
 */
export function buildLut(lut: Uint32Array, phases: number[]) {
  for (let i = 0; i < 64; i++) lut[i] = RGBA[i];
  for (let c = 0; c < CYCLES.length; c++) {
    const ramp = CYCLES[c];
    const n = ramp.length;
    const p = phases[c] ?? 0;
    const ph = Math.floor(p);
    const fr = p - ph;
    for (let k = 0; k < 8; k++) {
      const i0 = ((((k + ph) % n) + n) % n);
      lut[CYCLE_BASE + c * 8 + k] = lerpWord(RGBA[ramp[i0]], RGBA[ramp[(i0 + 1) % n]], fr);
    }
  }
  lut[T] = RGBA[P.ink];
}

export const cssColor = (i: number) => `#${HEX[i]}`;

/** Material ramps, dark to light, for shading shapes (hue-shifted along Resurrect 64's own ramps). */
export const R = {
  leaf: [P.pineDeep, P.pine, P.green, P.leaf, P.chartreuse],
  moss: [P.sageDeep, P.sage, P.sageLight, P.sagePale],
  fur: [P.barkDeep, P.brownDeep, P.rust, P.clay, P.sand],
  skin: [P.rust, P.clay, P.sand, P.peach, P.blush],
  ice: [P.navy, P.blue, P.sky, P.skyLight, P.white],
  snow: [P.lavGrey, P.mist, P.pale, P.white],
  rock: [P.ink, P.plum, P.dusk, P.lavGrey, P.mist],
  stone: [P.charcoal, P.sageDeep, P.sage, P.sageLight],
  pink: [P.magentaDeep, P.pinkDeep, P.hotPink, P.pink, P.blush],
  rose: [P.berry, P.plumRose, P.rose, P.pinkDeep, P.salmon],
  gold: [P.rust, P.amber, P.gold, P.goldGlow],
  red: [P.wine, P.crimson, P.scarlet, P.anemone, P.salmon],
  orange: [P.rust, P.clay, P.flame, P.orange, P.peach],
  teal: [P.tealDeep, P.teal, P.aqua, P.mint, P.foam],
  violet: [P.barkDeep, P.violet, P.purple, P.lilac, P.pinkPale],
  metal: [P.ink, P.charcoal, P.dusk, P.lavGrey, P.mist, P.pale],
  indigo: [P.ink, P.navy, P.indigo, P.blue, P.sky],
  sand: [P.rust, P.clay, P.sand, P.honey, P.blush],
  ink: [P.ink, P.plum, P.dusk],
  white: [P.mist, P.pale, P.white],
} as const;
export type Ramp = readonly number[];
