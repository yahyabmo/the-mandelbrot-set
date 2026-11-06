/// <reference lib="webworker" />
/**
 * Computes reference orbits in fixed point, away from the page so that the view keeps
 * moving while a deep orbit takes its time.
 */
import { preciseOrbit } from "../math/mandelbrot";

export interface OrbitRequest {
  id: number;
  cx: bigint;
  cy: bigint;
  bits: number;
  maxIter: number;
}

export interface OrbitReply {
  id: number;
  data: Float64Array;
  length: number;
  ms: number;
}

self.onmessage = (e: MessageEvent<OrbitRequest>) => {
  const { id, cx, cy, bits, maxIter } = e.data;
  const t0 = performance.now();
  const orbit = preciseOrbit(cx, cy, bits, maxIter);
  const reply: OrbitReply = { id, data: orbit.data, length: orbit.length, ms: performance.now() - t0 };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(reply, [orbit.data.buffer]);
};
