import { describe, expect, it } from "vitest";
import { random } from "../src/dive/plan";
import { inBulbs, sampleOrbits, type Grid } from "../src/buddha/sampler";
import { escapeSteps } from "../src/math/atlas";

describe("the Buddhabrot", () => {
  it("knows the points of the cardioid and of the big disc without iterating", () => {
    for (const [x, y] of [[0, 0], [-0.5, 0.3], [0.2, 0], [-1, 0.1], [-1.2, 0]]) {
      expect(inBulbs(x, y)).toBe(true);
      expect(escapeSteps(x, y, 2000)).toBe(-1);
    }
    for (const [x, y] of [[0.3, 0], [-0.75, 0.2], [-1.3, 0.1], [0.5, 0.5]]) expect(inBulbs(x, y)).toBe(false);
  });

  it("draws orbits symmetric about the real axis, shorter ones in fewer channels", () => {
    const grid: Grid = { cx: -0.5, cy: 0, width: 3, w: 60, h: 40 };
    const hist = new Uint32Array(3 * grid.w * grid.h);
    const drawn = sampleOrbits(grid, 40_000, random(9), hist);
    expect(drawn).toBeGreaterThan(1000);
    let top = 0;
    let bottom = 0;
    for (let py = 0; py < grid.h; py++)
      for (let px = 0; px < grid.w; px++) {
        const j = 3 * (py * grid.w + px);
        // Every orbit counted in a short channel is counted in the longer ones too.
        expect(hist[j]).toBeGreaterThanOrEqual(hist[j + 1]);
        expect(hist[j + 1]).toBeGreaterThanOrEqual(hist[j + 2]);
        if (py < grid.h / 2) top += hist[j];
        else bottom += hist[j];
      }
    expect(top / bottom).toBeGreaterThan(0.9);
    expect(top / bottom).toBeLessThan(1.1);
  });
});
