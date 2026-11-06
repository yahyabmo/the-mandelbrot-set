import { describe, expect, it } from "vitest";
import { findMinibrot, frameWidth, nextMinibrot, random, startMinibrot, STARTS, type Minibrot } from "../src/dive/plan";
import { fromDecimal, toNumber } from "../src/math/fixed";

describe("the endless dive", () => {
  it("finds the period-3 copy in a box around it", () => {
    const m = findMinibrot({ cx: fromDecimal("-1.7549"), cy: 0n, width: 0.004 }, 2000)!;
    expect(m.period).toBe(3);
    expect(toNumber(m.cx)).toBeCloseTo(-1.7548776662466927, 12);
    expect(2 ** m.sizeLog2).toBeGreaterThan(0.01);
  });

  it("has a minibrot at every starting place", () => {
    for (let k = 0; k < STARTS.length; k++) expect(startMinibrot(k)).not.toBeNull();
  });

  it("dives through embedded Julia sets: about twice as deep each step, periods growing slowly", () => {
    const rng = random(7);
    let m: Minibrot = startMinibrot(0)!;
    for (let step = 0; step < 4; step++) {
      const next = nextMinibrot(m, rng);
      expect(next).not.toBeNull();
      expect(next!.sizeLog2).toBeLessThan(m.sizeLog2 - 3);
      m = next!;
    }
    // Four steps reach far beyond the 10^-16 of a double, with periods still in the thousands.
    expect(frameWidth(m)).toBeLessThan(1e-40);
    expect(m.period).toBeLessThan(5000);
  }, 60_000);
});
