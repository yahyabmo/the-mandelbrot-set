import { describe, expect, it } from "vitest";
import { orbitOf } from "../src/math/atlas";
import { noteOf } from "../src/senses/sound";

describe("the sound of orbits", () => {
  it("plays a cycle of period 3 as a loop of three notes", () => {
    // The nucleus of the bulb of period 3 at the top of the set.
    const o = orbitOf(-0.12256116687665, 0.74486176661974, 400);
    const notes = Array.from({ length: 9 }, (_, k) => noteOf(o.points[2 * (300 + k)], o.points[2 * (300 + k) + 1]).hz);
    expect(notes.slice(3, 6)).toEqual(notes.slice(0, 3));
    expect(notes.slice(6, 9)).toEqual(notes.slice(0, 3));
    expect(new Set(notes.slice(0, 3)).size).toBeGreaterThan(1);
  });

  it("stays in a musical range and pans with the real part", () => {
    for (const [x, y] of [[0, 0.1], [1, 0], [-1.5, 0.3], [3, -3]]) {
      const n = noteOf(x, y);
      expect(n.hz).toBeGreaterThan(90);
      expect(n.hz).toBeLessThan(1200);
      expect(Math.abs(n.pan)).toBeLessThanOrEqual(0.9);
    }
    expect(noteOf(1, 0).pan).toBeGreaterThan(0);
    expect(noteOf(-1, 0).pan).toBeLessThan(0);
  });
});
