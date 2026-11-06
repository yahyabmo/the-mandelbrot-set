import { describe, expect, it } from "vitest";
import { autoIterations, MAX_ITERATIONS, MIN_ITERATIONS } from "../src/math/iterations";
import {
  clampWidth,
  ease,
  HOME,
  homeView,
  MIN_WIDTH,
  panBy,
  settled,
  toComplex,
  zoomAt,
} from "../src/math/view";

const W = 1600;
const H = 900;

describe("view", () => {
  it("puts the centre of the view in the middle of the screen", () => {
    expect(toComplex(HOME, W / 2, H / 2, W, H)).toEqual([HOME.cx, HOME.cy]);
  });

  it("points the imaginary axis upwards", () => {
    const [, top] = toComplex(HOME, W / 2, 0, W, H);
    expect(top).toBeGreaterThan(HOME.cy);
  });

  it("keeps the point under the cursor in place while zooming", () => {
    const before = toComplex(HOME, 300, 200, W, H);
    const after = toComplex(zoomAt(HOME, 300, 200, W, H, 8), 300, 200, W, H);
    expect(after[0]).toBeCloseTo(before[0], 12);
    expect(after[1]).toBeCloseTo(before[1], 12);
  });

  it("moves the content with the drag", () => {
    const v = panBy(HOME, 100, 0, W);
    const [re] = toComplex(v, W / 2 + 100, H / 2, W, H);
    expect(re).toBeCloseTo(HOME.cx, 12);
  });

  it("stops at the deepest width the reference can hold", () => {
    expect(clampWidth(1e-20)).toBe(MIN_WIDTH);
  });

  it("widens the home view on wide screens so that the whole set fits in height", () => {
    // The set is about 2.3 tall: at 16:9 a width of 3.6 would crop its top and bottom.
    expect(homeView(1600, 900).width).toBeCloseTo(2.7 * (1600 / 900), 12);
    expect(homeView(900, 900).width).toBe(HOME.width);
    expect(homeView(390, 844).width).toBe(HOME.width);
  });

  it("eases the zoom evenly in log space", () => {
    const mid = ease({ ...HOME, width: 1 }, { ...HOME, width: 1e-4 }, 0.5);
    expect(mid.width).toBeCloseTo(1e-2, 12);
  });

  it("knows when the motion is over", () => {
    expect(settled(HOME, { ...HOME, cx: HOME.cx + 1e-9 }, W)).toBe(true);
    expect(settled(HOME, { ...HOME, cx: HOME.cx + 0.01 }, W)).toBe(false);
  });
});

describe("automatic iterations", () => {
  it("grows with depth and stays within bounds", () => {
    const shallow = autoIterations(3.6);
    const deep = autoIterations(1e-10);
    expect(deep).toBeGreaterThan(shallow);
    expect(autoIterations(1e-300)).toBe(MAX_ITERATIONS);
    expect(autoIterations(3.6, 0.01)).toBe(MIN_ITERATIONS);
  });
});
