/// <reference lib="webworker" />
/** One of the workers of the Buddhabrot: it follows random orbits and keeps its own counts. */
import { random } from "../dive/plan";
import { sampleOrbits, type Grid } from "./sampler";

export type BuddhaRequest = { kind: "grid"; grid: Grid; generation: number; seed: number } | { kind: "snapshot" } | { kind: "stop" };

export interface BuddhaReply {
  generation: number;
  hist: Uint32Array;
  orbits: number;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
let grid: Grid | null = null;
let generation = 0;
let hist = new Uint32Array(0);
let orbits = 0;
let rng = random(1);
let running = false;

function work(): void {
  if (!grid) {
    running = false;
    return;
  }
  const t0 = performance.now();
  while (performance.now() - t0 < 40) orbits += sampleOrbits(grid, 500, rng, hist);
  setTimeout(work, 0);
}

scope.onmessage = (e: MessageEvent<BuddhaRequest>) => {
  const req = e.data;
  if (req.kind === "grid") {
    grid = req.grid;
    generation = req.generation;
    hist = new Uint32Array(3 * grid.w * grid.h);
    orbits = 0;
    rng = random(req.seed);
    if (!running) {
      running = true;
      work();
    }
  } else if (req.kind === "snapshot") {
    if (!grid) return;
    const copy = hist.slice();
    const reply: BuddhaReply = { generation, hist: copy, orbits };
    scope.postMessage(reply, [copy.buffer]);
  } else {
    grid = null;
  }
};
