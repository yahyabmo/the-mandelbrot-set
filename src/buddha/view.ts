/**
 * The Buddhabrot on screen: workers count orbits on a grid at half the resolution of the
 * canvas; the page adds up their counts twice a second and shows them, tone-mapped in
 * log scale, three channels for orbits that escape within 5000, 500 and 50 steps. While
 * the view moves, the counts already made move with it; once it rests, counting starts
 * again on the new view.
 */
import { toNumber } from "../math/fixed";
import type { View } from "../math/view";
import { HEADER, SRGB, VERTEX } from "../render/shaders";
import type { BuddhaReply, BuddhaRequest } from "./buddha-worker";
import type { Grid } from "./sampler";

const SHOW = `${HEADER}${SRGB}
uniform sampler2D uHist;      // counts as RGB32F, row 0 at the top
uniform vec2 uScreen;
uniform vec2 uGridSize;
uniform vec2 uOffset;         // view centre minus grid centre, in grid pixels (y up)
uniform float uRatio;         // size of a screen pixel in grid pixels
uniform vec3 uMax;
out vec4 outColour;

vec3 at(ivec2 p) {
  ivec2 hi = ivec2(uGridSize) - 1;
  if (p.x < 0 || p.y < 0 || p.x > hi.x || p.y > hi.y) return vec3(0.0);
  return texelFetch(uHist, p, 0).rgb;
}

void main() {
  vec2 q = (gl_FragCoord.xy - 0.5 * uScreen) * uRatio;
  // Grid coordinates, x to the right and y downwards from the top row.
  vec2 g = vec2(0.5 * uGridSize.x + uOffset.x + q.x, 0.5 * uGridSize.y - uOffset.y - q.y) - 0.5;
  ivec2 i = ivec2(floor(g));
  vec2 f = fract(g);
  vec3 h = mix(mix(at(i), at(i + ivec2(1, 0)), f.x), mix(at(i + ivec2(0, 1)), at(i + ivec2(1, 1)), f.x), f.y);
  // Every pixel near the set is crossed thousands of times: scale to the brightest few,
  // with a curve that leaves the common haze dark and the ghost bright.
  vec3 v = pow(clamp(h / max(uMax, vec3(1.0)), 0.0, 1.0), vec3(2.2));
  // Long orbits in gold, middle ones in teal, short ones in blue.
  vec3 c = v.r * vec3(1.0, 0.7, 0.36) + v.g * vec3(0.16, 0.5, 0.55) + v.b * vec3(0.18, 0.28, 0.9);
  outColour = vec4(toSrgb(clamp(c * 0.85, 0.0, 1.0)), 1.0);
}`;

export class Buddhabrot {
  private program: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private tex: WebGLTexture;
  private workers: Worker[] = [];
  private grid: Grid | null = null;
  private generation = 0;
  private sum = new Float32Array(0);
  private parts: (BuddhaReply | null)[] = [];
  private max = [1, 1, 1];
  private uploaded = false;
  private snapshotAt = 0;
  private restAt = 0;
  /** Orbits drawn into the image on screen, for the readout. */
  orbits = 0;
  private shownGrid: Grid | null = null;

  constructor(private gl: WebGL2RenderingContext) {
    const p = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, SHOW],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "buddhabrot shader");
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    this.program = p;
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i)!.name;
      this.u[name] = gl.getUniformLocation(p, name);
    }
    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  /** Stop counting: the other worlds do not need it. */
  stop(): void {
    for (const w of this.workers) w.terminate();
    this.workers = [];
    this.grid = null;
    this.uploaded = false;
  }

  private start(): void {
    const n = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));
    for (let k = 0; k < n; k++) {
      const w = new Worker(new URL("./buddha-worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<BuddhaReply>) => this.receive(k, e.data);
      this.workers.push(w);
    }
    this.parts = new Array(n).fill(null);
  }

  /** Count afresh on the view, once it has stopped moving. */
  private recount(view: View, wPx: number, hPx: number): void {
    if (!this.workers.length) this.start();
    const w = Math.ceil(wPx / 2);
    const h = Math.ceil(hPx / 2);
    this.grid = { cx: toNumber(view.cx), cy: toNumber(view.cy), width: view.width, w, h };
    this.generation++;
    this.parts.fill(null);
    this.workers.forEach((worker, k) => {
      const req: BuddhaRequest = { kind: "grid", grid: this.grid!, generation: this.generation, seed: (Math.random() * 2 ** 31) | (k + 1) };
      worker.postMessage(req);
    });
  }

  private receive(k: number, r: BuddhaReply): void {
    if (r.generation !== this.generation || !this.grid) return;
    this.parts[k] = r;
    if (this.parts.some((p) => p === null)) return;
    // Every worker has answered: add up their counts.
    const n = 3 * this.grid.w * this.grid.h;
    if (this.sum.length !== n) this.sum = new Float32Array(n);
    this.sum.fill(0);
    let orbits = 0;
    for (const p of this.parts) {
      const h = p!.hist;
      for (let i = 0; i < n; i++) this.sum[i] += h[i];
      orbits += p!.orbits;
    }
    // Each channel is scaled to its 99.7th percentile, read from a sample of the pixels:
    // the very brightest are a few points where the orbits linger.
    const step = Math.max(1, Math.floor(n / 3 / 20000));
    this.max = [0, 1, 2].map((c) => {
      const values: number[] = [];
      for (let i = c; i < n; i += 3 * step) values.push(this.sum[i]);
      values.sort((a, b) => a - b);
      return Math.max(1, values[Math.floor(0.997 * (values.length - 1))]);
    });
    this.orbits = orbits;
    this.parts.fill(null);
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, this.grid.w, this.grid.h, 0, gl.RGB, gl.FLOAT, this.sum);
    this.uploaded = true;
    this.shownGrid = this.grid;
  }

  /** Draw the counts for the view; count afresh when it has rested a moment. */
  draw(view: View, wPx: number, hPx: number, moving: boolean, now: number): void {
    const gl = this.gl;
    const changed = !this.grid || toNumber(view.cx) !== this.grid.cx || toNumber(view.cy) !== this.grid.cy || view.width !== this.grid.width || Math.ceil(wPx / 2) !== this.grid.w;
    if (moving) this.restAt = now;
    if (changed && !moving && now - this.restAt > 150) this.recount(view, wPx, hPx);
    if (this.grid && now - this.snapshotAt > 500) {
      this.snapshotAt = now;
      for (const w of this.workers) w.postMessage({ kind: "snapshot" } satisfies BuddhaRequest);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, wPx, hPx);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    const g = this.shownGrid;
    if (!this.uploaded || !g) {
      gl.clearColor(0.02, 0.02, 0.03, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return;
    }
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.uniform1i(this.u.uHist, 6);
    const sg = g.width / g.w;
    const sv = view.width / wPx;
    gl.uniform2f(this.u.uScreen, wPx, hPx);
    gl.uniform2f(this.u.uGridSize, g.w, g.h);
    gl.uniform2f(this.u.uOffset, (toNumber(view.cx) - g.cx) / sg, (toNumber(view.cy) - g.cy) / sg);
    gl.uniform1f(this.u.uRatio, sv / sg);
    gl.uniform3f(this.u.uMax, this.max[0], this.max[1], this.max[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
