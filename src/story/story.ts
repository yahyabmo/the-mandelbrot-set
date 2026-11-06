/**
 * The Odyssey on screen: a plate that tells one chapter at a time, flies the camera there,
 * switches the atlas layers that explain it, and checks its task against the live reading.
 */
import type { Atlas } from "../atlas/controller";
import { fitView, type Rect, type View } from "../math/view";
import { CHAPTERS, numeral, type StoryContext } from "./chapters";

export interface StoryHost {
  atlas: Atlas;
  flyTo(v: View): void;
  /** Screen size in CSS pixels. */
  size(): readonly [number, number];
  setPalette(id: string): void;
  context(): Omit<StoryContext, "sight">;
  /** Called when the story opens or closes, or moves to another chapter. */
  changed(index: number | null): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export class Story {
  private index: number | null = null;
  private memory: Record<string, number> = {};
  private solved = false;

  constructor(private host: StoryHost) {
    const dots = $("chapter-dots");
    CHAPTERS.forEach((c, i) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.title = `${numeral(i)}. ${c.title}`;
      b.setAttribute("aria-label", `Chapter ${numeral(i)}: ${c.title}`);
      b.addEventListener("click", () => this.open(i));
      li.append(b);
      dots.append(li);
    });
    $("chapter-prev").addEventListener("click", () => this.step(-1));
    $("chapter-next").addEventListener("click", () => (this.index === CHAPTERS.length - 1 ? this.close() : this.step(1)));
    $("chapter-close").addEventListener("click", () => this.close());
    $("story-toggle").addEventListener("click", () => (this.index === null ? this.open(0) : this.close()));
  }

  get chapter(): number | null {
    return this.index;
  }

  open(i: number): void {
    const c = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, i))];
    this.index = CHAPTERS.indexOf(c);
    this.memory = {};
    this.solved = false;
    this.host.atlas.setLayers(c.layers);
    if (c.palette) this.host.setPalette(c.palette);
    this.render();
    document.body.classList.add("story-open");
    $("chapter").hidden = false;
    $("story-toggle").setAttribute("aria-expanded", "true");
    // Measured once the plate is in place: the view is framed in what it leaves free.
    const [w, h] = this.host.size();
    this.host.flyTo(fitView(c.view, c.height, this.free(w, h), w, h));
    this.host.changed(this.index);
  }

  close(): void {
    if (this.index === null) return;
    this.index = null;
    $("chapter").hidden = true;
    document.body.classList.remove("story-open");
    $("story-toggle").setAttribute("aria-expanded", "false");
    this.host.changed(null);
  }

  step(d: number): void {
    if (this.index !== null) this.open(this.index + d);
  }

  /** Check the task of the chapter against what the pointer reads now. */
  frame(): void {
    if (this.index === null || this.solved) return;
    const task = CHAPTERS[this.index].task;
    if (!task) return;
    const ctx: StoryContext = { ...this.host.context(), sight: this.host.atlas.sight() };
    if (task.done(ctx, this.memory)) {
      this.solved = true;
      const box = $("chapter-task");
      box.classList.add("done");
      $("chapter-task-text").textContent = task.success;
    }
  }

  /** The part of the screen that the story plate and the index leave free. */
  private free(w: number, h: number): Rect {
    const plate = $("chapter").getBoundingClientRect();
    const margin = 14;
    if (w <= 720) {
      const top = $("hud").getBoundingClientRect().bottom;
      return { x0: margin, x1: w - margin, y0: top + margin, y1: plate.top - margin };
    }
    const panel = $("panel").getBoundingClientRect();
    const right = document.body.classList.contains("panel-closed") ? w : panel.left;
    return { x0: plate.right + margin, x1: right - margin, y0: 70, y1: h - margin };
  }

  private render(): void {
    const i = this.index!;
    const c = CHAPTERS[i];
    $("chapter-kicker").textContent = `Chapter ${numeral(i)} of ${numeral(CHAPTERS.length - 1)}`;
    $("chapter-title").textContent = c.title;
    // The bodies are the app's own text, with <em> and <sup> only.
    $("chapter-body").innerHTML = c.body.map((p) => `<p>${p}</p>`).join("");
    const box = $("chapter-task");
    box.hidden = !c.task;
    box.classList.remove("done");
    $("chapter-task-text").textContent = c.task?.prompt ?? "";
    $<HTMLButtonElement>("chapter-prev").disabled = i === 0;
    $("chapter-next").textContent = i === CHAPTERS.length - 1 ? "Explore freely" : "Next";
    [...$("chapter-dots").querySelectorAll("button")].forEach((b, k) => {
      b.classList.toggle("active", k === i);
      b.setAttribute("aria-current", k === i ? "step" : "false");
    });
  }
}
