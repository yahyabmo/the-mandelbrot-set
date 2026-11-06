/**
 * Other worlds: fractals made by rules close to z -> z^2 + c. They are drawn directly in
 * 32-bit floats, without the deep machinery of the Mandelbrot set, so they stop at a
 * magnification of about 10^5.
 */
import { viewOf, type View } from "./math/view";

export interface World {
  id: string;
  name: string;
  /** The rule, as text. */
  rule: string;
  /** Number given to the shader. */
  formula: number;
  /** The power of z in the rule, for the smooth count. */
  power: number;
  home: View;
  /** Height of the whole figure, which the home view keeps in sight on wide screens. */
  height: number;
  /** Narrowest view the floats can draw cleanly. */
  minWidth: number;
  /** Where a second click on the world flies: its most famous view. */
  highlight?: { name: string; view: View; palette?: string };
}

export const WORLDS: World[] = [
  { id: "mandelbrot", name: "Mandelbrot", rule: "z² + c", formula: 0, power: 2, home: viewOf("-0.75", "0", 3.6), height: 2.7, minWidth: 0 },
  // Drawn upside down, as is the custom, so that the ship floats upright.
  { id: "ship", name: "Burning Ship", rule: "(|x| + i|y|)² + c", formula: 1, power: 2, home: viewOf("-0.45", "0.5", 4.2), height: 2.8, minWidth: 4e-5, highlight: { name: "the ship", view: viewOf("-1.757", "0.031", 0.15), palette: "ember" } },
  { id: "tricorn", name: "Tricorn", rule: "z̄² + c", formula: 2, power: 2, home: viewOf("-0.2", "0", 4.2), height: 3.6, minWidth: 4e-5 },
  { id: "cubic", name: "Multibrot 3", rule: "z³ + c", formula: 3, power: 3, home: viewOf("0", "0", 3.4), height: 2.9, minWidth: 4e-5 },
  { id: "quartic", name: "Multibrot 4", rule: "z⁴ + c", formula: 4, power: 4, home: viewOf("-0.1", "0", 3.2), height: 2.8, minWidth: 4e-5 },
];

/** The home view of a world, widened on wide screens so that the figure fits in height. */
export function worldHome(w: World, wPx: number, hPx: number): View {
  return { ...w.home, width: Math.max(w.home.width, (w.height * wPx) / Math.max(1, hPx)) };
}

export function worldById(id: string | null | undefined): World {
  return WORLDS.find((w) => w.id === id) ?? WORLDS[0];
}
