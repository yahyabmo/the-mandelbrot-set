/**
 * A film of the dive to the current view, rendered one sharp frame at a time, as the
 * script of 2023 did, and encoded to MP4 in the browser with WebCodecs. The camera keeps
 * the view's centre and zooms from the whole set at an even pace in log scale, easing in
 * and out at both ends.
 */
import { mulNumber } from "../math/fixed";
import type { View } from "../math/view";
import type { Frame, Renderer, Status } from "../render/renderer";

export interface FilmOptions {
  fps: number;
  width: number;
  height: number;
  /** Samples per pixel each frame waits for. */
  samples: number;
}

export interface RecordHost {
  renderer: Renderer;
  canvas: HTMLCanvasElement;
  /** The frame description for a view: colours, iterations. */
  frameOf(view: View, target: View): Frame;
  progress(done: number, total: number): void;
}

/** Seconds of film: four, and a third of a second per factor of ten, up to two minutes. */
export function filmSeconds(from: View, to: View): number {
  const decades = Math.log10(from.width / to.width);
  return Math.min(120, Math.max(6, 4 + 0.3 * decades));
}

/** The camera at time t in [0, 1]: centred on the target, the width eased in log scale. */
export function cameraAt(from: View, to: View, t: number): View {
  const s = t * t * (3 - 2 * t);
  const width = Math.exp(Math.log(from.width) + (Math.log(to.width) - Math.log(from.width)) * s);
  // The centre slides from the start to the target while the set is wide, then stays.
  const k = Math.min(1, s * 4);
  return { cx: from.cx + mulNumber(to.cx - from.cx, k), cy: from.cy + mulNumber(to.cy - from.cy, k), width };
}

/** Render the film; resolves to the MP4 file, or null when stopped. */
export async function recordFilm(host: RecordHost, from: View, to: View, o: FilmOptions, stopped: () => boolean): Promise<Blob | null> {
  const mb = await import("mediabunny");
  if (!(await mb.canEncodeVideo("avc", { width: o.width, height: o.height }))) throw new Error("This browser cannot encode H.264 video.");
  const { renderer, canvas } = host;
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  // A zoom changes every pixel at every frame, over smooth gradients: it needs a generous bitrate.
  const source = new mb.CanvasSource(canvas, { codec: "avc", bitrate: mb.QUALITY_VERY_HIGH });
  output.addVideoTrack(source, { frameRate: o.fps });
  await output.start();
  const total = Math.round(filmSeconds(from, to) * o.fps);
  canvas.width = o.width;
  canvas.height = o.height;
  renderer.resize(o.width, o.height);
  renderer.offline = true;
  try {
    for (let k = 0; k < total; k++) {
      if (stopped()) return null;
      const view = cameraAt(from, to, total > 1 ? k / (total - 1) : 1);
      const frame = host.frameOf(view, to);
      const t0 = performance.now();
      let status: Status;
      do {
        status = renderer.render(frame);
        // Let the GPU and the page breathe between passes.
        await new Promise((r) => setTimeout(r, 0));
      } while (!(status.sharp && status.samples >= o.samples) && performance.now() - t0 < 30_000 && !stopped());
      // Draw the finished frame once more, so that the canvas holds it when it is captured.
      renderer.render(frame);
      await source.add(k / o.fps, 1 / o.fps);
      host.progress(k + 1, total);
    }
    await output.finalize();
    return new Blob([output.target.buffer!], { type: "video/mp4" });
  } finally {
    renderer.offline = false;
  }
}
