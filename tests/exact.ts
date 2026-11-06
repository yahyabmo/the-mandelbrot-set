import { BAILOUT, smooth } from "../src/math/mandelbrot";

/** Fixed-point iteration with BigInt: the ground truth the double-precision methods are judged by. */
const BITS = 400n;
const ONE = 1n << BITS;

/** The exact value of a double as a fixed-point number: a double is m * 2^e. */
export function toFixed(x: number): bigint {
  if (x === 0) return 0n;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const bits = view.getBigUint64(0);
  const sign = bits >> 63n ? -1n : 1n;
  const exponent = BigInt(Number((bits >> 52n) & 0x7ffn) - 1075);
  const mantissa = (bits & ((1n << 52n) - 1n)) | (1n << 52n);
  const shift = exponent + BITS;
  return sign * (shift >= 0n ? mantissa << shift : mantissa >> -shift);
}

export function iterateExact(cre: number, cim: number, maxIter: number): number {
  const cr = toFixed(cre);
  const ci = toFixed(cim);
  const escape = BigInt(BAILOUT * BAILOUT) * ONE;
  let x = 0n;
  let y = 0n;
  for (let i = 0; i < maxIter; i++) {
    const nx = ((x * x - y * y) >> BITS) + cr;
    y = ((2n * x * y) >> BITS) + ci;
    x = nx;
    const r2 = (x * x + y * y) >> BITS;
    if (r2 > escape) return smooth(i, Number(r2 >> (BITS - 52n)) / 2 ** 52);
  }
  return -1;
}
