import type { PlayerShape } from "@couchcade/theme";

/**
 * The eight player shapes as SVG geometry in a 24×24 box, drawn with a `-2 -2 28 28` viewBox so
 * the outline never clips. Same geometry as the approved platform screens canvas.
 */
export const shapeGeometry = {
  circle: { tag: "circle", attrs: { cx: 12, cy: 12, r: 9.8 } },
  square: { tag: "rect", attrs: { x: 2.8, y: 2.8, width: 18.4, height: 18.4, rx: 2.5 } },
  triangle: { tag: "path", attrs: { d: "M12 2.2 L22.4 20.8 H1.6 Z" } },
  diamond: { tag: "path", attrs: { d: "M12 1.2 L22.8 12 L12 22.8 L1.2 12 Z" } },
  star: {
    tag: "path",
    attrs: {
      d: "M12 1.6 L14.88 8.84 L22.65 9.34 L16.66 14.31 L18.58 21.86 L12 17.7 L5.42 21.86 L7.34 14.31 L1.35 9.34 L9.12 8.84 Z",
    },
  },
  hexagon: {
    tag: "path",
    attrs: { d: "M12 1.2 L21.35 6.6 L21.35 17.4 L12 22.8 L2.65 17.4 L2.65 6.6 Z" },
  },
  heart: {
    tag: "path",
    attrs: {
      d: "M12 21.6 C4 16 1.4 12 1.4 8.2 C1.4 4.8 3.9 2.4 7 2.4 C9.2 2.4 11 3.7 12 5.6 C13 3.7 14.8 2.4 17 2.4 C20.1 2.4 22.6 4.8 22.6 8.2 C22.6 12 20 16 12 21.6 Z",
    },
  },
  plus: {
    tag: "path",
    attrs: { d: "M8.4 1.4 H15.6 V8.4 H22.6 V15.6 H15.6 V22.6 H8.4 V15.6 H1.4 V8.4 H8.4 Z" },
  },
} as const satisfies Record<
  PlayerShape,
  { tag: "circle" | "rect" | "path"; attrs: Record<string, string | number> }
>;
