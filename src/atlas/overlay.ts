/**
 * What the atlas draws over the image: the orbit of the point under the pointer, the
 * component it belongs to, the external rays, and the line of the π experiment.
 * Positions are doubles relative to the centre of the view, exact enough down to the
 * depths where the atlas speaks.
 */
import type { Complex, OrbitPoints } from "../math/atlas";

export interface OverlayScene {
  /** Centre of the view as doubles, its width, the canvas size in CSS pixels. */
  cx: number;
  cy: number;
  width: number;
  wPx: number;
  hPx: number;
  orbit: OrbitPoints | null;
  component: { nucleus: Complex; size: Complex; period: number } | null;
  rays: { label: string; points: Float64Array; period: number; lit: boolean }[];
  pi: boolean;
}

const INK = "246, 243, 234";
const BRASS = "#efc879";
const MONO = '500 11px "IBM Plex Mono", ui-monospace, monospace';

export class Overlay {
  private g: CanvasRenderingContext2D;

  constructor(private canvas: HTMLCanvasElement) {
    this.g = canvas.getContext("2d")!;
  }

  draw(s: OverlayScene): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(s.wPx * dpr);
    const H = Math.round(s.hPx * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    const g = this.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const k = s.wPx / s.width;
    const X = (re: number) => s.wPx / 2 + (re - s.cx) * k;
    const Y = (im: number) => s.hPx / 2 - (im - s.cy) * k;
    g.lineJoin = "round";
    g.lineCap = "round";

    for (const r of s.rays) if (!r.lit) this.ray(r, X, Y, s);
    for (const r of s.rays) if (r.lit) this.ray(r, X, Y, s);
    if (s.pi) this.piLine(X, Y, k);
    if (s.component) this.component(s.component, X, Y, k, s);
    if (s.orbit) this.orbit(s.orbit, X, Y);
  }

  private ray(r: OverlayScene["rays"][number], X: (x: number) => number, Y: (y: number) => number, s: OverlayScene): void {
    const g = this.g;
    const p = r.points;
    g.strokeStyle = r.lit ? BRASS : `rgba(${INK}, ${r.period <= 3 ? 0.5 : r.period === 4 ? 0.3 : 0.17})`;
    g.lineWidth = r.lit ? 1.8 : r.period <= 3 ? 1.1 : 0.8;
    g.beginPath();
    let lastX = NaN;
    let lastY = NaN;
    for (let i = 0; i < p.length; i += 2) {
      const x = X(p[i]);
      const y = Y(p[i + 1]);
      // Skip points closer than half a pixel to the last one drawn.
      if (i > 0 && Math.abs(x - lastX) + Math.abs(y - lastY) < 0.5 && i < p.length - 2) continue;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
      lastX = x;
      lastY = y;
    }
    g.stroke();
    if (!r.lit && r.period > 3) return;
    // The label sits on the ray, some way before where it lands.
    const n = p.length / 2;
    const ex = X(p[2 * n - 2]);
    const ey = Y(p[2 * n - 1]);
    let j = n - 1;
    while (j > 0 && Math.hypot(X(p[2 * j]) - ex, Y(p[2 * j + 1]) - ey) < (r.lit ? 46 : 34)) j--;
    const lx = X(p[2 * j]);
    const ly = Y(p[2 * j + 1]);
    if (lx < 0 || ly < 0 || lx > s.wPx || ly > s.hPx) return;
    this.label(r.label, lx, ly, r.lit ? BRASS : `rgba(${INK}, 0.85)`);
  }

  private component(c: NonNullable<OverlayScene["component"]>, X: (x: number) => number, Y: (y: number) => number, k: number, s: OverlayScene): void {
    const radius = 0.5 * Math.hypot(c.size[0], c.size[1]) * k;
    if (radius < 5 || radius > 2 * Math.max(s.wPx, s.hPx)) return;
    const g = this.g;
    const x = X(c.nucleus[0]);
    const y = Y(c.nucleus[1]);
    g.save();
    g.setLineDash([5, 4]);
    g.strokeStyle = BRASS;
    g.lineWidth = 1.2;
    g.beginPath();
    g.arc(x, y, radius, 0, 2 * Math.PI);
    g.stroke();
    g.restore();
    g.fillStyle = BRASS;
    g.beginPath();
    g.arc(x, y, 2.2, 0, 2 * Math.PI);
    g.fill();
    const a = -Math.PI / 4;
    this.label(`period ${c.period}`, x + Math.cos(a) * radius + 6, y + Math.sin(a) * radius - 4, BRASS);
  }

  private orbit(o: OrbitPoints, X: (x: number) => number, Y: (y: number) => number): void {
    const g = this.g;
    const n = Math.min(o.count, 300);
    for (let i = 1; i <= n; i++) {
      const a = Math.max(0.15, 1 - i / Math.max(30, n));
      g.strokeStyle = `rgba(${INK}, ${(0.8 * a).toFixed(3)})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(X(o.points[2 * i - 2]), Y(o.points[2 * i - 1]));
      g.lineTo(X(o.points[2 * i]), Y(o.points[2 * i + 1]));
      g.stroke();
    }
    g.fillStyle = `rgba(${INK}, 0.95)`;
    for (let i = 2; i <= n; i++) {
      g.beginPath();
      g.arc(X(o.points[2 * i]), Y(o.points[2 * i + 1]), 1.7, 0, 2 * Math.PI);
      g.fill();
    }
    g.fillStyle = BRASS;
    g.beginPath();
    g.arc(X(o.points[2]), Y(o.points[3]), 3.2, 0, 2 * Math.PI);
    g.fill();
  }

  /** The line c = -3/4 + iε rising from the neck, with a tick at each power of ten. */
  private piLine(X: (x: number) => number, Y: (y: number) => number, k: number): void {
    const g = this.g;
    const x = X(-0.75);
    g.save();
    g.setLineDash([3, 4]);
    g.strokeStyle = BRASS;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x, Y(0));
    g.lineTo(x, Y(0.2));
    g.stroke();
    g.restore();
    for (let e = 1; e <= 9; e++) {
      const y = Y(10 ** -e);
      if (Math.abs(y - Y(0)) < 9 && e > 1) break;
      g.strokeStyle = BRASS;
      g.beginPath();
      g.moveTo(x - 5, y);
      g.lineTo(x + 5, y);
      g.stroke();
      if (k * 10 ** -e > 14) this.label(`ε = 10⁻${"⁰¹²³⁴⁵⁶⁷⁸⁹"[e]}`, x + 9, y + 4, BRASS);
    }
  }

  private label(text: string, x: number, y: number, colour: string): void {
    const g = this.g;
    g.font = MONO;
    g.lineWidth = 3;
    g.strokeStyle = "rgba(8, 9, 12, 0.85)";
    g.strokeText(text, x, y);
    g.fillStyle = colour;
    g.fillText(text, x, y);
  }
}
