import { fromDecimal, fromNumber, mulNumber, toNumber, type Fixed } from "./fixed";

/**
 * A view of the complex plane: its centre, in fixed point so that it can be placed far
 * beyond the 16 digits of a double, and the width it spans across the canvas.
 * Screen y grows downwards, the imaginary axis upwards.
 */
export interface View {
  cx: Fixed;
  cy: Fixed;
  width: number;
}

/** Width at which the whole set is in view on a landscape screen. */
export const HOME_WIDTH = 3.6;
export const HOME: View = { cx: fromNumber(-0.75), cy: 0n, width: HOME_WIDTH };

/** Below this width the reference orbit, computed in double precision, runs out of digits. */
export const MIN_WIDTH = 2e-12;
export const MAX_WIDTH = 12;

/** A view written with decimals, as places and links give them. */
export function viewOf(re: string, im: string, width: number): View {
  return { cx: fromDecimal(re), cy: fromDecimal(im), width };
}

/** The home view, widened on tall screens so that the set still fits vertically. */
export function homeView(wPx: number, hPx: number): View {
  const aspect = wPx / Math.max(1, hPx);
  return { ...HOME, width: Math.max(HOME_WIDTH, 2.7 * aspect) };
}

export function clampWidth(width: number): number {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width));
}

/** Offset from the centre of the view to the point under a screen pixel. */
export function pixelOffset(v: View, px: number, py: number, wPx: number, hPx: number): [number, number] {
  const s = v.width / wPx;
  return [(px - wPx / 2) * s, -(py - hPx / 2) * s];
}

/** The complex number under a screen pixel. */
export function toComplex(v: View, px: number, py: number, wPx: number, hPx: number): [Fixed, Fixed] {
  const [ox, oy] = pixelOffset(v, px, py, wPx, hPx);
  return [v.cx + fromNumber(ox), v.cy + fromNumber(oy)];
}

/** Zoom by `factor` (above 1 zooms in) keeping the point under (px, py) where it is. */
export function zoomAt(v: View, px: number, py: number, wPx: number, hPx: number, factor: number): View {
  const width = clampWidth(v.width / factor);
  const [ox, oy] = pixelOffset(v, px, py, wPx, hPx);
  const k = 1 - width / v.width;
  return { cx: v.cx + fromNumber(ox * k), cy: v.cy + fromNumber(oy * k), width };
}

/** Move the view so that the content follows a drag of (dx, dy) pixels. */
export function panBy(v: View, dx: number, dy: number, wPx: number): View {
  const s = v.width / wPx;
  return { ...v, cx: v.cx - fromNumber(dx * s), cy: v.cy + fromNumber(dy * s) };
}

/** Magnification relative to the home view. */
export function magnification(v: View): number {
  return HOME_WIDTH / v.width;
}

/** Fastest change of width while easing, in factors of e per second: 10¹⁸ takes about five seconds. */
export const MAX_ZOOM_RATE = 8;

/**
 * Ease `from` towards `to` by a share k of the way, in log space for the width so that
 * the zoom feels even at every depth, and by at most `maxLog` factors of e.
 *
 * The centre moves in proportion to the width: (c - to.c) / (w - to.w) stays constant.
 * On that path the point under the cursor of a wheel zoom stays exactly in place, and a
 * long dive keeps its target where it was on screen until the last moment.
 */
export function ease(from: View, to: View, k: number, maxLog = Infinity): View {
  const gap = Math.log(to.width) - Math.log(from.width);
  const step = Math.max(-maxLog, Math.min(maxLog, gap * k));
  const width = Math.exp(Math.log(from.width) + step);
  const span = from.width - to.width;
  if (Math.abs(span) > 1e-9 * Math.max(from.width, to.width)) {
    const r = Math.max(0, Math.min(1, (width - to.width) / span));
    return { cx: to.cx + mulNumber(from.cx - to.cx, r), cy: to.cy + mulNumber(from.cy - to.cy, r), width };
  }
  return { cx: from.cx + mulNumber(to.cx - from.cx, k), cy: from.cy + mulNumber(to.cy - from.cy, k), width };
}

/** True once two views differ by less than a tenth of a pixel. */
export function settled(a: View, b: View, wPx: number): boolean {
  const s = b.width / wPx;
  return (
    Math.abs(toNumber(a.cx - b.cx)) < 0.1 * s &&
    Math.abs(toNumber(a.cy - b.cy)) < 0.1 * s &&
    Math.abs(Math.log(a.width / b.width)) < 1e-4
  );
}
