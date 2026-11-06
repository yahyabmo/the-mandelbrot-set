import type { View } from "./math/view";

export interface Place {
  id: string;
  name: string;
  blurb: string;
  view: View | "home";
  palette?: string;
}

export const PLACES: Place[] = [
  { id: "home", name: "The whole set", blurb: "z → z² + c, for every c", view: "home" },
  {
    id: "seahorses",
    name: "Seahorse valley",
    blurb: "Between the cardioid and its big bulb",
    view: { cx: -0.7453, cy: 0.1127, width: 0.012 },
  },
  {
    id: "spiral",
    name: "Seahorse spiral",
    blurb: "A double spiral, 10⁵ times closer",
    view: { cx: -0.743643887037151, cy: 0.13182590420533, width: 4e-5 },
  },
  {
    id: "elephants",
    name: "Elephant valley",
    blurb: "Trunks along the right-hand cusp",
    view: { cx: 0.2826, cy: 0.0095, width: 0.024 },
  },
  {
    id: "minibrot",
    name: "A copy of itself",
    blurb: "The period-3 minibrot on the real axis",
    view: { cx: -1.7548776662466927, cy: 0, width: 0.042 },
  },
  {
    id: "dendrite",
    name: "The dendrite at c = i",
    blurb: "A Misiurewicz point: branches without bulbs",
    view: { cx: 0, cy: 1, width: 0.3 },
  },
  {
    id: "lightning",
    name: "Lightning",
    blurb: "Antennas around a bulb above the top one",
    view: { cx: -0.1592, cy: 1.0317, width: 0.02 },
  },
  {
    id: "dive-2023",
    name: "The 2023 dive",
    blurb: "The point of the original script, 10⁹ deep",
    view: { cx: -1.787806383508555, cy: 0.0000568907551128815, width: 4e-9 },
    palette: "turbo-2023",
  },
];
