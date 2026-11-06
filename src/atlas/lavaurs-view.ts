/**
 * Lavaurs' diagram in the index: the circle of external angles, with a chord joining the
 * two rays that land at the root of each component, up to period 6. It is a map of the
 * whole set's structure: chords never cross, as the components never overlap. Chords are
 * drawn as arcs that meet the circle at right angles, as the diagram is usually drawn.
 */
import type { Chord } from "../math/atlas";

const INK = "246, 243, 234";
const BRASS = "#efc879";

const weight = (p: number) => [0, 0, 2, 1.5, 1.1, 0.8, 0.6][p] ?? 0.5;
const alpha = (p: number) => [0, 0, 0.95, 0.8, 0.6, 0.45, 0.32][p] ?? 0.25;

export class LavaursView {
  private g: CanvasRenderingContext2D;
  private lit: Chord | null = null;
  private hover: Chord | null = null;
  /** Each chord as a polyline in CSS pixels, for the size it was last drawn at. */
  private paths = new Map<Chord, [number, number][]>();
  private pathSize = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private chords: Chord[],
    onPick: (c: Chord) => void,
    private onHover: (c: Chord | null) => void,
  ) {
    this.g = canvas.getContext("2d")!;
    canvas.addEventListener("pointermove", (e) => this.setHover(this.nearest(e.offsetX, e.offsetY)));
    canvas.addEventListener("pointerleave", () => this.setHover(null));
    canvas.addEventListener("click", (e) => {
      const c = this.nearest(e.offsetX, e.offsetY);
      if (c) onPick(c);
    });
  }

  /** Light the chord of the component under the pointer in the main view. */
  show(lit: Chord | null): void {
    if (lit === this.lit) return;
    this.lit = lit;
    this.draw();
  }

  private setHover(c: Chord | null): void {
    if (c === this.hover) return;
    this.hover = c;
    this.canvas.style.cursor = c ? "pointer" : "default";
    this.onHover(c);
    this.draw();
  }

  private geometry() {
    const size = this.canvas.clientWidth;
    const r = size / 2 - 24;
    const at = (t: number): [number, number] => [size / 2 + r * Math.cos(2 * Math.PI * t), size / 2 - r * Math.sin(2 * Math.PI * t)];
    return { size, r, at };
  }

  /** The arc of the circle through A and B that meets the big circle at right angles. */
  private arc(ta: number, tb: number): [number, number][] {
    const { size, r, at } = this.geometry();
    const A = at(ta);
    const B = at(tb);
    let d = Math.abs(tb - ta) * 2 * Math.PI;
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (Math.PI - d < 1e-3) return [A, B];
    let mid = (ta + tb) * Math.PI;
    if (Math.abs(tb - ta) > 0.5) mid += Math.PI;
    const dist = r / Math.cos(d / 2);
    const rho = r * Math.tan(d / 2);
    const ox = size / 2 + dist * Math.cos(mid);
    const oy = size / 2 - dist * Math.sin(mid);
    const a1 = Math.atan2(A[1] - oy, A[0] - ox);
    let delta = Math.atan2(B[1] - oy, B[0] - ox) - a1;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta <= -Math.PI) delta += 2 * Math.PI;
    const n = Math.max(6, Math.ceil(Math.abs(delta) * rho / 3));
    const out: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const t = a1 + (delta * i) / n;
      out.push([ox + rho * Math.cos(t), oy + rho * Math.sin(t)]);
    }
    return out;
  }

  private pathOf(c: Chord): [number, number][] {
    const size = this.canvas.clientWidth;
    if (size !== this.pathSize) {
      this.paths.clear();
      this.pathSize = size;
    }
    let p = this.paths.get(c);
    if (!p) {
      p = this.arc(c.a.num / c.a.den, c.b.num / c.b.den);
      this.paths.set(c, p);
    }
    return p;
  }

  private nearest(px: number, py: number): Chord | null {
    let best: Chord | null = null;
    let bestD = 6;
    for (const c of this.chords) {
      const p = this.pathOf(c);
      for (let i = 1; i < p.length; i++) {
        const [ax, ay] = p[i - 1];
        const vx = p[i][0] - ax;
        const vy = p[i][1] - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
        const d = Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    return best;
  }

  private trace(c: Chord): void {
    const p = this.pathOf(c);
    const g = this.g;
    g.beginPath();
    g.moveTo(...p[0]);
    for (let i = 1; i < p.length; i++) g.lineTo(...p[i]);
    g.stroke();
  }

  draw(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { size, r, at } = this.geometry();
    if (!size) return;
    const W = Math.round(size * dpr);
    if (this.canvas.width !== W) {
      this.canvas.width = W;
      this.canvas.height = W;
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    g.strokeStyle = `rgba(${INK}, 0.5)`;
    g.lineWidth = 1;
    g.beginPath();
    g.arc(size / 2, size / 2, r, 0, 2 * Math.PI);
    g.stroke();
    g.lineCap = "round";
    const on = this.hover ?? this.lit;
    for (const c of this.chords) {
      if (c === on) continue;
      g.strokeStyle = `rgba(${INK}, ${alpha(c.period)})`;
      g.lineWidth = weight(c.period);
      this.trace(c);
    }
    g.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
    g.fillStyle = `rgba(${INK}, 0.7)`;
    g.textBaseline = "middle";
    g.textAlign = "left";
    g.fillText("0", size / 2 + r + 6, size / 2);
    g.textAlign = "right";
    g.fillText("1/2", size / 2 - r - 6, size / 2);
    g.textAlign = "center";
    g.fillText("1/4", size / 2, size / 2 - r - 11);
    g.fillText("3/4", size / 2, size / 2 + r + 11);
    g.textAlign = "left";
    g.textBaseline = "alphabetic";
    if (on) {
      g.strokeStyle = BRASS;
      g.lineWidth = 2.4;
      const a = at(on.a.num / on.a.den);
      const b = at(on.b.num / on.b.den);
      this.trace(on);
      g.fillStyle = BRASS;
      for (const [x, y] of [a, b]) {
        g.beginPath();
        g.arc(x, y, 3, 0, 2 * Math.PI);
        g.fill();
      }
    }
  }
}
