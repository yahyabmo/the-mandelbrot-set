/**
 * Perturbation below the range of a float32, line for line as in the shader, so that the
 * tests can check it against exact iteration.
 *
 * Below a pixel size of 2^-100 the offset dz from the reference no longer fits a float32,
 * whose smallest normal value is 2^-126. It is then kept as w * 2^e: a float mantissa
 * and an integer exponent, renormalised at every step. The three terms of the step,
 * 2 Z dz, dz^2 and dc, are brought to the exponent of the largest before they are added,
 * so that none is lost to underflow while it still matters, even where Z is 0. Once dz
 * has grown past 2^-100 it is a plain float again and the usual loop takes over.
 *
 * Arithmetic here is float32, rounded after every operation, with values below the
 * normal range flushed to zero as GPUs do.
 */
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

const maxAbs = (x: number, y: number) => Math.max(Math.abs(x), Math.abs(y));

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

/**
 * Continuous iteration count of the pixel at (dpx, dpy) pixels from the reference, or -1
 * inside the set. `orbit` holds Z_0..Z_len as float32 pairs, as the orbit texture does;
 * the pixel size is pm * 2^pe.
 */
export function iterateScaled(orbit: Float32Array, len: number, dpx: number, dpy: number, pm: number, pe: number, maxIter: number): number {
  // dc = dcm * 2^ec
  const dcx = f(dpx * pm);
  const dcy = f(dpy * pm);
  const ec = pe;
  const eC = ec + expo(maxAbs(dcx, dcy));
  // dz = w * 2^e, with |w| in [1, 2): the first step gives dz = dc.
  let wx = dcx;
  let wy = dcy;
  let e = ec;
  let wa = maxAbs(wx, wy);
  if (wa > 0) {
    const k = expo(wa);
    wx = f(wx * p2(-k));
    wy = f(wy * p2(-k));
    e += k;
  }
  let m = 1;
  let i = 1;
  let dx = 0;
  let dy = 0;
  let plain = false;
  for (; i < maxIter; i++) {
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
    wa = maxAbs(wx, wy);
    if (wa > 0) {
      const k = expo(wa);
      wx = f(wx * p2(-k));
      wy = f(wy * p2(-k));
      e += k;
    }
    m++;
    if (e > LEAVE || m === len) {
      dx = f(wx * p2(e));
      dy = f(wy * p2(e));
      plain = true;
      break;
    }
    const Zx = orbit[2 * m];
    const Zy = orbit[2 * m + 1];
    const Za = maxAbs(Zx, Zy);
    if (Za > 0 && Za < SMALL_Z) {
      // z = Z + dz with both small: rebase when z comes closer to 0 than dz.
      const ez = Math.max(expo(Za), e);
      const zmx = f(f(Zx * p2(-ez)) + f(wx * p2(e - ez)));
      const zmy = f(f(Zy * p2(-ez)) + f(wy * p2(e - ez)));
      if (f(f(zmx * zmx) + f(zmy * zmy)) < f(f(f(wx * wx) + f(wy * wy)) * p2(2 * (e - ez)))) {
        wx = zmx;
        wy = zmy;
        e = ez;
        wa = maxAbs(wx, wy);
        if (wa > 0) {
          const k = expo(wa);
          wx = f(wx * p2(-k));
          wy = f(wy * p2(-k));
          e += k;
        }
        m = 0;
      }
    }
  }
  if (!plain) return -1;

  // A plain float from here on: dz <- 2 Z dz + dz^2 + dc, z = Z + dz, with rebasing.
  const cx = f(dcx * p2(ec));
  const cy = f(dcy * p2(ec));
  // Finish the step the deep loop left at, as the plain loop would.
  for (let first = true; i < maxIter; i++, first = false) {
    if (!first) {
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
    if (r2 > BAILOUT2) return smooth(i, r2);
    if (r2 < f(f(dx * dx) + f(dy * dy)) || m === len) {
      dx = x;
      dy = y;
      m = 0;
    }
  }
  return -1;
}
