// The one AudioWorklet: it wraps the studio (voices, ambience, mixer) and outputs the finished
// stereo mix. Messages carry absolute frames, so timing never depends on the main thread.
import { Studio, type StudioMsg } from "./dsp/studio";

declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

export type WorkletMsg = StudioMsg;

class BiomeCore extends AudioWorkletProcessor {
  private studio = new Studio(sampleRate);
  private ticks = 0;
  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<WorkletMsg>) => this.studio.handle(e.data);
  }
  process(_in: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0];
    if (!out?.[0]) return true;
    this.studio.process(currentFrame, out[0], out[1] ?? out[0]);
    // A heartbeat for the UI and the tests: voice count and peak, about 6 times a second.
    if (++this.ticks % 64 === 0) this.port.postMessage({ type: "stats", voices: this.studio.core.voices, peak: this.studio.mix.peak });
    return true;
  }
}

registerProcessor("biome-core", BiomeCore);
