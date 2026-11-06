import { describe, expect, it } from "vitest";
import { iterateScaled, p2, splitPixel, expo, f } from "../src/math/deep";
import { FRAC, fromDecimal, fromNumber, type Fixed } from "../src/math/fixed";
import { bitsFor, iteratePerturbed, preciseOrbit } from "../src/math/mandelbrot";
import { iterateExactAt } from "./exact";

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** Nucleus of a real hyperbolic component, by Newton's method in fixed point. */
function realNucleus(guess: number, period: number, bits: number): Fixed {
  const B = BigInt(bits);
  let c = BigInt(Math.round(guess * 2 ** 52)) << (B - 52n);
  for (let k = 0; k < 14; k++) {
    let z = 0n;
    let dz = 0n;
    for (let j = 0; j < period; j++) {
      dz = ((2n * z * dz) >> B) + (1n << B);
      z = ((z * z) >> B) + c;
    }
    c -= (z << B) / dz;
  }
  return c << BigInt(FRAC - bits);
}

const W = 1440;
const close = (a: number, exact: number) => (a < 0 && exact < 0) || (a >= 0 && exact >= 0 && Math.abs(a - exact) < 0.05);

/**
 * Compare the float32 deep method with exact iteration on random pixels of a view, and
 * with the same perturbation in doubles, which has no range problem down there.
 */
function agreement(cx: Fixed, cy: Fixed, width: number, maxIter: number, n = 48) {
  const pixel = width / W;
  const orbit = preciseOrbit(cx, cy, bitsFor(pixel), maxIter);
  const z32 = Float32Array.from(orbit.data);
  const [pm, pe] = splitPixel(pixel);
  const exactBits = Math.min(FRAC, bitsFor(pixel) + 24);
  const next = random(5);
  let deep = 0;
  let double = 0;
  const values: number[] = [];
  for (let k = 0; k < n; k++) {
    const dpx = (next() - 0.5) * W;
    const dpy = (next() - 0.5) * W * 0.6;
    // The very offset the float32 method uses, so that all three iterate the same c.
    const dx = f(dpx * pm) * 2 ** pe;
    const dy = f(dpy * pm) * 2 ** pe;
    const exact = iterateExactAt(cx + fromNumber(dx), cy + fromNumber(dy), maxIter, exactBits);
    const v = iterateScaled(z32, orbit.length, dpx, dpy, pm, pe, maxIter);
    values.push(v);
    if (close(v, exact)) deep++;
    if (close(iteratePerturbed(orbit, dx, dy, maxIter), exact)) double++;
  }
  return { deep: deep / n, double: double / n, values };
}

describe("float32 helpers of the shader", () => {
  it("read exponents and make powers of two as the bits do", () => {
    expect(expo(1)).toBe(0);
    expect(expo(1.99)).toBe(1 - 1);
    expect(expo(2 ** -100)).toBe(-100);
    expect(expo(0)).toBe(-127);
    expect(p2(-127)).toBe(0);
    expect(p2(-126)).toBe(2 ** -126);
    expect(p2(500)).toBe(2 ** 127);
  });

  it("flush what falls under the normal range of a float32", () => {
    expect(f(2 ** -127)).toBe(0);
    expect(f(1 / 3)).toBe(Math.fround(1 / 3));
  });

  it("split a pixel size into a mantissa in [1, 2) and an exponent", () => {
    for (const pixel of [1e-35, 7e-120, 2 ** -200, 3e-303]) {
      const [m, e] = splitPixel(pixel);
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThan(2);
      expect((m * 2 ** e) / pixel).toBeCloseTo(1, 6);
    }
  });
});

describe("offsets with their own exponent", () => {
  const dendrite = [1e-35, 1e-120, 1e-290];
  for (const width of dendrite) {
    it(`match exact iteration around the Misiurewicz point c = i, width ${width}`, () => {
      const { deep, double, values } = agreement(0n, fromNumber(1), width, 3000);
      expect(values.some((v) => v > 0)).toBe(true);
      expect(deep).toBeGreaterThan(0.95);
      expect(deep).toBeGreaterThanOrEqual(double - 0.05);
    });
  }

  it("match exact iteration at the point of the 2023 script, 10⁴⁰ deep", () => {
    const { deep } = agreement(fromDecimal("-1.78780638350855487198076170"), fromDecimal("0.00005689075511288150404139"), 1e-40, 3000);
    expect(deep).toBeGreaterThan(0.95);
  });

  it("keep every point inside a minibrot whose reference returns to 0", () => {
    // The nucleus of the period-3 minibrot: its orbit comes back exactly to 0 every 3 steps,
    // where the term 2 Z dz vanishes and dz^2 + dc must not underflow.
    const c = realNucleus(-1.7548776662466927, 3, 400);
    const { values } = agreement(c, 0n, 1e-50, 1500, 24);
    expect(values.every((v) => v === -1)).toBe(true);
  });
});
