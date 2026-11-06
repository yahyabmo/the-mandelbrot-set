/**
 * The atlas: layers of mathematics over the explorer, switched in the index. It reads the
 * point under the pointer (or the centre, on a touch screen), and shows its Julia set and
 * orbit in the lens, its component on the image, the external rays and Lavaurs' diagram,
 * and the π experiment.
 */
import type { Palette, Rgb } from "../color/palettes";
import { angleText, componentSize, lavaurs, nucleus, orbitOf, readPoint, type Chord, type Complex, type OrbitPoints, type Reading } from "../math/atlas";
import { fromNumber, toNumber } from "../math/fixed";
import { toComplex, type View } from "../math/view";
import { scientificText } from "../ui/format";
import type { AtlasReply, AtlasRequest, PiRow } from "./atlas-worker";
import { LavaursView } from "./lavaurs-view";
import { Lens } from "./lens";
import { Overlay } from "./overlay";

export interface AtlasHost {
  view(): View;
  size(): readonly [number, number];
  colours(): { palette: Palette; period: number; offset: number; interior: Rgb };
  flyTo(v: View): void;
}

/** Below this width the atlas stops drawing over the image: doubles no longer place it. */
const ATLAS_DEPTH = 1e-11;
/** Iterations the atlas gives a point to escape. */
const READ_ITER = 4000;
const MAX_PERIOD = 6;
const PI_DIGITS = "3.14159265358979";

export type Layer = "lens" | "component" | "orbit" | "rays" | "pi";

/** What the atlas reads at the pointer, for whoever wants to react to it. */
export interface AtlasSight {
  /** True when the reading is aimed: by the mouse, or by the centre of the view on a touch screen. */
  pointing: boolean;
  c: Complex;
  reading: Reading | null;
  /** Chords picked in Lavaurs' diagram so far. */
  picks: number;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Atlas {
  readonly layers: Record<Layer, boolean> = { lens: true, component: true, orbit: false, rays: false, pi: false };
  private lens: Lens;
  private overlay: Overlay;
  private diagram: LavaursView;
  private chords: Chord[] = lavaurs(MAX_PERIOD);
  private rays = new Map<string, Float64Array>();
  private worker: Worker | null = null;
  private asked = { rays: false, pi: false };
  private pointer: { x: number; y: number } | null = null;
  private readKey = "";
  private sceneKey = "";
  private reading: Reading | null = null;
  private orbit: OrbitPoints | null = null;
  private probe: Complex = [0, 0];
  private lit: Chord | null = null;
  private hovered: Chord | null = null;
  private picks = 0;
  /** Set while something else, such as the sound, needs the readings with every layer off. */
  alwaysRead = false;
  /** On a screen without hover, the cross at the centre is the pointer. */
  private touch = matchMedia("(hover: none)").matches;

  constructor(private host: AtlasHost) {
    this.lens = new Lens($<HTMLCanvasElement>("lens-julia"), $<HTMLCanvasElement>("lens-orbit"));
    this.overlay = new Overlay($<HTMLCanvasElement>("atlas-overlay"));
    this.diagram = new LavaursView(
      $<HTMLCanvasElement>("lavaurs-canvas"),
      this.chords,
      (c) => this.flyToChord(c),
      (c) => {
        this.hovered = c;
        this.sceneKey = "";
      },
    );
    for (const layer of Object.keys(this.layers) as Layer[]) {
      $(`layer-${layer}`).addEventListener("click", () => this.toggle(layer));
    }
    $("pi-fly").addEventListener("click", () => this.host.flyTo({ cx: fromNumber(-0.75), cy: fromNumber(0.07), width: 0.24 }));
    this.sync();
  }

  /** The pointer over the image, in CSS pixels, or null when it left. */
  setPointer(p: { x: number; y: number } | null): void {
    this.pointer = p;
  }

  toggle(layer: Layer): void {
    this.layers[layer] = !this.layers[layer];
    this.sync();
  }

  /** Switch layers on or off together, as a chapter of the story does. */
  setLayers(on: Partial<Record<Layer, boolean>>): void {
    Object.assign(this.layers, on);
    this.sync();
  }

  /** The orbit of the point the atlas reads, for the sound. */
  orbitPoints(): OrbitPoints | null {
    return this.orbit;
  }

  sight(): AtlasSight {
    return { pointing: this.pointer !== null || this.touch, c: this.probe, reading: this.reading, picks: this.picks };
  }

  private sync(): void {
    for (const layer of Object.keys(this.layers) as Layer[]) $(`layer-${layer}`).setAttribute("aria-pressed", String(this.layers[layer]));
    $("lens").hidden = !this.layers.lens;
    $("lavaurs").hidden = !this.layers.rays;
    $("pi-card").hidden = !this.layers.pi;
    if (this.layers.rays) {
      this.ask("rays");
      this.diagram.draw();
    }
    if (this.layers.pi) this.ask("pi");
    this.sceneKey = "";
    this.readKey = "";
  }

  private ask(kind: "rays" | "pi"): void {
    if (this.asked[kind]) return;
    this.asked[kind] = true;
    if (!this.worker) {
      this.worker = new Worker(new URL("./atlas-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (e: MessageEvent<AtlasReply>) => this.receive(e.data);
    }
    const req: AtlasRequest = kind === "rays" ? { kind: "rays", maxPeriod: MAX_PERIOD } : { kind: "pi" };
    this.worker.postMessage(req);
  }

  private receive(r: AtlasReply): void {
    if (r.kind === "ray") {
      this.rays.set(r.key, r.points);
      this.sceneKey = "";
      this.readKey = "";
    } else this.addPiRow(r.row);
  }

  /** Call once per frame, after the image is drawn. */
  frame(): void {
    const v = this.host.view();
    const [w, h] = this.host.size();
    const shallow = v.width >= ATLAS_DEPTH;
    const [re, im] = this.pointer ? toComplex(v, this.pointer.x, this.pointer.y, w, h) : [v.cx, v.cy];
    this.probe = [toNumber(re), toNumber(im)];
    const anything = this.layers.lens || this.layers.component || this.layers.orbit || this.layers.rays || this.alwaysRead;
    const readKey = this.probe.join();
    if (anything && readKey !== this.readKey) {
      this.readKey = readKey;
      this.reading = readPoint(this.probe[0], this.probe[1], READ_ITER);
      this.orbit = orbitOf(this.probe[0], this.probe[1], 600, 1e3);
      this.lit = this.chordOf(this.reading);
      this.diagram.show(this.layers.rays ? this.lit : null);
      this.facts(v);
    }
    const colours = this.host.colours();
    if (this.layers.lens && this.orbit) {
      this.lens.draw(this.probe, this.orbit, colours.palette, Math.max(8, colours.period / 6), colours.offset, colours.interior);
    }
    const sceneKey = [v.cx, v.cy, v.width, w, h, readKey, JSON.stringify(this.layers), this.rays.size, this.hovered?.a.num, this.hovered?.period].join();
    if (sceneKey === this.sceneKey) return;
    this.sceneKey = sceneKey;
    const r = this.reading;
    this.overlay.draw({
      cx: toNumber(v.cx),
      cy: toNumber(v.cy),
      width: v.width,
      wPx: w,
      hPx: h,
      orbit: shallow && this.layers.orbit ? this.orbit : null,
      component: shallow && this.layers.component && r && this.near(r) ? { nucleus: r.nucleus!, size: r.size!, period: r.period } : null,
      rays: shallow && this.layers.rays ? this.rayScene() : [],
      pi: shallow && this.layers.pi,
    });
  }

  /** True when the point is in the component it found, or near it: within two of its radii. */
  private near(r: Reading): boolean {
    if (!r.nucleus || !r.size) return false;
    if (r.escape < 0) return true;
    return Math.hypot(this.probe[0] - r.nucleus[0], this.probe[1] - r.nucleus[1]) < Math.hypot(...r.size);
  }

  private rayScene() {
    const out: { label: string; points: Float64Array; period: number; lit: boolean }[] = [];
    const on = this.hovered ?? this.lit;
    for (const c of this.chords) {
      for (const a of [c.a, c.b]) {
        const points = this.rays.get(`${a.num}/${a.den}`);
        if (points) out.push({ label: angleText(a), points, period: c.period, lit: c === on });
      }
    }
    return out;
  }

  /** Where the two rays of a chord end: next to the root of its component. */
  private rootOf(c: Chord): Complex | null {
    const a = this.rays.get(`${c.a.num}/${c.a.den}`);
    const b = this.rays.get(`${c.b.num}/${c.b.den}`);
    if (!a || !b) return null;
    return [(a[a.length - 2] + b[b.length - 2]) / 2, (a[a.length - 1] + b[b.length - 1]) / 2];
  }

  /** The chord of the component a reading found, matched by the roots of the rays drawn so far. */
  private chordOf(r: Reading): Chord | null {
    if (!r.nucleus || !r.size || r.period < 2 || r.period > MAX_PERIOD) return null;
    const scale = Math.hypot(...r.size);
    let best: Chord | null = null;
    let bestD = Infinity;
    for (const c of this.chords) {
      if (c.period !== r.period) continue;
      const root = this.rootOf(c);
      if (!root) continue;
      const d = Math.hypot(root[0] - r.nucleus[0], root[1] - r.nucleus[1]);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best && bestD < 3 * scale + 0.02 ? best : null;
  }

  private flyToChord(c: Chord): void {
    const root = this.rootOf(c);
    if (!root) return;
    this.picks++;
    const n = nucleus(root[0], root[1], c.period);
    if (!n) return;
    const s = Math.hypot(...componentSize(n, c.period));
    this.host.flyTo({ cx: fromNumber(n[0]), cy: fromNumber(n[1]), width: Math.max(1e-9, 5 * s) });
  }

  /** The readings in words, under the lens. */
  private facts(v: View): void {
    const r = this.reading!;
    const digits = Math.min(14, Math.max(4, Math.ceil(-Math.log10(v.width / 1000))));
    const [x, y] = this.probe;
    $("lens-c").textContent = `${x.toFixed(digits)} ${y < 0 ? "−" : "+"} ${Math.abs(y).toFixed(digits)}i`;
    $("lens-fate").textContent = r.escape > 0 ? `escapes at step ${r.escape.toLocaleString("en-US")}` : "stays bounded";
    $("lens-component").textContent =
      r.nucleus && r.size && this.near(r) ? `period ${r.period}, size ${scientificText(Math.hypot(...r.size))}` : r.escape > 0 ? "outside" : `period ${r.period}`;
  }

  private addPiRow(row: PiRow): void {
    const tbody = $(row.place === "neck" ? "pi-neck" : "pi-cusp").querySelector("tbody")!;
    const tr = document.createElement("tr");
    const exp = Math.round(-Math.log10(row.eps));
    // As many decimals as the factor has: those of ε at the neck, of √ε at the cusp.
    const text = row.product.toFixed(row.place === "neck" ? exp : exp / 2);
    let same = 0;
    while (same < text.length && text[same] === PI_DIGITS[same]) same++;
    tr.innerHTML = `<td>10<sup>−${exp}</sup></td><td>${row.steps.toLocaleString("en-US")}</td><td><b></b><span></span></td>`;
    tr.querySelector("b")!.textContent = text.slice(0, same);
    tr.querySelector("span")!.textContent = text.slice(same);
    tbody.append(tr);
  }
}
