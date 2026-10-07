// The one AudioWorklet: synth core + procedural bed. Output 0 is dry stereo, output 1 the reverb
// send, output 2 the dub delay send. Messages carry absolute frames, so timing never depends on the main thread.
import { Core, type CoreMsg } from "./dsp/core";
import { Bed } from "./dsp/bed";

declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

export type WorkletMsg = CoreMsg | { type: "bed"; weights: number[]; level?: number };

class BiomeCore extends AudioWorkletProcessor {
  private core = new Core(sampleRate);
  private bed = new Bed(sampleRate);
  private ticks = 0;
  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<WorkletMsg>) => {
      const m = e.data;
      if (m.type === "bed") {
        this.bed.setWeights(m.weights);
        if (m.level !== undefined) this.bed.level = m.level;
      } else this.core.handle(m);
    };
  }
  process(_in: Float32Array[][], outputs: Float32Array[][]) {
    const [dry, send, del] = outputs;
    if (!dry?.[0]) return true;
    const dryR = dry[1] ?? dry[0];
    const sendL = send?.[0] ?? new Float32Array(dry[0].length);
    const sendR = send?.[1] ?? sendL;
    this.core.process(currentFrame, dry[0], dryR, sendL, sendR, del?.[0], del?.[1] ?? del?.[0]);
    this.bed.render(dry[0], dryR);
    // A heartbeat for the UI and the tests: voice count and peak, about 6 times a second.
    if (++this.ticks % 64 === 0) this.port.postMessage({ type: "stats", voices: this.core.voices, peak: this.core.peak });
    return true;
  }
}

registerProcessor("biome-core", BiomeCore);
