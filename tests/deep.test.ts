import { describe, expect, it } from "vitest";
import { buildBla } from "../src/math/bla";
import { expo, f, iterateGpu, offsetOf, p2, splitPixel } from "../src/math/deep";
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
 * Compare the shader's method with exact iteration on random pixels of a view, with and
 * without the bilinear approximation, and with the same perturbation in doubles.
 */
function agreement(cx: Fixed, cy: Fixed, width: number, maxIter: number, n = 48) {
  const pixel = width / W;
  const orbit = preciseOrbit(cx, cy, bitsFor(pixel), maxIter);
  const z32 = Float32Array.from(orbit.data);
  const dcMax = Math.hypot(W, W * 0.6) * 0.5 * pixel;
  const bla = buildBla(orbit, dcMax);
  const exactBits = Math.min(FRAC, bitsFor(pixel) + 24);
  // A reference at a nucleus is one period long and ends back at 0.
  const L = orbit.length;
  const periodic = L < maxIter && Math.hypot(orbit.data[2 * L], orbit.data[2 * L + 1]) < 2 ** -40;
  const next = random(5);
  let gpu = 0;
  let withBla = 0;
  let double = 0;
  let steps = 0;
  let blaSteps = 0;
  let iterations = 0;
  const values: number[] = [];
  for (let k = 0; k < n; k++) {
    const dpx = (next() - 0.5) * W;
    const dpy = (next() - 0.5) * W * 0.6;
    // The very offset the GPU uses, so that all methods iterate the same c.
    const dx = offsetOf(dpx, pixel);
    const dy = offsetOf(dpy, pixel);
    const exact = iterateExactAt(cx + fromNumber(dx), cy + fromNumber(dy), maxIter, exactBits);
    const plain = iterateGpu(z32, orbit.length, dpx, dpy, pixel, maxIter, null, periodic);
    const skipping = iterateGpu(z32, orbit.length, dpx, dpy, pixel, maxIter, bla, periodic);
    values.push(plain.value);
    if (close(plain.value, exact)) gpu++;
    if (close(skipping.value, exact)) withBla++;
    if (close(iteratePerturbed(orbit, dx, dy, maxIter), exact)) double++;
    steps += plain.steps;
    blaSteps += skipping.steps;
    iterations += exact < 0 ? maxIter : Math.ceil(exact);
  }
  return { gpu: gpu / n, bla: withBla / n, double: double / n, values, saved: 1 - blaSteps / steps, iterations, steps, blaSteps, periodic };
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

describe("the shader's perturbation", () => {
  const views = [
    { name: "the 2023 point at 10¹⁷, plain floats", re: "-1.78780638350855487198076170", im: "0.00005689075511288150404139", width: 3e-17, maxIter: 3000 },
    { name: "the tip c = -2 at 10²⁵, plain floats", re: "-2", im: "0", width: 1e-25, maxIter: 3000 },
    { name: "c = i at 10³⁵, own exponents", re: "0", im: "1", width: 1e-35, maxIter: 3000 },
    { name: "c = i at 10¹²⁰", re: "0", im: "1", width: 1e-120, maxIter: 3000 },
    { name: "c = i at 10²⁹⁰", re: "0", im: "1", width: 1e-290, maxIter: 3000 },
    { name: "the 2023 point at 10⁴⁰", re: "-1.78780638350855487198076170", im: "0.00005689075511288150404139", width: 1e-40, maxIter: 3000 },
  ];
  for (const { name, re, im, width, maxIter } of views) {
    it(`matches exact iteration, with and without skipping: ${name}`, () => {
      const r = agreement(fromDecimal(re), fromDecimal(im), width, maxIter);
      expect(r.values.some((v) => v > 0)).toBe(true);
      expect(r.gpu).toBeGreaterThan(0.95);
      expect(r.gpu).toBeGreaterThanOrEqual(r.double - 0.05);
      expect(r.bla).toBeGreaterThan(0.95);
    });
  }

  it("keeps every point inside a minibrot whose reference returns to 0", () => {
    // The nucleus of the period-3 minibrot: its orbit comes back exactly to 0 every 3 steps,
    // where the term 2 Z dz vanishes and dz^2 + dc must not underflow.
    const c = realNucleus(-1.7548776662466927, 3, 400);
    const r = agreement(c, 0n, 1e-50, 1500, 24);
    expect(r.values.every((v) => v === -1)).toBe(true);
    expect(r.bla).toBe(1);
  });

  it("stops the pixels inside a minibrot once their returns agree", () => {
    // The orbit of the nucleus is one period long; inside, two returns to the same offset
    // end the pixel long before the limit of 3000 iterations.
    const c = realNucleus(-1.99, 13, 400);
    const r = agreement(c, 0n, 1e-50, 3000, 16);
    expect(r.periodic).toBe(true);
    expect(r.values.every((v) => v === -1)).toBe(true);
    expect(r.bla).toBe(1);
    expect(r.blaSteps / 16).toBeLessThan(60);
  });

  it("does not take the outside of a minibrot for its inside", () => {
    // A view of the whole copy of period 13 and around it, from its nucleus.
    const c = realNucleus(-1.99, 13, 400);
    // The copy is 6.1e-10 across.
    const r = agreement(c, 0n, 3.2 * 6.1e-10, 20000, 48);
    expect(r.periodic).toBe(true);
    expect(r.values.some((v) => v > 0)).toBe(true);
    expect(r.values.some((v) => v < 0)).toBe(true);
    expect(r.gpu).toBeGreaterThan(0.95);
    expect(r.bla).toBeGreaterThan(0.95);
  });

  it("skips most of the steps of a deep dendrite", () => {
    const r = agreement(0n, fromNumber(1), 1e-120, 3000, 16);
    expect(r.saved).toBeGreaterThan(0.5);
  });
});
