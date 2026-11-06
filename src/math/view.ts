/**
 * A view of the complex plane: its centre, and the width it spans across the canvas.
 * Screen y grows downwards, the imaginary axis upwards.
 */
export interface View {
  cx: number;
  cy: number;
  width: number;
}

/** Width at which the whole set is in view on a landscape screen. */
export const HOME_WIDTH = 3.6;
export const HOME: View = { cx: -0.75, cy: 0, width: HOME_WIDTH };

/** Below this width a double-precision reference orbit runs out of digits. */
export const MIN_WIDTH = 2e-12;
export const MAX_WIDTH = 12;

/** The home view, widened on tall screens so that the set still fits vertically. */
export function homeView(wPx: number, hPx: number): View {
  const aspect = wPx / Math.max(1, hPx);
  return { ...HOME, width: Math.max(HOME_WIDTH, 2.7 * aspect) };
}

export function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

/** The complex number under a screen pixel. */
export function toComplex(v: View, px: number, py: number, wPx: number, hPx: number): [number, number] {
  const s = v.width / wPx;
  return [v.cx + (px - wPx / 2) * s, v.cy - (py - hPx / 2) * s];
}

/** Zoom by `factor` (above 1 zooms in) keeping the point under (px, py) where it is. */
export function zoomAt(v: View, px: number, py: number, wPx: number, hPx: number, factor: number): View {
  const width = clampWidth(v.width / factor);
  const [re, im] = toComplex(v, px, py, wPx, hPx);
  const k = width / v.width;
  return { cx: re + (v.cx - re) * k, cy: im + (v.cy - im) * k, width };
}

/** Move the view so that the content follows a drag of (dx, dy) pixels. */
export function panBy(v: View, dx: number, dy: number, wPx: number): View {
  const s = v.width / wPx;
  return { ...v, cx: v.cx - dx * s, cy: v.cy + dy * s };
}

/** Magnification relative to the home view. */
export function magnification(v: View): number {
  return HOME_WIDTH / v.width;
}

/** Ease `from` towards `to`; zoom eases in log space so that it feels even at every depth. */
export function ease(from: View, to: View, k: number): View {
  const lw = Math.log(from.width) + (Math.log(to.width) - Math.log(from.width)) * k;
  return { cx: from.cx + (to.cx - from.cx) * k, cy: from.cy + (to.cy - from.cy) * k, width: Math.exp(lw) };
}

/** True once two views differ by less than a tenth of a pixel. */
export function settled(a: View, b: View, wPx: number): boolean {
  const s = b.width / wPx;
  return (
    Math.abs(a.cx - b.cx) < 0.1 * s &&
    Math.abs(a.cy - b.cy) < 0.1 * s &&
    Math.abs(Math.log(a.width / b.width)) < 1e-4
  );
}
