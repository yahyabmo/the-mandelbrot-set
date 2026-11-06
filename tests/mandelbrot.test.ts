import { describe, expect, it } from "vitest";
import { iterateDirect, iteratePerturbed, referenceOrbit, smooth } from "../src/math/mandelbrot";
import { iterateExact } from "./exact";

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
