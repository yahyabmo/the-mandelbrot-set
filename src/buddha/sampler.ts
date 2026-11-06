/**
 * The Buddhabrot: instead of colouring each c by its own orbit, follow the orbits of
 * random points c that escape, and count every point z they pass through. The counts,
 * kept in three channels for orbits that escape within 50, 500 and 5000 steps, make the
 * Nebulabrot: the ghost of where the Mandelbrot set sends the plane.
 */

/** The region of the plane drawn into the histogram. */
export interface Grid {
  cx: number;
  cy: number;
  /** Width in the plane, and size in pixels. */
  width: number;
  w: number;
  h: number;
}

/** Escape limits of the three channels, largest first: the first is the length of the orbits. */
export const LIMITS: [number, number, number] = [5000, 500, 50];

/** True inside the main cardioid or the disc of period 2, whose orbits never escape. */
export function inBulbs(x: number, y: number): boolean {
  const q = (x - 0.25) * (x - 0.25) + y * y;
  if (q * (q + (x - 0.25)) <= 0.25 * y * y) return true;
  return (x + 1) * (x + 1) + y * y <= 1 / 16;
}

/**
 * Follow `count` random points of the box around the set, and add the orbits of those
 * that escape to `hist` (three counts per pixel, in the order of LIMITS). Returns the
 * number of orbits drawn.
 */
export function sampleOrbits(grid: Grid, count: number, rng: () => number, hist: Uint32Array, limits = LIMITS): number {
  const s = grid.width / grid.w;
  const x0 = grid.cx - grid.width / 2;
  const y0 = grid.cy + (s * grid.h) / 2;
  const longest = limits[0];
  let drawn = 0;
  for (let k = 0; k < count; k++) {
    const cr = -2.1 + 2.7 * rng();
    const ci = -1.3 + 2.6 * rng();
    if (inBulbs(cr, ci)) continue;
    let x = 0;
    let y = 0;
    let n = 0;
    while (n < longest && x * x + y * y <= 16) {
      const nx = x * x - y * y + cr;
      y = 2 * x * y + ci;
      x = nx;
      n++;
    }
    if (n >= longest) continue;
    drawn++;
    // Which channels this orbit belongs to: those whose limit it escaped within.
    const c1 = n <= limits[1] ? 1 : 0;
    const c2 = n <= limits[2] ? 1 : 0;
    x = 0;
    y = 0;
    for (let i = 0; i < n; i++) {
      const nx = x * x - y * y + cr;
      y = 2 * x * y + ci;
      x = nx;
      const px = Math.floor((x - x0) / s);
      const py = Math.floor((y0 - y) / s);
      if (px < 0 || py < 0 || px >= grid.w || py >= grid.h) continue;
      const j = 3 * (py * grid.w + px);
      hist[j]++;
      hist[j + 1] += c1;
      hist[j + 2] += c2;
    }
  }
  return drawn;
}
