// Streams the recorded instruments into the worklet, a world at a time. The format is chosen by
// trying it: Opus in WebM where the browser decodes it, AAC in M4A otherwise (older Safari).
// Files decode one after another (iOS can crash decoding many at once), each is trimmed to its
// onset (codecs add a little silence at the start), and the samples move to the worklet without
// a copy.
import type { Engine } from "./engine";
import { instrumentsFor, loaded, MANIFEST } from "./instruments";

let ext: "webm" | "m4a" | null = null;
const busy = new Map<string, Promise<void>>();

async function decode(e: Engine, f: string): Promise<AudioBuffer> {
  const base = `${import.meta.env.BASE_URL}samples/${f}`;
  const tryExt = async (x: "webm" | "m4a") => {
    const r = await fetch(`${base}.${x}`);
    if (!r.ok) throw new Error(`${r.status} ${base}.${x}`);
    return e.ctx.decodeAudioData(await r.arrayBuffer());
  };
  if (ext) return tryExt(ext);
  try {
    const b = await tryExt("webm");
    ext = "webm";
    return b;
  } catch {
    ext = "m4a";
    return tryExt("m4a");
  }
}

function trim(data: Float32Array, sr: number): Float32Array {
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  let on = 0;
  while (on < data.length && Math.abs(data[on]) < peak * 0.02) on++;
  return data.slice(Math.max(0, on - Math.round(0.003 * sr)));
}

/** Load every instrument a world uses (once). Resolves when they are all playable. */
export function loadWorld(e: Engine, world: string): Promise<void> {
  const done = busy.get(world);
  if (done) return done;
  const job = (async () => {
    for (const id of instrumentsFor(world)) {
      if (loaded.has(id)) continue;
      for (const z of MANIFEST.instruments[id].zones) {
        try {
          const buf = await decode(e, z.f);
          const data = trim(buf.getChannelData(0), buf.sampleRate);
          e.post({ type: "sample", id: z.f, data, sr: buf.sampleRate }, [data.buffer]);
        } catch (err) {
          console.warn("sample", z.f, err);
        }
      }
      loaded.add(id);
    }
  })();
  busy.set(world, job);
  return job;
}
