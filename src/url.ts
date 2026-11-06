import { clampWidth, type View } from "./math/view";

/** What a shared link restores. */
export interface Shared {
  view: View;
  palette: string;
  density: number;
  offset: number;
  detail: number;
}

const num = (s: string | null, fallback: number) => {
  const v = s === null ? NaN : Number(s);
  return Number.isFinite(v) ? v : fallback;
};

export function encode(s: Shared): string {
  const q = new URLSearchParams({
    re: s.view.cx.toPrecision(17),
    im: s.view.cy.toPrecision(17),
    w: s.view.width.toExponential(6),
    pal: s.palette,
    den: s.density.toFixed(3),
    off: s.offset.toFixed(3),
    det: s.detail.toFixed(3),
  });
  return `#${q.toString()}`;
}

export function decode(hash: string, defaults: Shared): Shared {
  const q = new URLSearchParams(hash.replace(/^#/, ""));
  if (!q.has("re") || !q.has("im") || !q.has("w")) return defaults;
  return {
    view: {
      cx: num(q.get("re"), defaults.view.cx),
      cy: num(q.get("im"), defaults.view.cy),
      width: clampWidth(num(q.get("w"), defaults.view.width)),
    },
    palette: q.get("pal") ?? defaults.palette,
    density: num(q.get("den"), defaults.density),
    offset: num(q.get("off"), defaults.offset),
    detail: num(q.get("det"), defaults.detail),
  };
}
