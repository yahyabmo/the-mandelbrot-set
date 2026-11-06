import { describe, expect, it } from "vitest";
import { PLACES } from "../src/places";
import { coordinateText, magnificationText } from "../src/ui/format";
import { decode, encode, type Shared } from "../src/url";
import { MIN_WIDTH } from "../src/math/view";
import { PALETTES } from "../src/color/palettes";

const state: Shared = {
  view: { cx: -1.787806383508555, cy: 0.0000568907551128815, width: 4e-9 },
  palette: "turbo-2023",
  density: 1.5,
  offset: 0.25,
  detail: 2,
};

describe("shared links", () => {
  it("restore exactly the same view", () => {
    const back = decode(encode(state), { ...state, palette: "classic" });
    expect(back.view.cx).toBe(state.view.cx);
    expect(back.view.cy).toBe(state.view.cy);
    expect(back.view.width).toBeCloseTo(state.view.width, 15);
    expect(back.palette).toBe("turbo-2023");
    expect(back.density).toBe(1.5);
  });

  it("ignore a link without a view", () => {
    expect(decode("#pal=ink", state)).toBe(state);
  });

  it("keep a hand-edited link within the reachable depth", () => {
    expect(decode("#re=0&im=0&w=1e-30", state).view.width).toBe(MIN_WIDTH);
  });
});

describe("formatting", () => {
  it("writes small and huge magnifications readably", () => {
    expect(magnificationText(1)).toBe("1.00×");
    expect(magnificationText(240)).toBe("240×");
    expect(magnificationText(2.4e8)).toBe("2.4 × 10⁸");
  });

  it("shows more digits as the view narrows", () => {
    expect(coordinateText(-0.75, 3.6).length).toBeLessThan(coordinateText(-0.75, 1e-9).length);
    expect(coordinateText(0.5, 1)).toMatch(/^\+/);
  });
});

describe("places", () => {
  it("have unique names and known palettes", () => {
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
    for (const p of PLACES) if (p.palette) expect(PALETTES.some((q) => q.id === p.palette)).toBe(true);
  });

  it("stay within the depth this version reaches", () => {
    for (const p of PLACES) if (p.view !== "home") expect(p.view.width).toBeGreaterThanOrEqual(MIN_WIDTH);
  });
});
