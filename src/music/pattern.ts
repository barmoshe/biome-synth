// The section format: what the worlds and the mind write together.
// A section says how much of each layer plays and how hard, plus an optional motif and chord plan;
// each world interprets it through its own genre and mechanic. clampSection never rejects:
// whatever comes in, something playable comes out.

export const SECTION_NAMES = ["drift", "pulse", "bloom", "surge", "dissolve"] as const;
export type SectionName = (typeof SECTION_NAMES)[number];
export const LAYERS = ["bass", "pad", "arp", "lead", "drums", "texture"] as const;
export type Layer = (typeof LAYERS)[number];

export type Section = {
  name: SectionName;
  /** Length in bars, 2..16. */
  bars: number;
  /** 0..1, drives density, brightness and the visuals. */
  energy: number;
  /** 0..1 per layer: 0 is silent, 1 is everything the world has for that layer. */
  layers: Record<Layer, number>;
  /**
   * An optional motif in step grammar: space-separated "step:len:degree" tokens, steps in the
   * world's own grid (16 or 12 per bar), up to two bars, degrees from the world's root.
   */
  motif: string;
  /** Optional chord roots as scale degrees, one per bar, cycling. Empty = the world's own plan. */
  chords: number[];
  /** Whose theme it develops: the band's own, or the player's. Shown in the HUD. */
  by?: "band" | "you";
};

export type LineNote = { step: number; len: number; deg: number };

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.max(lo, Math.min(hi, n));
};
const pick = <T>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);

export function parseLine(src: string, maxSteps: number): LineNote[] {
  const out: LineNote[] = [];
  for (const tok of String(src ?? "").trim().split(/\s+/).slice(0, 64)) {
    const m = /^(-?\d+):(\d+):(-?\d+)$/.exec(tok);
    if (!m) continue;
    const step = Number(m[1]);
    if (step < 0 || step >= maxSteps) continue;
    out.push({ step, len: Math.max(1, Math.min(32, Number(m[2]))), deg: Math.max(-14, Math.min(21, Number(m[3]))) });
  }
  return out.sort((a, b) => a.step - b.step);
}

export function formatLine(notes: LineNote[]): string {
  return notes.map((n) => `${n.step}:${n.len}:${n.deg}`).join(" ");
}

export function clampSection(raw: unknown, fallbackName: SectionName = "bloom", stepsPerBar = 16): Section {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const energy = clamp(r.energy, 0, 1, 0.5);
  const rl = r.layers && typeof r.layers === "object" ? r.layers : {};
  const layers = {} as Record<Layer, number>;
  for (const k of LAYERS) layers[k] = clamp(rl[k], 0, 1, k === "drums" ? (energy < 0.2 ? 0 : energy) : k === "lead" ? (energy > 0.35 ? 0.8 : 0) : 0.8);
  const chords = (Array.isArray(r.chords) ? r.chords : [])
    .filter((c: unknown) => typeof c === "number" && Number.isFinite(c))
    .slice(0, 8)
    .map((c: number) => Math.max(-7, Math.min(7, Math.round(c))));
  const out: Section = {
    name: pick(r.name, SECTION_NAMES, fallbackName),
    bars: Math.round(clamp(r.bars, 2, 16, 8)),
    energy,
    layers,
    motif: typeof r.motif === "string" ? formatLine(parseLine(r.motif, stepsPerBar * 2)) : "",
    chords,
    by: r.by === "you" ? "you" : "band",
  };
  return out;
}
