import { describe, expect, it } from "vitest";
import { fromDecimal, fromNumber } from "../src/math/fixed";
import { bitsFor, iterateDirect, iteratePerturbed, preciseOrbit, referenceOrbit, smooth } from "../src/math/mandelbrot";
import { iterateExact, iterateExactAt } from "./exact";

/** Small deterministic generator, so that a failure can be replayed. */
function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("direct iteration", () => {
  it("keeps the points of the set", () => {
    expect(iterateDirect(0, 0, 1000)).toBe(-1);
    expect(iterateDirect(-1, 0, 1000)).toBe(-1);
    expect(iterateDirect(-0.1, 0.1, 1000)).toBe(-1);
  });

  it("lets the points outside escape quickly", () => {
    const v = iterateDirect(2, 2, 1000);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(5);
  });

  it("gives a smooth count that grows towards the set", () => {
    const far = iterateDirect(0.5, 0.5, 1000);
    const near = iterateDirect(0.26, 0.0, 1000);
    expect(near).toBeGreaterThan(far);
  });

  it("joins two neighbouring escape counts without a jump", () => {
    // At the bailout the fractional part restarts: 4 - log2(log2(B^2)) for both sides.
    const b2 = 256 * 256;
    expect(smooth(10, b2)).toBeCloseTo(smooth(11, b2 * b2), 9);
  });
});

describe("perturbation with rebasing", () => {
  const cases = [
    { name: "seahorse valley", cx: -0.743643887037151, cy: 0.13182590420533, width: 1e-6 },
    { name: "the spike", cx: -1.7548776662466927, cy: 0, width: 1e-4 },
    { name: "outside the set", cx: 0.5, cy: 0.5, width: 0.05 },
    { name: "the 2023 zoom point", cx: -1.787806383508555, cy: 0.0000568907551128815, width: 1e-9 },
  ];
  const maxIter = 2000;
  const total = 120;

  for (const { name, cx, cy, width } of cases) {
    it(`is as close to the exact value as plain double iteration: ${name}`, () => {
      const orbit = referenceOrbit(cx, cy, maxIter);
      const next = random(7);
      const near = (a: number, exact: number) => (a < 0 && exact < 0) || (a >= 0 && exact >= 0 && Math.abs(a - exact) < 0.05);
      let perturbedRight = 0;
      let directRight = 0;
      for (let k = 0; k < total; k++) {
        // c - cx is exact for such close numbers: both methods iterate the very same c.
        const cre = cx + (next() - 0.5) * width;
        const cim = cy + (next() - 0.5) * width * 0.6;
        const exact = iterateExact(cre, cim, maxIter);
        if (near(iteratePerturbed(orbit, cre - cx, cim - cy, maxIter), exact)) perturbedRight++;
        if (near(iterateDirect(cre, cim, maxIter), exact)) directRight++;
      }
      // Near the boundary the orbit is chaotic and any rounding grows: a few points miss with both methods.
      expect(perturbedRight / total).toBeGreaterThan(0.95);
      expect(perturbedRight).toBeGreaterThanOrEqual(directRight - 2);
    });
  }

  const deep = [
    { name: "the 2023 point at 10¹⁷", re: "-1.78780638350855487198076170", im: "0.00005689075511288150404139", width: 3e-17, maxIter: 3000 },
    { name: "a seahorse at 10²⁸", re: "-0.7436438870371587047918217678", im: "0.1318259042053120314798063236", width: 1e-28, maxIter: 6000 },
  ];
  for (const { name, re, im, width, maxIter } of deep) {
    it(`agrees with the exact value beyond double precision: ${name}`, () => {
      const cx = fromDecimal(re);
      const cy = fromDecimal(im);
      const orbit = preciseOrbit(cx, cy, bitsFor(width / 2000), maxIter);
      const next = random(11);
      let right = 0;
      const n = 60;
      for (let k = 0; k < n; k++) {
        const dx = (next() - 0.5) * width;
        const dy = (next() - 0.5) * width * 0.6;
        const exact = iterateExactAt(cx + fromNumber(dx), cy + fromNumber(dy), maxIter);
        const v = iteratePerturbed(orbit, dx, dy, maxIter);
        if ((v < 0 && exact < 0) || (v >= 0 && exact >= 0 && Math.abs(v - exact) < 0.05)) right++;
      }
      expect(right / n).toBeGreaterThan(0.95);
    });
  }

  it("computes the same orbit in fixed point as in doubles where doubles suffice", () => {
    const a = referenceOrbit(-0.743643887037151, 0.13182590420533, 200);
    const b = preciseOrbit(fromNumber(-0.743643887037151), fromNumber(0.13182590420533), 120, 200);
    expect(b.length).toBe(a.length);
    for (let i = 0; i < 40; i++) expect(b.data[i]).toBeCloseTo(a.data[i], 12);
  });

  it("records the reference until it escapes", () => {
    const orbit = referenceOrbit(0.5, 0.5, 1000);
    expect(orbit.length).toBeLessThan(1000);
    const x = orbit.data[2 * orbit.length];
    const y = orbit.data[2 * orbit.length + 1];
    expect(x * x + y * y).toBeGreaterThan(4);
  });

  it("keeps a reference inside the set for the whole limit", () => {
    expect(referenceOrbit(-0.1, 0.1, 500).length).toBe(500);
  });
});
