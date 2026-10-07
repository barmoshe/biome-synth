// The lookahead scheduler (from ../riff-link/src/audio/clock.ts): a coarse timer walks a global
// step counter and hands every step due in the next 120 ms an absolute audio time. Each step's
// time is the previous step's time plus its length, never a summed setTimeout, so nothing drifts.
// The step length belongs to the world that is playing (a 16th at 132, an eighth of 12/8 at 108);
// it glides toward a new length during a beatless bridge, or jumps on a hard cut.

export type StepFn = (step: number, time: number, stepSec: number) => void;

export type ClockDeps = {
  now(): number;
  every(ms: number, fn: () => void): () => void;
};

const LOOKAHEAD = 0.12;
const TICK_MS = 25;

export class Clock {
  private sec: number;
  private target: number;
  private next = 0;
  private stepN = 0;
  private stopTimer: (() => void) | null = null;
  private fns: StepFn[] = [];
  /** Scheduled steps not yet audible, for the UI to drain. */
  readonly pending: { step: number; time: number }[] = [];

  constructor(private deps: ClockDeps, stepSec: number) {
    this.sec = this.target = stepSec;
  }

  onStep(fn: StepFn) {
    this.fns.push(fn);
  }

  /** The current step length in seconds. */
  get stepSec() {
    return this.sec;
  }
  get step() {
    return this.stepN;
  }
  get running() {
    return this.stopTimer !== null;
  }

  setStepSec(sec: number, immediate = false) {
    this.target = Math.max(0.03, Math.min(1, sec));
    if (immediate) this.sec = this.target;
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
      this.sec += (this.target - this.sec) * 0.06;
      if (Math.abs(this.target - this.sec) < 0.0005) this.sec = this.target;
      const sec = this.sec;
      for (const f of this.fns) f(this.stepN, this.next, sec);
      this.pending.push({ step: this.stepN, time: this.next });
      if (this.pending.length > 256) this.pending.shift();
      this.stepN++;
      this.next += sec;
    }
  }
}
