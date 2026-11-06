/**
 * The Odyssey: eight chapters, each a short text, a place the camera flies to, the atlas
 * layers that explain it, and a small task checked live against what the pointer reads.
 */
import type { AtlasSight, Layer } from "../atlas/controller";
import { viewOf, type View } from "../math/view";

/** The whole set, with a margin. */
const WHOLE = viewOf("-0.75", "0", 2.8);

/** What a task can look at: the reading under the pointer, the reference in use, the depth. */
export interface StoryContext {
  sight: AtlasSight;
  reference: "none" | "doubles" | "waiting" | number;
  width: number;
}

export interface Task {
  prompt: string;
  /** `memory` keeps what earlier frames of the same chapter have seen. */
  done: (ctx: StoryContext, memory: Record<string, number>) => boolean;
  success: string;
}

export interface Chapter {
  id: string;
  title: string;
  /** Paragraphs, in plain text with <em> for emphasis. */
  body: string[];
  /** What the chapter shows: this view's width, and `height`, framed in the free part of the screen. */
  view: View;
  height: number;
  palette?: string;
  layers: Partial<Record<Layer, boolean>>;
  task?: Task;
}

const NONE: Partial<Record<Layer, boolean>> = { lens: false, component: false, orbit: false, rays: false, pi: false };

const inside = (c: StoryContext) => c.sight.pointing && c.sight.reading !== null && c.sight.reading.escape < 0;
const outside = (c: StoryContext) => c.sight.pointing && c.sight.reading !== null && c.sight.reading.escape > 0;

export const CHAPTERS: Chapter[] = [
  {
    id: "rule",
    title: "One rule",
    body: [
      "Pick a number <em>c</em> in the plane. Start from 0 and apply one rule, over and over: square, then add <em>c</em>. The points you visit are the orbit of <em>c</em>, drawn here from the pointer.",
      "For most <em>c</em> the orbit flies off to infinity. For some it stays close forever: those make the Mandelbrot set, the black shape in front of you. Everything else is coloured by how fast its orbit escapes.",
    ],
    view: WHOLE,
    height: 2.5,
    layers: { ...NONE, orbit: true },
    task: {
      prompt: "Move the pointer until its orbit stays bounded.",
      done: inside,
      success: "Bounded. This c is in the set: its orbit never leaves.",
    },
  },
  {
    id: "julia",
    title: "Connected or dust",
    body: [
      "Every <em>c</em> has a second picture, its Julia set: the starting points whose orbits stay bounded under the same rule. The lens shows it for the point under the pointer, with the orbit of 0 drawn on it.",
      "Inside the Mandelbrot set the Julia set is in one piece. Step outside and it shatters into dust. The Mandelbrot set is exactly the catalogue of the connected ones.",
    ],
    view: WHOLE,
    height: 2.5,
    layers: { ...NONE, lens: true },
    task: {
      prompt: "Cross the boundary: point outside the set, then inside.",
      done: (c, m) => {
        if (outside(c)) m.out = 1;
        return m.out === 1 && inside(c);
      },
      success: "Dust outside, one piece inside: you crossed the boundary.",
    },
  },
  {
    id: "bulbs",
    title: "Bulbs and periods",
    body: [
      "In the big heart, the main cardioid, orbits settle on a single point. On each bulb that grows from it they settle on a cycle instead, and the length of that cycle is the period of the bulb.",
      "Around the cardioid the bulbs run through every fraction <em>p/q</em>, one bulb of period <em>q</em> for each. The largest filament on top of a bulb splits into as many branches as its period: count them.",
    ],
    view: viewOf("-0.06", "0.52", 1.08),
    height: 0.72,
    layers: { ...NONE, lens: true, component: true },
    task: {
      prompt: "Find a bulb of period 5.",
      done: (c) => inside(c) && c.sight.reading!.period === 5,
      success: "Period 5: its orbits come back every five steps.",
    },
  },
  {
    id: "rays",
    title: "A map of rays",
    body: [
      "Seen from far away the set is round. Unbend the plane around it into the outside of a disc, and the straight lines from infinity become external rays, each named by an angle, a fraction of a turn.",
      "The rays of angle <em>k</em> / (2<sup><em>p</em></sup> − 1) land in pairs, at the roots of the components of period <em>p</em>. Lavaurs' diagram, in the index, draws each pair as a chord. The chords never cross, because the components never overlap.",
    ],
    view: WHOLE,
    height: 2.5,
    layers: { ...NONE, lens: true, component: true, rays: true },
    task: {
      prompt: "Pick a chord in Lavaurs' diagram to fly to its component.",
      done: (c, m) => {
        m.start ??= c.sight.picks;
        return c.sight.picks > m.start;
      },
      success: "Each chord is a component, and each component of period up to 6 has its chord.",
    },
  },
  {
    id: "pi",
    title: "π in seahorse valley",
    body: [
      "Between the cardioid and the big disc lies a narrow neck, at <em>c</em> = −3/4. Start a little above it, at −3/4 + <em>i</em>ε, and count the steps <em>N</em> before the orbit escapes.",
      "The smaller ε, the longer the orbit lingers, and <em>N</em> × ε comes closer to π: 3.3, 3.15, 3.143, 3.1417, and so on, digit after digit. Dave Boll found it in 1991, while checking that the neck had no width.",
    ],
    view: viewOf("-0.75", "0.07", 0.2),
    height: 0.17,
    layers: { ...NONE, lens: true, pi: true },
    task: {
      prompt: "Point at the neck, where orbits take the longest to escape.",
      done: (c) => outside(c) && Math.abs(c.sight.c[0] + 0.75) < 0.004 && c.sight.reading!.escape > 150,
      success: "The closer to the neck, the closer N × ε to π.",
    },
  },
  {
    id: "copies",
    title: "Copies of itself",
    body: [
      "On the long needle to the left sits a small copy of the whole set. Inside it orbits cycle through three regions: its period is 3. The set holds infinitely many such minibrots, each with bulbs and copies of its own.",
      "Not everything repeats. At the tips of the filaments lie points like <em>c</em> = <em>i</em>, where the orbit falls onto a cycle after a few steps. Around them the set looks alike at every scale, as the last chapter shows.",
    ],
    view: viewOf("-1.7548776662466927", "0", 0.05),
    height: 0.034,
    layers: { ...NONE, lens: true, component: true },
    task: {
      prompt: "Find the period of the copy.",
      done: (c) => inside(c) && c.sight.reading!.period === 3 && c.sight.c[0] < -1.7,
      success: "Period 3, and the same shape: a true copy, not a picture of one.",
    },
  },
  {
    id: "dive",
    title: "Diving",
    body: [
      "Here the script of 2023 ended, one frame after another, with 80-bit numbers: a billion billion times closer. A float on a graphics card holds seven digits; this view needs twenty.",
      "So one orbit, at the centre, is computed exactly, in 125 bits, and every pixel follows only its tiny offset from it. Where offsets grow too small even for that, they carry their own exponent; where they stay simple, whole runs of steps are skipped at once.",
    ],
    view: viewOf("-1.78780638350855487198076170", "0.00005689075511288150404139", 3.1e-18),
    height: 2e-18,
    palette: "turbo-2023",
    layers: { ...NONE, lens: true },
    task: {
      prompt: "Wait for the reference orbit, and read its precision in the readout.",
      done: (c) => typeof c.reference === "number" && c.width < 1e-15,
      success: "The reference is in: its bits are in the readout, bottom left.",
    },
  },
  {
    id: "bottom",
    title: "The bottom of the map",
    body: [
      "Ten to the power 290. If the whole set were the size of the visible universe, this view would be far smaller than the Planck length, the smallest length physics can speak of. It is the dendrite at <em>c</em> = <em>i</em> again, with the same branches.",
      "Around 10<sup>300</sup> the size of a pixel no longer fits a double, and the map ends. From here the set is yours: every pixel you have seen is computed live, so go anywhere.",
    ],
    view: viewOf("0", "1", 1e-290),
    height: 6e-291,
    palette: "classic",
    layers: { ...NONE, lens: true },
  },
];

const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function numeral(i: number): string {
  return NUMERALS[i] ?? String(i + 1);
}
