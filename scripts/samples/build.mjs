// The sample build: fetch the CC0 sources in instruments.mjs, cut and level each file, find its
// real pitch, and encode it twice for the web (Opus in WebM for most browsers, AAC in M4A for
// Safari). Writes public/samples/<instrument>/<n>.{webm,m4a}, public/samples/manifest.json and
// CREDITS.md. Downloads are cached in .samples-cache/ (git-ignored), so a rebuild is offline.
//   node scripts/samples/build.mjs [instrument ...]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { INSTRUMENTS, SOURCES } from "./instruments.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const CACHE = join(ROOT, ".samples-cache");
const OUT = join(ROOT, "public/samples");
const SR = 48000;
const PEAK = 0.89; // -1 dBFS

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midiOf = (n) => {
  const m = /^([A-G])(#?)(-?\d)$/.exec(n);
  return (Number(m[3]) + 1) * 12 + NOTE[m[1]] + (m[2] ? 1 : 0);
};

async function fetchCached(url, file) {
  if (existsSync(file)) return readFileSync(file);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  return buf;
}

const trees = {};
async function tree(src) {
  if (!trees[src]) trees[src] = JSON.parse(await fetchCached(SOURCES[src].tree, join(CACHE, `tree-${src}.json`))).tree.map((e) => e.path);
  return trees[src];
}

/** Decode anything ffmpeg reads to mono float32 at 48 kHz. */
function decode(file) {
  const out = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-ac", "1", "-ar", String(SR), "-f", "f32le", "-"], { maxBuffer: 1 << 28 });
  return new Float32Array(out.buffer, out.byteOffset, out.byteLength / 4).slice();
}

/** Trim to the onset (3 ms before it), cut the tail at -60 dB or maxSec, fade both ends. */
function cut(x, maxSec) {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  const on = x.findIndex((v) => Math.abs(v) > peak * 0.02);
  const start = Math.max(0, on - Math.round(0.003 * SR));
  let end = x.length;
  while (end > start && Math.abs(x[end - 1]) < peak * 0.001) end--;
  end = Math.min(end, start + Math.round(maxSec * SR));
  const y = x.slice(start, end);
  const fin = Math.min(y.length, Math.round(0.0005 * SR));
  for (let i = 0; i < fin; i++) y[i] *= i / fin;
  const fout = Math.min(y.length, Math.round(0.03 * SR));
  for (let i = 0; i < fout; i++) y[y.length - 1 - i] *= i / fout;
  return { y, peak };
}

/** YIN pitch estimate in Hz over a window after the attack, or 0 when unvoiced. */
function pitch(y) {
  const W = 2048;
  const at = Math.min(Math.round(0.08 * SR), Math.max(0, y.length - W * 2));
  if (y.length < at + W * 2) return 0;
  const lo = Math.floor(SR / 1500);
  const hi = Math.floor(SR / 30);
  const d = new Float32Array(hi + 1);
  for (let tau = 1; tau <= hi; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) {
      const e = y[at + i] - y[at + i + tau];
      s += e * e;
    }
    d[tau] = s;
  }
  let run = 0;
  for (let tau = 1; tau <= hi; tau++) {
    run += d[tau];
    d[tau] = run ? (d[tau] * tau) / run : 1;
  }
  for (let tau = lo; tau < hi; tau++)
    if (d[tau] < 0.15) {
      while (tau + 1 < hi && d[tau + 1] < d[tau]) tau++;
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
      return SR / (tau + shift);
    }
  return 0;
}

function encode(y, base) {
  const tmp = `${base}.f32`;
  writeFileSync(tmp, Buffer.from(y.buffer, y.byteOffset, y.byteLength));
  const input = ["-v", "error", "-y", "-f", "f32le", "-ar", String(SR), "-ac", "1", "-i", tmp];
  execFileSync("ffmpeg", [...input, "-c:a", "libopus", "-b:a", "64k", `${base}.webm`]);
  execFileSync("ffmpeg", [...input, "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", `${base}.m4a`]);
  rmSync(tmp);
}

/** Pick the files for a pitched instrument: one note every `every` semitones, its layers and round robins. */
function pickPitched(inst, files) {
  const parsed = files
    .map((f) => {
      const n = inst.note.exec(f);
      const v = inst.vel ? inst.vel.exec(f) : null;
      const rr = /_rr?(\d)/.exec(f);
      return n && { file: f, named: midiOf(n[1]), vel: v ? Number(v[1]) : 0, rr: rr ? Number(rr[1]) : 1 };
    })
    .filter(Boolean)
    .filter((p) => !inst.layers || inst.layers.includes(p.vel));
  const [lo, hi] = inst.range.map(midiOf);
  const notes = [...new Set(parsed.map((p) => p.named))].filter((n) => n >= lo && n <= hi).sort((a, b) => a - b);
  const keep = [];
  for (const n of notes) if (!keep.length || n - keep[keep.length - 1] >= inst.every) keep.push(n);
  const out = [];
  for (const n of keep)
    for (const vel of inst.layers ?? [0]) {
      const same = parsed.filter((p) => p.named === n && p.vel === vel).sort((a, b) => a.rr - b.rr);
      // An instrument may lack one layer on one note: fall back to whatever that note has.
      const pool = same.length ? same : parsed.filter((p) => p.named === n).slice(0, 1);
      for (const p of pool.slice(0, inst.rr ?? 1)) out.push({ ...p, layer: (inst.layers ?? [0]).indexOf(vel) });
    }
  return out;
}

async function build(inst) {
  const src = SOURCES[inst.src];
  const all = await tree(inst.src);
  const inDir = all.filter((p) => p.startsWith(inst.dir + "/") && p.split("/").length === inst.dir.split("/").length + 1).map((p) => p.split("/").pop());
  const picks = inst.pitched ? pickPitched(inst, inDir.filter((f) => /\.(ogg|wav)$/i.test(f))) : inst.hits.map((h) => ({ ...h, layer: (h.vel ?? 1) - 1 }));
  if (!picks.length) throw new Error(`${inst.id}: no files matched`);
  const dir = join(OUT, inst.id);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const layers = Math.max(...picks.map((p) => p.layer)) + 1;
  const rrCount = {};
  const zones = [];
  for (const [i, p] of picks.entries()) {
    const path = `${inst.dir}/${p.file}`;
    const raw = join(CACHE, inst.src, path);
    await fetchCached(src.raw + path.split("/").map(encodeURIComponent).join("/"), raw);
    const { y, peak } = cut(decode(raw), inst.maxSec ?? 2);
    let root, tune = 0;
    if (inst.pitched) {
      const f0 = pitch(y);
      const det = f0 ? 69 + 12 * Math.log2(f0 / 440) : p.named;
      // Trust the detected pitch class over the file name's octave (VSCO names sit an octave low).
      // The octave comes from the name (VSCO names sit an octave low: the source sets `octave`);
      // detection makes octave errors on weak fundamentals, so it only fine-tunes, and only when
      // it hears the same note name.
      root = p.named + 12 * (src.octave ?? 0);
      const dev = ((((det - root) % 12) + 18) % 12) - 6;
      tune = f0 && Math.abs(dev) <= 0.6 ? Math.round(dev * 100) : 0;
      if (f0 && Math.abs(dev) > 0.6) console.warn(`  ${inst.id} ${p.file}: heard ${det.toFixed(2)}, expected ${root}`);
      if (process.env.VERBOSE) console.log(`  ${inst.id} ${p.file}: root ${root} tune ${tune}`);
    }
    const g = PEAK / (peak || 1);
    for (let k = 0; k < y.length; k++) y[k] *= g;
    encode(y, join(dir, String(i)));
    const key = inst.pitched ? `${root}` : p.key;
    const slot = `${key}/${p.layer}`;
    const rr = (rrCount[slot] = (rrCount[slot] ?? -1) + 1);
    zones.push({ f: `${inst.id}/${i}`, ...(inst.pitched ? { root, tune } : { key: p.key }), vel: [p.layer / layers, (p.layer + 1) / layers], rr, peak, len: +(y.length / SR).toFixed(3), from: path });
  }
  // Level: keep each file's original loudness relative to the instrument's loudest.
  const top = Math.max(...zones.map((z) => z.peak));
  for (const z of zones) (z.gain = +(z.peak / top).toFixed(3)), delete z.peak;
  console.log(`${inst.id}: ${zones.length} zones`);
  return { world: inst.world, title: inst.title ?? inst.id, src: inst.src, pitched: !!inst.pitched, zones };
}

const only = process.argv.slice(2);
const manifestPath = join(OUT, "manifest.json");
const manifest = existsSync(manifestPath) && only.length ? JSON.parse(readFileSync(manifestPath, "utf8")) : { sr: SR, instruments: {} };
for (const inst of INSTRUMENTS) if (!only.length || only.includes(inst.id)) manifest.instruments[inst.id] = await build(inst);
writeFileSync(manifestPath, JSON.stringify(manifest, (k, v) => (k === "from" ? undefined : v)));

// Credits, from the manifest so they always match what ships.
const used = {};
for (const [id, m] of Object.entries(manifest.instruments)) (used[m.src] ??= []).push(m.title === id ? id : `${id} (${m.title})`);
let credits = "# Sample credits\n\nEvery recorded sound in Biome Synth comes from these libraries, each released under CC0 1.0\n(public domain dedication: no permission or credit needed; credited here with thanks).\n";
for (const [src, list] of Object.entries(used)) {
  const s = SOURCES[src];
  credits += `\n## ${s.name}\n\n${s.author}, ${s.license}, ${s.home}\n\n${list.sort().map((x) => `- ${x}`).join("\n")}\n`;
}
writeFileSync(join(ROOT, "CREDITS.md"), credits);
