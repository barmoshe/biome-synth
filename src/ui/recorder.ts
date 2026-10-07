// Record a clip: the world, scaled up crisp, plus the master output, into one video file you can
// share or save. MP4 where the browser can write it (Safari, recent Chrome), WebM otherwise.
import type { Engine } from "../audio/engine";

export const MAX_SECONDS = 30;

export type Recording = {
  stop(): Promise<File | null>;
  /** Copy the current frame into the recorder's canvas; call once per animation frame. */
  frame(src: HTMLCanvasElement): void;
  readonly started: number;
};

function pickType(): { mime: string; ext: string } | null {
  const R = typeof MediaRecorder !== "undefined" ? MediaRecorder : null;
  if (!R) return null;
  for (const [mime, ext] of [
    ["video/mp4;codecs=avc1,mp4a.40.2", "mp4"],
    ["video/mp4", "mp4"],
    ["video/webm;codecs=vp9,opus", "webm"],
    ["video/webm", "webm"],
  ] as const)
    if (R.isTypeSupported(mime)) return { mime, ext };
  return null;
}

export const canRecord = () => pickType() !== null && typeof HTMLCanvasElement.prototype.captureStream === "function";

export function startRecording(engine: Engine, src: HTMLCanvasElement): Recording | null {
  const type = pickType();
  const ctx = engine.ctx as AudioContext;
  if (!type || typeof ctx.createMediaStreamDestination !== "function") return null;

  // Scale the art up by an integer so the video stays crisp: about 1080 px tall.
  const k = Math.max(1, Math.round(1080 / src.height));
  const out = document.createElement("canvas");
  out.width = src.width * k;
  out.height = src.height * k;
  const g = out.getContext("2d")!;
  g.imageSmoothingEnabled = false;

  const dest = ctx.createMediaStreamDestination();
  engine.analyser.connect(dest);
  const stream = new MediaStream([...out.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: type.mime, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 192_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(500);

  return {
    started: performance.now(),
    frame(s) {
      g.drawImage(s, 0, 0, out.width, out.height);
    },
    stop() {
      return new Promise((resolve) => {
        rec.onstop = () => {
          engine.analyser.disconnect(dest);
          stream.getTracks().forEach((t) => t.stop());
          if (!chunks.length) return resolve(null);
          const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
          resolve(new File(chunks, `biome-synth-${stamp}.${type.ext}`, { type: type.mime.split(";")[0] }));
        };
        rec.stop();
      });
    },
  };
}

/** Share on phones that can, otherwise download. */
export async function shareOrSave(file: File) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Biome Synth" });
      return "shared";
    } catch {
      /* cancelled: fall through to a download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "saved";
}
