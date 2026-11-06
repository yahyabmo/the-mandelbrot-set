/**
 * Bilinear approximation of the perturbation, to skip iterations.
 *
 * While dz stays small next to the reference, the step dz <- 2 Z dz + dz^2 + dc is nearly
 * linear: dz <- A dz + B dc with A = 2 Z_m and B = 1, as long as |dz| < R = eps |A|.
 * Two such steps, x then y, make one: A = A_y A_x and B = A_y B_x + B_y, valid while
 * |dz| < min(R_x, (R_y - |B_x| |dc|) / |A_x|). Merging in pairs gives, for each level l,
 * approximations of 2^l steps starting at m = 1 + j 2^l; the renderer applies the
 * longest one whose radius holds.
 *
 * The table is stored for the GPU as float32 mantissas with their own exponents, since
 * A and B overflow a float32 far before the deepest zooms.
 */
import type { Orbit } from "./mandelbrot";

/** Relative size of the neglected dz^2 term: float32 precision. */
export const BLA_EPSILON = 2 ** -24;
/** Entries per row of the textures. */
export const BLA_ROW = 4096;

export interface BlaTable {
  /** Number of levels: level l skips 2^l steps. */
  levels: number;
  /** Index of the first entry of each level. */
  offsets: number[];
  /** Per entry: mantissas of A (re, im) and B (re, im). */
  ab: Float32Array;
  /** Per entry: exponents of A and B, then log2 of the radius (-Infinity when it never holds). */
  er: Float32Array;
  /** Largest log2 radius of all: offsets above it need not look at the table. */
  maxLogR: number;
  /** The largest |dc| the radii allow for. */
  dcMax: number;
  count: number;
}

/** x = m 2^e with |m| in [1, 2) for the larger of the two parts. */
function split(x: number, y: number): [number, number, number] {
  const a = Math.max(Math.abs(x), Math.abs(y));
  if (a === 0 || !Number.isFinite(a)) return [0, 0, 0];
  let e = Math.floor(Math.log2(a));
  if (a / 2 ** e >= 2) e++;
  const s = 2 ** -e;
  return [x * s, y * s, e];
}

/** The table for an orbit, valid for every pixel with |dc| <= dcMax. */
export function buildBla(orbit: Orbit, dcMax: number, eps = BLA_EPSILON): BlaTable {
  const Z = orbit.data;
  const n0 = Math.max(0, orbit.length - 1);
  // Level 0: one step from each m in 1..length-1.
  let ax = new Float64Array(n0);
  let ay = new Float64Array(n0);
  let bx = new Float64Array(n0).fill(1);
  let by = new Float64Array(n0);
  let r = new Float64Array(n0);
  for (let j = 0; j < n0; j++) {
    const m = j + 1;
    ax[j] = 2 * Z[2 * m];
    ay[j] = 2 * Z[2 * m + 1];
    r[j] = eps * Math.sqrt(ax[j] * ax[j] + ay[j] * ay[j]);
  }
  const levels: { ax: Float64Array; ay: Float64Array; bx: Float64Array; by: Float64Array; r: Float64Array }[] = [];
  levels.push({ ax, ay, bx, by, r });
  while (r.length >= 2) {
    const n = r.length >> 1;
    const nax = new Float64Array(n);
    const nay = new Float64Array(n);
    const nbx = new Float64Array(n);
    const nby = new Float64Array(n);
    const nr = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      const x = 2 * j;
      const y = x + 1;
      // A = A_y A_x, B = A_y B_x + B_y
      const Ax = ax[y] * ax[x] - ay[y] * ay[x];
      const Ay = ax[y] * ay[x] + ay[y] * ax[x];
      const Bx = ax[y] * bx[x] - ay[y] * by[x] + bx[y];
      const By = ax[y] * by[x] + ay[y] * bx[x] + by[y];
      const rx = r[x];
      const ry = (r[y] - Math.sqrt(bx[x] * bx[x] + by[x] * by[x]) * dcMax) / Math.sqrt(ax[x] * ax[x] + ay[x] * ay[x]);
      let R = Math.min(rx, Math.max(0, ry));
      if (!(R > 0) || !Number.isFinite(Ax + Ay + Bx + By)) R = 0;
      nax[j] = R > 0 ? Ax : 0;
      nay[j] = R > 0 ? Ay : 0;
      nbx[j] = R > 0 ? Bx : 0;
      nby[j] = R > 0 ? By : 0;
      nr[j] = R;
    }
    ax = nax;
    ay = nay;
    bx = nbx;
    by = nby;
    r = nr;
    levels.push({ ax, ay, bx, by, r });
  }

  const offsets: number[] = [];
  let count = 0;
  for (const l of levels) {
    offsets.push(count);
    count += l.r.length;
  }
  const size = Math.max(1, Math.ceil(count / BLA_ROW)) * BLA_ROW;
  const ab = new Float32Array(4 * size);
  const er = new Float32Array(4 * size);
  let maxLogR = -Infinity;
  levels.forEach((l, li) => {
    for (let j = 0; j < l.r.length; j++) {
      const k = 4 * (offsets[li] + j);
      const [amx, amy, ae] = split(l.ax[j], l.ay[j]);
      const [bmx, bmy, be] = split(l.bx[j], l.by[j]);
      ab[k] = amx;
      ab[k + 1] = amy;
      ab[k + 2] = bmx;
      ab[k + 3] = bmy;
      er[k] = ae;
      er[k + 1] = be;
      const logR = l.r[j] > 0 ? Math.log2(l.r[j]) : -Infinity;
      er[k + 2] = logR;
      if (li === 0) maxLogR = Math.max(maxLogR, logR);
    }
  });
  return { levels: levels.length, offsets, ab, er, maxLogR, dcMax, count };
}
