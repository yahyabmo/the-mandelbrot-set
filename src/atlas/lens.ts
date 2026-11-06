/**
 * The lens: the Julia set of the point under the pointer, with the orbit of 0 drawn on it.
 * Each point c of the Mandelbrot set has its Julia set, the points z whose orbit under
 * z -> z^2 + c stays bounded; c belongs to the Mandelbrot set exactly when its Julia set
 * is connected, which the lens shows as you move.
 */
import { paletteTexels, type Palette, type Rgb } from "../color/palettes";
import type { Complex, OrbitPoints } from "../math/atlas";
import { COLOUR, HEADER, SRGB, VERTEX } from "../render/shaders";

const JULIA = `${HEADER}${COLOUR}${SRGB}
uniform vec2 uSize;
uniform vec2 uC;
uniform float uScale;
uniform int uMaxIter;
out vec4 outColour;
void main() {
  vec2 z = (gl_FragCoord.xy - 0.5 * uSize) * uScale;
  for (int i = 0; i < uMaxIter; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + uC;
    float r2 = dot(z, z);
    if (r2 > 65536.0) {
      outColour = vec4(toSrgb(colourOf(float(i) - log2(log2(r2)) + 4.0)), 1.0);
      return;
    }
  }
  outColour = vec4(toSrgb(colourOf(-1.0)), 1.0);
}`;

/** Half the width of the lens, in the plane of z: every connected Julia set fits. */
export const LENS_RADIUS = 1.9;

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

export class Lens {
  private gl: WebGL2RenderingContext | null;
  private program: WebGLProgram | null = null;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private palette: WebGLTexture | null = null;
  private paletteId = "";
  private key = "";
  private ink: CanvasRenderingContext2D;

  constructor(
    private julia: HTMLCanvasElement,
    private orbitCanvas: HTMLCanvasElement,
  ) {
    this.gl = julia.getContext("webgl2", { antialias: false, depth: false, alpha: false });
    this.ink = orbitCanvas.getContext("2d")!;
    if (this.gl) this.setUp(this.gl);
  }

  private setUp(gl: WebGL2RenderingContext): void {
    const p = gl.createProgram()!;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERTEX],
      [gl.FRAGMENT_SHADER, JULIA],
    ] as const) {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "lens shader");
      gl.attachShader(p, sh);
    }
    gl.linkProgram(p);
    this.program = p;
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i)!.name;
      this.u[name] = gl.getUniformLocation(p, name);
    }
    const t = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.palette = t;
  }

  /** Draw the Julia set of c and the orbit; does nothing when nothing changed. */
  draw(c: Complex, orbit: OrbitPoints, palette: Palette, period: number, offset: number, interior: Rgb): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.julia.clientWidth * dpr);
    const h = Math.round(this.julia.clientHeight * dpr);
    const key = [c[0], c[1], palette.id, period, offset, w, h].join();
    if (key === this.key) return;
    this.key = key;
    for (const cv of [this.julia, this.orbitCanvas]) {
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
    }
    const scale = (2 * LENS_RADIUS) / w;
    const gl = this.gl;
    if (gl && this.program) {
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.program);
      if (palette.id !== this.paletteId) {
        gl.bindTexture(gl.TEXTURE_2D, this.palette);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, 1024, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteTexels(palette));
        this.paletteId = palette.id;
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.palette);
      gl.uniform1i(this.u.uPalette, 0);
      gl.uniform1f(this.u.uPeriod, period);
      gl.uniform1f(this.u.uOffset, offset);
      gl.uniform1i(this.u.uMirrored, palette.mirrored ? 1 : 0);
      gl.uniform3f(this.u.uInterior, toLinear(interior[0]), toLinear(interior[1]), toLinear(interior[2]));
      gl.uniform2f(this.u.uSize, w, h);
      gl.uniform2f(this.u.uC, c[0], c[1]);
      gl.uniform1f(this.u.uScale, scale);
      gl.uniform1i(this.u.uMaxIter, 400);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    this.drawOrbit(orbit, w, h, scale, dpr);
  }

  /** The orbit 0, c, c^2 + c, …: a fading line, its start in brass. */
  private drawOrbit(o: OrbitPoints, w: number, h: number, scale: number, dpr: number): void {
    const g = this.ink;
    g.clearRect(0, 0, w, h);
    const X = (x: number) => w / 2 + x / scale;
    const Y = (y: number) => h / 2 - y / scale;
    const n = o.count;
    g.lineWidth = 1 * dpr;
    for (let k = 1; k <= n; k++) {
      const a = Math.max(0.12, 1 - k / Math.max(24, n));
      g.strokeStyle = `rgba(246, 243, 234, ${(0.75 * a).toFixed(3)})`;
      g.beginPath();
      g.moveTo(X(o.points[2 * k - 2]), Y(o.points[2 * k - 1]));
      g.lineTo(X(o.points[2 * k]), Y(o.points[2 * k + 1]));
      g.stroke();
    }
    g.fillStyle = "rgba(246, 243, 234, 0.9)";
    for (let k = 2; k <= Math.min(n, 400); k++) {
      g.beginPath();
      g.arc(X(o.points[2 * k]), Y(o.points[2 * k + 1]), 1.4 * dpr, 0, 2 * Math.PI);
      g.fill();
    }
    // z_1 = c, where the orbit begins, and z_0 = 0 at the centre.
    g.fillStyle = "#efc879";
    g.beginPath();
    g.arc(X(o.points[2]), Y(o.points[3]), 3 * dpr, 0, 2 * Math.PI);
    g.fill();
    g.strokeStyle = "rgba(246, 243, 234, 0.5)";
    g.beginPath();
    g.arc(X(0), Y(0), 2.5 * dpr, 0, 2 * Math.PI);
    g.stroke();
  }
}
