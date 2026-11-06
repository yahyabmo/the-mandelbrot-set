/**
 * The perturbation path of the shader, line for line, so that the tests can check it
 * against exact iteration. Arithmetic is float32, rounded after every operation, with
 * values below the normal range flushed to zero as GPUs do.
 *
 * Below a pixel size of 2^-100 the offset dz from the reference no longer fits a float32,
 * whose smallest normal value is 2^-126. It is then kept as w * 2^e: a float mantissa
 * and an integer exponent, renormalised at every step. The three terms of the step,
 * 2 Z dz, dz^2 and dc, are brought to the exponent of the largest before they are added,
 * so that none is lost to underflow while it still matters, even where Z is 0. Once dz
 * has grown past 2^-100 it is a plain float again and the usual loop takes over.
 *
 * In both loops, a bilinear approximation (see bla.ts) skips 2^l steps at once wherever
 * one holds.
 */
import type { BlaTable } from "./bla";
import { BAILOUT, smooth } from "./mandelbrot";

/** Pixel size below which the offsets carry their own exponent. */
export const SCALED_BELOW = 2 ** -100;
/** An offset above 2^LEAVE fits a plain float again. */
const LEAVE = -100;
/** Below this the reference is close enough to 0 for z to come closer still: check for a rebase. */
const SMALL_Z = 2 ** -60;
const NONE = -100000;
const BAILOUT2 = BAILOUT * BAILOUT;
const NORMAL = 2 ** -126;

/** Rounding to float32, flushing what falls below the normal range. */
export function f(x: number): number {
  const y = Math.fround(x);
  return y > -NORMAL && y < NORMAL ? 0 : y;
}

const bits = new DataView(new ArrayBuffer(4));

/** Exponent of a float32 read from its bits, as the shader does: -127 for 0. */
export function expo(x: number): number {
  bits.setFloat32(0, x);
  return ((bits.getInt32(0) >> 23) & 255) - 127;
}

/** 2^k as a float32: 0 below the normal range, capped at 2^127. */
export function p2(k: number): number {
  return k < -126 ? 0 : 2 ** Math.min(k, 127);
}

/** v * 2^k in two steps, for k beyond the range of one power of two. */
function scale(v: number, k: number): number {
  const h = Math.trunc(k / 2);
  return f(f(v * p2(h)) * p2(k - h));
}

const maxAbs = (x: number, y: number) => Math.max(Math.abs(x), Math.abs(y));
/** log2 |dz| from above, without the undefined log2(0) of GLSL. */
const logOf = (a: number) => (a > 0 ? Math.log2(a) + 0.5 : -1e30);

/** The pixel size as a float mantissa in [1, 2) and an integer exponent. */
export function splitPixel(pixel: number): [number, number] {
  let e = Math.floor(Math.log2(pixel));
  let m = pixel / 2 ** e;
  if (m >= 2) {
    m /= 2;
    e++;
  } else if (m < 1) {
    m *= 2;
    e--;
  }
  return [Math.fround(m), e];
}

/** The offset from the reference that the GPU iterates for a pixel, exactly, as a double. */
export function offsetOf(dpx: number, pixel: number): number {
  if (pixel < SCALED_BELOW) {
    const [pm, pe] = splitPixel(pixel);
    return f(f(dpx) * pm) * 2 ** pe;
  }
  return f(f(dpx) * f(pixel));
}

/** Highest level l >= 1 whose approximation holds from step m for |dz| = 2^logDz, else 0. */
export function blaLevel(t: BlaTable | null, len: number, m: number, logDz: number): number {
  if (!t || m < 1 || logDz >= t.maxLogR) return 0;
  let best = 0;
  for (let l = 0; l < t.levels; l++) {
    const span = 1 << l;
    if (((m - 1) & (span - 1)) !== 0 || m + span > len) break;
    if (logDz >= t.er[4 * (t.offsets[l] + ((m - 1) >> l)) + 2]) break;
    best = l;
  }
  return best;
}

export interface Counts {
  /** Continuous iteration count, or -1 inside the set. */
  value: number;
  /** Steps actually computed, against the iterations they stand for. */
  steps: number;
}

/**
 * The shader's perturbation for the pixel at (dpx, dpy) pixels from the reference.
 * `orbit` holds Z_0..Z_len as float32 pairs, as the orbit texture does.
 */
export function iterateGpu(
  orbit: Float32Array,
  len: number,
  dpx: number,
  dpy: number,
  pixel: number,
  maxIter: number,
  bla: BlaTable | null = null,
): Counts {
  let steps = 0;
  const done = (value: number) => ({ value, steps });
  let dx = 0;
  let dy = 0;
  let cx: number;
  let cy: number;
  let m = 0;
  let i = 0;
  if (pixel < SCALED_BELOW) {
    const [pm, pe] = splitPixel(pixel);
    // dc = dcm * 2^ec
    const dcx = f(f(dpx) * pm);
    const dcy = f(f(dpy) * pm);
    const ec = pe;
    const eC = ec + expo(maxAbs(dcx, dcy));
    // dz = w * 2^e, with |w| in [1, 2): the first step gives dz = dc.
    let wx = dcx;
    let wy = dcy;
    let e = ec;
    const normalise = () => {
      const wa = maxAbs(wx, wy);
      if (wa > 0) {
        const k = expo(wa);
        wx = f(wx * p2(-k));
        wy = f(wy * p2(-k));
        e += k;
      }
    };
    normalise();
    m = 1;
    i = 1;
    let plain = false;
    for (; i < maxIter; i++) {
      steps++;
      const l = blaLevel(bla, len, m, e + logOf(maxAbs(wx, wy)));
      if (l > 0) {
        const k = 4 * (bla!.offsets[l] + ((m - 1) >> l));
        const [amx, amy, bmx, bmy] = [bla!.ab[k], bla!.ab[k + 1], bla!.ab[k + 2], bla!.ab[k + 3]];
        const ae = bla!.er[k];
        const be = bla!.er[k + 1];
        // A w 2^(ae+e) + B dcm 2^(be+ec), brought to the larger exponent
        const awx = f(f(amx * wx) - f(amy * wy));
        const awy = f(f(amx * wy) + f(amy * wx));
        const bdx = f(f(bmx * dcx) - f(bmy * dcy));
        const bdy = f(f(bmx * dcy) + f(bmy * dcx));
        const awa = maxAbs(awx, awy);
        const bda = maxAbs(bdx, bdy);
        const E = Math.max(awa > 0 ? ae + e + expo(awa) : NONE, bda > 0 ? be + ec + expo(bda) : NONE);
        wx = f(f(awx * p2(ae + e - E)) + f(bdx * p2(be + ec - E)));
        wy = f(f(awy * p2(ae + e - E)) + f(bdy * p2(be + ec - E)));
        e = E;
        normalise();
        m += 1 << l;
        i += (1 << l) - 1;
      } else {
        const zx = orbit[2 * m];
        const zy = orbit[2 * m + 1];
        const za = maxAbs(zx, zy);
        const E = Math.max(za > 0 ? e + 1 + expo(za) : NONE, 2 * e, eC);
        // w <- 2 Z w 2^(e-E) + w^2 2^(2e-E) + dcm 2^(ec-E), then e = E
        const a = p2(e - E);
        const b = p2(2 * e - E);
        const c = p2(ec - E);
        const tx = f(f(2 * f(f(zx * wx) - f(zy * wy))) * a);
        const ty = f(f(2 * f(f(zx * wy) + f(zy * wx))) * a);
        const sx = f(f(f(wx * wx) - f(wy * wy)) * b);
        const sy = f(f(f(wx * wy) + f(wy * wx)) * b);
        wx = f(f(tx + sx) + f(dcx * c));
        wy = f(f(ty + sy) + f(dcy * c));
        e = E;
        normalise();
        m++;
      }
      if (e > LEAVE || m >= len) {
        dx = f(wx * p2(e));
        dy = f(wy * p2(e));
        plain = true;
        break;
      }
      const Zx = orbit[2 * m];
      const Zy = orbit[2 * m + 1];
      const Za = maxAbs(Zx, Zy);
      if (Za === 0) {
        // Z is 0, so z = dz: rebasing changes nothing but brings the skips back in step.
        m = 0;
      } else if (Za < SMALL_Z) {
        // z = Z + dz with both small: rebase when z comes no further from 0 than dz.
        const ez = Math.max(expo(Za), e);
        const zmx = f(f(Zx * p2(-ez)) + f(wx * p2(e - ez)));
        const zmy = f(f(Zy * p2(-ez)) + f(wy * p2(e - ez)));
        if (f(f(zmx * zmx) + f(zmy * zmy)) <= f(f(f(wx * wx) + f(wy * wy)) * p2(2 * (e - ez)))) {
          wx = zmx;
          wy = zmy;
          e = ez;
          normalise();
          m = 0;
        }
      }
    }
    if (!plain) return done(-1);
    cx = f(dcx * p2(ec));
    cy = f(dcy * p2(ec));
    // Finish the step the deep loop left at, as the plain loop would.
    const x = f(orbit[2 * m] + dx);
    const y = f(orbit[2 * m + 1] + dy);
    const r2 = f(f(x * x) + f(y * y));
    if (r2 > BAILOUT2) return done(smooth(i, r2));
    if (r2 <= f(f(dx * dx) + f(dy * dy)) || m >= len) {
      dx = x;
      dy = y;
      m = 0;
    }
    i++;
  } else {
    cx = f(f(dpx) * f(pixel));
    cy = f(f(dpy) * f(pixel));
  }

  // dz <- 2 Z dz + dz^2 + dc, z = Z + dz, with rebasing.
  for (; i < maxIter; i++) {
    steps++;
    const l = blaLevel(bla, len, m, logOf(maxAbs(dx, dy)));
    if (l > 0) {
      const k = 4 * (bla!.offsets[l] + ((m - 1) >> l));
      const [amx, amy, bmx, bmy] = [bla!.ab[k], bla!.ab[k + 1], bla!.ab[k + 2], bla!.ab[k + 3]];
      const ae = bla!.er[k];
      const be = bla!.er[k + 1];
      const nx = f(scale(f(f(amx * dx) - f(amy * dy)), ae) + scale(f(f(bmx * cx) - f(bmy * cy)), be));
      const ny = f(scale(f(f(amx * dy) + f(amy * dx)), ae) + scale(f(f(bmx * cy) + f(bmy * cx)), be));
      dx = nx;
      dy = ny;
      m += 1 << l;
      i += (1 << l) - 1;
    } else {
      const zx = orbit[2 * m];
      const zy = orbit[2 * m + 1];
      const nx = f(f(f(2 * f(f(zx * dx) - f(zy * dy))) + f(f(dx * dx) - f(dy * dy))) + cx);
      const ny = f(f(f(2 * f(f(zx * dy) + f(zy * dx))) + f(2 * f(dx * dy))) + cy);
      dx = nx;
      dy = ny;
      m++;
    }
    const x = f(orbit[2 * m] + dx);
    const y = f(orbit[2 * m + 1] + dy);
    const r2 = f(f(x * x) + f(y * y));
    if (r2 > BAILOUT2) return done(smooth(i, r2));
    if (r2 <= f(f(dx * dx) + f(dy * dy)) || m >= len) {
      dx = x;
      dy = y;
      m = 0;
    }
  }
  return done(-1);
}
