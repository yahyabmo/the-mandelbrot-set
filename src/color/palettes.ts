import { TURBO_HEX } from "./turbo";

export type Rgb = [number, number, number];

export interface Palette {
  id: string;
  name: string;
  /** Iterations for one pass through the colours. */
  period: number;
  /** Go back down through the colours instead of jumping to the first one. */
  mirrored: boolean;
  /** Colour at t in [0, 1), as sRGB in [0, 255]. */
  at(t: number): Rgb;
}

export const TEXELS = 1024;

function hex(h: string): Rgb {
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

const TURBO: Rgb[] = Array.from({ length: TURBO_HEX.length / 6 }, (_, i) => hex(TURBO_HEX.slice(6 * i, 6 * i + 6)));

/** Piecewise-linear gradient through evenly or explicitly placed stops. */
function gradient(stops: [number, string][]): (t: number) => Rgb {
  const parsed = stops.map(([p, h]) => [p, hex(h)] as const);
  return (t) => {
    for (let i = 1; i < parsed.length; i++) {
      const [p1, c1] = parsed[i];
      const [p0, c0] = parsed[i - 1];
      if (t <= p1) {
        const k = (t - p0) / (p1 - p0 || 1);
        return [0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k) as Rgb;
      }
    }
    return parsed[parsed.length - 1][1] as Rgb;
  };
}

function sample(table: Rgb[], t: number): Rgb {
  const x = Math.min(table.length - 1.000001, Math.max(0, t * (table.length - 1)));
  const i = Math.floor(x);
  const k = x - i;
  return [0, 1, 2].map((j) => table[i][j] + (table[i + 1][j] - table[i][j]) * k) as Rgb;
}

export const PALETTES: Palette[] = [
  {
    // The colours of the 2023 script: 150 steps of turbo, up and back down.
    id: "turbo-2023",
    name: "Turbo 2023",
    period: 150,
    mirrored: true,
    at: (t) => sample(TURBO, t),
  },
  {
    id: "classic",
    name: "Classic",
    period: 96,
    mirrored: false,
    at: gradient([
      [0, "000764"],
      [0.16, "206bcb"],
      [0.42, "edffff"],
      [0.6425, "ffaa00"],
      [0.8575, "000200"],
      [1, "000764"],
    ]),
  },
  {
    id: "ember",
    name: "Ember",
    period: 140,
    mirrored: true,
    at: gradient([
      [0, "050106"],
      [0.25, "3b0a2a"],
      [0.5, "b3261e"],
      [0.75, "f59e0b"],
      [1, "fff4d6"],
    ]),
  },
  {
    id: "glacier",
    name: "Glacier",
    period: 140,
    mirrored: true,
    at: gradient([
      [0, "02040f"],
      [0.3, "0b2a5b"],
      [0.6, "1f8fb3"],
      [0.85, "9ee9f0"],
      [1, "ffffff"],
    ]),
  },
  {
    id: "aurora",
    name: "Aurora",
    period: 120,
    mirrored: true,
    at: gradient([
      [0, "02060f"],
      [0.3, "0b4f6c"],
      [0.58, "20bf8a"],
      [0.82, "b9f5c9"],
      [1, "f4efff"],
    ]),
  },
  {
    id: "nebula",
    name: "Nebula",
    period: 150,
    mirrored: true,
    at: gradient([
      [0, "05030d"],
      [0.3, "3a0f5c"],
      [0.56, "a12a87"],
      [0.8, "f07c5a"],
      [1, "ffe8b0"],
    ]),
  },
  {
    id: "ink",
    name: "Ink",
    period: 80,
    mirrored: true,
    at: gradient([
      [0, "f6f1e7"],
      [0.55, "6b6257"],
      [1, "0b0a09"],
    ]),
  },
];

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/** The palette as RGBA8 texels, sRGB: the GPU turns them to linear light when sampling. */
export function paletteTexels(p: Palette): Uint8Array {
  const out = new Uint8Array(TEXELS * 4);
  for (let i = 0; i < TEXELS; i++) {
    const [r, g, b] = p.at(i / TEXELS);
    out.set([Math.round(r), Math.round(g), Math.round(b), 255], 4 * i);
  }
  return out;
}

/** Where a continuous iteration count falls in the palette, the same rule as the shader. */
export function paletteCoordinate(value: number, period: number, offset: number, mirrored: boolean): number {
  const t = value / period + offset;
  if (!mirrored) return t - Math.floor(t);
  const u = (t / 2 - Math.floor(t / 2)) * 2;
  return u < 1 ? u : 2 - u;
}

/** A CSS gradient preview of the palette. */
export function paletteCss(p: Palette, steps = 24): string {
  const stops = Array.from({ length: steps + 1 }, (_, i) => {
    const [r, g, b] = p.at(Math.min(0.999, i / steps));
    return `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)}) ${((100 * i) / steps).toFixed(1)}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}
