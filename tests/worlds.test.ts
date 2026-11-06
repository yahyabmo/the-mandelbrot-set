import { describe, expect, it } from "vitest";
import { decode, encode } from "../src/url";
import { viewOf } from "../src/math/view";
import { WORLDS, worldById, worldHome } from "../src/worlds";

describe("other worlds", () => {
  it("have unique names and distinct rules", () => {
    expect(new Set(WORLDS.map((w) => w.id)).size).toBe(WORLDS.length);
    expect(new Set(WORLDS.map((w) => w.formula)).size).toBe(WORLDS.length);
    expect(worldById("nowhere")).toBe(WORLDS[0]);
  });

  it("keep the whole figure in height on wide screens", () => {
    const ship = worldById("ship");
    const v = worldHome(ship, 1920, 1080);
    expect((v.width * 1080) / 1920).toBeGreaterThanOrEqual(ship.height - 1e-12);
  });

  it("travel in shared links, and the Mandelbrot set stays the default", () => {
    const shared = { view: viewOf("-1.762", "0.028", 0.05), palette: "ember", density: 1, offset: 0, detail: 1, world: "ship" };
    expect(decode(encode(shared), { ...shared, world: "mandelbrot" }).world).toBe("ship");
    expect(encode({ ...shared, world: "mandelbrot" })).not.toMatch(/[&#]f=/);
  });
});
