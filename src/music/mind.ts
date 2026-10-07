// The mind: the band's own composer, running on the device. No network, no model download.
// It listens to the player and composes with what it hears:
//  - Ear: a phrase ends after a bar of silence; engagement is how much the player plays per bar.
//  - Melody: a second-order Markov model over scale-step intervals and onsets (backing off to
//    first order, then to any interval it knows), trained on the world's idiom and, three times
//    over, on the player's own phrases. Learned moves are relative, so they travel between worlds.
//  - Theme: the player's last phrase becomes the theme, and each section develops it (fragment,
//    sequence, inversion, retrograde, augmentation), so the music keeps coming back to it.
//  - Answers: when a phrase ends, the band answers it in the world's lead voice, ending at home.
//  - Harmony: a walk on the world's chord graph that carries on from the last chord and ends on
//    one that leads home.
//  - Form: the next section follows the player. Busy pushes toward the surge, idle settles, and
//    the night holds the energy down.
import { formatLine, parseLine, type LineNote, type Section, type SectionName } from "./pattern";
import { ENERGY, layersFor, type WorldMusic } from "./world";

/** The default arc, when the player is neither busy nor gone. */
export const ARC: Record<SectionName, SectionName> = { drift: "pulse", pulse: "bloom", bloom: "surge", surge: "dissolve", dissolve: "pulse" };
const BUSY: Record<SectionName, SectionName> = { drift: "pulse", pulse: "bloom", bloom: "surge", surge: "bloom", dissolve: "bloom" };
const IDLE: Record<SectionName, SectionName> = { drift: "pulse", pulse: "bloom", bloom: "dissolve", surge: "dissolve", dissolve: "drift" };

/** Melodies stay in this range of degrees around the root. */
const LO = -3;
const HI = 11;
const mod = (n: number, m: number) => ((n % m) + m) % m;

// ---------- development: the classic ways to vary a theme ----------

export const develop = {
  transpose: (l: LineNote[], k: number) => l.map((n) => ({ ...n, deg: n.deg + k })),
  /** Mirror every interval around the first note. */
  invert: (l: LineNote[]) => l.map((n) => ({ ...n, deg: 2 * (l[0]?.deg ?? 0) - n.deg })),
  /** The pitches backwards, the rhythm kept. */
  retrograde: (l: LineNote[]) => {
    const degs = l.map((n) => n.deg).reverse();
    return l.map((n, i) => ({ ...n, deg: degs[i] }));
  },
  augment: (l: LineNote[]) => l.map((n) => ({ step: n.step * 2, len: n.len * 2, deg: n.deg })),
  diminish: (l: LineNote[]) => {
    const out: LineNote[] = [];
    for (const n of l) {
      const step = Math.floor(n.step / 2);
      if (out.length && out[out.length - 1].step === step) continue;
      out.push({ step, len: Math.max(1, Math.round(n.len / 2)), deg: n.deg });
    }
    return out;
  },
  /** The head of the theme. */
  fragment: (l: LineNote[]) => l.slice(0, Math.max(2, Math.ceil(l.length / 2))),
  /** The line, then again `span` steps later, moved by `k` degrees. */
  sequence: (l: LineNote[], k: number, span: number) => [...l, ...l.map((n) => ({ ...n, step: n.step + span, deg: n.deg + k }))],
};

/** Nearest degree whose pitch class is in `set` (a pentatonic, a triad), ties going down. */
export function snapTo(deg: number, set: readonly number[], len = 7): number {
  for (let d = 0; d < len; d++) {
    if (set.includes(mod(deg - d, len))) return deg - d;
    if (set.includes(mod(deg + d, len))) return deg + d;
  }
  return deg;
}

// ---------- the melody model ----------

type Counts = Map<number, number>;
const add = (m: Counts, k: number, w: number) => m.set(k, (m.get(k) ?? 0) + w);
function draw(m: Counts | undefined, r: () => number): number | null {
  if (!m || !m.size) return null;
  let total = 0;
  for (const v of m.values()) total += v;
  let x = r() * total;
  for (const [k, v] of m) if ((x -= v) <= 0) return k;
  return [...m.keys()][m.size - 1];
}

export class Melody {
  private t2 = new Map<string, Counts>();
  private t1 = new Map<number, Counts>();
  private t0: Counts = new Map();
  private gaps: Counts = new Map();
  private lens: Counts = new Map();

  learn(line: LineNote[], w = 1) {
    for (let i = 1; i < line.length; i++) {
      const iv = Math.max(-7, Math.min(7, line[i].deg - line[i - 1].deg));
      add(this.t0, iv, w);
      if (i >= 2) {
        const p1 = line[i - 1].deg - line[i - 2].deg;
        if (!this.t1.has(p1)) this.t1.set(p1, new Map());
        add(this.t1.get(p1)!, iv, w);
        if (i >= 3) {
          const key = `${line[i - 2].deg - line[i - 3].deg},${p1}`;
          if (!this.t2.has(key)) this.t2.set(key, new Map());
          add(this.t2.get(key)!, iv, w);
        }
      }
      add(this.gaps, Math.max(1, Math.min(8, line[i].step - line[i - 1].step)), w);
    }
    for (const n of line) add(this.lens, Math.max(1, Math.min(8, n.len)), w);
  }

  /** How strongly the model expects interval `iv`, 0..1: for the tests and the curious. */
  weight(iv: number) {
    let total = 0;
    for (const v of this.t0.values()) total += v;
    return total ? (this.t0.get(iv) ?? 0) / total : 0;
  }

  private interval(prev: number[], r: () => number): number {
    const n = prev.length;
    return (n >= 2 ? draw(this.t2.get(`${prev[n - 2]},${prev[n - 1]}`), r) : null) ?? (n >= 1 ? draw(this.t1.get(prev[n - 1]), r) : null) ?? draw(this.t0, r) ?? (r() < 0.5 ? 1 : -1);
  }

  /**
   * A new line of up to `steps` steps. `fit` keeps each note in the world's language: in range, on
   * its melodic set, and on a chord tone where the beat is strong.
   */
  compose(start: number, steps: number, r: () => number, fit: (deg: number, step: number) => number, maxNotes = 8): LineNote[] {
    const line: LineNote[] = [];
    const ivs: number[] = [];
    let step = 0;
    let deg = fit(start, 0);
    while (step < steps && line.length < maxNotes) {
      line.push({ step, len: draw(this.lens, r) ?? 2, deg });
      step += draw(this.gaps, r) ?? 2;
      const iv = this.interval(ivs, r);
      let next = deg + iv;
      // Bounce off the edges instead of sticking to them.
      if (next > HI || next < LO) next = deg - iv;
      next = fit(Math.max(LO, Math.min(HI, next)), step);
      ivs.push(next - deg);
      deg = next;
    }
    return line;
  }
}

// ---------- the mind ----------

export type MindDeps = {
  rng: () => number;
  /** 0..1 local hour brightness (night is low). */
  daylight: () => number;
};

export class Mind {
  private melody = new Melody();
  private world: WorldMusic | null = null;
  /** The phrase being played now, in global steps. */
  private open: { step: number; deg: number }[] = [];
  private lastHeard = -1e9;
  private barNotes = 0;
  /** Recent closed phrases, kept across worlds (degrees are relative, so they travel). */
  private heard: { line: LineNote[]; spb: number }[] = [];
  /** The theme the band develops, and the grid it was written on. */
  private theme: { line: LineNote[]; spb: number; by: "band" | "you" } | null = null;
  private sectionsSinceHeard = 0;
  private lastChord = 0;
  private surges = 0;
  /** Notes per bar, smoothed over a few bars. */
  engagement = 0;

  constructor(private deps: MindDeps) {}

  get themeBy() {
    return this.theme?.by ?? "band";
  }

  /** A new world: relearn its idiom, keep what the player taught. */
  enter(w: WorldMusic) {
    this.world = w;
    this.melody = new Melody();
    for (const src of w.idiom ?? []) this.melody.learn(parseLine(src, w.stepsPerBar * 2), 1);
    for (const h of this.heard) this.melody.learn(h.line, 3);
    this.open = [];
    this.lastChord = 0;
    this.surges = 0;
    if (this.theme?.by === "band") this.theme = null;
  }

  // ---------- the ear ----------

  hear(step: number, deg: number) {
    if (this.open.length && this.open[this.open.length - 1].step === step) this.open.pop();
    this.open.push({ step, deg });
    if (this.open.length > 16) this.open.shift();
    this.lastHeard = step;
    this.barNotes++;
  }

  /** A creature tap: it counts as playing, though it is not a melody. */
  touch(step: number) {
    this.lastHeard = step;
    this.barNotes++;
  }

  /** The player is playing right now (within the last bar). */
  listening(step: number) {
    return step - this.lastHeard < (this.world?.stepsPerBar ?? 16);
  }

  /**
   * Called on every downbeat. Updates engagement and closes the phrase after a bar of silence (or
   * once it runs two bars): it is learned, becomes the theme, and into silence the band answers.
   */
  bar(step: number): { line: LineNote[]; answer: LineNote[]; at: number } | null {
    const w = this.world;
    if (!w) return null;
    this.engagement = this.engagement * 0.75 + this.barNotes * 0.25;
    this.barNotes = 0;
    const silent = step - this.lastHeard >= w.stepsPerBar;
    // A player who never pauses still makes phrases: two bars of playing is one.
    const long = this.open.length >= 3 && step - this.open[0].step >= w.stepsPerBar * 2;
    if (this.open.length < 2 || (!silent && !long)) {
      if (this.open.length === 1 && silent) this.open = [];
      return null;
    }
    const line = this.close();
    // Answer only into silence: while the player keeps going, the band just learns.
    return silent ? { line, answer: this.answer(line), at: step } : { line, answer: [], at: step };
  }

  /** Turn the open phrase into a line on the world's grid, learn it, and maybe take it as the theme. */
  private close(): LineNote[] {
    const w = this.world!;
    const spb = w.stepsPerBar;
    const beat = w.stepsPerBeat;
    // Keep where the phrase sat in the beat, so a pickup stays a pickup.
    const t0 = this.open[0].step - (this.open[0].step % beat);
    const line: LineNote[] = [];
    for (let i = 0; i < this.open.length; i++) {
      const n = this.open[i];
      const s = n.step - t0;
      if (s >= spb * 2) break;
      const next = this.open[i + 1]?.step ?? n.step + beat;
      line.push({ step: s, len: Math.max(1, Math.min(8, next - n.step)), deg: n.deg });
    }
    this.open = [];
    this.melody.learn(line, 3);
    this.heard.push({ line, spb });
    if (this.heard.length > 6) this.heard.shift();
    if (line.length >= 3) {
      this.theme = { line, spb, by: "you" };
      this.sectionsSinceHeard = 0;
    }
    return line;
  }

  /**
   * The consequent to the player's antecedent: the same rhythm, the shape mirrored or moved, and the
   * last note brought home to the tonic.
   */
  answer(line: LineNote[]): LineNote[] {
    const r = this.deps.rng;
    let a = line.length > 8 ? develop.fragment(line).slice(0, 6) : line;
    const pick = r();
    a = pick < 0.4 ? develop.invert(a) : pick < 0.75 ? develop.transpose(a, r() < 0.5 ? -1 : 1) : develop.retrograde(a);
    a = this.fit(a);
    if (a.length) {
      const last = a[a.length - 1];
      const len = this.world?.scale.length ?? 7;
      a[a.length - 1] = { ...last, deg: snapTo(last.deg, [0], len), len: Math.max(last.len, 3) };
    }
    return a;
  }

  // ---------- form, harmony, theme ----------

  /** Which section comes next, from the player's engagement and the hour. */
  next(cur: SectionName): SectionName {
    const e = this.engagement;
    const night = this.deps.daylight() < 0.3;
    let n: SectionName;
    if (e >= 2) {
      n = BUSY[cur];
      // Two surges in a row at most; the third time the band breathes out.
      if (cur === "surge" && this.surges < 2) n = "surge";
    } else if (e < 0.4) n = IDLE[cur];
    else n = ARC[cur];
    if (night && n === "surge" && e < 2) n = "bloom";
    this.surges = n === "surge" ? this.surges + 1 : 0;
    return n;
  }

  /** A section from the world's own writer, shaped by the player and the hour. */
  write(name: SectionName, w: WorldMusic): Section {
    const r = this.deps.rng;
    const s = w.write(name, r);
    const lift = Math.min(1, this.engagement / 3) * 0.1 - (this.deps.daylight() < 0.3 ? 0.08 : 0);
    s.energy = Math.max(0, Math.min(1, ENERGY[name] + lift));
    s.layers = layersFor(s.energy);
    s.chords = this.chords(w, s.bars);
    this.sectionsSinceHeard++;
    // The player's theme fades after a few sections without them; then the band writes its own.
    if (this.theme?.by === "you" && this.sectionsSinceHeard > 3) this.theme = null;
    // The band's own theme lasts four sections, long enough to be remembered.
    if (this.theme?.by === "band" && this.sectionsSinceHeard % 4 === 0) this.theme = null;
    if (!this.theme) this.theme = { line: this.compose(w, s.chords), spb: w.stepsPerBar, by: "band" };
    s.motif = this.motif(name);
    s.by = this.theme.by;
    return s;
  }

  /** The theme as this section develops it, in the playing world's grid. */
  motif(name: SectionName): string {
    const w = this.world;
    if (!w || !this.theme) return "";
    const k = w.stepsPerBar / this.theme.spb;
    let t = this.theme.line.map((n) => ({ step: Math.round(n.step * k), len: Math.max(1, Math.round(n.len * k)), deg: n.deg }));
    const r = this.deps.rng;
    if (name === "drift") t = develop.augment(develop.fragment(t));
    else if (name === "bloom") t = develop.sequence(develop.fragment(t), r() < 0.5 ? 2 : -1, w.stepsPerBar);
    else if (name === "surge") t = r() < 0.5 ? develop.transpose(t, 2) : develop.sequence(develop.diminish(t), 1, w.stepsPerBar);
    else if (name === "dissolve") t = develop.augment(develop.retrograde(develop.fragment(t)));
    return formatLine(this.fit(t));
  }

  /** Keep a line inside two bars, in range, and on the world's melodic set. */
  fit(line: LineNote[]): LineNote[] {
    const w = this.world;
    const spb = w?.stepsPerBar ?? 16;
    const len = w?.scale.length ?? 7;
    const set = w?.skyDegrees;
    return line
      .filter((n) => n.step >= 0 && n.step < spb * 2)
      .map((n) => {
        let d = n.deg;
        while (d > HI) d -= len;
        while (d < LO) d += len;
        return { ...n, deg: set ? snapTo(d, set, len) : d };
      });
  }

  private compose(w: WorldMusic, chords: number[]): LineNote[] {
    const r = this.deps.rng;
    const len = w.scale.length;
    const set = w.skyDegrees;
    const chordAt = (step: number) => chords.length ? chords[Math.floor(step / w.stepsPerBar) % chords.length] : 0;
    const fit = (deg: number, step: number) => {
      let d = set ? snapTo(deg, set, len) : deg;
      // On a strong beat, lean onto the chord.
      if (step % (w.stepsPerBeat * 2) === 0) {
        const root = chordAt(step);
        d = snapTo(d, [0, 2, 4].map((x) => mod(root + x, len)), len);
      }
      return d;
    };
    const start = 2 + Math.floor(r() * 5);
    const line = this.melody.compose(start, w.stepsPerBar * 2, r, fit);
    // End at rest on the chord root.
    if (line.length) {
      const last = line[line.length - 1];
      line[line.length - 1] = { ...last, deg: snapTo(last.deg, [mod(chordAt(last.step), len)], len) };
    }
    return line;
  }

  /** A walk on the world's chord graph: carries on from the last chord, ends on one that leads home. */
  chords(w: WorldMusic, bars: number): number[] {
    const g = w.chordGraph;
    if (!g) return [];
    const r = this.deps.rng;
    const n = Math.max(2, Math.min(8, bars));
    const plan: number[] = [];
    let c = this.lastChord in g ? this.lastChord : 0;
    for (let i = 0; i < n; i++) {
      plan.push(c);
      const opts = g[c] ?? [0];
      c = opts[Math.floor(r() * opts.length)];
    }
    const homeward = Object.keys(g).map(Number).filter((k) => g[k].includes(0));
    if (n > 2 && !(g[plan[n - 1]] ?? []).includes(0) && homeward.length) plan[n - 1] = homeward[Math.floor(r() * homeward.length)];
    this.lastChord = (g[plan[n - 1]] ?? [0]).includes(0) ? 0 : plan[n - 1];
    return plan;
  }
}
