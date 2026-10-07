// The glue: world + engine + clock + conductor + input. Lives outside React; the HUD reads a
// small snapshot through subscribe().
import { Clock } from "./audio/clock";
import { getEngine, readLevels, type Engine } from "./audio/engine";
import type { NoteEvent } from "./audio/dsp/core";
import { Conductor, type Composer } from "./music/conductor";
import type { Section } from "./music/pattern";
import type { Out } from "./music/world";
import { BIOMES, ROLES, type Role } from "./shared/biomes";
import { P } from "./world/palette";
import { BW, STAGE, WORLD } from "./world/types";
import { World, type Critter } from "./world/world";

export type Snapshot = {
  started: boolean;
  biome: number;
  weights: number[];
  section: Section["name"];
  sectionBy: "band" | "claude";
  /** The world the band is playing (it lags the camera by a bridge). */
  genre: string;
  bpm: number;
  bridging: boolean;
  bars: number;
  drift: 0 | 1 | 2;
  /** Fraction of the loop, 0..1, for the map strip. */
  pos: number;
  bandMode: "local" | "claude" | "waking";
  help: boolean;
};

const DRIFT = [0, 9, 26];
/** Note colours by scale degree: the ribbon and the bursts share them. */
const NOTE_C = [P.goldGlow, P.mint, P.skyLight, P.pink, P.lime, P.lilac, P.peach];

let held = 1;
const nextId = () => ++held;

type Pointer = {
  critter: Critter | null;
  /** The last creature this finger strummed, so a creature plays once per pass. */
  over: Critter | null;
  holdId?: number;
  lastDeg?: number;
  x: number;
  y: number;
  t: number;
  /** Smoothed velocity, art px per second. */
  vx: number;
  vy: number;
  moved: number;
};

export class Stage {
  world = new World();
  engine: Engine | null = null;
  clock: Clock | null = null;
  conductor: Conductor;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private scale = 1;
  private raf = 0;
  private last = 0;
  private visQueue: { time: number; role: Role; from: Out["from"]; vel: number; who?: Critter | null }[] = [];
  private levels = { rms: 0, low: 0, mid: 0, high: 0 };
  private travel: { from: number; to: number; t: number } | null = null;
  private keysHeld = new Set<string>();
  private pointers = new Map<number, Pointer>();
  private bedTimer = 0;
  private listeners = new Set<() => void>();
  snap: Snapshot;

  constructor() {
    const seed = (Math.random() * 1e9) | 0;
    // The journey starts in Orbit, the first biome.
    this.world.camX = BW / 2 - 250;
    this.conductor = new Conductor({
      seed,
      target: () => this.world.dominant(),
      weightOf: (i) => this.world.weights()[i],
      fx: (fx, at, ramp) => this.engine?.setFx(fx, at, ramp),
      sweep: (to, at, dur) => this.engine?.sweepLp(to, at, dur),
      tapeStop: (at, seconds) => this.engine?.post({ type: "tapestop", frame: Math.round(at * this.engine.ctx.sampleRate), seconds }),
      onSection: () => this.emit(),
      onWorld: () => this.emit(),
      daylight: () => {
        const h = new Date().getHours() + new Date().getMinutes() / 60;
        return 0.5 - 0.5 * Math.cos(((h - 2) / 24) * Math.PI * 2);
      },
    });
    this.snap = this.makeSnap(false);
  }

  // ---------- HUD store ----------

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnap = () => this.snap;
  private makeSnap(started: boolean): Snapshot {
    const w = this.world.weights();
    const c = this.conductor.section;
    return {
      started,
      biome: this.world.dominant(),
      weights: w,
      section: c.name,
      sectionBy: c.by ?? "band",
      genre: this.conductor.world.genre,
      bpm: this.conductor.world.bpm,
      bridging: this.conductor.transitioning,
      bars: c.bars,
      drift: this.snap?.drift ?? 1,
      pos: (((this.world.centerX % WORLD) + WORLD) % WORLD) / WORLD,
      bandMode: this.snap?.bandMode ?? "local",
      help: this.snap?.help ?? false,
    };
  }
  private emit(patch: Partial<Snapshot> = {}) {
    this.snap = { ...this.makeSnap(this.snap.started), ...patch };
    for (const l of this.listeners) l();
  }

  // ---------- lifecycle ----------

  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.fit();
    window.addEventListener("resize", this.fit);
    canvas.addEventListener("pointerdown", this.onDown);
    window.addEventListener("pointermove", this.onMove);
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("visibilitychange", this.onVisible);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  unmount() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.fit);
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onUp);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.clock?.stop();
  }

  /**
   * Integer scale in device pixels, so the art never blurs. Aim for a logical height near 270
   * (216-288); on narrow screens let the width decide (about 280 wide) and give the rest to sky.
   */
  private fit = () => {
    const c = this.canvas;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const vw = Math.round(window.innerWidth * dpr);
    const vh = Math.round(window.innerHeight * dpr);
    let k = Math.max(1, Math.round(vh / STAGE));
    while (k > 1 && vh / k < 216) k--;
    while (vh / k > 288) k++;
    k = Math.max(1, Math.min(k, Math.floor(vw / 280)));
    const W = Math.ceil(vw / k);
    const H = Math.ceil(vh / k);
    this.scale = k / dpr;
    c.width = W;
    c.height = H;
    c.style.width = `${(W * k) / dpr}px`;
    c.style.height = `${(H * k) / dpr}px`;
    this.world.resize(W, H);
  };

  private onVisible = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.frame);
    }
  };

  /** First gesture: build the engine and start the band. */
  async start() {
    if (this.engine) return;
    const e = await getEngine();
    this.engine = e;
    const ctx = e.ctx;
    const clock = new Clock({ now: () => ctx.currentTime, every: (ms, fn) => { const id = setInterval(fn, ms); return () => clearInterval(id); } }, this.conductor.stepSec);
    clock.onStep((step, time) => this.onStep(step, time));
    this.clock = clock;
    const now = ctx.currentTime + 0.05;
    e.setFx(this.conductor.world.fx, now, 0);
    this.postBed();
    // A three-note hello so you know sound works, then the band.
    [0, 0.5, 1].forEach((x, i) => this.play(this.conductor.sky(0, x, { bright: 0.6, speed: 0, pan: x - 0.5 }), now + i * 0.12, true));
    clock.start(now + 0.5);
    this.emit({ started: true });
  }

  setComposer(c: Composer | null, mode: Snapshot["bandMode"]) {
    this.conductor.setComposer(c);
    this.emit({ bandMode: mode });
  }

  private onStep(step: number, time: number) {
    const c = this.conductor;
    const outs = c.hits(step, time);
    // The clock follows the world: a glide during a bridge, exact from the new world's downbeat.
    this.clock!.setStepSec(c.pendingStepSec ?? c.stepSec, c.entered);
    c.entered = false;
    this.play(outs, time);
  }

  /** Send outs to the worklet at `time` (plus each one's offset) and queue their creatures. */
  private play(outs: Out[], time: number, quiet = false) {
    const e = this.engine;
    if (!e || !outs.length) return;
    const sr = e.ctx.sampleRate;
    const evs: NoteEvent[] = [];
    for (const o of outs) {
      const t = time + (o.offset ?? 0);
      evs.push({ frame: Math.round(t * sr), note: o.note, send: o.send, delay: o.delay, ducks: o.ducks, id: o.id });
      if (o.throw) e.throwDelay(t, o.throw);
      if (!o.silent && !quiet) this.visQueue.push({ time: t, role: o.role, from: o.from, vel: o.note.vel });
    }
    e.post({ type: "notes", evs });
    // Keep the creature queue in time order: player notes jump ahead of scheduled band notes.
    this.visQueue.sort((a, b) => a.time - b.time);
  }

  private postBed() {
    this.engine?.post({ type: "bed", weights: this.world.weights(), level: 0.5 });
  }

  /** The step that is sounding now. */
  private audibleStep() {
    const c = this.clock;
    const e = this.engine;
    if (!c || !e) return 0;
    const now = e.ctx.currentTime;
    let s = c.step;
    for (const p of c.pending) if (p.time <= now) s = p.step;
    return s;
  }

  // ---------- frame ----------

  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const w = this.world;

    // Camera: a quick glide when travelling, else the drift plus held arrow keys.
    if (this.travel) {
      const tr = this.travel;
      tr.t = Math.min(1, tr.t + dt / 1.6);
      const e = tr.t < 0.5 ? 2 * tr.t * tr.t : 1 - Math.pow(-2 * tr.t + 2, 2) / 2;
      w.camX = tr.from + (tr.to - tr.from) * e;
      if (tr.t >= 1) this.travel = null;
    } else {
      let v = DRIFT[this.snap.drift];
      if (this.keysHeld.has("ArrowRight")) v += 90;
      if (this.keysHeld.has("ArrowLeft")) v -= 90;
      w.camX += v * dt;
    }

    let beat = 0;
    if (this.engine) {
      readLevels(this.engine, this.levels);
      const t = this.engine.ctx.currentTime;
      // Anticipation: about 70 ms before a band note, its critter is chosen and starts to squash,
      // so the stretch lands on the beat.
      for (const v of this.visQueue) {
        if (v.time - t > 0.07) break;
        if (v.from !== "player" && v.who === undefined) {
          v.who = w.nextFor(v.role);
          if (v.who) v.who.pre = 1;
        }
      }
      while (this.visQueue.length && this.visQueue[0].time <= t) {
        const v = this.visQueue.shift()!;
        if (v.from !== "player") w.play(v.role, v.from, v.vel, v.who ?? undefined);
      }
      if (this.clock) {
        const spb = this.conductor.world.stepsPerBeat;
        beat = ((this.audibleStep() % spb) + spb) % spb / spb;
      }
      this.bedTimer -= dt;
      if (this.bedTimer <= 0) {
        this.bedTimer = 0.2;
        this.postBed();
      }
    }

    w.update(dt, this.levels, beat);
    if (this.ctx) w.render(this.ctx, now / 1000, this.levels, beat);

    // The HUD only needs a few updates a second.
    const b = w.dominant();
    if (b !== this.snap.biome || Math.abs(this.snap.pos - (((w.centerX % WORLD) + WORLD) % WORLD) / WORLD) > 0.002) this.emit();
    this.raf = requestAnimationFrame(this.frame);
  };

  // ---------- input ----------

  private toArt(e: PointerEvent | WheelEvent): [number, number] {
    const r = this.canvas!.getBoundingClientRect();
    return [(e.clientX - r.left) / this.scale, (e.clientY - r.top) / this.scale];
  }

  private onDown = async (e: PointerEvent) => {
    e.preventDefault();
    if (!this.engine) {
      await this.start();
      return;
    }
    const [x, y] = this.toArt(e);
    const critter = this.world.pick(x, y);
    const info: Pointer = { critter, over: critter, x, y, t: performance.now(), vx: 0, vy: 0, moved: 0 };
    this.pointers.set(e.pointerId, info);
    if (critter) this.tapCritter(critter, info);
    else info.lastDeg = this.skyNote(x, y, 0);
    this.world.trail(e.pointerId, x, y, NOTE_C[(info.lastDeg ?? 0) % NOTE_C.length]);
    navigator.vibrate?.(8);
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && this.canvas) {
      const [hx, hy] = this.toArt(e);
      const over = this.world.pick(hx, hy, 2);
      this.world.setHover(over);
      this.canvas.style.cursor = over ? "pointer" : "crosshair";
    }
    const info = this.pointers.get(e.pointerId);
    if (!info || !this.engine) return;
    const [x, y] = this.toArt(e);
    const now = performance.now();
    const dt = Math.max(1, now - info.t) / 1000;
    const k = 0.35;
    info.vx += ((x - info.x) / dt - info.vx) * k;
    info.vy += ((y - info.y) / dt - info.vy) * k;
    info.moved += Math.hypot(x - info.x, y - info.y);
    info.x = x;
    info.y = y;
    info.t = now;
    const speed = Math.hypot(info.vx, info.vy);

    // The ribbon follows the finger, and the finger stirs the weather.
    this.world.trail(e.pointerId, x, y, NOTE_C[(info.lastDeg ?? 0) % NOTE_C.length], speed);
    this.world.stir(x, y, info.vx, info.vy);

    // Sweeping over creatures strums them, each once per pass.
    const c = this.world.pick(x, y, 1);
    if (c && c !== info.over) {
      info.over = c;
      this.playRole(c.role, c, undefined, Math.min(1, 0.55 + speed / 600));
      navigator.vibrate?.(4);
      return;
    }
    if (!c) info.over = null;
    if (c) return;
    // Sliding across the sky plays each new note it crosses: fast is short and bright, slow sings.
    const deg = this.skyDeg(x);
    if (deg !== info.lastDeg) info.lastDeg = this.skyNote(x, y, speed);
  };

  private onUp = (e: PointerEvent) => {
    const info = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    this.world.trailEnd(e.pointerId);
    const eng = this.engine;
    if (!info || !eng) return;
    if (info.holdId) eng.post({ type: "release", id: info.holdId, frame: Math.round(eng.ctx.currentTime * eng.ctx.sampleRate) });
    // A fast flick throws a shooting star that plays a cascade in tempo.
    const speed = Math.hypot(info.vx, info.vy);
    if (speed > 260 && info.moved > 20 && performance.now() - info.t < 80) this.fling(info, speed);
  };

  private fling(info: Pointer, speed: number) {
    const e = this.engine!;
    const c = this.conductor;
    const sec = c.stepSec;
    const n = Math.max(4, Math.min(8, Math.round(speed / 140)));
    const dir = info.vy < -Math.abs(info.vx) * 0.3 ? 1 : info.vy > Math.abs(info.vx) * 0.3 ? -1 : info.vx >= 0 ? 1 : -1;
    const x0 = info.x / this.world.W;
    const t0 = e.ctx.currentTime + 0.02;
    const step = this.audibleStep();
    const colors: number[] = [];
    // The cascade walks the world's own sky notes, one per step, in its own voice.
    for (let i = 0; i < n; i++) {
      const x = Math.max(0, Math.min(1, x0 + dir * (i + 1) * 0.055));
      const outs = c.sky(step + i, x, { bright: 0.85, speed: 400, pan: x - 0.5 }).map((o) => ({ ...o, from: "echo" as const }));
      this.play(outs, t0 + i * sec, true);
      colors.push(NOTE_C[c.skyDeg(x) % NOTE_C.length]);
    }
    this.world.fling(info.x, info.y, info.vx, info.vy, colors, sec);
    navigator.vibrate?.([6, 30, 6]);
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.travel = null;
    this.world.camX += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 0.4;
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") && e.key === " ") return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      this.keysHeld.add(e.key);
      this.travel = null;
      e.preventDefault();
      return;
    }
    if (e.key === "h" || e.key === "H" || e.key === "?") return this.emit({ help: !this.snap.help });
    if (e.key === "Escape") return this.emit({ help: false });
    if (e.key === "d" || e.key === "D") return this.cycleDrift();
    const n = Number(e.key);
    if (n >= 1 && n <= ROLES.length && !e.repeat) {
      void this.start().then(() => {
        const role = ROLES[n - 1];
        const c = this.world.critters.find((k) => k.role === role && k.biome === this.world.dominant() && this.world.screenOf(k)) ?? null;
        if (c) this.tapCritter(c, {});
        else this.playRole(role, null);
      });
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keysHeld.delete(e.key);
  };

  cycleDrift() {
    this.emit({ drift: ((this.snap.drift + 1) % 3) as 0 | 1 | 2 });
  }

  toggleHelp(v?: boolean) {
    this.emit({ help: v ?? !this.snap.help });
  }

  /** Glide to the middle of biome i, the shorter way round. */
  goTo(i: number) {
    const target = i * BW + BW / 2 - this.world.W / 2;
    const cur = this.world.camX;
    let d = (((target - cur) % WORLD) + WORLD) % WORLD;
    if (d > WORLD / 2) d -= WORLD;
    this.travel = { from: cur, to: cur + d, t: 0 };
  }

  private tapCritter(c: Critter, info: { holdId?: number }) {
    const id = c.role === "pad" ? nextId() : undefined;
    info.holdId = id;
    this.playRole(c.role, c, id);
  }

  private playRole(role: Role, c: Critter | null, id?: number, vel = 1) {
    const e = this.engine;
    if (!e) return;
    const outs = this.conductor.tap(this.audibleStep(), role).map((o) => ({ ...o, id, note: { ...o.note, vel: o.note.vel * vel } }));
    this.play(outs, e.ctx.currentTime + 0.01, true);
    this.world.play(role, "player", vel, c ?? undefined);
  }

  private skyDeg(x: number) {
    return this.conductor.skyDeg(x / this.world.W);
  }

  /** A lead note from open sky. `speed` in art px/s: fast slides play short and bright, slow ones sing. */
  private skyNote(x: number, y: number, speed: number): number {
    const e = this.engine;
    if (!e) return 0;
    const height = Math.max(0, Math.min(1, 1 - y / this.world.H));
    const fast = Math.min(1, speed / 500);
    const bright = Math.min(1, height * 0.8 + fast * 0.4);
    const outs = this.conductor.sky(this.audibleStep(), x / this.world.W, { bright, speed, pan: (x / this.world.W) * 1.2 - 0.6 });
    this.play(outs, e.ctx.currentTime + 0.01, true);
    const deg = this.skyDeg(x);
    this.world.burst(x, y, NOTE_C[((deg % NOTE_C.length) + NOTE_C.length) % NOTE_C.length], 1 - fast * 0.6);
    return deg;
  }
}
