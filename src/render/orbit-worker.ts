/// <reference lib="webworker" />
/**
 * Computes reference orbits in fixed point, and their tables of bilinear approximations,
 * away from the page so that the view keeps moving while a deep orbit takes its time.
 */
import { buildBla, type BlaTable } from "../math/bla";
import { preciseOrbit, type Orbit } from "../math/mandelbrot";

export type WorkerRequest =
  | { kind: "orbit"; id: number; cx: bigint; cy: bigint; bits: number; maxIter: number; dcMax: number }
  | { kind: "bla"; id: number; dcMax: number };

export type WorkerReply =
  | { kind: "orbit"; id: number; data: Float64Array; length: number; ms: number; bla: BlaTable }
  | { kind: "bla"; id: number; bla: BlaTable };

const scope = self as unknown as DedicatedWorkerGlobalScope;
/** The last orbit, kept to rebuild its table when the view needs other radii. */
let last: { id: number; orbit: Orbit } | null = null;

const transfers = (t: BlaTable) => [t.ab.buffer, t.er.buffer];

scope.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  if (req.kind === "orbit") {
    const t0 = performance.now();
    const orbit = preciseOrbit(req.cx, req.cy, req.bits, req.maxIter);
    const bla = buildBla(orbit, req.dcMax);
    last = { id: req.id, orbit: { data: orbit.data.slice(), length: orbit.length } };
    const reply: WorkerReply = { kind: "orbit", id: req.id, data: orbit.data, length: orbit.length, ms: performance.now() - t0, bla };
    scope.postMessage(reply, [orbit.data.buffer, ...transfers(bla)]);
  } else if (last && last.id === req.id) {
    const bla = buildBla(last.orbit, req.dcMax);
    const reply: WorkerReply = { kind: "bla", id: req.id, bla };
    scope.postMessage(reply, transfers(bla));
  }
};
