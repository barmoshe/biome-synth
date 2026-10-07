// Small helpers for living scenery: positions that loop across the screen, and streaks.
import { bayer, type Strip } from "./strip";

/** A position that travels across the screen and loops, with a margin either side. */
export const loopX = (v: number, W: number, margin = 60) => ((((v % (W + margin * 2)) + W + margin * 2) % (W + margin * 2)) - margin);

/** A fading streak from (x, y) back along (dx, dy), coloured head to tail. */
export function streak(f: Strip, x: number, y: number, dx: number, dy: number, len: number, colors: number[]) {
  const n = Math.hypot(dx, dy) || 1;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    const px = Math.round(x - (dx / n) * i);
    const py = Math.round(y - (dy / n) * i);
    if (t > 0.3 && t > bayer(px, py) + 0.25) continue;
    f.set(px, py, colors[Math.min(colors.length - 1, Math.floor(t * colors.length))]);
  }
}
