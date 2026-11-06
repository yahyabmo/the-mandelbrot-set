import { viewOf, type View } from "./math/view";

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
    view: viewOf("-0.7453", "0.1127", 0.012),
  },
  {
    id: "spiral",
    name: "Seahorse spiral",
    blurb: "A double spiral, 10⁵ times closer",
    view: viewOf("-0.743643887037151", "0.13182590420533", 4e-5),
  },
  {
    id: "elephants",
    name: "Elephant valley",
    blurb: "Trunks along the right-hand cusp",
    view: viewOf("0.2826", "0.0095", 0.024),
  },
  {
    id: "minibrot",
    name: "A copy of itself",
    blurb: "The period-3 minibrot on the real axis",
    view: viewOf("-1.7548776662466927", "0", 0.042),
  },
  {
    id: "dendrite",
    name: "The dendrite at c = i",
    blurb: "A Misiurewicz point: branches without bulbs",
    view: viewOf("0", "1", 0.3),
  },
  {
    id: "lightning",
    name: "Lightning",
    blurb: "Antennas around a bulb above the top one",
    view: viewOf("-0.1592", "1.0317", 0.02),
  },
  {
    id: "dive-2023",
    name: "The 2023 dive",
    blurb: "The point of the original script, 10⁹ deep",
    // The centre of the 2023 script, to its 27 digits.
    view: viewOf("-1.78780638350855487198076170", "0.00005689075511288150404139", 4e-9),
    palette: "turbo-2023",
  },
];
