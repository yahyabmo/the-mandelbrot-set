/**
 * Finding minibrots at any depth, for the endless dive.
 *
 * 1. The period: follow the orbits of the four corners of a box. The first step at which
 *    the quadrilateral they make surrounds 0 is the period of a nucleus inside the box.
 *    The corners are followed by perturbation around a reference orbit, in doubles.
 * 2. The nucleus: Newton's method on z_p(c) = 0, in fixed point with as many bits as the
 *    depth needs, from the centre of the box.
 * 3. The size: the estimate of atlas.ts, with the products that overflow a double kept
 *    as a mantissa and an exponent.
 */
import { FRAC, type Fixed } from "./fixed";
import type { Orbit } from "./mandelbrot";

/** True when the polygon with these vertices surrounds the origin. */
export function surroundsZero(xs: number[], ys: number[]): boolean {
  let inside = false;
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    const yi = ys[i];
    const yj = ys[j];
    if (yi > 0 !== yj > 0) {
      // Where the edge crosses the real axis.
      const x = xs[i] + ((xs[j] - xs[i]) * (0 - yi)) / (yj - yi);
      if (x > 0) inside = !inside;
    }
  }
  return inside;
}

/**
 * Period of the box whose corners sit at offsets `corners` from the reference: the first
 * step at which their orbits surround 0, or 0 if none does before one escapes or maxIter.
 */
export function boxPeriod(orbit: Orbit, corners: [number, number][], maxIter: number): number {
  const Z = orbit.data;
  const n = corners.length;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const m = new Int32Array(n);
  const xs = new Array<number>(n);
  const ys = new Array<number>(n);
  for (let i = 1; i <= maxIter; i++) {
    for (let k = 0; k < n; k++) {
      const zx = Z[2 * m[k]];
      const zy = Z[2 * m[k] + 1];
      const a = dx[k];
      const b = dy[k];
      dx[k] = 2 * (zx * a - zy * b) + (a * a - b * b) + corners[k][0];
      dy[k] = 2 * (zx * b + zy * a) + 2 * a * b + corners[k][1];
      m[k]++;
      const x = Z[2 * m[k]] + dx[k];
      const y = Z[2 * m[k] + 1] + dy[k];
      const r2 = x * x + y * y;
      if (r2 > 1e4) return 0;
      if (r2 <= dx[k] * dx[k] + dy[k] * dy[k] || m[k] >= orbit.length) {
        dx[k] = x;
        dy[k] = y;
        m[k] = 0;
      }
      xs[k] = x;
      ys[k] = y;
    }
    if (surroundsZero(xs, ys)) return i;
  }
  return 0;
}

/**
 * The nucleus of period p nearest to c, by Newton's method in fixed point with `bits`
 * bits after the point; null when Newton does not settle within `steps`.
 */
export function nucleusFixed(cx: Fixed, cy: Fixed, period: number, bits: number, steps = 40): [Fixed, Fixed] | null {
  const B = BigInt(bits);
  const drop = BigInt(FRAC - bits);
  const one = 1n << B;
  let x = cx >> drop;
  let y = cy >> drop;
  const tolerance = 1n << 12n;
  // An orbit that leaves the disc of radius 4 doubles its bits at every step: stop it there.
  const far = 4n << B;
  for (let k = 0; k < steps; k++) {
    let zr = 0n;
    let zi = 0n;
    let dr = 0n;
    let di = 0n;
    for (let i = 0; i < period; i++) {
      // dz <- 2 z dz + 1, z <- z^2 + c
      const ndr = ((zr * dr - zi * di) >> (B - 1n)) + one;
      di = (zr * di + zi * dr) >> (B - 1n);
      dr = ndr;
      const nzr = ((zr * zr - zi * zi) >> B) + x;
      zi = ((zr * zi) >> (B - 1n)) + y;
      zr = nzr;
      if (zr > far || zr < -far || zi > far || zi < -far) return null;
    }
    const den = dr * dr + di * di;
    if (den === 0n) return null;
    // c <- c - z / dz
    const sr = ((zr * dr + zi * di) << B) / den;
    const si = ((zi * dr - zr * di) << B) / den;
    x -= sr;
    y -= si;
    const a = sr < 0n ? -sr : sr;
    const b = si < 0n ? -si : si;
    if (a + b <= tolerance) return [x << drop, y << drop];
    if (a + b > 8n * one) return null;
  }
  return null;
}

/** A complex number as m 2^e, for products that leave the range of a double. */
interface Big {
  re: number;
  im: number;
  e: number;
}

function normal(v: Big): Big {
  const a = Math.max(Math.abs(v.re), Math.abs(v.im));
  if (a === 0 || !Number.isFinite(a)) return v;
  const k = Math.floor(Math.log2(a));
  const s = 2 ** -k;
  return { re: v.re * s, im: v.im * s, e: v.e + k };
}

/**
 * Size of the component of period p with nucleus c, as log2 of its modulus and its angle:
 * the same estimate as componentSize in atlas.ts, 1 / (b l^2), valid at any depth.
 */
export function sizeFixed(cx: Fixed, cy: Fixed, period: number, bits: number): { log2: number; angle: number } {
  const B = BigInt(bits);
  const drop = BigInt(FRAC - bits);
  const x = cx >> drop;
  const y = cy >> drop;
  const unit = 2 ** -Math.min(bits, 1020);
  const shift = BigInt(Math.max(0, bits - 1020));
  let zr = 0n;
  let zi = 0n;
  let l: Big = { re: 1, im: 0, e: 0 };
  let br = 1;
  let bi = 0;
  const far = 4n << B;
  for (let i = 1; i < period; i++) {
    const nzr = ((zr * zr - zi * zi) >> B) + x;
    zi = ((zr * zi) >> (B - 1n)) + y;
    zr = nzr;
    if (zr > far || zr < -far || zi > far || zi < -far) return { log2: NaN, angle: NaN };
    const fr = Number(zr >> shift) * unit;
    const fi = Number(zi >> shift) * unit;
    // l <- 2 z l
    l = normal({ re: 2 * (fr * l.re - fi * l.im), im: 2 * (fr * l.im + fi * l.re), e: l.e });
    // b <- b + 1 / l
    const m2 = l.re * l.re + l.im * l.im;
    if (m2 > 0 && l.e < 1000) {
      const s = 2 ** -l.e;
      br += (l.re / m2) * s;
      bi -= (l.im / m2) * s;
    }
  }
  // size = 1 / (b l^2)
  const log2 = -(Math.log2(Math.hypot(br, bi)) + 2 * (l.e + Math.log2(Math.hypot(l.re, l.im))));
  const angle = -(Math.atan2(bi, br) + 2 * Math.atan2(l.im, l.re));
  return { log2, angle };
}
