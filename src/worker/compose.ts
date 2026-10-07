// Claude as the conductor: given the world, the section that is playing and what the player did,
// write the next section as JSON. The system prompt is static (the five worlds' rules), so it is
// cached; each request carries only the small, changing part. The browser clamps whatever comes
// back, and if this is slow or fails the world's own section plays: Claude is never in the timing loop.
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";

const SYSTEM = `You are the conductor of Biome Synth, a pixel world people play by touch. A band of creatures plays generative music in five worlds, each its own genre. While one section plays, you write the next one. Your section is clamped and performed by code, on the bar line, so it must be musical, not long.

The worlds (degrees count from the world's root in its own scale; 0 is the root):
- space "Orbit": kosmische sequencer music (Berlin School). D Lydian over a D pedal, 96 bpm, 16 steps per bar, no drums: creatures are planets on orbits; the stars run a 7-note ostinato against the bar. layers.drums controls the moon's sub thrum and the satellite blips; layers.lead the comet; layers.texture the solar wind.
- tundra "Aurora": tintinnabuli (Arvo Part) in free time. B Aeolian, 16 steps per bar at 60 bpm but events come on irregular breaths. Every melody note brings a B-minor triad note. layers.arp is the bells' density, layers.drums the frame drum and ice cracks, layers.pad the drone, layers.texture the snow.
- sea "Deep": dub techno (Basic Channel). E Dorian, 118 bpm, 16 steps per bar, 54% swing. Offbeat chord stabs into a tape delay; chords are roots in degrees (0 = Em11, 3 = A13). layers.drums above 0.3 brings the kick, above 0.5 the hiss hats.
- jungle "Canopy": 12/8 highlife polyrhythm. A major (melodies on its pentatonic degrees 0,1,2,4,5), dotted-quarter 108, 12 steps per bar. Bell timeline, log drums, shaker; two creatures split one melody (kotekan). Chords cycle per bar; the default plan is 0,3,4,3 (A, D, E, D).
- neon "Neon": UK 2-step garage with Blade Runner brass. F# natural minor, 132 bpm, 16 steps per bar, 58% swing, sidechain pumping. Chords per bar as degrees; the default is 0,5,2,6 (i, VI, III, VII).

A section: name (drift, pulse, bloom, surge, dissolve: the arc), bars (2 to 16), energy (0 to 1), layers (0 to 1 each: bass, pad, arp, lead, drums, texture), motif (optional, "step:len:degree" tokens separated by spaces, steps in the world's own grid, up to two bars, empty string if none), chords (optional degrees, one per bar, empty array to keep the world's plan), lyria (steering for an optional AI audio bed under the band: 1 to 3 short prompts in the world's genre with weights 0.1 to 2, and density and brightness 0 to 1).

How to conduct: follow the arc the name implies, but answer the player. If they played a lot, leave them room (lower lead, keep drums steady); if they were quiet, let the band carry more. Change one or two things per section, not everything. Keep each world in its genre. Never write prose; return only the section.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "bars", "energy", "layers", "motif", "chords", "lyria"],
  properties: {
    name: { type: "string", enum: ["drift", "pulse", "bloom", "surge", "dissolve"] },
    bars: { type: "integer" },
    energy: { type: "number" },
    layers: {
      type: "object",
      additionalProperties: false,
      required: ["bass", "pad", "arp", "lead", "drums", "texture"],
      properties: {
        bass: { type: "number" },
        pad: { type: "number" },
        arp: { type: "number" },
        lead: { type: "number" },
        drums: { type: "number" },
        texture: { type: "number" },
      },
    },
    motif: { type: "string" },
    chords: { type: "array", items: { type: "integer" } },
    lyria: {
      type: "object",
      additionalProperties: false,
      required: ["prompts", "density", "brightness"],
      properties: {
        prompts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "weight"],
            properties: { text: { type: "string" }, weight: { type: "number" } },
          },
        },
        density: { type: "number" },
        brightness: { type: "number" },
      },
    },
  },
} as const;

export type ComposeBody = {
  world: string;
  genre: string;
  name: string;
  stepsPerBar: number;
  previous: unknown;
  player: { notes: number; taps: Record<string, number> };
};

/** Validate the browser's request: small, known fields only. */
export function readBody(raw: unknown): ComposeBody | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const worlds = ["space", "tundra", "sea", "jungle", "neon"];
  if (typeof r.world !== "string" || !worlds.includes(r.world)) return null;
  const names = ["drift", "pulse", "bloom", "surge", "dissolve"];
  const p = (r.player ?? {}) as Record<string, unknown>;
  const taps: Record<string, number> = {};
  if (p.taps && typeof p.taps === "object")
    for (const [k, v] of Object.entries(p.taps as Record<string, unknown>).slice(0, 8)) if (typeof v === "number") taps[k.slice(0, 8)] = Math.min(999, v);
  const prev = JSON.stringify(r.previous ?? {});
  return {
    world: r.world,
    genre: typeof r.genre === "string" ? r.genre.slice(0, 60) : "",
    name: typeof r.name === "string" && names.includes(r.name) ? r.name : "bloom",
    stepsPerBar: r.stepsPerBar === 12 ? 12 : 16,
    previous: prev.length < 4000 ? JSON.parse(prev) : {},
    player: { notes: typeof p.notes === "number" ? Math.min(9999, p.notes) : 0, taps },
  };
}

export type ComposeResult = { ok: true; section: unknown } | { ok: false; status: number; reason: string };

export async function compose(apiKey: string, body: ComposeBody): Promise<ComposeResult> {
  const client = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // A small composing job: low effort keeps it quick and cheap.
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA as unknown as Record<string, unknown> } },
      system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `World: ${body.world} (${body.genre}, ${body.stepsPerBar} steps per bar). Write the "${body.name}" section that follows this one:\n${JSON.stringify(body.previous)}\nDuring it the player played ${body.player.notes} notes; taps by role: ${JSON.stringify(body.player.taps)}.`,
        },
      ],
    });
    if (res.stop_reason === "refusal") return { ok: false, status: 204, reason: "refused" };
    if (res.stop_reason === "max_tokens") return { ok: false, status: 502, reason: "truncated" };
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    try {
      return { ok: true, section: JSON.parse(text) };
    } catch {
      return { ok: false, status: 502, reason: "unparseable" };
    }
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return { ok: false, status: 429, reason: "rate limited" };
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, status: 503, reason: "not configured" };
    if (e instanceof Anthropic.APIConnectionTimeoutError) return { ok: false, status: 504, reason: "timeout" };
    if (e instanceof Anthropic.APIError) return { ok: false, status: 502, reason: `upstream ${e.status ?? ""}`.trim() };
    return { ok: false, status: 500, reason: "error" };
  }
}
