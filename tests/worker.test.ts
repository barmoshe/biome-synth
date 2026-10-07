import { describe, expect, it } from "vitest";
import app, { steer } from "../src/worker/index";
import { readBody } from "../src/worker/compose";
import { clampSection } from "../src/music/pattern";

const env = (extra: Record<string, string> = {}) => ({ ASSETS: { fetch: async () => new Response("asset") }, ...extra }) as never;
const req = (body: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const goodBody = { world: "neon", genre: "2-step", name: "surge", stepsPerBar: 16, previous: { name: "bloom" }, player: { notes: 12, taps: { kick: 3 } } };

describe("worker", () => {
  it("reports what the AI band can do", async () => {
    expect(await (await app.request("/api/status", {}, env())).json()).toEqual({ claude: false, lyria: false });
    expect(await (await app.request("/api/status", {}, env({ ANTHROPIC_API_KEY: "k", GEMINI_API_KEY: "g" }))).json()).toEqual({ claude: true, lyria: true });
    expect(await (await app.request("/api/status", {}, env({ ANTHROPIC_API_KEY: "k", AI_ENABLED: "0" }))).json()).toEqual({ claude: false, lyria: false });
  });

  it("fixture mode writes a playable section for the asked name", async () => {
    const r = await app.request("/api/compose", req(goodBody), env({ COMPOSE_FIXTURE: "1" }));
    expect(r.status).toBe(200);
    const s = clampSection(await r.json());
    expect(s.name).toBe("surge");
    expect(s.motif.length).toBeGreaterThan(0);
  });

  it("refuses cleanly without a key, when switched off, or on a bad body", async () => {
    expect((await app.request("/api/compose", req(goodBody), env())).status).toBe(503);
    expect((await app.request("/api/compose", req(goodBody), env({ ANTHROPIC_API_KEY: "k", AI_ENABLED: "0" }))).status).toBe(503);
    expect((await app.request("/api/compose", req({ world: "mars" }), env({ COMPOSE_FIXTURE: "1" }))).status).toBe(400);
    expect((await app.request("/api/compose", { method: "POST", body: "{nope" }, env({ COMPOSE_FIXTURE: "1" }))).status).toBe(400);
  });

  it("the Lyria relay needs a websocket and a key", async () => {
    expect((await app.request("/api/lyria", {}, env({ GEMINI_API_KEY: "g" }))).status).toBe(426);
    expect((await app.request("/api/lyria", { headers: { upgrade: "websocket" } }, env())).status).toBe(503);
  });

  it("unknown api paths are 404", async () => {
    expect((await app.request("/api/nope", {}, env())).status).toBe(404);
  });
});

describe("compose body", () => {
  it("keeps only known, bounded fields", () => {
    const b = readBody({ ...goodBody, player: { notes: 1e9, taps: { "a-very-long-role-name": 5, x: "y" } }, extra: "ignored" })!;
    expect(b.player.notes).toBe(9999);
    expect(Object.keys(b.player.taps)).toEqual(["a-very-l"]);
    expect(readBody({ world: "space" })!.name).toBe("bloom");
    expect(readBody(null)).toBeNull();
  });
});

describe("lyria steering filter", () => {
  it("never lets the browser set up its own session or model", () => {
    expect(steer(JSON.stringify({ setup: { model: "models/something-else" } }))).toBeNull();
    expect(steer("not json")).toBeNull();
    expect(steer(JSON.stringify({ playbackControl: "SELF_DESTRUCT" }))).toBeNull();
  });
  it("passes and clamps prompts, config and playback", () => {
    const p = JSON.parse(steer(JSON.stringify({ clientContent: { weightedPrompts: [{ text: "rain", weight: 9 }, { text: 3, weight: 1 }] } }))!);
    expect(p).toEqual({ clientContent: { weightedPrompts: [{ text: "rain", weight: 3 }] } });
    const c = JSON.parse(steer(JSON.stringify({ musicGenerationConfig: { bpm: 400, density: -1, scale: "D_MAJOR_B_MINOR", evil: true } }))!);
    expect(c).toEqual({ musicGenerationConfig: { bpm: 200, density: 0, scale: "D_MAJOR_B_MINOR" } });
    expect(JSON.parse(steer(JSON.stringify({ playbackControl: "RESET_CONTEXT" }))!)).toEqual({ playbackControl: "RESET_CONTEXT" });
  });
});
