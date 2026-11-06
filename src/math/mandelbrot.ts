import { toBits, type Fixed } from "./fixed";

/**
 * The iteration z -> z^2 + c, on the CPU in double precision.
 *
 * The GPU shaders follow these functions line for line; the tests use them as the
 * reference that the perturbation method must agree with.
 */

/** Escape radius: a large one makes the smooth colouring exact to the eye. */
export const BAILOUT = 256;
const BAILOUT2 = BAILOUT * BAILOUT;
/** The reference orbit stops at |Z| > 2, where every orbit is known to escape. */
const REFERENCE_ESCAPE2 = 4;

/** Continuous iteration count of an escaped orbit, or -1 for a point that never escaped. */
export function smooth(iteration: number, r2: number): number {
  return iteration - Math.log2(Math.log2(r2)) + 4;
}

/** Plain iteration of one point. */
export function iterateDirect(cre: number, cim: number, maxIter: number): number {
  let x = 0;
  let y = 0;
  for (let i = 0; i < maxIter; i++) {
    const nx = x * x - y * y + cre;
    y = 2 * x * y + cim;
    x = nx;
    const r2 = x * x + y * y;
    if (r2 > BAILOUT2) return smooth(i, r2);
  }
  return -1;
}

/**
 * Orbit Z_0 = 0, Z_1, ... of the reference point c0, until it escapes or reaches maxIter.
 * Stored as (re, im) pairs; `length` is the index of the last point.
 */
export interface Orbit {
  data: Float64Array;
  length: number;
}

export function referenceOrbit(cre: number, cim: number, maxIter: number): Orbit {
  const data = new Float64Array(2 * (maxIter + 1));
  let x = 0;
  let y = 0;
  let n = 0;
  while (n < maxIter) {
    const nx = x * x - y * y + cre;
    y = 2 * x * y + cim;
    x = nx;
    n++;
    data[2 * n] = x;
    data[2 * n + 1] = y;
    if (x * x + y * y > REFERENCE_ESCAPE2) break;
  }
  return { data: data.subarray(0, 2 * (n + 1)), length: n };
}

/** Bits after the point that a reference needs for pixels of this size, with a wide margin. */
export function bitsFor(pixel: number): number {
  return Math.max(64, Math.ceil(-Math.log2(pixel)) + 40);
}

/**
 * The reference orbit of a centre given beyond double precision: Z is computed in fixed
 * point with `bits` bits after the point, then each Z is rounded to a double, since the
 * perturbation only needs it to float precision. Same layout as referenceOrbit.
 */
export function preciseOrbit(cx: Fixed, cy: Fixed, bits: number, maxIter: number): Orbit {
  const B = BigInt(bits);
  const B1 = BigInt(bits - 1);
  const cr = toBits(cx, bits);
  const ci = toBits(cy, bits);
  // |Z| stays below 2^3 here, so Number() never overflows below 1020 bits.
  const drop = BigInt(Math.max(0, bits - 1020));
  const unit = 2 ** -Math.min(bits, 1020);
  const data = new Float64Array(2 * (maxIter + 1));
  let x = 0n;
  let y = 0n;
  let n = 0;
  while (n < maxIter) {
    const xx = (x * x) >> B;
    const yy = (y * y) >> B;
    y = ((x * y) >> B1) + ci;
    x = xx - yy + cr;
    n++;
    const zx = Number(x >> drop) * unit;
    const zy = Number(y >> drop) * unit;
    data[2 * n] = zx;
    data[2 * n + 1] = zy;
    if (zx * zx + zy * zy > REFERENCE_ESCAPE2) break;
  }
  return { data: data.subarray(0, 2 * (n + 1)), length: n };
}

/**
 * Iterate c0 + dc through its offset from the reference orbit:
 * dz <- 2 Z dz + dz^2 + dc, then z = Z + dz.
 *
 * Rebasing: when z comes closer to 0 than dz, or the reference has run out, restart
 * against the beginning of the same orbit with dz = z. One reference then serves the
 * whole image without the glitches of the plain method.
 */
export function iteratePerturbed(orbit: Orbit, dcre: number, dcim: number, maxIter: number): number {
  const Z = orbit.data;
  let dx = 0;
  let dy = 0;
  let m = 0;
  for (let i = 0; i < maxIter; i++) {
    const zx = Z[2 * m];
    const zy = Z[2 * m + 1];
    // dz <- 2 Z dz + dz^2 + dc
    const nx = 2 * (zx * dx - zy * dy) + (dx * dx - dy * dy) + dcre;
    dy = 2 * (zx * dy + zy * dx) + 2 * dx * dy + dcim;
    dx = nx;
    m++;
    const x = Z[2 * m] + dx;
    const y = Z[2 * m + 1] + dy;
    const r2 = x * x + y * y;
    if (r2 > BAILOUT2) return smooth(i, r2);
    if (r2 <= dx * dx + dy * dy || m === orbit.length) {
      dx = x;
      dy = y;
      m = 0;
    }
  }
  return -1;
}
