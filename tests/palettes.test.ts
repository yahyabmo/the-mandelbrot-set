import { describe, expect, it } from "vitest";
import { paletteById, paletteCoordinate, paletteTexels, PALETTES, TEXELS } from "../src/color/palettes";

describe("palettes", () => {
  it("fill the whole texture with opaque colours", () => {
    for (const p of PALETTES) {
      const t = paletteTexels(p);
      expect(t.length).toBe(TEXELS * 4);
      for (let i = 3; i < t.length; i += 4) expect(t[i]).toBe(255);
    }
  });

  it("keep the turbo colours of the 2023 script", () => {
    const turbo = paletteById("turbo-2023");
    expect(turbo.mirrored).toBe(true);
    expect(turbo.period).toBe(150);
    expect(turbo.at(0)).toEqual([0x30, 0x12, 0x3b]);
  });

  it("fall back to the first palette for an unknown name", () => {
    expect(paletteById("nope").id).toBe(PALETTES[0].id);
  });

  it("have unique names", () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
  });
});

describe("palette coordinate", () => {
  it("wraps around for a plain palette", () => {
    expect(paletteCoordinate(150, 100, 0, false)).toBeCloseTo(0.5, 12);
  });

  it("goes back down for a mirrored palette, like the 2023 script", () => {
    // 150 steps up, then the same 150 back down.
    expect(paletteCoordinate(75, 150, 0, true)).toBeCloseTo(0.5, 12);
    expect(paletteCoordinate(225, 150, 0, true)).toBeCloseTo(0.5, 12);
    expect(paletteCoordinate(150, 150, 0, true)).toBeCloseTo(1, 12);
  });

  it("shifts with the offset", () => {
    expect(paletteCoordinate(0, 100, 0.25, false)).toBeCloseTo(0.25, 12);
  });
});
