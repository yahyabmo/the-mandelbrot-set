/**
 * The endless dive: the camera flies from minibrot to minibrot, each about twice as deep
 * as the last, down to the bottom of the map; then it surfaces and dives again elsewhere.
 * The next minibrot is looked for while the camera flies to the current one.
 */
import type { View } from "../math/view";
import { superscript } from "../ui/format";
import type { DiveReply, DiveRequest } from "./dive-worker";
import { frameWidth, itersFor, STARTS, type Minibrot } from "./plan";

export interface DiveHost {
  flyTo(v: View): void;
  home(): View;
  /** True once the camera has reached its target and the image is sharp. */
  arrived(): boolean;
  setMinIter(n: number): void;
  status(text: string): void;
  changed(active: boolean): void;
}

/** How long the camera stays on each minibrot before diving on. */
const REST_MS = 2500;

type Phase = "searching" | "flying" | "resting" | "surfacing";

export class AutoDive {
  active = false;
  private worker: Worker | null = null;
  private id = 0;
  private phase: Phase = "searching";
  private next: Minibrot | null | undefined = undefined;
  private restUntil = 0;
  private dives = 0;
  private steps = 0;

  constructor(private host: DiveHost) {}

  /** True while the camera goes down at the cruising speed; it surfaces at full speed. */
  get cruising(): boolean {
    return this.active && this.phase !== "surfacing";
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.host.changed(true);
    this.begin();
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.id++;
    this.host.setMinIter(0);
    this.host.status("");
    this.host.changed(false);
  }

  toggle(): void {
    if (this.active) this.stop();
    else this.start();
  }

  /** A new dive from the next starting place. */
  private begin(): void {
    const k = this.dives++ % STARTS.length;
    this.phase = "searching";
    this.steps = 0;
    this.host.status(`Looking for a minibrot near ${STARTS[k].name}…`);
    this.ask({ kind: "start", id: 0, start: k, seed: (Math.random() * 2 ** 31) | 0 });
  }

  private ask(req: DiveRequest): void {
    this.next = undefined;
    if (!this.worker) {
      this.worker = new Worker(new URL("./dive-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<DiveReply>) => {
        if (e.data.id === this.id) this.next = e.data.minibrot;
      };
    }
    this.worker.postMessage({ ...req, id: ++this.id });
  }

  /** Call once per frame. */
  frame(now: number): void {
    if (!this.active) return;
    if (this.phase === "flying" && this.host.arrived()) {
      this.phase = "resting";
      this.restUntil = now + REST_MS;
    }
    if (this.phase === "surfacing" && this.host.arrived()) this.begin();
    const ready = this.next !== undefined;
    const rested = this.phase === "searching" || (this.phase === "resting" && now >= this.restUntil);
    if (!ready || !rested) return;
    const m = this.next;
    if (!m) {
      // Nothing deeper: the bottom of the map, or a dead end. Surface and dive elsewhere.
      this.phase = "surfacing";
      this.host.setMinIter(0);
      this.host.status(this.steps ? `Bottom reached after ${this.steps} minibrots. Surfacing…` : "Surfacing…");
      this.host.flyTo(this.host.home());
      this.next = undefined;
      return;
    }
    this.steps++;
    this.phase = "flying";
    this.host.setMinIter(itersFor(m));
    this.host.flyTo({ cx: m.cx, cy: m.cy, width: frameWidth(m) });
    const depth = Math.round(-m.sizeLog2 * Math.log10(2));
    this.host.status(`Minibrot ${this.steps}: period ${m.period.toLocaleString("en-US")}, 10${superscript(-depth)} wide. Looking for the next…`);
    // Look for the next one while the camera flies to this one.
    this.ask({ kind: "next", id: 0, from: m });
  }
}
