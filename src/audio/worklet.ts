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

/**
 * The Lyria bed's player: a ring buffer of streamed 48 kHz stereo PCM, resampled to the context
 * rate. It waits for about 1.5 s of audio before playing and goes quiet (and refills) on underrun,
 * so a network hiccup is a short gap, never a glitch loop.
 */
class PcmBed extends AudioWorkletProcessor {
  private buf = new Float32Array(48000 * 2 * 12); // 12 s, interleaved stereo
  private w = 0; // frames written
  private r = 0; // fractional frame read position
  private playing = false;
  private ratio = 48000 / sampleRate;
  private ticks = 0;
  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<{ type: string; pcm?: Float32Array }>) => {
      if (e.data.type === "pcm" && e.data.pcm) this.push(e.data.pcm);
      else if (e.data.type === "flush") (this.w = 0), (this.r = 0), (this.playing = false);
    };
  }
  private get frames() {
    return this.buf.length / 2;
  }
  private push(pcm: Float32Array) {
    const n = pcm.length / 2;
    // Drop the oldest audio if the stream ever runs far ahead of playback.
    if (this.w + n - this.r > this.frames - 1) this.r = this.w + n - this.frames / 2;
    for (let i = 0; i < n; i++) {
      const k = ((this.w + i) % this.frames) * 2;
      this.buf[k] = pcm[i * 2];
      this.buf[k + 1] = pcm[i * 2 + 1];
    }
    this.w += n;
  }
  process(_in: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0];
    if (!out?.[0]) return true;
    const L = out[0];
    const R = out[1] ?? out[0];
    const ahead = this.w - this.r;
    if (!this.playing && ahead > 48000 * 1.5) this.playing = true;
    if (this.playing && ahead < 2) this.playing = false;
    if (this.playing)
      for (let i = 0; i < L.length; i++) {
        const f = Math.floor(this.r);
        const t = this.r - f;
        const a = (f % this.frames) * 2;
        const b = ((f + 1) % this.frames) * 2;
        L[i] = this.buf[a] * (1 - t) + this.buf[b] * t;
        R[i] = this.buf[a + 1] * (1 - t) + this.buf[b + 1] * t;
        this.r += this.ratio;
        if (this.w - this.r < 2) break;
      }
    if (++this.ticks % 64 === 0) this.port.postMessage({ type: "buffer", seconds: (this.w - this.r) / 48000, playing: this.playing });
    return true;
  }
}

registerProcessor("pcm-bed", PcmBed);
