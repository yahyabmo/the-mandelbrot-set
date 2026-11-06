import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf-8");

describe("the page", () => {
  it("keeps hidden elements hidden whatever their layout rule", () => {
    // Without it, the hidden error screen covered the canvas and took every click and scroll.
    expect(css).toMatch(/\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });
});
