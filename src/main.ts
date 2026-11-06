import "./style.css";
import { Atlas } from "./atlas/controller";
import { paletteById, paletteCss, PALETTES, type Rgb } from "./color/palettes";
import { autoIterations } from "./math/iterations";
import { toDecimal, toNumber } from "./math/fixed";
import { ease, flightPath, HOME_WIDTH, homeView, inSight, MIN_WIDTH, panBy, settled, zoomAt, zoomRate, type View } from "./math/view";
import { PLACES, type Place } from "./places";
import { Renderer, type Status } from "./render/renderer";
import { Story } from "./story/story";
import { AutoDive } from "./dive/autodive";
import { OrbitSound } from "./senses/sound";
import { recordFilm, filmSeconds } from "./senses/recorder";
import { coordinateText, magnificationHtml, scientificText, superscript } from "./ui/format";
import { decode, encode } from "./url";

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("stage");
const INTERIOR: Rgb = [4, 5, 10];
const CAPTURE_SAMPLES = 8;

function fatal(message: string): never {
  const box = $("fatal");
  box.hidden = false;
  box.textContent = `${message} Try a recent version of Chrome, Edge or Firefox.`;
  throw new Error(message);
}

let renderer: Renderer;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  fatal((e as Error).message);
}

const size = () => [canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight] as const;

const defaults = {
  view: homeView(innerWidth, innerHeight),
  palette: "classic",
  density: 1,
  offset: 0,
  detail: 1,
};
const initial = decode(location.hash, defaults);

const state = {
  target: initial.view as View,
  current: initial.view as View,
  palette: paletteById(initial.palette),
  density: initial.density,
  offset: initial.offset,
  detail: initial.detail,
  cycling: false,
  cycleSpeed: 0.12,
  /** Iterations a view needs at least, beyond the automatic count: set by the endless dive. */
  minIter: 0,
  smooth: true,
  // A page opened without a link starts on the first place, the whole set.
  place: (initial === defaults ? "home" : null) as string | null,
  captureSince: 0,
};

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

// Places: a drop-down list in the panel. The keys 1 to 9 reach them too.
const placeButton = $("place-button");
const placeList = $("place-list");
const placeOptions = PLACES.map((p, i) => {
  const option = document.createElement("li");
  option.id = `place-${p.id}`;
  option.className = "picker-option";
  option.setAttribute("role", "option");
  option.innerHTML = `<kbd>${i + 1}</kbd><b></b><span></span>`;
  option.querySelector("b")!.textContent = p.name;
  option.querySelector("span")!.textContent = p.blurb;
  option.addEventListener("click", () => {
    closePlaces(true);
    goTo(p);
  });
  option.addEventListener("pointermove", () => highlight(i, false));
  placeList.append(option);
  return option;
});
let highlighted = 0;

function highlight(i: number, scroll = true): void {
  highlighted = (i + PLACES.length) % PLACES.length;
  placeOptions.forEach((o, k) => o.classList.toggle("highlighted", k === highlighted));
  placeList.setAttribute("aria-activedescendant", placeOptions[highlighted].id);
  if (scroll) placeOptions[highlighted].scrollIntoView({ block: "nearest" });
}

function openPlaces(): void {
  placeList.hidden = false;
  placeButton.setAttribute("aria-expanded", "true");
  highlight(Math.max(0, PLACES.findIndex((p) => p.id === state.place)));
  placeList.focus();
}

function closePlaces(refocus: boolean): void {
  if (placeList.hidden) return;
  placeList.hidden = true;
  placeButton.setAttribute("aria-expanded", "false");
  if (refocus) placeButton.focus();
}

placeButton.addEventListener("click", () => (placeList.hidden ? openPlaces() : closePlaces(true)));
placeButton.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  openPlaces();
});
placeList.addEventListener("keydown", (e) => {
  switch (e.key) {
    case "ArrowDown":
      highlight(highlighted + 1);
      break;
    case "ArrowUp":
      highlight(highlighted - 1);
      break;
    case "Home":
      highlight(0);
      break;
    case "End":
      highlight(PLACES.length - 1);
      break;
    case "Enter":
    case " ":
      closePlaces(true);
      goTo(PLACES[highlighted]);
      break;
    case "Escape":
      closePlaces(true);
      break;
    case "Tab":
      closePlaces(false);
      return;
    default:
      return;
  }
  e.preventDefault();
  e.stopPropagation();
});
document.addEventListener("pointerdown", (e) => {
  if (!$("place-picker").contains(e.target as Node)) closePlaces(false);
});

// The depth gauge: one tick per decade of magnification, down to the deepest this version reaches.
const GAUGE_DECADES = Math.floor(Math.log10(HOME_WIDTH / MIN_WIDTH));
const GAUGE_STEP = [1, 2, 5, 10, 20, 50].find((s) => GAUGE_DECADES / s <= 36) ?? 100;
const GAUGE_LABEL = GAUGE_DECADES / GAUGE_STEP > 12 ? 5 : 3;
for (let d = 0; d <= GAUGE_DECADES; d += GAUGE_STEP) {
  const major = (d / GAUGE_STEP) % GAUGE_LABEL === 0;
  const tick = document.createElement("div");
  tick.className = major ? "gauge-tick major" : "gauge-tick";
  tick.style.top = `${(100 * d) / GAUGE_DECADES}%`;
  if (major) tick.innerHTML = `<span>10${superscript(d)}</span>`;
  $("gauge-track").append(tick);
}

const paletteButtons = PALETTES.map((p) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "palette";
  b.innerHTML = `<i></i>`;
  b.querySelector("i")!.style.background = paletteCss(p);
  b.append(p.name);
  b.addEventListener("click", () => {
    state.palette = p;
    syncPanel();
  });
  $("palettes").append(b);
  return b;
});

const density = $<HTMLInputElement>("density");
const offset = $<HTMLInputElement>("offset");
const detail = $<HTMLInputElement>("detail");
const cycle = $("cycle");
const cycleSpeed = $<HTMLInputElement>("cycle-speed");
const smooth = $("smooth");

density.addEventListener("input", () => {
  state.density = 10 ** Number(density.value);
  syncPanel();
});
offset.addEventListener("input", () => {
  state.offset = Number(offset.value);
  syncPanel();
});
detail.addEventListener("input", () => {
  state.detail = 2 ** Number(detail.value);
  syncPanel();
});
cycleSpeed.addEventListener("input", () => (state.cycleSpeed = Number(cycleSpeed.value)));
cycle.addEventListener("click", () => {
  state.cycling = !state.cycling;
  syncPanel();
});
smooth.addEventListener("click", () => {
  state.smooth = !state.smooth;
  syncPanel();
});
$("copy-link").addEventListener("click", copyLink);
$("save-image").addEventListener("click", () => (state.captureSince = performance.now()));
$("reset").addEventListener("click", () => goTo(PLACES[0]));

const panelToggle = $("panel-toggle");
panelToggle.addEventListener("click", () => {
  const closed = document.body.classList.toggle("panel-closed");
  panelToggle.setAttribute("aria-expanded", String(!closed));
});
if (innerWidth <= 720) {
  document.body.classList.add("panel-closed");
  panelToggle.setAttribute("aria-expanded", "false");
}

function syncPanel(): void {
  const place = PLACES.findIndex((p) => p.id === state.place);
  $("place-key").textContent = place >= 0 ? String(place + 1) : "–";
  $("place-name").textContent = place >= 0 ? PLACES[place].name : "Off the map";
  $("place-blurb").textContent = place >= 0 ? PLACES[place].blurb : "Pick a place to fly there";
  placeOptions.forEach((o, i) => {
    o.classList.toggle("active", i === place);
    o.setAttribute("aria-selected", String(i === place));
  });
  paletteButtons.forEach((b, i) => b.classList.toggle("active", PALETTES[i].id === state.palette.id));
  density.value = String(Math.log10(state.density));
  offset.value = String(state.offset);
  detail.value = String(Math.log2(state.detail));
  $("density-out").textContent = `${state.density.toFixed(2)}×`;
  $("offset-out").textContent = state.offset.toFixed(2);
  $("detail-out").textContent = `${state.detail.toFixed(2)}×`;
  cycle.setAttribute("aria-pressed", String(state.cycling));
  smooth.setAttribute("aria-pressed", String(state.smooth));
}

/** Waypoints left on the way to a place, after the current target. */
let route: View[] = [];

function flyTo(v: View): void {
  route = flightPath(state.current, v);
  state.target = route.shift()!;
}

function goTo(p: Place): void {
  const [w, h] = size();
  flyTo(p.view === "home" ? homeView(w, h) : { ...p.view });
  if (p.palette) state.palette = paletteById(p.palette);
  state.place = p.id;
  closePlaces(false);
  inertia = { x: 0, y: 0 };
  syncPanel();
}

// The atlas reads the point under the mouse; on a touch screen, the centre of the view.
const atlas = new Atlas({
  view: () => state.current,
  size,
  colours: () => ({ palette: state.palette, period: state.palette.period / state.density, offset: state.offset, interior: INTERIOR }),
  flyTo: (v) => {
    flyTo(v);
    state.place = null;
    inertia = { x: 0, y: 0 };
    syncPanel();
  },
});
canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "touch") atlas.setPointer({ x: e.offsetX, y: e.offsetY });
});
canvas.addEventListener("pointerleave", () => atlas.setPointer(null));

let lastStatus: Status | null = null;
const story = new Story({
  atlas,
  flyTo: (v) => {
    flyTo(v);
    state.place = null;
    inertia = { x: 0, y: 0 };
    syncPanel();
  },
  size,
  setPalette: (id) => {
    state.palette = paletteById(id);
    syncPanel();
  },
  context: () => ({ reference: lastStatus?.reference ?? "none", width: state.current.width }),
  changed: (index) => {
    urlAt = 0;
    if (index !== null) dive.stop();
  },
});
/** Cruising speed of the endless dive, in factors of e per second: slow enough to watch. */
const DIVE_RATE = 7;
const dive = new AutoDive({
  flyTo: (v) => {
    flyTo(v);
    state.place = null;
    inertia = { x: 0, y: 0 };
    syncPanel();
  },
  home: () => homeView(...size()),
  arrived: () => state.current === state.target && route.length === 0 && lastStatus?.sharp === true,
  setMinIter: (n) => (state.minIter = n),
  status: (text) => ($("dive-status").textContent = text),
  changed: (active) => {
    $("dive-toggle").setAttribute("aria-pressed", String(active));
    if (active) story.close();
  },
});
$("dive-toggle").addEventListener("click", () => dive.toggle());

const sound = new OrbitSound();
function toggleSound(): void {
  const on = sound.toggle();
  atlas.alwaysRead = on;
  $("sound-toggle").setAttribute("aria-pressed", String(on));
}
$("sound-toggle").addEventListener("click", toggleSound);

// A film of the dive to the current view, frame by frame, in Full HD.
let recording = false;
let stopRecording = false;
const FILM = { fps: 30, width: 1920, height: 1080, samples: 4 };
async function recordView(): Promise<void> {
  if (recording) {
    stopRecording = true;
    return;
  }
  dive.stop();
  story.close();
  const to = state.target;
  const from = homeView(FILM.width, FILM.height);
  recording = true;
  stopRecording = false;
  $("record").textContent = "Stop";
  const status = $("record-status");
  status.textContent = `A film of ${Math.round(filmSeconds(from, to))} s: getting ready…`;
  try {
    const film = await recordFilm(
      {
        renderer,
        canvas,
        frameOf: (view, target) => ({
          view,
          maxIter: Math.max(autoIterations(view.width, state.detail), state.minIter),
          target,
          targetIter: Math.max(autoIterations(target.width, state.detail), state.minIter),
          palette: state.palette,
          period: state.palette.period / state.density,
          offset: state.offset,
          interior: INTERIOR,
          moving: false,
          allowSamples: true,
        }),
        progress: (done, total) => (status.textContent = `Recording: frame ${done} of ${total}`),
      },
      from,
      to,
      FILM,
      () => stopRecording,
    );
    if (film) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(film);
      a.download = `mandelbrot-dive-${state.place ?? "view"}.mp4`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
      status.textContent = `Film saved: ${(film.size / 1e6).toFixed(1)} MB.`;
    } else status.textContent = "Recording stopped.";
  } catch (e) {
    status.textContent = (e as Error).message;
  } finally {
    recording = false;
    $("record").textContent = "Record a film";
  }
}
$("record").addEventListener("click", () => void recordView());

/** "#chapter=3" opens the third chapter of the story. */
const chapterIn = (hash: string) => {
  const m = /^#chapter=(\d+)$/.exec(hash);
  return m ? Number(m[1]) - 1 : null;
};

let toastTimer = 0;
function toast(text: string): void {
  const t = $("toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove("show"), 1800);
}

function shareHash(): string {
  return encode({
    view: state.target,
    palette: state.palette.id,
    density: state.density,
    offset: state.offset,
    detail: state.detail,
  });
}

function copyLink(): void {
  history.replaceState(null, "", shareHash());
  navigator.clipboard
    .writeText(location.href)
    .then(() => toast("Link copied"))
    .catch(() => toast("The link is in the address bar"));
}

// A link pasted into the address bar of an open tab takes effect at once.
window.addEventListener("hashchange", () => {
  const chapter = chapterIn(location.hash);
  if (chapter !== null) {
    if (chapter !== story.chapter) story.open(chapter);
    return;
  }
  story.close();
  const s = decode(location.hash, { view: state.target, palette: state.palette.id, density: state.density, offset: state.offset, detail: state.detail });
  flyTo(s.view);
  state.palette = paletteById(s.palette);
  state.density = s.density;
  state.offset = s.offset;
  state.detail = s.detail;
  state.place = null;
  inertia = { x: 0, y: 0 };
  syncPanel();
});

// ---------------------------------------------------------------------------
// Navigation: wheel, drag with inertia, pinch, double-click, keyboard
// ---------------------------------------------------------------------------

const pointers = new Map<number, { x: number; y: number }>();
let velocity = { x: 0, y: 0 };
let inertia = { x: 0, y: 0 };
let lastMoveTime = 0;

function interacted(): void {
  dive.stop();
  route = [];
  state.place = null;
  $("hint").classList.add("gone");
}

canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  inertia = { x: 0, y: 0 };
  velocity = { x: 0, y: 0 };
  state.target = state.current;
  canvas.classList.add("grabbing");
  interacted();
  syncPanel();
});

canvas.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) return;
  const [w, h] = size();
  const next = { x: e.offsetX, y: e.offsetY };
  if (pointers.size === 1) {
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    state.target = state.current = panBy(state.current, dx, dy, w);
    const now = performance.now();
    const dt = Math.max(1, now - lastMoveTime);
    velocity = { x: 0.8 * velocity.x + 0.2 * (dx / dt) * 1000, y: 0.8 * velocity.y + 0.2 * (dy / dt) * 1000 };
    lastMoveTime = now;
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.entries()].map(([id, p]) => (id === e.pointerId ? next : p));
    const [pa, pb] = [...pointers.values()];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const oldMid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
    const factor = Math.hypot(a.x - b.x, a.y - b.y) / Math.max(1, Math.hypot(pa.x - pb.x, pa.y - pb.y));
    const moved = panBy(state.current, mid.x - oldMid.x, mid.y - oldMid.y, w);
    state.target = state.current = zoomAt(moved, mid.x, mid.y, w, h, factor);
  }
  pointers.set(e.pointerId, next);
});

function release(e: PointerEvent): void {
  pointers.delete(e.pointerId);
  if (pointers.size > 0) return;
  canvas.classList.remove("grabbing");
  // A flick keeps gliding; a drag that stopped before release does not.
  if (performance.now() - lastMoveTime < 80) inertia = { ...velocity };
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const [w, h] = size();
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * h : e.deltaY;
    state.target = zoomAt(state.target, e.offsetX, e.offsetY, w, h, Math.exp(-delta * 0.0018));
    inertia = { x: 0, y: 0 };
    interacted();
    syncPanel();
  },
  { passive: false },
);

canvas.addEventListener("dblclick", (e) => {
  const [w, h] = size();
  state.target = zoomAt(state.target, e.offsetX, e.offsetY, w, h, e.shiftKey ? 1 / 4 : 4);
  interacted();
  syncPanel();
});

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
  const [w, h] = size();
  const step = 0.12 * w;
  const pan = (dx: number, dy: number) => (state.target = panBy(state.target, dx, dy, w));
  if (story.chapter !== null && (e.key === "Escape" || e.key === "PageDown" || e.key === "PageUp")) {
    e.preventDefault();
    if (e.key === "Escape") story.close();
    else story.step(e.key === "PageDown" ? 1 : -1);
    return;
  }
  switch (e.key) {
    case "ArrowLeft":
      pan(step, 0);
      break;
    case "ArrowRight":
      pan(-step, 0);
      break;
    case "ArrowUp":
      pan(0, step);
      break;
    case "ArrowDown":
      pan(0, -step);
      break;
    case "+":
    case "=":
      state.target = zoomAt(state.target, w / 2, h / 2, w, h, 1.6);
      break;
    case "-":
    case "_":
      state.target = zoomAt(state.target, w / 2, h / 2, w, h, 1 / 1.6);
      break;
    case "r":
    case "R":
      goTo(PLACES[0]);
      return;
    case "h":
    case "H":
      document.body.classList.toggle("ui-hidden");
      return;
    case "d":
    case "D":
      dive.toggle();
      return;
    case "m":
    case "M":
      toggleSound();
      return;
    case "c":
    case "C":
      state.cycling = !state.cycling;
      syncPanel();
      return;
    case "s":
    case "S":
      state.captureSince = performance.now();
      return;
    default: {
      const i = Number(e.key) - 1;
      if (Number.isInteger(i) && i >= 0 && i < PLACES.length) goTo(PLACES[i]);
      return;
    }
  }
  e.preventDefault();
  interacted();
  syncPanel();
});

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

let last = performance.now();
let fps = 60;
let hudAt = 0;
let urlAt = 0;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const [w, h] = size();
  const W = Math.max(1, Math.round(w * dpr));
  const H = Math.max(1, Math.round(h * dpr));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  renderer.resize(W, H);
}

function capture(): void {
  state.captureSince = 0;
  canvas.toBlob((blob) => {
    if (!blob) return toast("The image could not be saved");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mandelbrot-${state.place ?? "view"}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast("Image saved");
  }, "image/png");
}

function frame(now: number): void {
  // While a film is being rendered, the recorder has the canvas to itself.
  if (recording) {
    last = now;
    requestAnimationFrame(frame);
    return;
  }
  // The first timestamp of requestAnimationFrame may come before the page script started.
  const elapsed = Math.max(0, now - last);
  const dt = Math.min(0.1, elapsed / 1000);
  last = now;
  fps = 0.92 * fps + 0.08 * (1 / Math.max(dt, 1e-3));
  resize();
  const [w] = size();

  const gliding = pointers.size === 0 && Math.hypot(inertia.x, inertia.y) > 8;
  if (gliding) {
    state.target = state.current = panBy(state.current, inertia.x * dt, inertia.y * dt, w);
    const decay = Math.exp(-dt * 4);
    inertia = { x: inertia.x * decay, y: inertia.y * decay };
  }
  if (route.length && inSight(state.current, route[0])) state.target = route.shift()!;
  if (state.current !== state.target) {
    state.current = settled(state.current, state.target, w) ? state.target : ease(state.current, state.target, 1 - Math.exp(-dt * 12), (dive.cruising ? Math.min(DIVE_RATE, zoomRate(Math.log(state.target.width / state.current.width))) : zoomRate(Math.log(state.target.width / state.current.width))) * dt);
  }
  const moving = pointers.size > 0 || gliding || state.current !== state.target;

  if (state.cycling) {
    state.offset = (state.offset + dt * state.cycleSpeed) % 1;
    offset.value = String(state.offset);
    $("offset-out").textContent = state.offset.toFixed(2);
  }

  const maxIter = Math.max(autoIterations(state.current.width, state.detail), state.minIter);
  const allowSamples = state.smooth && !state.cycling;
  const status = renderer.render({
    view: state.current,
    maxIter,
    target: state.target,
    targetIter: Math.max(autoIterations(state.target.width, state.detail), state.minIter),
    palette: state.palette,
    period: state.palette.period / state.density,
    offset: state.offset,
    interior: INTERIOR,
    moving,
    allowSamples,
  });
  renderer.adapt(Math.min(100, elapsed));
  atlas.frame();
  lastStatus = status;
  story.frame();
  dive.frame(now);
  if (sound.on) sound.setOrbit(atlas.orbitPoints(), atlas.sight().reading);

  if (state.captureSince) {
    const ready = status.sharp && (!allowSamples || status.samples >= CAPTURE_SAMPLES);
    if (ready || now - state.captureSince > 6000) capture();
  }

  if (now - hudAt > 120) {
    hudAt = now;
    const v = state.current;
    const [w] = size();
    const magnification = homeView(...size()).width / v.width;
    $("hud-zoom").innerHTML = magnificationHtml(magnification);
    const depth = Math.min(1, Math.max(0, Math.log10(Math.max(1, magnification)) / GAUGE_DECADES));
    $("gauge-mark").style.top = `${100 * depth}%`;
    $("scale-text").textContent = `120 px = ${scientificText((v.width / w) * 120)}`;
    $("hud-re").textContent = coordinateText(v.cx, v.width);
    $("hud-im").textContent = coordinateText(v.cy, v.width);
    $("hud-iter").textContent = maxIter.toLocaleString("en-US");
    $("hud-engine").textContent = status.engine;
    $("hud-ref").textContent =
      status.reference === "none"
        ? "none"
        : status.reference === "doubles"
          ? "doubles"
          : status.reference === "waiting"
            ? "computing…"
            : `${status.reference} bits${status.skipping ? " + BLA" : ""}`;
    $("hud-image").textContent = status.reference === "waiting"
      ? "waiting for the orbit"
      : status.sharp
      ? status.samples > 1
        ? `sharp, ${status.samples} samples`
        : "sharp"
      : `preview ${Math.round(status.scale * 100)}%`;
    $("hud-fps").textContent = String(Math.round(fps));
    $("hud-limit").hidden = v.width > MIN_WIDTH * 1.05;
  }
  if (!moving && now - urlAt > 500) {
    urlAt = now;
    // While the story is open, the link points at its chapter.
    const hash = story.chapter !== null ? `#chapter=${story.chapter + 1}` : shareHash();
    if (hash !== location.hash) history.replaceState(null, "", hash);
  }
  requestAnimationFrame(frame);
}

syncPanel();
const firstChapter = chapterIn(location.hash);
if (firstChapter !== null) story.open(firstChapter);
setTimeout(() => $("hint").classList.add("gone"), 12000);
requestAnimationFrame(frame);

// For scripted captures and for poking around from the devtools console.
(window as unknown as { odyssey: unknown }).odyssey = {
  state,
  renderer,
  goTo,
  PLACES,
  story,
  atlas,
  dive,
  sound,
  recordView,
  /** The current view in plain numbers, for scripts that cannot read bigints. */
  here: () => ({ re: toNumber(state.current.cx), im: toNumber(state.current.cy), width: state.current.width }),
  /** The current centre with every digit. */
  centre: () => [toDecimal(state.current.cx, 340), toDecimal(state.current.cy, 340)],
};
