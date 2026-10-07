// One AudioContext for the page, created inside the first gesture (iOS refuses sound otherwise).
// Graph: worklet dry ─┐
//        worklet send → reverb ─┼→ master → soft clip → limiter → analyser → speakers
//        lyria bed (later) ─────┘
// Adapted from riff-link's engine (../riff-link/src/audio/engine.ts).
import workletUrl from "./worklet.ts?worker&url";
import type { WorkletMsg } from "./worklet";

/** Each world's effects: two reverbs, a dub delay with a filter in its loop, a master filter, modulation. */
export type WorldFx = {
  room: number; // send gain into a short bright room
  hall: number; // send gain into a long hall
  delayTime: number; // seconds
  feedback: number; // 0..0.9
  delayLp: number; // Hz, the filter inside the delay loop
  delayWet: number; // 0..1
  masterLp: number; // Hz
  wobble: number; // cents of tape wobble
  wobbleHz: number;
  duck: number; // sidechain depth 0..0.9
  duckRelease: number; // seconds
};

export type Engine = {
  ctx: BaseAudioContext;
  node: AudioWorkletNode;
  master: GainNode;
  /** Where external audio (the Lyria bed) joins the mix. */
  bedIn: GainNode;
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

/** A generated stereo reverb tail: exponentially decaying noise with a darkening top end. */
export function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number, dark = 0.8): AudioBuffer {
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
      const k = 0.95 - dark * t; // high frequencies die first
      lp += Math.max(0.05, k) * (white - lp);
      d[i] = lp * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

export const DEFAULT_FX: WorldFx = { room: 0.3, hall: 0.3, delayTime: 0.375, feedback: 0.3, delayLp: 2500, delayWet: 0.3, masterLp: 18000, wobble: 0, wobbleHz: 0.3, duck: 0, duckRelease: 0.22 };

export async function buildGraph(ctx: BaseAudioContext): Promise<Engine> {
  await ctx.audioWorklet.addModule(workletUrl);
  const node = new AudioWorkletNode(ctx, "biome-core", { numberOfInputs: 0, numberOfOutputs: 3, outputChannelCount: [2, 2, 2] });

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const volume = ctx.createGain();
  volume.gain.value = 0.9;

  // Reverbs: a short bright room and a long dark hall, mixed per world.
  const sendIn = ctx.createGain();
  const roomIn = ctx.createGain();
  const hallIn = ctx.createGain();
  const room = ctx.createConvolver();
  room.buffer = makeImpulse(ctx, 0.9, 3, 0.5);
  const hall = ctx.createConvolver();
  hall.buffer = makeImpulse(ctx, 6.5, 2.2, 0.85);
  sendIn.connect(roomIn).connect(room).connect(master);
  sendIn.connect(hallIn).connect(hall).connect(master);

  // The dub delay: a filter inside the feedback loop, so each echo is darker than the last.
  const delayIn = ctx.createGain();
  const delay = ctx.createDelay(2);
  const loopLp = ctx.createBiquadFilter();
  loopLp.type = "lowpass";
  const feedback = ctx.createGain();
  const delayWet = ctx.createGain();
  delayIn.connect(delay);
  delay.connect(loopLp);
  loopLp.connect(feedback);
  feedback.connect(delay);
  loopLp.connect(delayWet);
  delayWet.connect(master);
  delayWet.connect(sendIn); // echoes bloom into the reverb

  const bedIn = ctx.createGain();
  bedIn.gain.value = 0;

  const masterLp = ctx.createBiquadFilter();
  masterLp.type = "lowpass";
  masterLp.Q.value = 0.9;

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
  node.connect(sendIn, 1);
  node.connect(delayIn, 2);
  bedIn.connect(master);
  master.connect(masterLp).connect(shaper).connect(limiter).connect(volume).connect(analyser).connect(ctx.destination);

  const stats = { voices: 0, peak: 0 };
  node.port.onmessage = (e) => {
    if (e.data?.type === "stats") Object.assign(stats, e.data);
  };
  const post = (msg: WorkletMsg, transfer?: Transferable[]) => node.port.postMessage(msg, transfer ?? []);

  const glide = (p: AudioParam, v: number, at: number, ramp: number) => {
    p.cancelScheduledValues(at);
    p.setValueAtTime(p.value, at);
    if (ramp <= 0) p.setValueAtTime(v, at);
    else p.linearRampToValueAtTime(v, at + ramp);
  };

  const engine: Engine = {
    ctx,
    node,
    master,
    bedIn,
    analyser,
    stats,
    post,
    fx: { ...DEFAULT_FX },
    setFx(fx, at, ramp) {
      engine.fx = fx;
      glide(roomIn.gain, fx.room, at, ramp);
      glide(hallIn.gain, fx.hall, at, ramp);
      glide(delay.delayTime, fx.delayTime, at, Math.max(0.05, ramp));
      glide(feedback.gain, fx.feedback, at, ramp);
      glide(loopLp.frequency, fx.delayLp, at, ramp);
      glide(delayWet.gain, fx.delayWet, at, ramp);
      glide(masterLp.frequency, fx.masterLp, at, ramp);
      post({ type: "mod", mod: { wobble: fx.wobble, wobbleHz: fx.wobbleHz, duck: fx.duck, duckRelease: fx.duckRelease } });
    },
    throwDelay(at, hold) {
      const fb = feedback.gain;
      fb.cancelScheduledValues(at);
      fb.setValueAtTime(0.86, at);
      fb.setTargetAtTime(engine.fx.feedback, at + hold * 0.4, hold / 3);
      const lp = loopLp.frequency;
      lp.cancelScheduledValues(at);
      lp.setValueAtTime(engine.fx.delayLp * 1.6, at);
      lp.exponentialRampToValueAtTime(Math.max(300, engine.fx.delayLp * 0.4), at + hold);
      lp.setTargetAtTime(engine.fx.delayLp, at + hold, 0.5);
    },
    sweepLp(to, at, dur) {
      const f = masterLp.frequency;
      f.cancelScheduledValues(at);
      f.setValueAtTime(Math.max(40, f.value), at);
      f.exponentialRampToValueAtTime(Math.max(40, to), at + dur);
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
