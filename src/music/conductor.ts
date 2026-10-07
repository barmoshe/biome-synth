// The conductor: which world is playing, which section of its arc, and how one world hands over
// to the next. Worlds change on a bar line once the camera has moved on, through a DJ-style bridge
// (dissolve, submerge, surface, power cut, lift-off): the outgoing world plays without drums while
// the tempo glides, then the new world starts on its downbeat with its own effects.
// Claude (when awake) writes the next section while the current one plays; it swaps in at the
// boundary, and if Claude is late or wrong the world's own section plays. Claude is never in the
// timing loop.
import type { BiomeId, Role } from "../shared/biomes";
import type { WorldFx } from "../audio/engine";
import { rng } from "./rng";
import { clampSection, type Layer, type Section, type SectionName } from "./pattern";
import type { Out, SkyCtx, StepCtx, WorldMusic } from "./world";
import { makeWorlds } from "./worlds";

export const NEXT: Record<SectionName, SectionName> = { drift: "pulse", pulse: "bloom", bloom: "surge", surge: "dissolve", dissolve: "pulse" };

export type ComposeRequest = {
  world: BiomeId;
  genre: string;
  name: SectionName;
  stepsPerBar: number;
  previous: Section;
  player: { notes: number; taps: Partial<Record<string, number>> };
};
export type Composer = (req: ComposeRequest) => Promise<unknown>;

export type TransitionKind = "dissolve" | "submerge" | "surface" | "powercut" | "liftoff" | "sweep";
const FORWARD: Record<string, TransitionKind> = { "0>1": "dissolve", "1>2": "submerge", "2>3": "surface", "3>4": "powercut", "4>0": "liftoff" };

export type ConductorDeps = {
  seed: number;
  /** The biome under the camera, and how much of the playing world is still on screen. */
  target(): number;
  weightOf(world: number): number;
  composer?: Composer | null;
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
  cur = 0;
  /** Global step where the current world began. */
  start = 0;
  section: Section;
  private secStart = 0;
  private next: Section | null = null;
  private asking = false;
  private bridge: Bridge | null = null;
  private r: () => number;
  private taps: Record<string, number> = {};
  private notes = 0;
  private lastPlayer = -1e9;

  constructor(private deps: ConductorDeps, first = 0) {
    this.worlds = makeWorlds();
    this.r = rng(deps.seed, "conductor");
    this.cur = first;
    this.world.reset(deps.seed);
    this.section = this.world.write("drift", this.r);
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

  setComposer(c: Composer | null) {
    this.deps.composer = c;
    if (!c) this.next = null;
  }

  private ctx(step: number): StepCtx {
    const w = this.world;
    const local = Math.max(0, step - this.start);
    let section = this.section;
    if (this.bridge) {
      // The bridge: the outgoing world without drums or lead, thinning out.
      const layers = { ...section.layers, drums: 0, lead: 0, bass: this.bridge.kind === "powercut" ? 0 : section.layers.bass * 0.5 } as Record<Layer, number>;
      section = { ...section, layers, energy: Math.min(section.energy, 0.35) };
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

    // Sections walk the world's arc.
    if (!this.bridge && step - this.secStart >= this.section.bars * this.world.stepsPerBar && pos === 0) this.advance(step);
    if (step === this.secStart) this.prepareNext();

    const c = this.ctx(step);
    const off = this.timing(c.pos);
    return this.trim(this.world.step(c)).map((o) => ({ ...o, offset: (o.offset ?? 0) + off }));
  }

  private leave(to: number, step: number, time: number) {
    const kind = FORWARD[`${this.cur}>${to}`] ?? "sweep";
    const w = this.world;
    const bars = kind === "powercut" ? 1 : 2;
    const end = step + bars * w.stepsPerBar;
    this.bridge = { to, kind, end, startStep: step };
    const dur = bars * w.stepsPerBar * this.stepSec;
    const next = this.worlds[to];
    if (kind === "submerge") this.deps.sweep?.(700, time, dur * 0.9);
    if (kind === "liftoff" || kind === "sweep") this.deps.sweep?.(900, time, dur * 0.6);
    if (kind === "powercut") this.deps.tapeStop?.(time, 0.45);
    if (kind === "dissolve" || kind === "surface") this.deps.fx?.({ ...w.fx, hall: Math.max(w.fx.hall, 0.8), feedback: Math.min(0.75, w.fx.feedback + 0.2) }, time, dur * 0.5);
    this.next = null;
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
    this.secStart = step;
    this.section = w.write(b.kind === "powercut" ? "bloom" : "pulse", this.r);
    this.deps.fx?.(w.fx, time, b.kind === "powercut" ? 0.02 : 1.2);
    this.pendingStepSec = null;
    this.entered = true;
    this.taps = {};
    this.notes = 0;
    this.deps.onWorld?.(w);
    this.deps.onSection?.(this.section);
  }

  private advance(step: number) {
    const name = NEXT[this.section.name];
    this.section = this.next ?? this.world.write(name, this.r);
    this.next = null;
    this.secStart = step;
    this.taps = {};
    this.notes = 0;
    this.deps.onSection?.(this.section);
  }

  /** Ask Claude for the section after this one, while this one plays. */
  private prepareNext() {
    const c = this.deps.composer;
    if (!c || this.asking) return;
    this.asking = true;
    const w = this.world;
    const name = NEXT[this.section.name];
    const forSection = this.section;
    c({ world: w.id, genre: w.genre, name, stepsPerBar: w.stepsPerBar, previous: this.section, player: { notes: this.notes, taps: { ...this.taps } } })
      .then((raw) => {
        if (raw && this.section === forSection && this.deps.composer === c && !this.bridge)
          this.next = { ...clampSection(raw, name, w.stepsPerBar), bars: Math.max(2, Math.min(16, (raw as Section).bars ?? 8)), by: "claude" };
      })
      .catch(() => {})
      .finally(() => {
        this.asking = false;
      });
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
    this.taps[role] = (this.taps[role] ?? 0) + 1;
    this.notes++;
    return this.trim(this.world.tap(role, this.ctx(step)));
  }

  /** The player touched open sky at x (0..1). */
  sky(step: number, x: number, o: Pick<SkyCtx, "bright" | "speed" | "pan">): Out[] {
    this.lastPlayer = step;
    this.notes++;
    this.taps.lead = (this.taps.lead ?? 0) + 1;
    return this.trim(this.world.sky(this.skyDeg(x), { ...this.ctx(step), ...o }));
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
