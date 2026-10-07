// The Lyria RealTime bed: an AI audio stream under the band, steered by where you are and what
// the band is doing. The Worker relays the session (it holds the key and sends the setup); here we
// decode the PCM into the bed player and send steering: weighted prompts that follow the camera's
// blend of worlds and Claude's section, density and brightness from the energy, and on entering a
// world a context reset with its tempo and key (Lyria only takes bpm and scale on a reset).
// Message shapes from @google/genai 2.27.0's live.music session (BidiGenerateMusic).
import type { Engine } from "../audio/engine";
import { BIOMES } from "../shared/biomes";
import type { Section } from "../music/pattern";
import type { WorldMusic } from "../music/world";

/** Each world's key as Lyria names it (the notes of the world's scale). */
const SCALE: Record<string, string> = {
  space: "A_MAJOR_G_FLAT_MINOR", // D Lydian = the A major notes
  tundra: "D_MAJOR_B_MINOR", // B Aeolian
  sea: "D_MAJOR_B_MINOR", // E Dorian = the D major notes
  jungle: "A_MAJOR_G_FLAT_MINOR",
  neon: "A_MAJOR_G_FLAT_MINOR", // F# minor
};

export type LyriaState = "off" | "connecting" | "buffering" | "playing" | "error";

export class LyriaBed {
  private ws: WebSocket | null = null;
  private node: AudioWorkletNode | null = null;
  private lastPrompts = "";
  private lastConfig = "";
  private world = "";
  state: LyriaState = "off";
  onState?: (s: LyriaState, detail?: string) => void;

  constructor(private engine: Engine) {}

  private set(s: LyriaState, detail?: string) {
    if (s === this.state && !detail) return;
    this.state = s;
    this.onState?.(s, detail);
  }

  start(world: WorldMusic) {
    if (this.ws) return;
    this.set("connecting");
    this.node ??= this.engine.bedPlayer();
    this.node.port.onmessage = (e) => {
      if (e.data?.type === "buffer" && this.ws) this.set(e.data.playing ? "playing" : "buffering");
    };
    const url = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/lyria`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      this.world = "";
      this.enter(world, 0.5);
      this.send({ playbackControl: "PLAY" });
      this.engine.setBedLevel(0.55, 3);
    };
    ws.onmessage = (e) => this.receive(e.data);
    ws.onerror = () => this.set("error", "The AI bed could not connect");
    ws.onclose = (e) => {
      this.ws = null;
      this.engine.setBedLevel(0, 1.5);
      if (this.state !== "off") this.set(e.code === 4000 ? "off" : "error", e.code === 4000 ? "The AI bed sleeps after ten minutes" : undefined);
    };
  }

  stop() {
    this.set("off");
    this.engine.setBedLevel(0, 1.2);
    const ws = this.ws;
    this.ws = null;
    setTimeout(() => {
      try {
        ws?.send(JSON.stringify({ playbackControl: "STOP" }));
        ws?.close();
      } catch {}
      this.node?.port.postMessage({ type: "flush" });
    }, 1300);
  }

  private send(m: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  private async receive(data: unknown) {
    const text = typeof data === "string" ? data : data instanceof Blob ? await data.text() : "";
    if (!text) return;
    let m: { serverContent?: { audioChunks?: { data?: string }[] }; filteredPrompt?: unknown };
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    for (const ch of m.serverContent?.audioChunks ?? []) if (ch.data) this.play(ch.data);
  }

  /** base64 16-bit PCM, 48 kHz stereo interleaved, into the bed player. */
  private play(b64: string) {
    const bin = atob(b64);
    const n = bin.length >> 1;
    const pcm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let v = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
      if (v >= 0x8000) v -= 0x10000;
      pcm[i] = v / 32768;
    }
    this.node?.port.postMessage({ type: "pcm", pcm }, [pcm.buffer]);
  }

  /** A new world: its tempo and key need a context reset, so the bed dips while it re-forms. */
  enter(w: WorldMusic, energy: number) {
    if (w.id === this.world) return;
    this.world = w.id;
    this.lastConfig = "";
    this.config(w, energy, true);
    if (this.state === "playing" || this.state === "buffering") {
      this.engine.setBedLevel(0.15, 0.8);
      setTimeout(() => this.ws && this.engine.setBedLevel(0.55, 2.5), 2500);
    }
    this.send({ playbackControl: "RESET_CONTEXT" });
  }

  private config(w: WorldMusic, energy: number, withKey = false) {
    const cfg: Record<string, unknown> = {
      density: Math.round((0.15 + 0.7 * energy) * 100) / 100,
      brightness: Math.round((0.3 + 0.5 * energy) * 100) / 100,
      guidance: 4,
      // The band has the drums; in the calm worlds the bed stays ambient.
      muteDrums: w.id === "space" || w.id === "tundra",
    };
    if (withKey) {
      cfg.bpm = Math.round(Math.max(60, Math.min(200, w.bpm)));
      cfg.scale = SCALE[w.id];
    }
    const s = JSON.stringify(cfg);
    if (s === this.lastConfig && !withKey) return;
    this.lastConfig = s;
    this.send({ musicGenerationConfig: cfg });
  }

  /** Steer from the camera's blend and the playing section; called a couple of times a second. */
  steer(weights: number[], section: Section, w: WorldMusic) {
    if (!this.ws) return;
    const prompts: { text: string; weight: number }[] = [];
    // Weights move in tenths, so a slow drift across a border sends a handful of updates, not hundreds.
    weights.forEach((wt, i) => wt > 0.08 && prompts.push({ text: BIOMES[i].prompt, weight: Math.max(0.1, Math.round(wt * 10) / 10) }));
    for (const p of section.lyria?.prompts ?? []) prompts.push({ text: p.text, weight: Math.round(p.weight * 0.6 * 100) / 100 });
    const key = JSON.stringify(prompts);
    // Only resend when the blend has moved enough to hear: prompt changes are not free.
    if (key !== this.lastPrompts && prompts.length) {
      this.lastPrompts = key;
      this.send({ clientContent: { weightedPrompts: prompts.slice(0, 4) } });
    }
    this.config(w, section.lyria?.density ?? section.energy);
  }
}
