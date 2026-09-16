import type { PlayerShape } from "@couchcade/theme";

export interface Point {
  x: number;
  y: number;
}

/** `count` points on a circle of `radius`, starting at the top, clockwise. */
function ring(count: number, radius: (i: number) => number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    return { x: Math.cos(angle) * radius(i), y: Math.sin(angle) * radius(i) };
  });
}

/**
 * A player shape as a closed polygon around (0, 0), `radius` world px from the centre to its
 * furthest point. The circle is a 16-gon so every shape draws the same way. Placeholder art until
 * CC-10.8 brings the stage's player shapes.
 */
export function shapePoints(shape: PlayerShape, radius: number): Point[] {
  const r = radius;
  switch (shape) {
    case "circle":
      return ring(16, () => r);
    case "square":
      return [
        { x: -r, y: -r },
        { x: r, y: -r },
        { x: r, y: r },
        { x: -r, y: r },
      ];
    case "triangle":
      return [
        { x: 0, y: -r },
        { x: r, y: r },
        { x: -r, y: r },
      ];
    case "diamond":
      return ring(4, () => r);
    case "star":
      return ring(10, (i) => (i % 2 === 0 ? r : r * 0.45));
    case "hexagon":
      return ring(6, () => r);
    case "heart":
      return Array.from({ length: 20 }, (_, i) => {
        const t = (i * 2 * Math.PI) / 20;
        const x = 16 * Math.sin(t) ** 3;
        const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        return { x: (x / 17) * r, y: (y / 17) * r + r * 0.15 };
      });
    case "plus": {
      const a = r * 0.35;
      return [
        { x: -a, y: -r },
        { x: a, y: -r },
        { x: a, y: -a },
        { x: r, y: -a },
        { x: r, y: a },
        { x: a, y: a },
        { x: a, y: r },
        { x: -a, y: r },
        { x: -a, y: a },
        { x: -r, y: a },
        { x: -r, y: -a },
        { x: -a, y: -a },
      ];
    }
  }
}
