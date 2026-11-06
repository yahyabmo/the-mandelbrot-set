import { describe, expect, it } from "vitest";
import { componentSize } from "../src/math/atlas";
import { FRAC, fromDecimal, fromNumber, toDecimal, toNumber, type Fixed } from "../src/math/fixed";
import { bitsFor, preciseOrbit } from "../src/math/mandelbrot";
import { boxPeriod, nucleusFixed, sizeFixed, surroundsZero } from "../src/math/minibrot";

/** |z_p(c)| in fixed point, to check a nucleus. */
function returnTo0(cx: Fixed, cy: Fixed, period: number, bits: number): number {
  const B = BigInt(bits);
  const x = cx >> BigInt(FRAC - bits);
  const y = cy >> BigInt(FRAC - bits);
  let zr = 0n;
  let zi = 0n;
  for (let i = 0; i < period; i++) {
    const n = ((zr * zr - zi * zi) >> B) + x;
    zi = ((zr * zi) >> (B - 1n)) + y;
    zr = n;
  }
  return Math.hypot(Number(zr), Number(zi)) * 2 ** -bits;
}

const corners = (w: number): [number, number][] => [
  [-w / 2, -w / 2],
  [w / 2, -w / 2],
  [w / 2, w / 2],
  [-w / 2, w / 2],
];

const P3 = "-1.75487766624669276004950889635852869189460661777279314398928397064608065512808109073822709284225030364837736791281";

describe("minibrots at any depth", () => {
  it("tell whether a polygon surrounds 0", () => {
    expect(surroundsZero([-1, 1, 1, -1], [-1, -1, 1, 1])).toBe(true);
    expect(surroundsZero([1, 2, 2, 1], [-1, -1, 1, 1])).toBe(false);
  });

  it("find the nucleus of period 3 to a hundred digits", () => {
    const n = nucleusFixed(fromNumber(-1.75), 0n, 3, 400)!;
    expect(toDecimal(n[0], 100)).toBe(toDecimal(fromDecimal(P3), 100));
    expect(Math.abs(toNumber(n[1]))).toBeLessThan(1e-100);
  });

  it("keep a single period of the orbit of a nucleus", () => {
    const n = nucleusFixed(fromNumber(-1.75), 0n, 3, 400)!;
    expect(preciseOrbit(n[0], n[1], 400, 1000).length).toBe(3);
    expect(preciseOrbit(fromNumber(-1.75), 0n, 400, 1000).length).toBe(1000);
  });

  it("estimate the size of a component as the double version does", () => {
    const c = componentSize([-1.7548776662466927, 0], 3);
    const s = sizeFixed(fromDecimal(P3), 0n, 3, 200);
    expect(s.log2).toBeCloseTo(Math.log2(Math.hypot(...c)), 9);
    expect(Math.cos(s.angle)).toBeCloseTo(Math.cos(Math.atan2(c[1], c[0])), 9);
  });

  it("read the period of a box around a nucleus", () => {
    const cx = fromDecimal("-1.7548");
    const orbit = preciseOrbit(cx, 0n, 128, 1000);
    expect(boxPeriod(orbit, corners(2e-3), 1000)).toBe(3);
    // A box away from the minibrot does not surround it.
    const away = preciseOrbit(fromDecimal("-1.70"), 0n, 128, 1000);
    expect(boxPeriod(away, corners(1e-4), 1000)).not.toBe(3);
  });

  it("find a minibrot inside a deep view and land on its nucleus", () => {
    // The point of the 2023 script, 10^20 times closer than the whole set.
    const cx = fromDecimal("-1.78780638350855487198076170");
    const cy = fromDecimal("0.00005689075511288150404139");
    const width = 1e-20;
    const bits = bitsFor(width / 1000);
    const orbit = preciseOrbit(cx, cy, bits, 20000);
    const p = boxPeriod(orbit, corners(width), 20000);
    expect(p).toBeGreaterThan(10);
    const n = nucleusFixed(cx, cy, p, bits)!;
    expect(n).not.toBeNull();
    // Newton has settled: one more pass does not move the point, and z_p is far smaller there than at the start.
    const again = nucleusFixed(n[0], n[1], p, bits)!;
    expect(Math.hypot(toNumber(again[0] - n[0]), toNumber(again[1] - n[1]))).toBeLessThan(width * 1e-9);
    expect(returnTo0(n[0], n[1], p, bits)).toBeLessThan(1e-12 * returnTo0(cx, cy, p, bits));
    // The nucleus is in the box, or next to it.
    expect(Math.hypot(toNumber(n[0] - cx), toNumber(n[1] - cy))).toBeLessThan(2 * width);
    // And it is a small copy: far smaller than the box.
    expect(sizeFixed(n[0], n[1], p, bits).log2).toBeLessThan(Math.log2(width));
  });
});
