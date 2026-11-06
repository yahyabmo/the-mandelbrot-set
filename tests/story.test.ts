import { describe, expect, it } from "vitest";
import { readPoint } from "../src/math/atlas";
import { MIN_WIDTH } from "../src/math/view";
import { PALETTES } from "../src/color/palettes";
import { CHAPTERS, numeral, type StoryContext } from "../src/story/chapters";

/** What the story would see with the pointer at c. */
function at(re: number, im: number, extra: Partial<StoryContext> = {}): StoryContext {
  return {
    sight: { pointing: true, c: [re, im], reading: readPoint(re, im, 4000), picks: 0 },
    reference: "none",
    width: 1,
    ...extra,
  };
}

const task = (id: string) => CHAPTERS.find((c) => c.id === id)!.task!;

describe("the odyssey", () => {
  it("has eight chapters with unique names, reachable views and known palettes", () => {
    expect(CHAPTERS).toHaveLength(8);
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(8);
    for (const c of CHAPTERS) {
      expect(c.view.width).toBeGreaterThanOrEqual(MIN_WIDTH);
      expect(c.height).toBeGreaterThan(0);
      if (c.palette) expect(PALETTES.some((p) => p.id === c.palette)).toBe(true);
      expect(c.body.length).toBeGreaterThan(0);
    }
    expect(numeral(7)).toBe("VIII");
  });

  it("only uses emphasis and exponents in its text", () => {
    for (const c of CHAPTERS) for (const p of c.body) expect(p.replace(/<\/?(em|sup)>/g, "")).not.toMatch(/[<>]/);
  });

  it("knows when an orbit stays bounded", () => {
    expect(task("rule").done(at(0.5, 0.5), {})).toBe(false);
    expect(task("rule").done(at(-0.1, 0.1), {})).toBe(true);
    // Not from the centre of the view: the reader has to point.
    const centre = at(-0.1, 0.1);
    centre.sight.pointing = false;
    expect(task("rule").done(centre, {})).toBe(false);
  });

  it("needs the boundary crossed from outside to inside", () => {
    const m = {};
    expect(task("julia").done(at(-0.1, 0.1), m)).toBe(false);
    expect(task("julia").done(at(0.5, 0.5), m)).toBe(false);
    expect(task("julia").done(at(-0.1, 0.1), m)).toBe(true);
  });

  it("recognises a bulb of period 5 and the period of the copy", () => {
    // The 2/5 bulb, above the left of the cardioid.
    expect(task("bulbs").done(at(-0.5043, 0.5628), {})).toBe(true);
    expect(task("bulbs").done(at(-0.1226, 0.7449), {})).toBe(false);
    expect(task("copies").done(at(-1.7549, 0), {})).toBe(true);
    expect(task("copies").done(at(-0.1226, 0.7449), {})).toBe(false);
  });

  it("waits for a pick in Lavaurs' diagram made during the chapter", () => {
    const m = {};
    const before = at(0, 0);
    before.sight.picks = 2;
    expect(task("rays").done(before, m)).toBe(false);
    before.sight.picks = 3;
    expect(task("rays").done(before, m)).toBe(true);
  });

  it("finds the neck of seahorse valley", () => {
    expect(task("pi").done(at(-0.75, 0.005), {})).toBe(true);
    expect(task("pi").done(at(-0.7, 0.1), {})).toBe(false);
  });

  it("waits for the deep reference", () => {
    expect(task("dive").done(at(0, 0, { width: 3e-18, reference: "waiting" }), {})).toBe(false);
    expect(task("dive").done(at(0, 0, { width: 3e-18, reference: 125 }), {})).toBe(true);
  });
});
