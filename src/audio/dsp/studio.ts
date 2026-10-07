// The whole sound in one object: voices (core), the procedural ambience (bed) and the mixer. The
// AudioWorklet wraps it, and the offline renders run the same object, so what the tests measure is
// what the browser plays.
import { Bed } from "./bed";
import { Core, type CoreMsg } from "./core";
import { BUS, Mixer, type WorldFx } from "./mix";

export type StudioMsg =
  | CoreMsg
  | { type: "bed"; weights: number[]; level?: number }
  | { type: "fx"; fx: WorldFx; frame: number; ramp: number }
  | { type: "throw"; frame: number; hold: number }
  | { type: "sweep"; frame: number; to: number; dur: number };

export class Studio {
  readonly core: Core;
  readonly bed: Bed;
  readonly mix: Mixer;
  constructor(sr: number, block = 128) {
    this.core = new Core(sr, block);
    this.bed = new Bed(sr);
    this.mix = new Mixer(sr, block);
  }
  handle(m: StudioMsg) {
    if (m.type === "bed") {
      this.bed.setWeights(m.weights);
      if (m.level !== undefined) this.bed.level = m.level;
    } else if (m.type === "fx") {
      this.mix.setFx(m.fx, m.frame, m.ramp);
      this.core.handle({ type: "mod", mod: { wobble: m.fx.wobble, wobbleHz: m.fx.wobbleHz, duck: m.fx.duck, duckRelease: m.fx.duckRelease } });
    } else if (m.type === "throw") this.mix.throwDelay(m.frame, m.hold);
    else if (m.type === "sweep") this.mix.sweepLp(m.frame, m.to, m.dur);
    else this.core.handle(m);
  }
  process(start: number, outL: Float32Array, outR: Float32Array) {
    this.core.process(start, this.mix);
    const [aL, aR] = this.mix.bus[BUS.amb];
    this.bed.render(aL, aR);
    this.mix.process(start, outL, outR);
  }
}
