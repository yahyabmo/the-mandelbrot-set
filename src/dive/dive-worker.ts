/// <reference lib="webworker" />
/** Looks for the minibrots of the endless dive, away from the page. */
import { nextMinibrot, random, startMinibrot, type Minibrot } from "./plan";

export type DiveRequest = { kind: "start"; id: number; start: number; seed: number } | { kind: "next"; id: number; from: Minibrot };

export interface DiveReply {
  id: number;
  minibrot: Minibrot | null;
  ms: number;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;
let rng = random(1);

scope.onmessage = (e: MessageEvent<DiveRequest>) => {
  const req = e.data;
  const t0 = performance.now();
  let minibrot: Minibrot | null;
  if (req.kind === "start") {
    rng = random(req.seed);
    minibrot = startMinibrot(req.start);
  } else {
    minibrot = nextMinibrot(req.from, rng);
  }
  const reply: DiveReply = { id: req.id, minibrot, ms: performance.now() - t0 };
  scope.postMessage(reply);
};
