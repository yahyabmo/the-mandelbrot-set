const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

export function superscript(n: number): string {
  return String(n)
    .replace(/-/g, "⁻")
    .replace(/\d/g, (d) => SUPERSCRIPT[Number(d)]);
}

/** 1.00×, 240×, then 2.4 × 10⁸. */
export function magnificationText(m: number): string {
  if (m < 10) return `${m.toFixed(2)}×`;
  if (m < 1e4) return `${Math.round(m)}×`;
  const e = Math.floor(Math.log10(m));
  return `${(m / 10 ** e).toFixed(1)} × 10${superscript(e)}`;
}

/** Enough digits to tell one pixel from the next, and no more. */
export function coordinateText(x: number, width: number): string {
  const digits = Math.min(17, Math.max(3, Math.ceil(-Math.log10(width / 2000))));
  const s = x.toFixed(digits);
  return x >= 0 ? `+${s}` : s;
}

/** A length such as 2.7 × 10⁻⁸, or 0.042 when it is readable as it is. */
export function scientificText(x: number): string {
  if (x >= 1e-3 && x < 1e4) return x.toPrecision(2);
  const e = Math.floor(Math.log10(x));
  return `${(x / 10 ** e).toFixed(1)} × 10${superscript(e)}`;
}
