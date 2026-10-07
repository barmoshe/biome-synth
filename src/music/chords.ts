// Chord symbols as a songwriter writes them ("E7", "F#m(add9)", "A/C#", "Dmaj9", "Bm7"), parsed
// into pitch classes: the chord tones in order (root, third, fifth, then extensions), the bass,
// and the scale a melody should use over it.

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const pc = (n: number) => ((n % 12) + 12) % 12;

export type Chord = {
  sym: string;
  /** Root pitch class. */
  root: number;
  /** Chord tones as pitch classes, root first, then third, fifth, seventh and extensions. */
  tones: number[];
  /** The lowest note: the root, or the slash bass. */
  bass: number;
};

function note(s: string): [number, string] {
  const m = /^([A-G])([#b]?)/.exec(s);
  if (!m) throw new Error(`not a chord: ${s}`);
  return [pc(NAMES[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0)), s.slice(m[0].length)];
}

/** Intervals in semitones above the root for a quality. Order: third, fifth, then the rest. */
function intervals(q: string): number[] {
  const add = /\(add(\d+)\)|add(\d+)/.exec(q);
  q = q.replace(/\(?add\d+\)?/, "");
  let third = 4;
  let fifth = 7;
  const ext: number[] = [];
  if (/^m(?!aj)/.test(q)) (third = 3), (q = q.slice(1));
  if (q.startsWith("sus4")) (third = 5), (q = q.slice(4));
  else if (q.startsWith("sus2")) (third = 2), (q = q.slice(4));
  if (q.startsWith("dim")) (third = 3), (fifth = 6), (q = q.slice(3));
  const maj = q.startsWith("maj");
  if (maj) q = q.slice(3);
  const seventh = maj ? 11 : 10;
  if (q.startsWith("7")) ext.push(seventh), (q = q.slice(1));
  else if (q.startsWith("9")) ext.push(seventh, 14), (q = q.slice(1));
  else if (q.startsWith("11")) ext.push(seventh, 14, 17), (q = q.slice(2));
  else if (q.startsWith("13")) ext.push(seventh, 14, 21), (q = q.slice(2));
  else if (q.startsWith("6")) ext.push(9), (q = q.slice(1));
  if (/#11/.test(q)) ext.push(18);
  if (add) ext.push(Number(add[1] ?? add[2]) === 9 ? 14 : Number(add[1] ?? add[2]) === 11 ? 17 : 21);
  return [third, fifth, ...ext];
}

export function chord(sym: string): Chord {
  const [main, slash] = sym.split("/");
  const [root, rest] = note(main.trim());
  const tones = [root, ...intervals(rest).map((i) => pc(root + i))];
  return { sym, root, tones, bass: slash ? note(slash.trim())[0] : root };
}

/** A chart: "A | D | E7 | A F#m" = one cell per bar, cells may hold several chords split evenly. */
export function chart(src: string): Chord[][] {
  return src.split("|").map((cell) => cell.trim().split(/\s+/).filter(Boolean).map(chord));
}

/** The MIDI note of pitch class `p` nearest to `near`. */
export function nearest(p: number, near: number): number {
  const base = near - pc(near) + pc(p);
  return [base - 12, base, base + 12].reduce((a, b) => (Math.abs(b - near) < Math.abs(a - near) ? b : a));
}

/** The nearest MIDI note to `midi` whose pitch class is in `set` (ties go down). */
export function snapPc(midi: number, set: readonly number[]): number {
  for (let d = 0; d < 12; d++) {
    if (set.includes(pc(midi - d))) return midi - d;
    if (set.includes(pc(midi + d))) return midi + d;
  }
  return midi;
}
