// Per-device preferences. Browser storage can be missing or throw (private windows, blocked site
// data), so every read and write is guarded and the defaults always work.
export type Prefs = {
  volume: number;
  muted: boolean;
  /** "auto" follows the system's reduced-motion setting. */
  motion: "auto" | "full" | "reduced";
  drift: 0 | 1 | 2;
  /** The first-run guide has been finished or skipped. */
  coached: boolean;
};

const KEY = "biome-synth:prefs";
export const DEFAULTS: Prefs = { volume: 0.85, muted: false, motion: "auto", drift: 1, coached: false };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw);
    return {
      volume: typeof p.volume === "number" ? Math.max(0, Math.min(1, p.volume)) : DEFAULTS.volume,
      muted: !!p.muted,
      motion: ["auto", "full", "reduced"].includes(p.motion) ? p.motion : "auto",
      drift: [0, 1, 2].includes(p.drift) ? p.drift : 1,
      coached: !!p.coached,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(p: Prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: preferences last for this visit only */
  }
}

export function reducedMotion(p: Prefs) {
  if (p.motion !== "auto") return p.motion === "reduced";
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
