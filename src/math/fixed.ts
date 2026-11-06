/**
 * Real numbers in fixed point: a bigint n stands for n / 2^FRAC.
 *
 * 1088 fractional bits place a point to within 10^-327, finer than the narrowest view
 * whose width a double can still describe. Only the centre of the view and the reference
 * orbit need such numbers; every distance measured in pixels stays a double.
 */
export type Fixed = bigint;

export const FRAC = 1088;
const FRAC_N = BigInt(FRAC);
export const ONE: Fixed = 1n << FRAC_N;

const f64 = new DataView(new ArrayBuffer(8));

/** x * 2^e, in steps so that no power of two overflows or underflows on the way. */
function scale2(x: number, e: number): number {
  while (e > 1000) {
    x *= 2 ** 1000;
    e -= 1000;
  }
  while (e < -1000) {
    x *= 2 ** -1000;
    e += 1000;
  }
  return x * 2 ** e;
}

/** The exact value of a double. */
export function fromNumber(x: number): Fixed {
  if (!Number.isFinite(x)) throw new RangeError(`Not a finite number: ${x}`);
  if (x === 0) return 0n;
  f64.setFloat64(0, x);
  const bits = f64.getBigUint64(0);
  const biased = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = biased === 0 ? fraction : fraction | (1n << 52n);
  // x = mantissa * 2^exponent
  const exponent = (biased === 0 ? 1 : biased) - 1075;
  const shift = exponent + FRAC;
  const magnitude = shift >= 0 ? mantissa << BigInt(shift) : mantissa >> BigInt(-shift);
  return bits >> 63n ? -magnitude : magnitude;
}

/** Number of binary digits, to within the 3 bits of the last hexadecimal digit. */
function roughBitLength(a: bigint): number {
  return a.toString(16).length * 4;
}

/** The nearest double at any magnitude, so that the gap between two close points stays exact. */
export function toNumber(n: Fixed): number {
  if (n === 0n) return 0;
  const a = n < 0n ? -n : n;
  const shift = Math.max(0, roughBitLength(a) - 64);
  const v = scale2(Number(a >> BigInt(shift)), shift - FRAC);
  return n < 0n ? -v : v;
}

/** n times a double, with the full relative precision of k even when k is tiny. */
export function mulNumber(n: Fixed, k: number): Fixed {
  if (k === 0 || n === 0n) return 0n;
  if (!Number.isFinite(k)) throw new RangeError(`Not a finite factor: ${k}`);
  // k = m / 2^shift with m a 53-bit integer.
  const shift = 52 - Math.floor(Math.log2(Math.abs(k)));
  const m = BigInt(Math.round(scale2(k, shift)));
  return shift >= 0 ? (n * m) >> BigInt(shift) : (n * m) << BigInt(-shift);
}

const DECIMAL = /^\s*([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d{1,4}))?\s*$/i;

/** Reads a decimal such as "-1.78780638350855487198076170" or "2.5e-3", to the nearest fixed point. */
export function fromDecimal(s: string): Fixed {
  const m = DECIMAL.exec(s);
  if (!m || (m[2] === "" && !m[3]) || s.length > 1500) throw new SyntaxError(`Not a decimal number: ${s.slice(0, 40)}`);
  const fraction = m[3] ?? "";
  const digits = BigInt((m[2] || "0") + fraction);
  // value = digits * 10^-scale
  const scale = fraction.length - Number(m[4] ?? 0);
  if (scale < -400) throw new RangeError("Number too large");
  let v: bigint;
  if (scale <= 0) v = (digits * 10n ** BigInt(-scale)) << FRAC_N;
  else {
    const d = 10n ** BigInt(scale);
    v = ((digits << FRAC_N) + d / 2n) / d;
  }
  return m[1] === "-" ? -v : v;
}

/** Writes n with `digits` decimals, rounded to nearest. */
export function toDecimal(n: Fixed, digits: number): string {
  const a = n < 0n ? -n : n;
  const scaled = (a * 10n ** BigInt(digits) + (ONE >> 1n)) >> FRAC_N;
  const s = scaled.toString().padStart(digits + 1, "0");
  const whole = s.slice(0, s.length - digits);
  const fraction = s.slice(s.length - digits);
  const sign = n < 0n && scaled !== 0n ? "-" : "";
  return digits > 0 ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** n rounded to `bits` fractional bits, as an integer: the form the reference orbit computes with. */
export function toBits(n: Fixed, bits: number): bigint {
  const drop = FRAC - bits;
  if (drop <= 0) return n << BigInt(-drop);
  return (n + (1n << BigInt(drop - 1))) >> BigInt(drop);
}
