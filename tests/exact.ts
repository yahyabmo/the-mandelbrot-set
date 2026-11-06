import { toBits, type Fixed } from "../src/math/fixed";
import { BAILOUT, smooth } from "../src/math/mandelbrot";

/** Fixed-point iteration with BigInt: the ground truth the double-precision methods are judged by. */
const BITS = 400n;

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
  return iterateExactBits(toFixed(cre), toFixed(cim), maxIter);
}

/** The same for a point given in the fixed point of the app, beyond double precision. */
export function iterateExactAt(cre: Fixed, cim: Fixed, maxIter: number, bits = Number(BITS)): number {
  return iterateExactBits(toBits(cre, bits), toBits(cim, bits), maxIter, BigInt(bits));
}

function iterateExactBits(cr: bigint, ci: bigint, maxIter: number, B = BITS): number {
  const escape = BigInt(BAILOUT * BAILOUT) << B;
  let x = 0n;
  let y = 0n;
  for (let i = 0; i < maxIter; i++) {
    const nx = ((x * x - y * y) >> B) + cr;
    y = ((2n * x * y) >> B) + ci;
    x = nx;
    const r2 = (x * x + y * y) >> B;
    if (r2 > escape) return smooth(i, Number(r2 >> (B - 52n)) / 2 ** 52);
  }
  return -1;
}
