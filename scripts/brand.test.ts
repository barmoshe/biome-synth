// App icons and the share image, drawn by the game's own renderer: `SNAP=brand npx vitest run`.
// Writes public/icon-192.png, icon-512.png, apple-touch-icon.png, favicon.png and og.png.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { it } from "vitest";

class FakeImageData {
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}
(globalThis as any).ImageData = FakeImageData;

function crc32(buf: Uint8Array) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function png(w: number, h: number, rgba: Uint8Array | Uint8ClampedArray, scale: number) {
  const W = w * scale, H = h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = (Math.floor(y / scale) * w + Math.floor(x / scale)) * 4;
      raw.set(rgba.subarray(s, s + 4), y * (W * 4 + 1) + 1 + x * 4);
    }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// A 5x7 pixel font for the few words the share image needs.
const FONT: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  B: ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  H: ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  M: ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
  N: ["#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  P: ["####.", "#...#", "#...#", "####.", "#....", "#....", "#...."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  S: [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  W: ["#...#", "#...#", "#...#", "#.#.#", "#.#.#", "##.##", "#...#"],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  Y: ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

it("draws the brand assets", async () => {
  const { World } = await import("../src/world/world");
  const { Strip } = await import("../src/world/strip");
  const { P, R, RGBA, CYCLE_BASE, buildLut } = await import("../src/world/palette");
  const { BW } = await import("../src/world/types");

  const toRgba = (s: InstanceType<typeof Strip>) => {
    const lut = new Uint32Array(256);
    buildLut(lut, [2, 3, 1, 4, 2, 3, 1, 2]);
    const out = new Uint8Array(s.w * s.h * 4);
    const u = new Uint32Array(out.buffer);
    for (let i = 0; i < s.px.length; i++) u[i] = s.px[i] === 255 ? 0 : lut[s.px[i]];
    return out;
  };
  void RGBA;
  void CYCLE_BASE;

  // The icon: a ringed planet over a moon horizon, in the palette.
  const ic = new Strip(32, 32, P.ink, false);
  ic.bands(0, 32, 0, 32, [P.ink, P.plum, P.navy], 3);
  for (const [x, y] of [[4, 5], [26, 3], [21, 9], [7, 14], [28, 16]]) ic.set(x, y, P.white);
  ic.ridge(0, 32, (x) => 25 + Math.round(Math.sin(x * 0.4) * 1.2), P.dusk, P.mist, 2);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    if (Math.sin(a) < 0) ic.set(16 + Math.cos(a) * 13, 15 + Math.sin(a) * 3, P.honey);
  }
  ic.blob(16, 15, 8, 8, R.pink, -0.7, -0.7);
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    if (Math.sin(a) >= 0) ic.set(16 + Math.cos(a) * 13, 15 + Math.sin(a) * 3, P.goldGlow);
  }
  const icon = toRgba(ic);
  writeFileSync("public/icon-512.png", png(32, 32, icon, 16));
  writeFileSync("public/icon-192.png", png(32, 32, icon, 6));
  writeFileSync("public/apple-touch-icon.png", png(32, 32, icon, 6));
  writeFileSync("public/favicon.png", png(32, 32, icon, 2));

  // The share image: 400x210 art at 3x is exactly 1200x630. Canopy, with the title on top.
  const w = new World();
  w.resize(400, 210);
  w.camX = 3 * BW + BW / 2 - 200 - 120;
  for (let i = 0; i < 30; i++) w.update(0.05, { rms: 0.3, low: 0.3, high: 0.3 }, 0);
  let img: { data: Uint8ClampedArray } | null = null;
  w.render({ putImageData: (d: { data: Uint8ClampedArray }) => (img = d) } as never, 4.2, { rms: 0.3 }, 0);
  const og = img!.data;
  const put = (x: number, y: number, rgb: number) => {
    if (x < 0 || y < 0 || x >= 400 || y >= 210) return;
    const k = (y * 400 + x) * 4;
    og[k] = rgb & 255;
    og[k + 1] = (rgb >>> 8) & 255;
    og[k + 2] = (rgb >>> 16) & 255;
    og[k + 3] = 255;
  };
  const text = (s: string, x0: number, y0: number, size: number, c: number, shadow: number) => {
    let x = x0;
    for (const ch of s) {
      const g = FONT[ch] ?? FONT[" "];
      for (let j = 0; j < 7; j++)
        for (let i = 0; i < 5; i++)
          if (g[j][i] === "#")
            for (let dy = 0; dy < size; dy++)
              for (let dx = 0; dx < size; dx++) {
                put(x + i * size + dx + size, y0 + j * size + dy + size, RGBA[shadow]);
                put(x + i * size + dx, y0 + j * size + dy, RGBA[c]);
              }
      x += 6 * size;
    }
    return x - x0;
  };
  const title = "BIOME SYNTH";
  const tw = title.length * 6 * 3;
  text(title, Math.round((400 - tw) / 2), 26, 3, P.goldGlow, P.ink);
  const sub = "A PIXEL WORLD YOU PLAY";
  text(sub, Math.round((400 - sub.length * 6) / 2), 58, 1, P.white, P.ink);
  writeFileSync("public/og.png", png(400, 210, og, 3));
}, 120000);
