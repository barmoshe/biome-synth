// Renders the world to PNGs without a browser: `npx vitest run scripts/snap.test.ts`.
// Writes to $SNAP_DIR (default ./snaps), one frame per biome centre and per border.
import { writeFileSync, mkdirSync } from "node:fs";
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
function png(w: number, h: number, rgba: Uint8ClampedArray, scale: number) {
  const W = w * scale, H = h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const s = ((Math.floor(y / scale) * w + Math.floor(x / scale)) * 4);
      raw.set(rgba.subarray(s, s + 4), y * (W * 4 + 1) + 1 + x * 4);
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

it("snaps", async () => {
  const { World } = await import("../src/world/world");
  const { BW } = await import("../src/world/types");
  const dir = process.env.SNAP_DIR ?? "snaps";
  mkdirSync(dir, { recursive: true });
  const w = new World();
  const [sw, sh] = (process.env.SNAP_SIZE ?? "504x253").split("x").map(Number);
  w.resize(sw, sh);
  const shots: [string, number][] = [];
  ["orbit", "aurora", "deep", "canopy", "neon"].forEach((n, i) => shots.push([n, i * BW + BW / 2]));
  ["orbit-aurora", "aurora-deep", "deep-canopy", "canopy-neon", "neon-orbit"].forEach((n, i) => shots.push([n, (i + 1) * BW]));
  let ctxImg: any = null;
  const ctx = { putImageData: (img: any) => (ctxImg = img) } as any;
  for (const [name, cx] of shots) {
    w.camX = cx - sw / 2;
    // Light every critter up on alternate shots so both states get seen.
    for (const c of w.critters) c.act = name.includes("-") ? 0 : 0.8;
    w.update(0.016, { rms: 0.3, low: 0.3, high: 0.3 }, 0);
    w.render(ctx, 3.3, { rms: 0.3 }, 0);
    writeFileSync(`${dir}/${name}.png`, png(sw, sh, ctxImg.data, Number(process.env.SNAP_SCALE ?? 3)));
  }
}, 120000);
