import { HOME_WIDTH } from "./view";

export const MIN_ITERATIONS = 64;
export const MAX_ITERATIONS = 50000;

/** More detail appears as we go deeper: the limit grows with the number of halvings. */
export function autoIterations(width: number, factor = 1): number {
  const halvings = Math.max(0, Math.log2(HOME_WIDTH / width));
  const n = (300 + 90 * halvings) * factor;
  return Math.round(Math.min(MAX_ITERATIONS, Math.max(MIN_ITERATIONS, n)));
}
