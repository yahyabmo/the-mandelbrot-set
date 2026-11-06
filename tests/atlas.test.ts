import { describe, expect, it } from "vitest";
import {
  anglePeriod,
  angleText,
  atomPeriod,
  componentSize,
  cyclePeriod,
  escapeSteps,
  externalRay,
  lavaurs,
  nucleus,
  orbitOf,
  readPoint,
} from "../src/math/atlas";

const near = ([x, y]: [number, number], [a, b]: [number, number], tol: number) => Math.hypot(x - a, y - b) < tol;

describe("orbits", () => {
  it("stay at 0 for c = 0 and leave for c = 1", () => {
    expect(orbitOf(0, 0, 50).escaped).toBe(false);
    const o = orbitOf(1, 0, 50);
    expect(o.escaped).toBe(true);
    expect(o.points[2]).toBe(1);
  });
});

describe("π in the Mandelbrot set", () => {
  it("appears in the neck of seahorse valley: N(ε) ε tends to π at c = -3/4 + iε", () => {
    expect(Math.abs(escapeSteps(-0.75, 0.01, 1e6) * 0.01 - Math.PI)).toBeLessThan(0.02);
    expect(Math.abs(escapeSteps(-0.75, 1e-4, 1e7) * 1e-4 - Math.PI)).toBeLessThan(1e-3);
  });

  it("appears at the cusp too: N(ε) √ε tends to π at c = 1/4 + ε", () => {
    expect(Math.abs(escapeSteps(0.25 + 1e-6, 0, 1e7) * 1e-3 - Math.PI)).toBeLessThan(0.01);
  });
});

describe("components", () => {
  it("find the period of the component a point lies in", () => {
    expect(cyclePeriod(0, 0.1)).toBe(1);
    expect(cyclePeriod(-1, 0.05)).toBe(2);
    expect(cyclePeriod(-0.12, 0.74)).toBe(3);
    expect(cyclePeriod(-1.754, 0)).toBe(3);
    expect(cyclePeriod(0.5, 0.5)).toBe(0);
  });

  it("find the component an escaping point passed nearest to", () => {
    expect(atomPeriod(0.3, 0, 1000)).toBe(1);
    // Just outside the disc of period 4 centred at -1.3107, on the left of the disc of period 2.
    expect(atomPeriod(-1.3, 0.1, 1000)).toBe(4);
  });

  it("find nuclei by Newton's method", () => {
    expect(near(nucleus(-0.95, 0.02, 2)!, [-1, 0], 1e-12)).toBe(true);
    expect(near(nucleus(-0.12, 0.74, 3)!, [-0.12256116687665, 0.74486176661974], 1e-10)).toBe(true);
    expect(near(nucleus(-1.75, 0, 3)!, [-1.75487766624669, 0], 1e-10)).toBe(true);
  });

  it("refuse a nucleus whose true period is smaller", () => {
    // Newton for period 4 near -1 lands on the nucleus of period 2.
    expect(nucleus(-1.01, 0.01, 4)).toBeNull();
  });

  it("estimate the size of a component", () => {
    const one = componentSize([0, 0], 1);
    expect(one[0]).toBeCloseTo(1, 12);
    const two = componentSize([-1, 0], 2);
    expect(two[0]).toBeCloseTo(0.5, 12);
    expect(two[1]).toBeCloseTo(0, 12);
    // The real minibrot of period 3 is about 50 times smaller than the whole set.
    const three = componentSize([-1.7548776662466927, 0], 3);
    expect(Math.hypot(...three)).toBeGreaterThan(0.01);
    expect(Math.hypot(...three)).toBeLessThan(0.03);
  });

  it("read a point inside and a point outside", () => {
    const inside = readPoint(-1, 0.05, 2000);
    expect(inside.escape).toBe(-1);
    expect(inside.period).toBe(2);
    expect(near(inside.nucleus!, [-1, 0], 1e-12)).toBe(true);
    expect(readPoint(0.5, 0.5, 2000).escape).toBeGreaterThan(0);
  });
});

describe("external rays", () => {
  const end = (r: [number, number][]) => r[r.length - 1];

  it("land where the theory says", () => {
    // 1/2 lands at the tip -2, 1/6 at the Misiurewicz point i.
    expect(near(end(externalRay({ num: 1, den: 2 }, 1e-6)), [-2, 0], 1e-3)).toBe(true);
    expect(near(end(externalRay({ num: 1, den: 6 }, 1e-6)), [0, 1], 1e-3)).toBe(true);
  });

  it("land at the roots of bulbs, if slowly: 1/3 at -3/4, 1/7 at the root of the 1/3 bulb", () => {
    // Near a parabolic root the distance left only falls like 1 / depth.
    expect(near(end(externalRay({ num: 1, den: 3 }, 1e-9, 300)), [-0.75, 0], 0.015)).toBe(true);
    expect(near(end(externalRay({ num: 1, den: 7 }, 1e-9, 300)), [-0.125, 0.649519052838329], 0.015)).toBe(true);
  });

  it("come in from far away along their angle", () => {
    const r = externalRay({ num: 1, den: 4 });
    expect(r[0][0]).toBeCloseTo(0, 9);
    expect(r[0][1]).toBeGreaterThan(100);
  });
});

describe("Lavaurs' diagram", () => {
  const pairs = (p: number) =>
    lavaurs(p)
      .filter((c) => c.period === p)
      .map((c) => `${c.a.num}-${c.b.num}`);

  it("knows the periods of angles under doubling", () => {
    expect(anglePeriod(1, 3)).toBe(2);
    expect(anglePeriod(1, 7)).toBe(3);
    expect(anglePeriod(5, 15)).toBe(2);
    expect(anglePeriod(3, 15)).toBe(4);
  });

  it("pairs the rays of each root up to period 4", () => {
    expect(pairs(2)).toEqual(["1-2"]);
    expect(pairs(3)).toEqual(["1-2", "3-4", "5-6"]);
    expect(pairs(4)).toEqual(["1-2", "3-4", "6-9", "7-8", "11-12", "13-14"]);
  });

  it("has as many chords as components of each period", () => {
    // Numbers of hyperbolic components of period 2 to 6: 1, 3, 6, 15, 27.
    const counts = [2, 3, 4, 5, 6].map((p) => lavaurs(6).filter((c) => c.period === p).length);
    expect(counts).toEqual([1, 3, 6, 15, 27]);
  });

  it("writes angles in lowest terms", () => {
    expect(angleText({ num: 6, den: 15 })).toBe("2/5");
    expect(angleText({ num: 1, den: 7 })).toBe("1/7");
  });
});
