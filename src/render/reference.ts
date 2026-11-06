import type { BlaTable } from "../math/bla";
import { fromNumber, toNumber, type Fixed } from "../math/fixed";
import { bitsFor, referenceOrbit, type Orbit } from "../math/mandelbrot";
import type { View } from "../math/view";
import type { WorkerReply, WorkerRequest } from "./orbit-worker";

/** A reference point and its orbit, against which the perturbation measures every pixel. */
export interface Reference {
  /** Number of the orbit at the worker, 0 for an orbit in doubles. */
  id: number;
  cx: Fixed;
  cy: Fixed;
  /** Bits after the point it was computed with; 0 for an orbit in doubles. */
  bits: number;
  /** Iteration limit it was computed to; an orbit shorter than this has escaped. */
  maxIter: number;
  orbit: Orbit;
  /** Bilinear approximations of the orbit, to skip iterations; replaced as the view needs. */
  bla: BlaTable | null;
  /** Time the orbit took. */
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
/** A table made for offsets this many times larger than the view needs is rebuilt: its skips are too short. */
const TOO_CAUTIOUS = 16;
/** Most room asked for ahead of a view that widens, which outgrows its table within the frame. */
const MAX_AHEAD = 1e4;

interface Wanted {
  cx: Fixed;
  cy: Fixed;
  bits: number;
  maxIter: number;
  dcMax: number;
}

function distance(r: { cx: Fixed; cy: Fixed }, v: View): number {
  return Math.hypot(toNumber(v.cx - r.cx), toNumber(v.cy - r.cy)) / v.width;
}

/** The largest offset |dc| from the reference r over the pixels of the view. */
export function largestOffset(r: { cx: Fixed; cy: Fixed }, v: View, wPx: number, hPx: number): number {
  const pixel = v.width / wPx;
  return (distance(r, v) * wPx + Math.hypot(wPx, hPx) / 2 + 1) * pixel;
}

/** True when r can stay the reference for the view v and its iteration limit. */
function covers(r: Wanted | Reference | null, v: View, maxIter: number, wPx: number, doubles = false): boolean {
  if (!r) return false;
  const escaped = "orbit" in r && r.orbit.length < r.maxIter;
  return (
    (doubles || r.bits >= bitsFor(v.width / wPx)) &&
    distance(r, v) <= FRESH_DISTANCE &&
    (escaped || r.maxIter >= maxIter)
  );
}

function doubleReference(v: View, maxIter: number): Reference {
  const cre = toNumber(v.cx);
  const cim = toNumber(v.cy);
  return { id: 0, cx: fromNumber(cre), cy: fromNumber(cim), bits: 0, maxIter, orbit: referenceOrbit(cre, cim, maxIter), bla: null, ms: 0 };
}

/**
 * Keeps a reference good enough for the view on screen. Shallow views get an orbit in
 * doubles at once. Deep ones get an orbit in fixed point from a worker, asked for as
 * soon as the motion heads there, so that it is often ready on arrival; until it is,
 * the previous deep reference serves whenever it still can. The worker also rebuilds
 * the table of approximations when the view outgrows it.
 */
export class References {
  private shallow: Reference | null = null;
  private deep: Reference | null = null;
  private worker: Worker | null = null;
  private pending: (Wanted & { id: number; since: number }) | null = null;
  private queued: Wanted | null = null;
  private tablePending = false;
  private nextId = 1;

  /** The reference to draw `view` with, or null while none can. */
  get(view: View, viewIter: number, target: View, targetIter: number, wPx: number, hPx: number): Reference | null {
    // Prepare the deepest point of the motion: the target when zooming in, the view when zooming out.
    const [goal, goalIter] = target.width <= view.width ? [target, targetIter] : [view, viewIter];
    if (goal.width < DOUBLE_LIMIT && !covers(this.deep, goal, goalIter, wPx)) this.ask(goal, goalIter, wPx, hPx);
    if (view.width >= DOUBLE_LIMIT) {
      if (!covers(this.shallow, view, viewIter, wPx, true)) this.shallow = doubleReference(view, Math.ceil(viewIter * 1.5));
      return this.shallow;
    }
    const d = this.deep;
    return d && d.bits >= bitsFor(view.width / wPx) && distance(d, view) <= USABLE_DISTANCE ? d : null;
  }

  /**
   * The table of approximations of r if it holds for every pixel of the view, else null;
   * asks for a better one when it does not hold, or holds with too much caution.
   */
  table(r: Reference, view: View, target: View, wPx: number, hPx: number): BlaTable | null {
    if (r.id === 0) return null;
    const need = largestOffset(r, view, wPx, hPx);
    // Widening, the offsets grow by the frame: ask for room ahead, and again before it runs out.
    const ahead = Math.min(MAX_AHEAD, Math.max(2, target.width / view.width));
    const t = r.bla;
    const holds = t !== null && t.dcMax >= need;
    const renew = !holds || t!.dcMax < need * Math.sqrt(ahead) || t!.dcMax > TOO_CAUTIOUS * ahead * need;
    if (renew && r === this.deep && !this.pending && !this.tablePending && this.worker) {
      this.tablePending = true;
      const req: WorkerRequest = { kind: "bla", id: r.id, dcMax: ahead * need };
      this.worker.postMessage(req);
    }
    return holds ? t : null;
  }

  /** True while a deep orbit is being computed. */
  get busy(): boolean {
    return this.pending !== null;
  }

  private ask(v: View, maxIter: number, wPx: number, hPx: number): void {
    if (this.pending && covers(this.pending, v, maxIter, wPx)) {
      this.queued = null;
      return;
    }
    const dcMax = 2 * (Math.hypot(wPx, hPx) / 2 + 1) * (v.width / wPx);
    this.queued = { cx: v.cx, cy: v.cy, bits: bitsFor(v.width / wPx) + SPARE_BITS, maxIter: Math.ceil(maxIter * 1.5), dcMax };
    if (this.pending && performance.now() - this.pending.since > PATIENCE_MS) {
      // Too long for an orbit nobody wants any more.
      this.worker?.terminate();
      this.worker = null;
      this.pending = null;
      this.tablePending = false;
    }
    if (!this.pending) this.send();
  }

  private send(): void {
    const q = this.queued;
    if (!q) return;
    this.queued = null;
    const req: WorkerRequest = { kind: "orbit", id: this.nextId++, ...q };
    this.pending = { ...q, id: req.id, since: performance.now() };
    (this.worker ?? this.start()).postMessage(req);
  }

  private start(): Worker {
    const worker = new Worker(new URL("./orbit-worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<WorkerReply>) => {
      const reply = e.data;
      if (reply.kind === "bla") {
        this.tablePending = false;
        // A fresh object, so that the renderer sees the change.
        if (this.deep && this.deep.id === reply.id) this.deep = { ...this.deep, bla: reply.bla };
        return;
      }
      const p = this.pending;
      if (!p || reply.id !== p.id) return;
      this.pending = null;
      this.deep = {
        id: p.id,
        cx: p.cx,
        cy: p.cy,
        bits: p.bits,
        maxIter: p.maxIter,
        orbit: { data: reply.data, length: reply.length },
        bla: reply.bla,
        ms: reply.ms,
      };
      this.send();
    };
    this.worker = worker;
    return worker;
  }
}
