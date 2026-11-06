import { fromNumber, toNumber, type Fixed } from "../math/fixed";
import { bitsFor, referenceOrbit, type Orbit } from "../math/mandelbrot";
import type { View } from "../math/view";
import type { OrbitReply, OrbitRequest } from "./orbit-worker";

/** A reference point and its orbit, against which the perturbation measures every pixel. */
export interface Reference {
  cx: Fixed;
  cy: Fixed;
  /** Bits after the point it was computed with; 0 for an orbit in doubles. */
  bits: number;
  /** Iteration limit it was computed to; an orbit shorter than this has escaped. */
  maxIter: number;
  orbit: Orbit;
  /** Time the computation took. */
  ms: number;
}

/** Above this width an orbit in doubles is exact enough, and fast enough to compute at once. */
export const DOUBLE_LIMIT = 1e-10;
/** Spare bits asked for, so that zooming on does not need a new orbit at every step. */
const SPARE_BITS = 16;
/** Farthest the reference may be from the centre, in view widths, to be kept... */
const FRESH_DISTANCE = 1.5;
/** ...and to be drawn with while a nearer one is computed. */
const USABLE_DISTANCE = 64;
/** An outdated computation is let finish unless it has been running this long. */
const PATIENCE_MS = 250;

interface Wanted {
  cx: Fixed;
  cy: Fixed;
  bits: number;
  maxIter: number;
}

function distance(r: Wanted, v: View): number {
  return Math.hypot(toNumber(v.cx - r.cx), toNumber(v.cy - r.cy)) / v.width;
}

/** True when r can stay the reference for the view v and its iteration limit. */
function covers(r: Wanted | null, v: View, maxIter: number, wPx: number, doubles = false): boolean {
  if (!r) return false;
  const escaped = "orbit" in r && (r as Reference).orbit.length < r.maxIter;
  return (
    (doubles || r.bits >= bitsFor(v.width / wPx)) &&
    distance(r, v) <= FRESH_DISTANCE &&
    (escaped || r.maxIter >= maxIter)
  );
}

function doubleReference(v: View, maxIter: number): Reference {
  const cre = toNumber(v.cx);
  const cim = toNumber(v.cy);
  return { cx: fromNumber(cre), cy: fromNumber(cim), bits: 0, maxIter, orbit: referenceOrbit(cre, cim, maxIter), ms: 0 };
}

/**
 * Keeps a reference good enough for the view on screen. Shallow views get an orbit in
 * doubles at once. Deep ones get an orbit in fixed point from a worker, asked for as
 * soon as the motion heads there, so that it is often ready on arrival; until it is,
 * the previous deep reference serves whenever it still can.
 */
export class References {
  private shallow: Reference | null = null;
  private deep: Reference | null = null;
  private worker: Worker | null = null;
  private pending: (Wanted & { id: number; since: number }) | null = null;
  private queued: Wanted | null = null;
  private nextId = 1;

  /** The reference to draw `view` with, or null while none can. */
  get(view: View, viewIter: number, target: View, targetIter: number, wPx: number): Reference | null {
    // Prepare the deepest point of the motion: the target when zooming in, the view when zooming out.
    const [goal, goalIter] = target.width <= view.width ? [target, targetIter] : [view, viewIter];
    if (goal.width < DOUBLE_LIMIT && !covers(this.deep, goal, goalIter, wPx)) this.ask(goal, goalIter, wPx);
    if (view.width >= DOUBLE_LIMIT) {
      if (!covers(this.shallow, view, viewIter, wPx, true)) this.shallow = doubleReference(view, Math.ceil(viewIter * 1.5));
      return this.shallow;
    }
    const d = this.deep;
    return d && d.bits >= bitsFor(view.width / wPx) && distance(d, view) <= USABLE_DISTANCE ? d : null;
  }

  /** True while a deep orbit is being computed. */
  get busy(): boolean {
    return this.pending !== null;
  }

  private ask(v: View, maxIter: number, wPx: number): void {
    if (this.pending && covers(this.pending, v, maxIter, wPx)) {
      this.queued = null;
      return;
    }
    this.queued = { cx: v.cx, cy: v.cy, bits: bitsFor(v.width / wPx) + SPARE_BITS, maxIter: Math.ceil(maxIter * 1.5) };
    if (this.pending && performance.now() - this.pending.since > PATIENCE_MS) {
      // Too long for an orbit nobody wants any more.
      this.worker?.terminate();
      this.worker = null;
      this.pending = null;
    }
    if (!this.pending) this.send();
  }

  private send(): void {
    const q = this.queued;
    if (!q) return;
    this.queued = null;
    const req: OrbitRequest = { id: this.nextId++, ...q };
    this.pending = { ...q, id: req.id, since: performance.now() };
    (this.worker ?? this.start()).postMessage(req);
  }

  private start(): Worker {
    const worker = new Worker(new URL("./orbit-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<OrbitReply>) => {
      const p = this.pending;
      if (!p || e.data.id !== p.id) return;
      this.pending = null;
      this.deep = {
        cx: p.cx,
        cy: p.cy,
        bits: p.bits,
        maxIter: p.maxIter,
        orbit: { data: e.data.data, length: e.data.length },
        ms: e.data.ms,
      };
      this.send();
    };
    this.worker = worker;
    return worker;
  }
}
