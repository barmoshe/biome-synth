// The section format: what the local band writes and what Claude writes through its tool.
// Everything is scale degrees, so a section plays in whichever biome is under the camera.
// clampSection never rejects: whatever comes in, something playable comes out.

export const SECTION_NAMES = ["drift", "pulse", "bloom", "surge", "dissolve"] as const;
export type SectionName = (typeof SECTION_NAMES)[number];

export const LINE_ROLES = ["bass", "arp", "lead"] as const;
export const DRUM_KEYS = ["kick", "hat", "perc"] as const;

export type Section = {
  name: SectionName;
  /** Length in bars, 2..16. */
  bars: number;
  /** 0..1, drives density, filter brightness and the visuals. */
  energy: number;
  /** One scale degree per bar, cycling. 0 = the biome's root. */
  chords: number[];
  voicing: "triad" | "sus" | "open";
  /** Pad plays the chord every N bars (0 = no pad). */
  padEvery: 0 | 1 | 2 | 4;
  /**
   * Lines in step grammar: space-separated "step:len:degree" tokens. Steps are 16ths from the start
   * of the line, len is in 16ths, degree is relative to the bar's chord (0 root, 2 third, 4 fifth).
   * A line loops every `lineBars` bars.
   */
  lines: Partial<Record<(typeof LINE_ROLES)[number], string>>;
  lineBars: 1 | 2 | 4;
  /** If there is no arp line: arpeggiate the chord. rate = notes per beat. */
  arp: { rate: 0 | 1 | 2 | 4; shape: "up" | "down" | "updown" | "random" };
  /** 16 characters each: X accent, x hit, o ghost, . rest. */
  drums: Partial<Record<(typeof DRUM_KEYS)[number], string>>;
  /** Steering for the Lyria bed, ignored when it is off. */
  lyria?: { prompts: { text: string; weight: number }[]; density: number; brightness: number };
  /** Who wrote it: shown in the HUD. */
  by?: "band" | "claude";
};

export type LineNote = { step: number; len: number; deg: number };

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === "number" && Number.isFinite(v) ? v : d;
  return Math.max(lo, Math.min(hi, n));
};
const pick = <T>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d);

export function parseLine(src: string, lineBars: number): LineNote[] {
  const max = lineBars * 16;
  const out: LineNote[] = [];
  for (const tok of src.trim().split(/\s+/).slice(0, 96)) {
    const m = /^(-?\d+):(\d+):(-?\d+)$/.exec(tok);
    if (!m) continue;
    const step = Number(m[1]);
    if (step < 0 || step >= max) continue;
    out.push({ step, len: Math.max(1, Math.min(32, Number(m[2]))), deg: Math.max(-14, Math.min(14, Number(m[3]))) });
  }
  return out.sort((a, b) => a.step - b.step);
}

export function formatLine(notes: LineNote[]): string {
  return notes.map((n) => `${n.step}:${n.len}:${n.deg}`).join(" ");
}

function cleanDrum(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[^Xxo.]/g, "").slice(0, 16);
  return s.length ? s.padEnd(16, ".") : undefined;
}

export function clampSection(raw: unknown, fallbackName: SectionName = "bloom"): Section {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const lineBars = pick(r.lineBars, [1, 2, 4] as const, 2);
  const chords = (Array.isArray(r.chords) ? r.chords : [])
    .filter((c: unknown) => typeof c === "number" && Number.isFinite(c))
    .slice(0, 8)
    .map((c: number) => Math.max(-7, Math.min(7, Math.round(c))));

  const lines: Section["lines"] = {};
  const rl = r.lines && typeof r.lines === "object" ? r.lines : {};
  for (const k of LINE_ROLES) {
    if (typeof rl[k] !== "string") continue;
    const notes = parseLine(rl[k], lineBars);
    if (notes.length) lines[k] = formatLine(notes);
  }

  const drums: Section["drums"] = {};
  const rd = r.drums && typeof r.drums === "object" ? r.drums : {};
  for (const k of DRUM_KEYS) {
    const d = cleanDrum(rd[k]);
    if (d) drums[k] = d;
  }

  const ra = r.arp && typeof r.arp === "object" ? r.arp : {};
  const out: Section = {
    name: pick(r.name, SECTION_NAMES, fallbackName),
    bars: Math.round(clamp(r.bars, 2, 16, 8)),
    energy: clamp(r.energy, 0, 1, 0.5),
    chords: chords.length ? chords : [0],
    voicing: pick(r.voicing, ["triad", "sus", "open"] as const, "triad"),
    padEvery: pick(r.padEvery, [0, 1, 2, 4] as const, 2),
    lines,
    lineBars,
    arp: { rate: pick(ra.rate, [0, 1, 2, 4] as const, 0), shape: pick(ra.shape, ["up", "down", "updown", "random"] as const, "up") },
    drums,
    by: r.by === "claude" ? "claude" : "band",
  };

  if (r.lyria && typeof r.lyria === "object" && Array.isArray(r.lyria.prompts)) {
    const prompts = r.lyria.prompts
      .filter((p: any) => p && typeof p.text === "string" && p.text.trim())
      .slice(0, 4)
      .map((p: any) => ({ text: String(p.text).slice(0, 160), weight: clamp(p.weight, 0.05, 2, 1) }));
    if (prompts.length) out.lyria = { prompts, density: clamp(r.lyria.density, 0, 1, 0.5), brightness: clamp(r.lyria.brightness, 0, 1, 0.5) };
  }
  return out;
}

export const drumVel = (ch: string) => (ch === "X" ? 1 : ch === "x" ? 0.7 : ch === "o" ? 0.35 : 0);
