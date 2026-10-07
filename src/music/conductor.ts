// The conductor: which world is playing, which section of its arc, and how one world hands over
// to the next. Worlds change on a bar line once the camera has moved on, through a DJ-style bridge
// (dissolve, submerge, surface, power cut, lift-off): the outgoing world plays without drums while
// the tempo glides, then the new world starts on its downbeat with its own effects.
// The mind (mind.ts) composes: it picks each next section from how the player plays, writes its
// chords and theme, and answers the player's phrases. The conductor performs it: the theme in the
// world's melody voice, the answer a bar after a phrase ends, and room for the player (the band's
// lead and arp step back while they play).
import type { Role } from "../shared/biomes";
import type { WorldFx } from "../audio/engine";
import { rng } from "./rng";
import { parseLine, type Layer, type LineNote, type Section } from "./pattern";
import type { Out, SkyCtx, StepCtx, WorldMusic } from "./world";
import { makeWorlds } from "./worlds";
import { Mind } from "./mind";

export type TransitionKind = "dissolve" | "submerge" | "surface" | "powercut" | "liftoff" | "sweep";
const FORWARD: Record<string, TransitionKind> = { "0>1": "dissolve", "1>2": "submerge", "2>3": "surface", "3>4": "powercut", "4>0": "liftoff" };

export type ConductorDeps = {
  seed: number;
  /** The biome under the camera, and how much of the playing world is still on screen. */
  target(): number;
  weightOf(world: number): number;
  /** Effects automation, at absolute audio times. */
  fx?(fx: WorldFx, at: number, ramp: number): void;
  sweep?(to: number, at: number, dur: number): void;
  tapeStop?(at: number, seconds: number): void;
  onSection?(s: Section): void;
  onWorld?(w: WorldMusic): void;
  daylight?(): number;
};

type Bridge = { to: number; kind: TransitionKind; end: number; startStep: number };

export class Conductor {
  readonly worlds: WorldMusic[];
  readonly mind: Mind;
  cur = 0;
  /** Global step where the current world began. */
  start = 0;
  section: Section;
  private secStart = 0;
  private bridge: Bridge | null = null;
  private r: () => number;
  private lastPlayer = -1e9;
  private theme: { src: string; line: LineNote[] } = { src: "", line: [] };
  /** The band's answer to the player's last phrase, by global step. */
  private answers = new Map<number, Out[]>();

  constructor(private deps: ConductorDeps, first = 0) {
    this.worlds = makeWorlds();
    this.r = rng(deps.seed, "conductor");
    this.mind = new Mind({ rng: rng(deps.seed, "mind"), daylight: () => deps.daylight?.() ?? 0.5 });
    this.cur = first;
    this.world.reset(deps.seed);
    this.mind.enter(this.world);
    this.section = this.mind.write("drift", this.world);
  }

  get world() {
    return this.worlds[this.cur];
  }
  get stepSec() {
    const w = this.world;
    return 60 / w.bpm / w.stepsPerBeat;
  }
  get transitioning() {
    return this.bridge !== null;
  }

  /** The step context. `band` adds the room the band leaves while the player plays. */
  private ctx(step: number, band = false): StepCtx {
    const w = this.world;
    const local = Math.max(0, step - this.start);
    let section = this.section;
    if (this.bridge) {
      // The bridge: the outgoing world without drums or lead, thinning out.
      const layers = { ...section.layers, drums: 0, lead: 0, bass: this.bridge.kind === "powercut" ? 0 : section.layers.bass * 0.5 } as Record<Layer, number>;
      section = { ...section, layers, energy: Math.min(section.energy, 0.35) };
    } else if (band && this.mind.listening(step)) {
      const layers = { ...section.layers, lead: section.layers.lead * 0.35, arp: section.layers.arp * 0.75 };
      section = { ...section, layers };
    }
    return {
      step: local,
      bar: Math.floor(local / w.stepsPerBar),
      pos: local % w.stepsPerBar,
      stepSec: this.stepSec,
      section,
      rng: this.r,
      playerActive: step - this.lastPlayer < w.stepsPerBar * 2,
      daylight: this.deps.daylight?.() ?? 0.5,
    };
  }

  /** Swing and humanised timing for a step in the current world. */
  private timing(pos: number) {
    const w = this.world;
    let off = 0;
    if (w.stepsPerBar === 16 && pos % 2 === 1) off += (w.swing - 0.5) * 2 * this.stepSec;
    if (w.humanize) off += (this.r() - 0.5) * 2 * w.humanize;
    return Math.max(0, off);
  }

  /** Everything to play on global step `step` (scheduled at audio time `time`). */
  hits(step: number, time: number): Out[] {
    const w = this.world;
    const local = step - this.start;
    const pos = local % w.stepsPerBar;

    if (this.bridge && step >= this.bridge.end) this.enter(this.bridge, step, time);
    else if (!this.bridge && pos === 0) {
      const t = this.deps.target();
      const away = this.deps.weightOf(this.cur);
      // Leave on a two-bar line, or right away once the playing world is nearly off screen.
      if (t !== this.cur && (Math.floor(local / w.stepsPerBar) % 2 === 0 || away < 0.25)) this.leave(t, step, time);
    }

    // Sections walk the arc the mind picks.
    if (!this.bridge && step - this.secStart >= this.section.bars * this.world.stepsPerBar && pos === 0) this.advance(step);

    // On each downbeat the mind listens back: a finished phrase gets an answer and becomes the theme.
    if (pos === 0) {
      const heard = this.mind.bar(step);
      if (heard && !this.bridge) {
        this.answer(heard.answer, step);
        if (this.mind.themeBy === "you") {
          this.section = { ...this.section, motif: this.mind.motif(this.section.name), by: "you" };
          this.deps.onSection?.(this.section);
        }
      }
    }

    const c = this.ctx(step, true);
    const off = this.timing(c.pos);
    const outs = [...this.world.step(c), ...this.sing(step, c)];
    const due = this.answers.get(step);
    if (due) {
      outs.push(...due);
      this.answers.delete(step);
    }
    return this.trim(outs).map((o) => ({ ...o, offset: (o.offset ?? 0) + off }));
  }

  /** The world's melody voice: its own if it has one, else its sky voice played softer. */
  private voice(deg: number, c: StepCtx, from: Out["from"], v: number, len?: number): Out[] {
    const w = this.world;
    const outs = w.voice ? w.voice(deg, c) : w.sky(deg, { ...c, bright: 0.45, speed: 0, pan: 0 }).map((o) => ({ ...o, note: { ...o.note, vel: o.note.vel * 0.75 } }));
    return outs.map((o) => ({ ...o, from, note: { ...o.note, vel: o.note.vel * v, dur: len ? Math.min(o.note.dur, len * c.stepSec) : o.note.dur } }));
  }

  /** The theme: in the first two bars of every four (a question, then space), never over the player. */
  private sing(step: number, c: StepCtx): Out[] {
    const w = this.world;
    const s = c.section;
    if (w.ownsTheme || this.bridge || !s.motif || s.layers.lead < 0.3 || this.answers.size || this.mind.listening(step)) return [];
    if (c.bar % 4 >= 2) return [];
    if (s.motif !== this.theme.src) this.theme = { src: s.motif, line: parseLine(s.motif, w.stepsPerBar * 2) };
    const at = (c.bar % 2) * w.stepsPerBar + c.pos;
    return this.theme.line.filter((n) => n.step === at).flatMap((n) => this.voice(n.deg, c, "band", 0.5 + 0.5 * s.layers.lead, n.len));
  }

  /** Queue the band's answer to a phrase, starting on this downbeat. */
  private answer(line: LineNote[], step: number) {
    for (const n of line) {
      const at = step + n.step;
      const list = this.answers.get(at) ?? [];
      list.push(...this.voice(n.deg, this.ctx(at), "echo", 0.9, n.len));
      this.answers.set(at, list);
    }
  }

  private leave(to: number, step: number, time: number) {
    const kind = FORWARD[`${this.cur}>${to}`] ?? "sweep";
    const w = this.world;
    const bars = kind === "powercut" ? 1 : 2;
    const end = step + bars * w.stepsPerBar;
    this.bridge = { to, kind, end, startStep: step };
    this.answers.clear();
    const dur = bars * w.stepsPerBar * this.stepSec;
    const next = this.worlds[to];
    if (kind === "submerge") this.deps.sweep?.(700, time, dur * 0.9);
    if (kind === "liftoff" || kind === "sweep") this.deps.sweep?.(900, time, dur * 0.6);
    if (kind === "powercut") this.deps.tapeStop?.(time, 0.45);
    if (kind === "dissolve" || kind === "surface") this.deps.fx?.({ ...w.fx, hall: Math.max(w.fx.hall, 0.8), feedback: Math.min(0.75, w.fx.feedback + 0.2) }, time, dur * 0.5);
    this.pendingStepSec = 60 / next.bpm / next.stepsPerBeat;
  }

  /** The new world's step length, glided into during the bridge (the clock reads it). */
  pendingStepSec: number | null = null;
  /** Set on the step a new world starts: the clock snaps to its exact tempo. */
  entered = false;

  private enter(b: Bridge, step: number, time: number) {
    this.cur = b.to;
    this.start = step;
    this.bridge = null;
    const w = this.world;
    w.reset(this.deps.seed + step);
    this.mind.enter(w);
    this.secStart = step;
    this.section = this.mind.write(b.kind === "powercut" ? "bloom" : "pulse", w);
    this.deps.fx?.(w.fx, time, b.kind === "powercut" ? 0.02 : 1.2);
    this.pendingStepSec = null;
    this.entered = true;
    this.deps.onWorld?.(w);
    this.deps.onSection?.(this.section);
  }

  private advance(step: number) {
    this.section = this.mind.write(this.mind.next(this.section.name), this.world);
    this.secStart = step;
    this.deps.onSection?.(this.section);
  }

  private trim(outs: Out[]): Out[] {
    const g = this.world.level;
    return g === 1 ? outs : outs.map((o) => ({ ...o, note: { ...o.note, vel: Math.min(1, o.note.vel * g) } }));
  }

  /** A creature solos on its own (the idle self-play): like a tap, but not the player's. */
  solo(step: number, role: Role): Out[] {
    return this.trim(this.world.tap(role, this.ctx(step))).map((o) => ({ ...o, from: "band" as const, note: { ...o.note, vel: o.note.vel * 0.7 }, throw: 0 }));
  }

  /** The player tapped a creature. */
  tap(step: number, role: Role): Out[] {
    this.lastPlayer = step;
    this.mind.touch(step);
    this.answers.clear();
    return this.trim(this.world.tap(role, this.ctx(step)));
  }

  /** The player touched open sky at x (0..1). `listen` false: a sound check, not the player. */
  sky(step: number, x: number, o: Pick<SkyCtx, "bright" | "speed" | "pan">, listen = true): Out[] {
    const deg = this.skyDeg(x);
    if (listen) {
      this.lastPlayer = step;
      this.mind.hear(step, deg);
      this.answers.clear();
    }
    return this.trim(this.world.sky(deg, { ...this.ctx(step), ...o }));
  }

  /** Two octaves across the screen, in the playing world's own degrees. */
  skyDeg(x: number): number {
    const w = this.world;
    const set = w.skyDegrees ?? w.scale.map((_, i) => i);
    const n = set.length;
    const idx = Math.max(0, Math.min(n * 2, Math.round(x * n * 2)));
    return set[idx % n] + w.scale.length * Math.floor(idx / n);
  }
}
