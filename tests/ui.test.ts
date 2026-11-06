import { describe, expect, it } from "vitest";
import { PLACES } from "../src/places";
import { coordinateText, magnificationHtml, magnificationText, scientificText } from "../src/ui/format";
import { decode, encode, type Shared } from "../src/url";
import { MIN_WIDTH, viewOf } from "../src/math/view";
import { fromDecimal, fromNumber, toNumber } from "../src/math/fixed";
import { PALETTES } from "../src/color/palettes";

const state: Shared = {
  view: viewOf("-1.78780638350855487198076170", "0.00005689075511288150404139", 3.1e-18),
  palette: "turbo-2023",
  density: 1.5,
  offset: 0.25,
  detail: 2,
};

describe("shared links", () => {
  it("restore exactly the same view", () => {
    const back = decode(encode(state), { ...state, palette: "classic" });
    // The link keeps the centre to a thousandth of the width, here far past a double.
    expect(Math.abs(toNumber(back.view.cx - state.view.cx))).toBeLessThan(1e-3 * state.view.width);
    expect(Math.abs(toNumber(back.view.cy - state.view.cy))).toBeLessThan(1e-3 * state.view.width);
    expect(back.view.width / state.view.width).toBeCloseTo(1, 6);
    expect(back.palette).toBe("turbo-2023");
    expect(back.density).toBe(1.5);
  });

  it("ignore a link without a view", () => {
    expect(decode("#pal=ink", state)).toBe(state);
  });

  it("keep a hand-edited link within the reachable depth", () => {
    expect(decode("#re=0&im=0&w=1e-400", state).view.width).toBe(MIN_WIDTH);
  });

  it("fall back on the current centre when a coordinate is unreadable", () => {
    expect(decode("#re=abc&im=0.5&w=0.1", state).view.cx).toBe(state.view.cx);
    expect(decode("#re=abc&im=0.5&w=0.1", state).view.cy).toBe(fromDecimal("0.5"));
  });
});

describe("formatting", () => {
  it("writes small and huge magnifications readably", () => {
    expect(magnificationText(1)).toBe("1.00×");
    expect(magnificationText(240)).toBe("240×");
    expect(magnificationText(2.4e8)).toBe("2.4 × 10⁸");
    expect(magnificationHtml(4.5e290)).toBe("4.5 × 10<sup>290</sup>");
    expect(magnificationHtml(240)).toBe("240×");
  });

  it("writes lengths of the scale bar readably", () => {
    expect(scientificText(0.042)).toBe("0.042");
    expect(scientificText(2.7e-8)).toBe("2.7 × 10⁻⁸");
  });

  it("shows more digits as the view narrows", () => {
    const x = fromNumber(-0.75);
    expect(coordinateText(x, 3.6).length).toBeLessThan(coordinateText(x, 1e-9).length);
    expect(coordinateText(fromNumber(0.5), 1)).toMatch(/^\+/);
  });

  it("cuts very long coordinates short in the readout", () => {
    expect(coordinateText(state.view.cx, 1e-60)).toBe("-1.787806383508554872…");
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
