// The lookahead scheduler (from ../riff-link/src/audio/clock.ts): a coarse timer walks a global
// 16th-step counter and hands every step due in the next 120 ms an absolute audio time.
// Each step's time is the previous step's time plus its length, never a summed setTimeout, so
// nothing drifts. Tempo glides toward its target a little each step, so borders between biomes
// with different tempos bend instead of jumping.

export type StepFn = (step: number, time: number, stepSec: number) => void;

export type ClockDeps = {
  now(): number;
  every(ms: number, fn: () => void): () => void;
};

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

export class Clock {
  private tempo: number;
  private target: number;
  private next = 0;
  private stepN = 0;
  private stopTimer: (() => void) | null = null;
  private fns: StepFn[] = [];
  /** Scheduled steps not yet audible, for the UI to drain. */
  readonly pending: { step: number; time: number }[] = [];

  constructor(private deps: ClockDeps, bpm: number) {
    this.tempo = this.target = bpm;
  }

  onStep(fn: StepFn) {
    this.fns.push(fn);
  }

  get bpm() {
    return this.tempo;
  }
  get step() {
    return this.stepN;
  }
  get running() {
    return this.stopTimer !== null;
  }

  setTempo(bpm: number, immediate = false) {
    this.target = Math.max(40, Math.min(200, bpm));
    if (immediate) this.tempo = this.target;
  }

  start(at = this.deps.now() + 0.06) {
    if (this.stopTimer) return;
    this.next = at;
    this.tick();
    this.stopTimer = this.deps.every(TICK_MS, () => this.tick());
  }

  stop() {
    this.stopTimer?.();
    this.stopTimer = null;
    this.pending.length = 0;
  }

  /** Public for tests: schedule everything due within the lookahead. */
  tick() {
    const now = this.deps.now();
    // If the page stalled (a hidden tab), skip ahead instead of firing a burst of late notes.
    if (this.next < now - 0.25) this.next = now + 0.02;
    while (this.next < now + LOOKAHEAD) {
      this.tempo += (this.target - this.tempo) * 0.04;
      if (Math.abs(this.target - this.tempo) < 0.05) this.tempo = this.target;
      const sec = 60 / this.tempo / 4;
      for (const f of this.fns) f(this.stepN, this.next, sec);
      this.pending.push({ step: this.stepN, time: this.next });
      if (this.pending.length > 256) this.pending.shift();
      this.stepN++;
      this.next += sec;
    }
  }
}
