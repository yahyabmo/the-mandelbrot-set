/// <reference lib="webworker" />
/**
 * The slow part of the atlas, off the page: the external rays of Lavaurs' chords, which
 * creep towards their parabolic landing points, and the long orbits of the π experiment.
 */
import { escapeSteps, externalRay, lavaurs } from "../math/atlas";

export type AtlasRequest = { kind: "rays"; maxPeriod: number } | { kind: "pi" };

export interface PiRow {
  /** Where the orbit starts: "neck" is c = -3/4 + iε, "cusp" is c = 1/4 + ε. */
  place: "neck" | "cusp";
  eps: number;
  steps: number;
  /** N ε at the neck, N √ε at the cusp. */
  product: number;
}

export type AtlasReply =
  | { kind: "ray"; key: string; period: number; points: Float64Array }
  | { kind: "pi"; row: PiRow };

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Deep enough for the rays to stop within a pixel or two of their roots on the whole set. */
const RAY_DEPTH = 300;

scope.onmessage = (e: MessageEvent<AtlasRequest>) => {
  if (e.data.kind === "rays") {
    for (const chord of lavaurs(e.data.maxPeriod)) {
      for (const a of [chord.a, chord.b]) {
        const ray = externalRay(a, 1e-9, RAY_DEPTH);
        const points = new Float64Array(ray.flat());
        const reply: AtlasReply = { kind: "ray", key: `${a.num}/${a.den}`, period: chord.period, points };
        scope.postMessage(reply, [points.buffer]);
      }
    }
  } else {
    for (let k = 1; k <= 7; k++) {
      const eps = 10 ** -k;
      const steps = escapeSteps(-0.75, eps, 1e9);
      const neck: AtlasReply = { kind: "pi", row: { place: "neck", eps, steps, product: steps * eps } };
      scope.postMessage(neck);
    }
    for (let k = 1; k <= 6; k++) {
      const eps = 10 ** (-2 * k);
      const steps = escapeSteps(0.25 + eps, 0, 1e9);
      const cusp: AtlasReply = { kind: "pi", row: { place: "cusp", eps, steps, product: steps * Math.sqrt(eps) } };
      scope.postMessage(cusp);
    }
  }
};
