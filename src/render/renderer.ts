import { paletteTexels, type Palette, type Rgb } from "../color/palettes";
import { toNumber, type Fixed } from "../math/fixed";
import type { View } from "../math/view";
import { BLA_ROW, type BlaTable } from "../math/bla";
import { SCALED_BELOW, splitPixel } from "../math/deep";
import type { Orbit } from "../math/mandelbrot";
import { References, type Reference } from "./reference";
import { COLOURIZE, COUNT, DISPLAY, SAMPLE, VERTEX } from "./shaders";

/** Above this width the direct float32 path is exact enough; below it, perturbation. */
export const DIRECT_LIMIT = 0.02;
const ORBIT_ROW = 4096;
const MAX_SAMPLES = 12;
/** Share of a screen refresh given to the fractal, the rest is for the page and the compositor. */
const BUDGET_SHARE = 0.7;
/** No screen refreshes faster than this; shorter frames are timing glitches. */
const MIN_REFRESH_MS = 4;
/** Lowest resolution of the image in motion: blurred, but never a slide show. */
const MIN_MOTION_SCALE = 0.08;
/** A frame this much longer than a refresh was held back by the GPU, not by the screen. */
const BOUND_FACTOR = 1.35;

export interface Frame {
  view: View;
  maxIter: number;
  /** Where the motion is heading, so that a deep reference can be prepared before arrival. */
  target: View;
  targetIter: number;
  palette: Palette;
  period: number;
  offset: number;
  interior: Rgb;
  /** True while the view is moving: render fast, at a reduced resolution. */
  moving: boolean;
  /** Supersampling is pointless while the colours keep changing. */
  allowSamples: boolean;
}

export interface Status {
  engine: "direct" | "perturbation";
  sharp: boolean;
  samples: number;
  scale: number;
  /** The reference in use: none, an orbit in doubles, or the bits of a fixed-point one. */
  reference: "none" | "doubles" | "waiting" | number;
  /** True when bilinear approximations skip iterations. */
  skipping: boolean;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
}

type Program = { p: WebGLProgram; u: Record<string, WebGLUniformLocation | null> };
/** What a frame was computed with: each has its own cost per pixel and allowed iteration. */
type Engine = "direct" | "perturbation" | "skipping";
/** On time while the view rests, the next frame takes this much more work... */
const PROBE = 1 / 0.85;
/** ...unless a frame came late within this many frames. */
const HOLD_FRAMES = 30;

/** Halton(2, 3) offsets in [-0.5, 0.5): evenly spread sub-pixel positions. */
function halton(i: number, base: number): number {
  let f = 1;
  let r = 0;
  while (i > 0) {
    f /= base;
    r += f * (i % base);
    i = Math.floor(i / base);
  }
  return r - 0.5;
}

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  private programs: Record<"count" | "sample" | "colourize" | "display", Program>;
  private palette: WebGLTexture;
  private paletteId = "";
  private orbit: WebGLTexture;
  private orbitLen = 0;
  private refs = new References();
  private uploaded: Orbit | null = null;
  private blaAB: WebGLTexture;
  private blaER: WebGLTexture;
  private blaUploaded: BlaTable | null = null;
  private bla: BlaTable | null = null;
  private blaOffsets = new Int32Array(24);
  private refCx: Fixed = 0n;
  private refCy: Fixed = 0n;
  private shown: { counts: Target; samples: number } | null = null;
  private low: Target | null = null;
  private full: Target | null = null;
  private accum: Target | null = null;
  private width = 1;
  private height = 1;

  /**
   * Milliseconds per pixel and per allowed iteration, learnt from the frames themselves.
   * Starting values come from a measure on an integrated AMD GPU.
   */
  private cost = { direct: 1e-8, perturbation: 4.5e-8, skipping: 4e-9 };
  private lastWork = 0;
  private lastEngine: Engine = "direct";
  /** True when the last frame refined a resting view: on time, it may try a little more. */
  private lastRefined = false;
  /** Frames to wait after a slow one before trying more again. */
  private hold = 0;
  private motionScale = 0.6;
  /** Interval between screen refreshes, read from the shortest frames: 8.3 ms at 120 Hz. */
  private refreshMs = 16.7;
  private viewKey = "";
  private colourKey = "";
  private fullRows = 0;
  private lowValid = false;
  private samples = 0;
  private sampleRows = 0;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { antialias: false, depth: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error("This browser does not support WebGL2.");
    if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("This GPU cannot render to float textures.");
    this.gl = gl;
    this.programs = {
      count: this.program(COUNT),
      sample: this.program(SAMPLE),
      colourize: this.program(COLOURIZE),
      display: this.program(DISPLAY),
    };
    this.palette = this.texture(gl.LINEAR);
    this.orbit = this.texture(gl.NEAREST);
    this.blaAB = this.texture(gl.NEAREST);
    this.blaER = this.texture(gl.NEAREST);
  }

  /** Iteration counts of the sharp image at some pixels (x from the left, y from the bottom), for checks. */
  readCounts(points: [number, number][]): number[] {
    const gl = this.gl;
    if (!this.full) return [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.full.fbo);
    const px = new Float32Array(4);
    const out = points.map(([x, y]) => {
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, px);
      return px[0];
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return out;
  }

  gpuName(): string {
    const gl = this.gl;
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  }

  resize(w: number, h: number): void {
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.full = this.target(this.full, w, h, "count");
    this.accum = this.target(this.accum, w, h, "accum");
    this.viewKey = "";
  }

  /** Tell the renderer how long the last frame took: it learns what one iteration costs. */
  adapt(frameMs: number): void {
    // Shorter than any screen refreshes: a timing glitch, which would make every frame look late.
    if (frameMs < MIN_REFRESH_MS) return;
    // The shortest frames give the refresh interval; it may slowly grow back if the screen changes.
    this.refreshMs = Math.min(this.refreshMs * 1.002, frameMs);
    if (this.lastWork <= 0) return;
    const bound = this.refreshMs * BOUND_FACTOR;
    const e = this.lastEngine;
    const measured = frameMs / this.lastWork;
    // A slow frame measures the cost, at once when it is far off. A frame on time only says
    // the cost is at most this much: while the view rests, try a little more work.
    if (frameMs > 2 * bound) this.cost[e] = Math.max(this.cost[e], measured);
    else if (frameMs > bound) this.cost[e] = 0.7 * this.cost[e] + 0.3 * measured;
    else if (this.lastRefined && this.hold === 0) this.cost[e] /= PROBE;
    else this.cost[e] = Math.min(this.cost[e], bound / this.lastWork);
    if (frameMs > bound) this.hold = HOLD_FRAMES;
    else if (this.hold > 0) this.hold--;
  }

  private get budgetMs(): number {
    return Math.max(5, this.refreshMs * BUDGET_SHARE);
  }

  /** Rows of the full image that fit in the budget, for this engine and iteration limit. */
  private rowsInBudget(maxIter: number): number {
    const c = this.cost[this.lastEngine];
    return Math.max(1, Math.floor(this.budgetMs / (c * this.width * maxIter)));
  }

  render(f: Frame): Status {
    const gl = this.gl;
    const perturb = f.view.width < DIRECT_LIMIT;
    this.uploadPalette(f.palette);
    this.bla = null;
    let reference: Status["reference"] = "none";
    if (perturb || f.target.width < DIRECT_LIMIT) {
      const ref = this.refs.get(f.view, f.maxIter, f.target, f.targetIter, this.width, this.height);
      if (perturb && !ref) {
        // No orbit precise enough yet: keep the last image up until it comes.
        if (this.shown) this.display(f, this.shown.counts, this.shown.samples);
        this.lastWork = 0;
        return { engine: "perturbation", sharp: false, samples: 0, scale: this.motionScale, reference: "waiting", skipping: false };
      }
      if (perturb && ref) {
        this.uploadOrbit(ref);
        this.bla = this.refs.table(ref, f.view, f.target, this.width, this.height);
        if (this.bla) this.uploadBla(this.bla);
        reference = ref.bits === 0 ? "doubles" : ref.bits;
      }
    }

    const viewKey = [f.view.cx, f.view.cy, f.view.width, f.maxIter, this.width, this.height].join();
    const colourKey = [f.palette.id, f.period, f.offset, f.interior.join()].join();
    if (viewKey !== this.viewKey) {
      this.viewKey = viewKey;
      this.fullRows = 0;
      this.lowValid = false;
      this.samples = 0;
      this.sampleRows = 0;
    }
    if (colourKey !== this.colourKey) {
      this.colourKey = colourKey;
      this.samples = 0;
      this.sampleRows = 0;
    }

    this.lastEngine = !perturb ? "direct" : this.bla ? "skipping" : "perturbation";
    this.lastWork = 0;
    this.lastRefined = !f.moving;
    const fullDone = this.fullRows >= this.height;
    if (f.moving || (!fullDone && !this.lowValid)) {
      // A quick, lower-resolution image: always complete, always on time.
      const c = this.cost[this.lastEngine];
      this.motionScale = Math.min(1, Math.max(MIN_MOTION_SCALE, Math.sqrt(this.budgetMs / (c * this.width * this.height * f.maxIter))));
      const w = Math.max(16, Math.round(this.width * this.motionScale));
      const h = Math.max(16, Math.round(this.height * this.motionScale));
      this.low = this.target(this.low, w, h, "count");
      this.drawCounts(this.low, f, perturb, 0, h, [0, 0]);
      this.lowValid = true;
      this.lastWork += w * h * f.maxIter;
    }
    if (!f.moving && !fullDone) {
      const rows = Math.min(this.rowsInBudget(f.maxIter), this.height - this.fullRows);
      this.drawCounts(this.full!, f, perturb, this.fullRows, rows, [0, 0]);
      this.fullRows += rows;
      this.lastWork += this.width * rows * f.maxIter;
    } else if (!f.moving && fullDone && f.allowSamples && this.samples < MAX_SAMPLES) {
      this.accumulate(f, perturb);
    }

    const sharp = this.fullRows >= this.height;
    const source = sharp ? this.full! : this.low!;
    this.shown = { counts: source, samples: sharp && this.samples > 0 ? this.samples : 0 };
    this.display(f, source, this.shown.samples);
    gl.flush();
    return {
      engine: perturb ? "perturbation" : "direct",
      sharp,
      samples: sharp ? Math.max(1, this.samples) : 0,
      scale: sharp ? 1 : this.motionScale,
      reference,
      skipping: this.bla !== null,
    };
  }

  // ---------------------------------------------------------------------------

  private accumulate(f: Frame, perturb: boolean): void {
    const gl = this.gl;
    const acc = this.accum!;
    if (this.samples === 0) {
      // The first sample is the sharp image itself, coloured.
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fbo);
      gl.viewport(0, 0, acc.w, acc.h);
      gl.disable(gl.BLEND);
      const pr = this.use("colourize", f);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.full!.tex);
      gl.uniform1i(pr.u.uCounts, 2);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.samples = 1;
      this.sampleRows = 0;
      return;
    }
    const rows = Math.min(this.rowsInBudget(f.maxIter), this.height - this.sampleRows);
    this.lastWork += this.width * rows * f.maxIter;
    const jitter: [number, number] = [halton(this.samples, 2), halton(this.samples, 3)];
    gl.bindFramebuffer(gl.FRAMEBUFFER, acc.fbo);
    gl.viewport(0, 0, acc.w, acc.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, this.sampleRows, acc.w, rows);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const pr = this.use("sample", f);
    this.setIteration(pr, f, perturb, acc.w, acc.h, jitter);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    this.sampleRows += rows;
    if (this.sampleRows >= this.height) {
      this.samples++;
      this.sampleRows = 0;
    }
  }

  private drawCounts(t: Target, f: Frame, perturb: boolean, y0: number, rows: number, jitter: [number, number]): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.viewport(0, 0, t.w, t.h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, y0, t.w, rows);
    const pr = this.use("count", f);
    this.setIteration(pr, f, perturb, t.w, t.h, jitter);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  private display(f: Frame, counts: Target, samples: number): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.width, this.height);
    const pr = this.use("display", f);
    gl.uniform2f(pr.u.uScreen, this.width, this.height);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, counts.tex);
    gl.uniform1i(pr.u.uCounts, 2);
    gl.uniform2f(pr.u.uCountsSize, counts.w, counts.h);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.accum!.tex);
    gl.uniform1i(pr.u.uAccum, 3);
    gl.uniform1f(pr.u.uSamples, samples);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Bind a program and the colour uniforms they all share. */
  private use(name: keyof Renderer["programs"], f: Frame): Program {
    const gl = this.gl;
    const pr = this.programs[name];
    gl.useProgram(pr.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.palette);
    gl.uniform1i(pr.u.uPalette, 0);
    gl.uniform1f(pr.u.uPeriod, f.period);
    gl.uniform1f(pr.u.uOffset, f.offset);
    gl.uniform1i(pr.u.uMirrored, f.palette.mirrored ? 1 : 0);
    gl.uniform3f(pr.u.uInterior, toLinear(f.interior[0]), toLinear(f.interior[1]), toLinear(f.interior[2]));
    return pr;
  }

  private setIteration(pr: Program, f: Frame, perturb: boolean, w: number, h: number, jitter: [number, number]): void {
    const gl = this.gl;
    gl.uniform2f(pr.u.uSize, w, h);
    gl.uniform1f(pr.u.uPixel, f.view.width / w);
    const pixel = f.view.width / w;
    gl.uniform2f(pr.u.uCenter, toNumber(f.view.cx), toNumber(f.view.cy));
    gl.uniform2f(pr.u.uRefPx, toNumber(f.view.cx - this.refCx) / pixel, toNumber(f.view.cy - this.refCy) / pixel);
    gl.uniform2f(pr.u.uJitter, jitter[0], jitter[1]);
    gl.uniform1i(pr.u.uMaxIter, f.maxIter);
    gl.uniform1i(pr.u.uPerturb, perturb ? 1 : 0);
    const [pm, pe] = splitPixel(pixel);
    gl.uniform1i(pr.u.uScaled, pixel < SCALED_BELOW ? 1 : 0);
    gl.uniform1f(pr.u.uPixelM, pm);
    gl.uniform1i(pr.u.uPixelE, pe);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.orbit);
    gl.uniform1i(pr.u.uOrbit, 1);
    gl.uniform1i(pr.u.uOrbitLen, this.orbitLen);
    const t = perturb ? this.bla : null;
    gl.uniform1i(pr.u.uBla, t ? 1 : 0);
    if (t) {
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.blaAB);
      gl.uniform1i(pr.u.uBlaAB, 4);
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, this.blaER);
      gl.uniform1i(pr.u.uBlaER, 5);
      gl.uniform1i(pr.u.uBlaLevels, Math.min(24, t.levels));
      gl.uniform1iv(pr.u["uBlaOffset[0]"], this.blaOffsets);
      gl.uniform1f(pr.u.uBlaMaxLogR, t.maxLogR);
    }
  }

  private uploadPalette(p: Palette): void {
    if (p.id === this.paletteId) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.palette);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 1024, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteTexels(p));
    this.paletteId = p.id;
  }

  /** The orbit of the reference, stored as float32: the perturbation needs no more. */
  private uploadOrbit(ref: Reference): void {
    if (ref.orbit === this.uploaded) return;
    this.uploaded = ref.orbit;
    const points = ref.orbit.length + 1;
    const rows = Math.ceil(points / ORBIT_ROW);
    const data = new Float32Array(rows * ORBIT_ROW * 2);
    data.set(ref.orbit.data.subarray(0, 2 * points));
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.orbit);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, ORBIT_ROW, rows, 0, gl.RG, gl.FLOAT, data);
    this.orbitLen = ref.orbit.length;
    this.refCx = ref.cx;
    this.refCy = ref.cy;
  }

  /** The approximations: mantissas of A and B in one texture, exponents and radius in another. */
  private uploadBla(t: BlaTable): void {
    if (t === this.blaUploaded) return;
    this.blaUploaded = t;
    const gl = this.gl;
    const rows = t.ab.length / 4 / BLA_ROW;
    gl.bindTexture(gl.TEXTURE_2D, this.blaAB);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, BLA_ROW, rows, 0, gl.RGBA, gl.FLOAT, t.ab);
    gl.bindTexture(gl.TEXTURE_2D, this.blaER);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, BLA_ROW, rows, 0, gl.RGBA, gl.FLOAT, t.er);
    this.blaOffsets.fill(0);
    t.offsets.slice(0, 24).forEach((o, i) => (this.blaOffsets[i] = o));
  }

  private texture(filter: number): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(old: Target | null, w: number, h: number, kind: "count" | "accum"): Target {
    if (old && old.w === w && old.h === h) return old;
    const gl = this.gl;
    if (old) {
      gl.deleteTexture(old.tex);
      gl.deleteFramebuffer(old.fbo);
    }
    const tex = this.texture(kind === "accum" ? gl.LINEAR : gl.NEAREST);
    if (kind === "count") gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, h, 0, gl.RED, gl.FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, w, h };
  }

  private program(fragment: string): Program {
    const gl = this.gl;
    const p = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      gl.attachShader(p, s);
    }
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    const u: Program["u"] = {};
    const count = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(p, i)!.name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }
}
