import { describe, expect, it } from "vitest";
import { FRAC, fromDecimal, fromNumber, mulNumber, ONE, toBits, toDecimal, toNumber } from "../src/math/fixed";

describe("fixed-point numbers", () => {
  it("hold every double exactly", () => {
    for (const x of [0, 1, -1, 0.1, -1.787806383508555, 3.6, 2 ** -60, 1e-300, -7e-310, 1e300]) {
      expect(toNumber(fromNumber(x))).toBe(x < 1e-320 && x > -1e-320 ? 0 : x);
    }
    expect(fromNumber(1)).toBe(ONE);
    expect(fromNumber(-0.5)).toBe(-(ONE >> 1n));
  });

  it("measure the gap between two points far beyond double precision", () => {
    const a = fromDecimal("-1.78780638350855487198076170");
    const b = fromDecimal("-1.78780638350855487198076170000000000000000000000000000000001");
    expect(toNumber(b - a) / -1e-59).toBeCloseTo(1, 12);
  });

  it("read and write decimals without losing digits", () => {
    const s = "-1.787806383508554871980761700000000000000000000000000000000000000000000042";
    expect(toDecimal(fromDecimal(s), 72)).toBe(s);
    expect(toDecimal(fromDecimal("0.00005689075511288150404139"), 26)).toBe("0.00005689075511288150404139");
    expect(toDecimal(fromDecimal("2.5e-3"), 4)).toBe("0.0025");
    expect(toDecimal(fromDecimal("-0.0000001"), 3)).toBe("0.000");
    expect(toDecimal(fromDecimal("12"), 0)).toBe("12");
  });

  it("refuse what is not a decimal", () => {
    for (const s of ["", "abc", "1.2.3", "--1", "1e99999"]) expect(() => fromDecimal(s)).toThrow();
  });

  it("scale by tiny factors without losing them", () => {
    expect(toNumber(mulNumber(ONE, 1e-300)) / 1e-300).toBeCloseTo(1, 12);
    expect(toNumber(mulNumber(fromNumber(-3), 0.25))).toBe(-0.75);
    expect(mulNumber(ONE, 0)).toBe(0n);
  });

  it("round to fewer bits for the reference orbit", () => {
    expect(toBits(ONE, 10)).toBe(1024n);
    expect(toBits(fromNumber(0.75), 2)).toBe(3n);
    expect(toBits(ONE, FRAC + 4)).toBe(ONE << 4n);
  });
});
