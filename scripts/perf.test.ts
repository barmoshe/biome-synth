// Frame cost of the world renderer, headless: `SNAP=perf npx vitest run`.
import { it } from "vitest";
it("frame cost", async () => {
  (globalThis as any).ImageData = class { data: Uint8ClampedArray; constructor(public width: number, public height: number) { this.data = new Uint8ClampedArray(width * height * 4); } };
  const { World } = await import("../src/world/world");
  const { BW } = await import("../src/world/types");
  const ctx = { putImageData() {} } as any;
  for (const [w, h, label] of [[504, 254, "MacBook 14 window"], [480, 270, "1080p"], [250, 542, "phone portrait"]] as const) {
    const world = new World();
    world.resize(w, h);
    for (const biome of [0, 3, 4]) {
      world.camX = biome * BW + BW / 2 - w / 2;
      for (const c of world.critters) c.act = 0.6;
      const times: number[] = [];
      for (let i = 0; i < 240; i++) {
        const t0 = performance.now();
        world.camX += 0.15;
        world.update(1 / 60, { rms: 0.3, low: 0.3, high: 0.3 }, 0);
        world.render(ctx, i / 60, { rms: 0.3 }, 0);
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      console.log(`${label} biome ${biome}: median ${times[120].toFixed(2)} ms, p95 ${times[228].toFixed(2)} ms`);
    }
  }
}, 120000);
