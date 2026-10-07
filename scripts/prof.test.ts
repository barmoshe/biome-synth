import { it } from "vitest";
it("profile paint", async () => {
  (globalThis as any).ImageData = class { data: Uint8ClampedArray; constructor(public width: number, public height: number) { this.data = new Uint8ClampedArray(width * height * 4); } };
  const { ART } = await import("../src/world/biomes");
  const { Strip } = await import("../src/world/strip");
  const { BW, WORLD, STAGE, LAYER_F } = await import("../src/world/types");
  const a = ART[3];
  for (const [li, name] of ["far", "mid", "near", "front"].entries()) {
    const f = LAYER_F[li];
    const s = new Strip(Math.round(WORLD * f), STAGE);
    const t0 = performance.now();
    (a as any)[name]?.({ s, x0: 3 * BW * f, x1: 4 * BW * f, f });
    console.log(name, (performance.now() - t0).toFixed(0), "ms");
  }
  const { World } = await import("../src/world/world");
  const t1 = performance.now();
  new World();
  console.log("world", (performance.now() - t1).toFixed(0), "ms");
}, 60000);
