/**
 * The plan of the endless dive: from one minibrot to a deeper one, down to the bottom of
 * the map, then up and down again elsewhere.
 *
 * A minibrot of nucleus n and complex size s is close to a copy of the whole set, placed
 * by c = n + s w for w in the plane of the whole set. Inside the copy, every minibrot is
 * a tuned copy whose period is a multiple of n's: periods would explode. Just outside it,
 * at a few sizes from n, lie embedded Julia sets, at whose centre sits a minibrot about
 * twice as deep with a period only a few times larger. Each step looks in boxes on
 * circles around the copy, and keeps one of the minibrots that gain the most depth for
 * the least growth of period.
 */
import { fromDecimal, fromNumber, toNumber, type Fixed } from "../math/fixed";
import { bitsFor, preciseOrbit } from "../math/mandelbrot";
import { boxPeriod, nucleusFixed, sizeFixed } from "../math/minibrot";

export interface Minibrot {
  cx: Fixed;
  cy: Fixed;
  period: number;
  /** log2 of the modulus of the size, and its angle: the copy is the whole set turned by it. */
  sizeLog2: number;
  angle: number;
}

export interface Box {
  cx: Fixed;
  cy: Fixed;
  width: number;
}

/** Above this period the orbits and the search grow too long for a fluid dive. */
export const MAX_PERIOD = 60_000;
/** Deeper than this the next step would leave the map. */
export const BOTTOM_LOG2 = -960;

/** Where dives begin: boxes around minibrots of the whole set, of periods 3, 4, 27, 5 and 17. */
export const STARTS: { name: string; box: [string, string, number] }[] = [
  { name: "the needle", box: ["-1.7549", "0", 0.004] },
  { name: "the far needle", box: ["-1.9408", "0", 0.002] },
  { name: "seahorse valley", box: ["-0.7453", "0.1127", 0.01] },
  { name: "a filament below the set", box: ["0.3602", "-0.6413", 0.01] },
  { name: "a filament on top of the cardioid", box: ["-0.0177", "0.6630", 0.01] },
];

/** The minibrot whose nucleus lies in the box, found by its period and Newton's method. */
export function findMinibrot(box: Box, maxIter: number, maxPeriod = MAX_PERIOD): Minibrot | null {
  const bits = bitsFor(box.width / 4096) + 16;
  const orbit = preciseOrbit(box.cx, box.cy, bits, maxIter);
  const h = box.width / 2;
  const p = boxPeriod(
    orbit,
    [
      [-h, -h],
      [h, -h],
      [h, h],
      [-h, h],
    ],
    maxIter,
  );
  if (p < 1 || p > maxPeriod) return null;
  return settle(box, p);
}

/** The box at w in the plane of the copy m, `f` sizes of m wide. */
function boxAt(m: Minibrot, wr: number, wi: number, f: number): Box {
  const r = 2 ** m.sizeLog2;
  const sr = r * Math.cos(m.angle);
  const si = r * Math.sin(m.angle);
  return { cx: m.cx + fromNumber(sr * wr - si * wi), cy: m.cy + fromNumber(sr * wi + si * wr), width: r * f };
}

/** Boxes on circles around the copy: at R sizes, every 30 degrees from a turned start. */
export function candidates(m: Minibrot, turn: number): Box[] {
  const out: Box[] = [];
  for (const R of [1.5, 3, 8, 30]) {
    for (let a = 0; a < 12; a++) {
      const t = turn + (2 * Math.PI * a) / 12;
      for (const f of [0.05, 0.5, 3]) out.push(boxAt(m, R * Math.cos(t), R * Math.sin(t), f * R));
    }
  }
  return out;
}

/** A small generator, so that a dive can be replayed from its seed. */
export function random(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 2 ** 32;
  };
}

/** Place the nucleus of period p near the box to a fraction of its own size; null when Newton fails. */
function settle(box: Box, p: number): Minibrot | null {
  const bits = bitsFor(box.width / 4096) + 16;
  let n = nucleusFixed(box.cx, box.cy, p, bits);
  if (!n) return null;
  let size = sizeFixed(n[0], n[1], p, bits);
  if (!Number.isFinite(size.log2)) return null;
  const fine = bitsFor(2 ** size.log2 / 4096) + 32;
  if (fine > bits) {
    n = nucleusFixed(n[0], n[1], p, fine);
    if (!n) return null;
    size = sizeFixed(n[0], n[1], p, fine);
    if (!Number.isFinite(size.log2)) return null;
  }
  return { cx: n[0], cy: n[1], period: p, sizeLog2: size.log2, angle: size.angle };
}

/**
 * The next minibrot of the dive: among those found around m that go deeper by at least a
 * third of the way, one of the three that gain the most depth per doubling of the period.
 * One reference orbit, at the nucleus of m, serves every box by perturbation; Newton runs
 * once for each period found, from the smallest.
 */
export function nextMinibrot(m: Minibrot, rng: () => number): Minibrot | null {
  const maxIter = Math.min(200_000, 40 * m.period + 5000);
  const boxes = candidates(m, rng() * 2 * Math.PI);
  const smallest = Math.min(...boxes.map((b) => b.width));
  const orbit = preciseOrbit(m.cx, m.cy, bitsFor(smallest / 4096) + 24, maxIter);
  const byPeriod = new Map<number, Box>();
  const highest = Math.min(MAX_PERIOD, 16 * m.period);
  for (const box of boxes) {
    const ox = toNumber(box.cx - m.cx);
    const oy = toNumber(box.cy - m.cy);
    const h = box.width / 2;
    const p = boxPeriod(
      orbit,
      [
        [ox - h, oy - h],
        [ox + h, oy - h],
        [ox + h, oy + h],
        [ox - h, oy + h],
      ],
      maxIter,
    );
    if (p > m.period && p <= highest && !byPeriod.has(p)) byPeriod.set(p, box);
  }
  const found: { n: Minibrot; score: number }[] = [];
  for (const p of [...byPeriod.keys()].sort((x, y) => x - y)) {
    const n = settle(byPeriod.get(p)!, p);
    // Deeper by a third of the depth at least, and still on the map.
    if (!n || n.sizeLog2 > m.sizeLog2 * 1.33 - 3 || n.sizeLog2 < BOTTOM_LOG2) continue;
    found.push({ n, score: (m.sizeLog2 - n.sizeLog2) / Math.log2(n.period / m.period + 1) });
  }
  if (!found.length) return null;
  found.sort((x, y) => y.score - x.score);
  return found[Math.floor(rng() * Math.min(3, found.length))].n;
}

/** The minibrot a dive begins with. */
export function startMinibrot(k: number): Minibrot | null {
  const [re, im, width] = STARTS[k % STARTS.length].box;
  return findMinibrot({ cx: fromDecimal(re), cy: fromDecimal(im), width }, 5000);
}

/** Width of the view that frames a minibrot with some of its surroundings. */
export function frameWidth(m: Minibrot): number {
  return 3.2 * 2 ** m.sizeLog2;
}

/**
 * Iterations a view of the minibrot needs. Near the copy an orbit makes about one turn of
 * the period for each step the whole set would take, and the whole set needs hundreds:
 * so hundreds of periods. Inside, the pixels stop at the second return to the same point.
 */
export function itersFor(m: Minibrot): number {
  return Math.min(20_000_000, 300 * m.period + 5000);
}
