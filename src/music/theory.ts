// Scales, degrees and snapping. Everything musical is written in scale degrees, so the same
// pattern sounds right in whichever biome's scale is under the camera.

export const SCALES = {
  minorPent: [0, 3, 5, 7, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  doubleHarmonic: [0, 1, 4, 5, 7, 8, 11],
} as const;
export type ScaleName = keyof typeof SCALES;

/** Pitch class that is correct for negative numbers too (JS % keeps the sign). */
export const pc = (n: number) => ((n % 12) + 12) % 12;
const mod = (n: number, m: number) => ((n % m) + m) % m;

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Scale degree (any integer, 0 = root) to MIDI note, starting from `root`. */
export function degreeToMidi(root: number, scale: readonly number[], degree: number): number {
  const len = scale.length;
  const oct = Math.floor(degree / len);
  return root + oct * 12 + scale[mod(degree, len)];
}

/** The nearest in-scale MIDI note (ties go down). */
export function snap(midi: number, root: number, scale: readonly number[]): number {
  const m = Math.round(midi);
  for (let d = 0; d < 12; d++) {
    if (inScale(m - d, root, scale)) return m - d;
    if (inScale(m + d, root, scale)) return m + d;
  }
  return m;
}

export function inScale(midi: number, root: number, scale: readonly number[]): boolean {
  return scale.includes(pc(midi - root));
}

/** Nearest scale degree to a MIDI note. */
export function midiToDegree(midi: number, root: number, scale: readonly number[]): number {
  const s = snap(midi, root, scale);
  const oct = Math.floor((s - root) / 12);
  return oct * scale.length + scale.indexOf(pc(s - root));
}

/** Triad on a degree, stacked in thirds of the scale (for a pentatonic, "thirds" are skips). */
export function chordDegrees(degree: number, voicing: "triad" | "sus" | "open" = "triad"): number[] {
  if (voicing === "sus") return [degree, degree + 3, degree + 4];
  if (voicing === "open") return [degree, degree + 4, degree + 9];
  return [degree, degree + 2, degree + 4];
}
