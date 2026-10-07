// One AudioContext for the page, created inside the first gesture (iOS refuses sound otherwise).
// Graph: worklet dry ─┐
//        worklet send → reverb ─┼→ master → soft clip → limiter → analyser → speakers
//        lyria bed (later) ─────┘
// Adapted from riff-link's engine (../riff-link/src/audio/engine.ts).
import workletUrl from "./worklet.ts?worker&url";
import type { WorkletMsg } from "./worklet";

export type Engine = {
  ctx: BaseAudioContext;
  node: AudioWorkletNode;
  master: GainNode;
  /** Where external audio (the Lyria bed) joins the mix. */
  bedIn: GainNode;
  reverbSend: GainNode;
  analyser: AnalyserNode;
  post(msg: WorkletMsg, transfer?: Transferable[]): void;
  stats: { voices: number; peak: number };
};

/** A generated stereo reverb tail: exponentially decaying noise with a darkening top end. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.round(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    let seed = ch ? 0x2545f491 : 0x9e3779b9;
    for (let i = 0; i < len; i++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const white = ((seed >>> 0) / 4294967296) * 2 - 1;
      const t = i / len;
      const k = 0.9 - 0.8 * t; // high frequencies die first
      lp += k * (white - lp);
      d[i] = lp * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export async function buildGraph(ctx: BaseAudioContext): Promise<Engine> {
  await ctx.audioWorklet.addModule(workletUrl);
  const node = new AudioWorkletNode(ctx, "biome-core", { numberOfInputs: 0, numberOfOutputs: 2, outputChannelCount: [2, 2] });

  const master = ctx.createGain();
  master.gain.value = 0.9;

  const reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(ctx, 3.2, 2.6);
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.8;

  const bedIn = ctx.createGain();
  bedIn.gain.value = 0;

  // Soft clip so stacked voices never hard-clip, then a limiter at about -1 dB.
  const shaper = ctx.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
  }
  shaper.curve = curve;
  shaper.oversample = "2x";
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;

  node.connect(master, 0);
  node.connect(reverbSend, 1);
  reverbSend.connect(reverb).connect(master);
  bedIn.connect(master);
  master.connect(shaper).connect(limiter).connect(analyser).connect(ctx.destination);

  const stats = { voices: 0, peak: 0 };
  node.port.onmessage = (e) => {
    if (e.data?.type === "stats") Object.assign(stats, e.data);
  };

  return {
    ctx,
    node,
    master,
    bedIn,
    reverbSend,
    analyser,
    stats,
    post: (msg, transfer) => node.port.postMessage(msg, transfer ?? []),
  };
}

let live: Promise<Engine> | null = null;

/** The live engine, created on first call. Call it from a user gesture. */
export function getEngine(): Promise<Engine> {
  if (live) {
    void live.then((e) => {
      const ctx = e.ctx as AudioContext;
      if (ctx.state !== "running") void ctx.resume();
    });
    return live;
  }
  // iOS: without this the ring/silent switch mutes Web Audio.
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = "playback";

  const ctx = new AudioContext({ latencyHint: "interactive" });
  // Unlock inside the gesture: a silent one-sample buffer.
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
  src.connect(ctx.destination);
  src.start();
  void ctx.resume();

  // A running AudioContext never sleeps on its own: suspend it with the tab.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
  // iOS can interrupt the context (a call, Siri); resume on the next touch.
  const revive = () => {
    if ((ctx.state as string) === "interrupted" || ctx.state === "suspended") if (!document.hidden) void ctx.resume();
  };
  window.addEventListener("pointerdown", revive, { passive: true });

  live = buildGraph(ctx).then((e) => {
    (window as unknown as { __biome: Engine }).__biome = e; // for verification only
    return e;
  });
  return live;
}

export function peekEngine(): Promise<Engine> | null {
  return live;
}

let levelBuf: Float32Array<ArrayBuffer> | null = null;
let freqBuf: Uint8Array<ArrayBuffer> | null = null;

/** Output RMS (0..1) and three bands for the visuals. */
export function readLevels(e: Engine, out: { rms: number; low: number; mid: number; high: number }) {
  const a = e.analyser;
  if (!levelBuf || levelBuf.length !== a.fftSize) levelBuf = new Float32Array(a.fftSize);
  if (!freqBuf || freqBuf.length !== a.frequencyBinCount) freqBuf = new Uint8Array(a.frequencyBinCount);
  a.getFloatTimeDomainData(levelBuf);
  let sum = 0;
  for (let i = 0; i < levelBuf.length; i++) sum += levelBuf[i] * levelBuf[i];
  out.rms = Math.sqrt(sum / levelBuf.length);
  a.getByteFrequencyData(freqBuf);
  const hz = e.ctx.sampleRate / a.fftSize;
  let lo = 0, mi = 0, hi = 0, nl = 0, nm = 0, nh = 0;
  for (let i = 1; i < freqBuf.length; i++) {
    const f = i * hz;
    const v = freqBuf[i] / 255;
    if (f < 180) (lo += v), nl++;
    else if (f < 1500) (mi += v), nm++;
    else if (f < 8000) (hi += v), nh++;
  }
  out.low = nl ? lo / nl : 0;
  out.mid = nm ? mi / nm : 0;
  out.high = nh ? hi / nh : 0;
}
