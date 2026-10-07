// The browser side of the Claude conductor: ask the Worker for the next section. Anything but a
// clean JSON section within 25 s resolves to null, and the world's own section plays instead.
import type { Composer } from "../music/conductor";

export type AiStatus = { claude: boolean; lyria: boolean };

export async function aiStatus(): Promise<AiStatus> {
  try {
    const r = await fetch("/api/status", { headers: { accept: "application/json" } });
    if (!r.ok) return { claude: false, lyria: false };
    const j = await r.json();
    return { claude: !!j.claude, lyria: !!j.lyria };
  } catch {
    return { claude: false, lyria: false };
  }
}

export const composeWithClaude: Composer = async (req) => {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 25_000);
  try {
    const r = await fetch("/api/compose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal: ctl.signal,
    });
    if (!r.ok || r.status === 204) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};
