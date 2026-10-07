// One Worker: the SPA as static assets, plus the AI band's two endpoints.
// - POST /api/compose: Claude writes the next section (src/worker/compose.ts).
// - GET  /api/lyria:   a WebSocket relay to Lyria RealTime. The Worker holds the key, opens the
//   session and sends the setup itself; the browser may only send steering messages (prompts,
//   config, playback). Sessions end after ten minutes.
// - GET  /api/status:  which parts of the AI band are available here.
// Keys live in Worker secrets (ANTHROPIC_API_KEY, GEMINI_API_KEY), never in the browser.
import { Hono, type Context } from "hono";
import { compose, readBody } from "./compose";

type Env = {
  ASSETS: Fetcher;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  /** "0" switches the AI band off without a deploy (the budget switch). */
  AI_ENABLED?: string;
  /** "1" serves a canned section instead of calling Claude (local testing without a key). */
  COMPOSE_FIXTURE?: string;
  /** Rate limiters (Cloudflare Rate Limiting binding); optional in local dev. */
  COMPOSE_LIMIT?: RateLimit;
  LYRIA_LIMIT?: RateLimit;
};
type C = Context<{ Bindings: Env }>;

const LYRIA_URL = "https://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateMusic";
const LYRIA_MODEL = "models/lyria-realtime-exp";
const LYRIA_MAX_MS = 10 * 60 * 1000;

const app = new Hono<{ Bindings: Env }>();

const on = (env: Env) => env.AI_ENABLED !== "0";
const ip = (c: C) => c.req.header("cf-connecting-ip") ?? "local";

async function allowed(limiter: RateLimit | undefined, key: string) {
  if (!limiter) return true;
  try {
    return (await limiter.limit({ key })).success;
  } catch {
    return true;
  }
}

app.get("/api/status", (c) =>
  c.json({
    claude: on(c.env) && (!!c.env.ANTHROPIC_API_KEY || c.env.COMPOSE_FIXTURE === "1"),
    lyria: on(c.env) && !!c.env.GEMINI_API_KEY,
  }),
);

const FIXTURE = {
  name: "bloom",
  bars: 8,
  energy: 0.72,
  layers: { bass: 1, pad: 0.8, arp: 0.9, lead: 0.7, drums: 0.8, texture: 0.5 },
  motif: "0:2:0 3:2:2 6:4:4 12:2:3 16:2:2 19:2:1 22:6:0",
  chords: [],
  lyria: { prompts: [{ text: "warm analog pads, slow evolving texture", weight: 1 }], density: 0.5, brightness: 0.6 },
};

app.post("/api/compose", async (c) => {
  if (!on(c.env)) return c.json({ error: "off" }, 503);
  if (!(await allowed(c.env.COMPOSE_LIMIT, ip(c)))) return c.json({ error: "slow down" }, 429);
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return c.json({ error: "bad request" }, 400);
  }
  const body = readBody(raw);
  if (!body) return c.json({ error: "bad request" }, 400);
  if (c.env.COMPOSE_FIXTURE === "1") return c.json({ ...FIXTURE, name: body.name });
  if (!c.env.ANTHROPIC_API_KEY) return c.json({ error: "not configured" }, 503);
  const r = await compose(c.env.ANTHROPIC_API_KEY, body);
  if (!r.ok) return r.status === 204 ? c.body(null, 204) : c.json({ error: r.reason }, r.status as 429 | 500 | 502 | 503 | 504);
  return c.json(r.section);
});

/** Only steering may pass from the browser to Lyria. */
function steer(data: string): string | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(data);
  } catch {
    return null;
  }
  if (m.clientContent && typeof m.clientContent === "object") {
    const wp = (m.clientContent as { weightedPrompts?: unknown }).weightedPrompts;
    if (!Array.isArray(wp) || !wp.length) return null;
    const weightedPrompts = wp
      .slice(0, 4)
      .filter((p) => p && typeof p.text === "string" && typeof p.weight === "number")
      .map((p) => ({ text: String(p.text).slice(0, 200), weight: Math.max(0, Math.min(3, p.weight)) }));
    return weightedPrompts.length ? JSON.stringify({ clientContent: { weightedPrompts } }) : null;
  }
  if (m.musicGenerationConfig && typeof m.musicGenerationConfig === "object") {
    const g = m.musicGenerationConfig as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const num = (k: string, lo: number, hi: number) => {
      if (typeof g[k] === "number") out[k] = Math.max(lo, Math.min(hi, g[k] as number));
    };
    num("bpm", 60, 200);
    num("density", 0, 1);
    num("brightness", 0, 1);
    num("guidance", 0, 6);
    num("temperature", 0, 3);
    if (typeof g.scale === "string" && /^[A-Z_]{3,40}$/.test(g.scale)) out.scale = g.scale;
    for (const k of ["muteBass", "muteDrums"]) if (typeof g[k] === "boolean") out[k] = g[k];
    return JSON.stringify({ musicGenerationConfig: out });
  }
  if (typeof m.playbackControl === "string" && ["PLAY", "PAUSE", "STOP", "RESET_CONTEXT"].includes(m.playbackControl)) return JSON.stringify({ playbackControl: m.playbackControl });
  return null;
}

app.get("/api/lyria", async (c) => {
  if (c.req.header("upgrade")?.toLowerCase() !== "websocket") return c.text("expected a websocket", 426);
  if (!on(c.env) || !c.env.GEMINI_API_KEY) return c.text("not configured", 503);
  if (!(await allowed(c.env.LYRIA_LIMIT, ip(c)))) return c.text("slow down", 429);

  // The upstream session first: if Google refuses, the browser gets a clean error.
  const up = await fetch(`${LYRIA_URL}?key=${c.env.GEMINI_API_KEY}`, { headers: { Upgrade: "websocket" } });
  const upstream = up.webSocket;
  if (!upstream) return c.text("upstream refused", 502);
  upstream.accept();
  upstream.send(JSON.stringify({ setup: { model: LYRIA_MODEL } }));

  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair);
  server.accept();

  const close = (code = 1000, reason = "") => {
    try {
      server.close(code, reason);
    } catch {}
    try {
      upstream.close(code, reason);
    } catch {}
  };
  const cap = setTimeout(() => close(4000, "session limit"), LYRIA_MAX_MS);

  upstream.addEventListener("message", (e) => {
    try {
      server.send(typeof e.data === "string" ? e.data : (e.data as ArrayBuffer));
    } catch {}
  });
  upstream.addEventListener("close", (e) => {
    clearTimeout(cap);
    close(e.code === 1005 ? 1000 : e.code, e.reason);
  });
  upstream.addEventListener("error", () => close(1011, "upstream error"));
  server.addEventListener("message", (e) => {
    if (typeof e.data !== "string" || e.data.length > 4000) return;
    const msg = steer(e.data);
    if (msg) upstream.send(msg);
  });
  server.addEventListener("close", () => {
    clearTimeout(cap);
    close();
  });

  return new Response(null, { status: 101, webSocket: client });
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

export default app;
export { steer };
