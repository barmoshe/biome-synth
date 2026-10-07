// One AudioContext for the page, created inside the first gesture (iOS refuses sound otherwise).
// Graph: the worklet (voices, ambience and the whole mix, see dsp/studio.ts) → volume → analyser →
// speakers. Effects, throws and sweeps are messages with absolute frames, not AudioParams, so the
// browser and the offline renders mix the same way.
import workletUrl from "./worklet.ts?worker&url";
import type { WorkletMsg } from "./worklet";
import { DEFAULT_FX, type WorldFx } from "./dsp/mix";

export type { WorldFx } from "./dsp/mix";
export { DEFAULT_FX } from "./dsp/mix";

export type Engine = {
  ctx: BaseAudioContext;
  node: AudioWorkletNode;
  analyser: AnalyserNode;
  post(msg: WorkletMsg, transfer?: Transferable[]): void;
  stats: { voices: number; peak: number };
  /** Glide every effect to a world's settings, starting at `at`, over `ramp` seconds. */
  setFx(fx: WorldFx, at: number, ramp: number): void;
  /** A dub throw: the delay's feedback jumps, then decays over `hold` seconds. */
  throwDelay(at: number, hold: number): void;
  /** Sweep the master filter (submerge, lift-off). */
  sweepLp(to: number, at: number, dur: number): void;
  /** User volume 0..1. */
  setVolume(v: number): void;
  fx: WorldFx;
};

export async function buildGraph(ctx: BaseAudioContext): Promise<Engine> {
  await ctx.audioWorklet.addModule(workletUrl);
  const node = new AudioWorkletNode(ctx, "biome-core", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
  const volume = ctx.createGain();
  volume.gain.value = 0.9;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.6;
  node.connect(volume).connect(analyser).connect(ctx.destination);

  const stats = { voices: 0, peak: 0 };
  node.port.onmessage = (e) => {
    if (e.data?.type === "stats") Object.assign(stats, e.data);
  };
  const post = (msg: WorkletMsg, transfer?: Transferable[]) => node.port.postMessage(msg, transfer ?? []);
  const frame = (t: number) => Math.round(t * ctx.sampleRate);

  const engine: Engine = {
    ctx,
    node,
    analyser,
    stats,
    post,
    fx: { ...DEFAULT_FX },
    setFx(fx, at, ramp) {
      engine.fx = fx;
      post({ type: "fx", fx, frame: frame(at), ramp });
    },
    throwDelay(at, hold) {
      post({ type: "throw", frame: frame(at), hold });
    },
    sweepLp(to, at, dur) {
      post({ type: "sweep", frame: frame(at), to, dur });
    },
    setVolume(v) {
      volume.gain.setTargetAtTime(Math.max(0, Math.min(1, v)), ctx.currentTime, 0.05);
    },
  };
  engine.setFx(DEFAULT_FX, 0, 0);
  return engine;
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
