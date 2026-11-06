/**
 * The mathematics of the atlas: what the explorer says about a point and draws over the
 * image. Everything here is in doubles, which is enough at the depths where the atlas
 * speaks: from the whole set down to a magnification of about 10⁹.
 */

export type Complex = [number, number];

/** The orbit 0, c, c² + c, … of a point, up to `n` points or until it leaves the disc of radius `escape`. */
export interface OrbitPoints {
  /** z_0..z_count as (re, im) pairs. */
  points: Float64Array;
  count: number;
  escaped: boolean;
}

export function orbitOf(cr: number, ci: number, n: number, escape = 1e3): OrbitPoints {
  const points = new Float64Array(2 * (n + 1));
  let x = 0;
  let y = 0;
  let k = 0;
  const e2 = escape * escape;
  while (k < n) {
    const nx = x * x - y * y + cr;
    y = 2 * x * y + ci;
    x = nx;
    k++;
    points[2 * k] = x;
    points[2 * k + 1] = y;
    if (x * x + y * y > e2) return { points: points.subarray(0, 2 * (k + 1)), count: k, escaped: true };
  }
  return { points, count: k, escaped: false };
}

/** Steps before |z| exceeds 2, or -1 if it never does within maxIter. */
export function escapeSteps(cr: number, ci: number, maxIter: number): number {
  let x = 0;
  let y = 0;
  for (let n = 1; n <= maxIter; n++) {
    const nx = x * x - y * y + cr;
    y = 2 * x * y + ci;
    x = nx;
    if (x * x + y * y > 4) return n;
  }
  return -1;
}

/**
 * Period of the atom domain of an escaping c: the step at which |z| came closest to 0
 * before it escaped, the period of the component the point lies nearest to, in the sense
 * of its orbit.
 */
export function atomPeriod(cr: number, ci: number, maxIter: number): number {
  let x = 0;
  let y = 0;
  let best = Infinity;
  let period = 1;
  for (let n = 1; n <= maxIter; n++) {
    const nx = x * x - y * y + cr;
    y = 2 * x * y + ci;
    x = nx;
    const r2 = x * x + y * y;
    if (r2 > 4) break;
    if (r2 < best) {
      best = r2;
      period = n;
    }
  }
  return period;
}

/**
 * Period of the attracting cycle of a point inside the set: after `settle` steps the
 * orbit has nearly reached its cycle, and comes back to within `tol` of itself after
 * exactly one period. 0 when no cycle shows within `maxPeriod` steps, as near the
 * boundary where the orbit settles too slowly.
 */
export function cyclePeriod(cr: number, ci: number, settle = 20000, maxPeriod = 4096, tol = 1e-10): number {
  let x = 0;
  let y = 0;
  for (let n = 0; n < settle; n++) {
    const nx = x * x - y * y + cr;
    y = 2 * x * y + ci;
    x = nx;
    if (x * x + y * y > 4) return 0;
  }
  const [sx, sy] = [x, y];
  for (let p = 1; p <= maxPeriod; p++) {
    const nx = x * x - y * y + cr;
    y = 2 * x * y + ci;
    x = nx;
    if (Math.hypot(x - sx, y - sy) < tol) return p;
  }
  return 0;
}

/**
 * The nucleus of the component of period p near c: the point whose orbit comes back to 0
 * after p steps, by Newton's method on z_p(c) = 0. Null when Newton does not settle, or
 * settles on a nucleus of a smaller period.
 */
export function nucleus(cr: number, ci: number, period: number, steps = 60): Complex | null {
  let x = cr;
  let y = ci;
  for (let k = 0; k < steps; k++) {
    let zr = 0;
    let zi = 0;
    let dr = 0;
    let di = 0;
    for (let i = 0; i < period; i++) {
      // dz <- 2 z dz + 1, z <- z^2 + c
      const ndr = 2 * (zr * dr - zi * di) + 1;
      di = 2 * (zr * di + zi * dr);
      dr = ndr;
      const nzr = zr * zr - zi * zi + x;
      zi = 2 * zr * zi + y;
      zr = nzr;
    }
    const d2 = dr * dr + di * di;
    if (!(d2 > 0) || !Number.isFinite(d2)) return null;
    // c <- c - z / dz
    const sr = (zr * dr + zi * di) / d2;
    const si = (zi * dr - zr * di) / d2;
    x -= sr;
    y -= si;
    if (!Number.isFinite(x + y) || Math.hypot(x, y) > 4) return null;
    if (Math.hypot(sr, si) < 1e-15 * Math.max(1, Math.hypot(x, y))) break;
  }
  // The orbit must return to 0 at step p, and not before.
  let zr = 0;
  let zi = 0;
  let smallest = Infinity;
  for (let i = 1; i <= period; i++) {
    const nzr = zr * zr - zi * zi + x;
    zi = 2 * zr * zi + y;
    zr = nzr;
    const a = Math.hypot(zr, zi);
    if (i < period) smallest = Math.min(smallest, a);
    else if (a > 1e-9) return null;
  }
  if (period > 1 && smallest < 1e-6) return null;
  return [x, y];
}

/**
 * Size and orientation of the component of period p with nucleus c0, as one complex
 * number: about 1 for the main cardioid, 0.5 for the disc of period 2. Its modulus
 * scales the component, its argument turns it.
 */
export function componentSize(c0: Complex, period: number): Complex {
  const [cr, ci] = c0;
  let zr = 0;
  let zi = 0;
  let lr = 1;
  let li = 0;
  let br = 1;
  let bi = 0;
  for (let i = 1; i < period; i++) {
    const nzr = zr * zr - zi * zi + cr;
    zi = 2 * zr * zi + ci;
    zr = nzr;
    // l <- 2 z l, b <- b + 1 / l
    const nlr = 2 * (zr * lr - zi * li);
    li = 2 * (zr * li + zi * lr);
    lr = nlr;
    const l2 = lr * lr + li * li;
    br += lr / l2;
    bi -= li / l2;
  }
  // size = 1 / (b l^2)
  const qr = lr * lr - li * li;
  const qi = 2 * lr * li;
  const dr = br * qr - bi * qi;
  const di = br * qi + bi * qr;
  const d2 = dr * dr + di * di;
  return [dr / d2, -di / d2];
}

/** What the atlas knows about a point. */
export interface Reading {
  /** Steps before escape, or -1 inside the set (within the limit). */
  escape: number;
  period: number;
  nucleus: Complex | null;
  size: Complex | null;
}

export function readPoint(cr: number, ci: number, maxIter: number): Reading {
  const escape = escapeSteps(cr, ci, maxIter);
  const period = (escape < 0 && cyclePeriod(cr, ci)) || atomPeriod(cr, ci, maxIter);
  const n = period <= 4096 ? nucleus(cr, ci, period) : null;
  return { escape, period, nucleus: n, size: n ? componentSize(n, period) : null };
}

// ---------------------------------------------------------------------------
// External rays
// ---------------------------------------------------------------------------

/** An angle as a fraction of a turn, num / den, kept exact through doubling. */
export interface Angle {
  num: number;
  den: number;
}

/** 2^n num / den, modulo 1, as a fraction of the same denominator. */
function doubled(a: Angle, n: number): number {
  let k = a.num % a.den;
  for (let i = 0; i < n; i++) k = (2 * k) % a.den;
  return k / a.den;
}

/**
 * Points of the external ray of angle a, from far away down towards where it lands.
 * Far from the set z_n(c) is close to Φ(c)^(2^(n-1)), where Φ is the conformal map of
 * the outside of the set to the outside of the disc; the ray is where Φ(c) = r e^(2πi a).
 * The points at r = R^(1/2^m), for m = 1/S, 2/S, …, come by Newton's method on
 * z_n(c) = R^(2^(n-1-m)) e^(2πi 2^(n-1) a), each from the one before.
 * The ray stops once its steps fall under `until`, or after `depth` doublings.
 */
export function externalRay(a: Angle, until = 1e-4, depth = 40, sharpness = 8, R = 256): Complex[] {
  const theta = (2 * Math.PI * a.num) / a.den;
  let x = R * Math.cos(theta);
  let y = R * Math.sin(theta);
  const points: Complex[] = [[x, y]];
  for (let k = 1; k <= depth * sharpness; k++) {
    const m = k / sharpness;
    const n = Math.ceil(m) + 1;
    const radius = R ** (2 ** (n - 1 - m));
    const phase = 2 * Math.PI * doubled(a, n - 1);
    const tr = radius * Math.cos(phase);
    const ti = radius * Math.sin(phase);
    let ok = false;
    for (let it = 0; it < 24; it++) {
      let zr = 0;
      let zi = 0;
      let dr = 0;
      let di = 0;
      for (let i = 0; i < n; i++) {
        const ndr = 2 * (zr * dr - zi * di) + 1;
        di = 2 * (zr * di + zi * dr);
        dr = ndr;
        const nzr = zr * zr - zi * zi + x;
        zi = 2 * zr * zi + y;
        zr = nzr;
      }
      const er = zr - tr;
      const ei = zi - ti;
      const d2 = dr * dr + di * di;
      if (!(d2 > 0) || !Number.isFinite(d2 + er + ei)) break;
      const sr = (er * dr + ei * di) / d2;
      const si = (ei * dr - er * di) / d2;
      x -= sr;
      y -= si;
      if (Math.hypot(sr, si) < 1e-14 * Math.max(1, Math.hypot(x, y))) {
        ok = true;
        break;
      }
    }
    if (!ok || !Number.isFinite(x + y)) break;
    const [px, py] = points[points.length - 1];
    points.push([x, y]);
    if (k > sharpness && Math.hypot(x - px, y - py) < until) break;
  }
  return points;
}

// ---------------------------------------------------------------------------
// Lavaurs' diagram
// ---------------------------------------------------------------------------

/** Smallest n >= 1 with 2^n k = k modulo den: the period of the angle k / den under doubling. */
export function anglePeriod(k: number, den: number): number {
  let x = (2 * k) % den;
  let n = 1;
  while (x !== k % den && n < 64) {
    x = (2 * x) % den;
    n++;
  }
  return n;
}

/** A chord of Lavaurs' diagram: the two rays that land at the root of one component. */
export interface Chord {
  a: Angle;
  b: Angle;
  period: number;
}

const value = (a: Angle) => a.num / a.den;

function crosses(c: Chord, d: Chord): boolean {
  const [x1, y1] = [value(c.a), value(c.b)];
  const [x2, y2] = [value(d.a), value(d.b)];
  return (x1 < x2 && x2 < y1 && y1 < y2) || (x2 < x1 && x1 < y2 && y2 < y1);
}

/**
 * Lavaurs' algorithm: period by period, join each smallest free angle of exact period p,
 * of the form k / (2^p - 1), to the next free one that its chord reaches without crossing
 * those already drawn. Each chord pairs the two rays landing at the root of a component
 * of period p.
 */
export function lavaurs(maxPeriod: number): Chord[] {
  const chords: Chord[] = [];
  for (let p = 2; p <= maxPeriod; p++) {
    const den = 2 ** p - 1;
    const free: Angle[] = [];
    for (let k = 1; k < den; k++) if (anglePeriod(k, den) === p) free.push({ num: k, den });
    while (free.length > 1) {
      const a = free.shift()!;
      const j = free.findIndex((b) => !chords.some((c) => crosses(c, { a, b, period: p })));
      if (j < 0) break;
      const [b] = free.splice(j, 1);
      chords.push({ a, b, period: p });
    }
  }
  return chords;
}

/** "1/7" for an angle, in lowest terms. */
export function angleText(a: Angle): string {
  let x = a.num;
  let y = a.den;
  while (y) [x, y] = [y, x % y];
  return `${a.num / x}/${a.den / x}`;
}
