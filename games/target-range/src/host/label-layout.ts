import { SHAPE_SIZE } from "@couchcade/stage/draw";

/**
 * Where the player shapes next to stuck arrows go, and where the points tags under the
 * scoreboard go, so that with 8 players nothing covers anything else (docs/games/target-range.md,
 * "Readability with 8 crosshairs": colour is never the only cue, so every shape must stay visible).
 */

/** An axis-aligned box. `right` and `bottom` are exclusive. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** True when the boxes are closer than `gap`. Boxes that only touch don't overlap. */
export function overlaps(a: Box, b: Box, gap = 0): boolean {
  return (
    a.left < b.right + gap &&
    b.left < a.right + gap &&
    a.top < b.bottom + gap &&
    b.top < a.bottom + gap
  );
}

function overlapArea(a: Box, b: Box): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * The box a stuck arrow's stub keeps clear, centred on its landing pixel. The stub sprite's 4×4
 * square (world.ts) covers the landing pixel and the pixels up and left of it, inside this box.
 */
export const stubSize = 5;

export function stubBox(x: number, y: number): Box {
  const half = Math.floor(stubSize / 2);
  return { left: x - half, top: y - half, right: x - half + stubSize, bottom: y - half + stubSize };
}

/**
 * Top-left corners to try for a shape next to a stub centred on (0, 0), nearest first: touching
 * the stub at the top right (the crosshair's corner), then the other corners and sides, then the
 * same spots one shape further out.
 */
const shapeOffsets: readonly (readonly [number, number])[] = (() => {
  const half = Math.floor(stubSize / 2);
  /** Touching the stub on its right or bottom side. */
  const after = half + 1;
  /** Touching the stub on its left or top side. */
  const before = -half - SHAPE_SIZE;
  /** Centred on the stub. */
  const centred = -Math.floor(SHAPE_SIZE / 2);
  const ring = (reach: number): [number, number][] => [
    [after + reach, before - reach],
    [before - reach, before - reach],
    [after + reach, after + reach],
    [before - reach, after + reach],
    [after + reach, centred],
    [before - reach, centred],
    [centred, before - reach],
    [centred, after + reach],
  ];
  return [...ring(0), ...ring(SHAPE_SIZE), ...ring(2 * SHAPE_SIZE)];
})();

/**
 * Places the shape of each newest arrow next to its stub, in the order given (seat order). A
 * shape takes the first spot that covers no stub and no shape placed before it and stays inside
 * `bounds`. When every spot is taken, it takes the one that covers the least. `stubs` are every
 * stub on the target, the newest ones included, so no shape ever hides where an arrow landed.
 */
export function placeShapes(
  newest: readonly { x: number; y: number }[],
  stubs: readonly { x: number; y: number }[],
  bounds: Box,
): Box[] {
  const stubBoxes = stubs.map((stub) => stubBox(stub.x, stub.y));
  const placed: Box[] = [];
  for (const arrow of newest) {
    let best: { box: Box; cost: number } | null = null;
    for (const [dx, dy] of shapeOffsets) {
      const box = {
        left: arrow.x + dx,
        top: arrow.y + dy,
        right: arrow.x + dx + SHAPE_SIZE,
        bottom: arrow.y + dy + SHAPE_SIZE,
      };
      const inside =
        box.left >= bounds.left &&
        box.top >= bounds.top &&
        box.right <= bounds.right &&
        box.bottom <= bounds.bottom;
      if (!inside) continue;
      const cost = [...stubBoxes, ...placed].reduce(
        (sum, other) => sum + overlapArea(box, other),
        0,
      );
      if (best === null || cost < best.cost) best = { box, cost };
      if (cost === 0) break;
    }
    const [dx, dy] = shapeOffsets[0] as readonly [number, number];
    placed.push(
      best?.box ?? {
        left: arrow.x + dx,
        top: arrow.y + dy,
        right: arrow.x + dx + SHAPE_SIZE,
        bottom: arrow.y + dy + SHAPE_SIZE,
      },
    );
  }
  return placed;
}

/** A tag to place below something: centred on `x`, with its top at `top` or lower. */
export interface TagRequest {
  x: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Places tags left to right. A tag starts at its `top` and moves down a row at a time until it
 * keeps `gap` from every tag placed before it. Returns each tag's box, in the order given.
 */
export function placeTagsBelow(
  requests: readonly (TagRequest | null)[],
  gap: number,
): (Box | null)[] {
  const placed: (Box | null)[] = requests.map(() => null);
  const boxes: Box[] = [];
  const order = requests
    .map((request, index) => ({ request, index }))
    .filter((entry): entry is { request: TagRequest; index: number } => entry.request !== null)
    .toSorted((a, b) => a.request.x - b.request.x || a.index - b.index);
  for (const { request, index } of order) {
    const left = request.x - Math.round(request.width / 2);
    let top = request.top;
    let box: Box = { left, top, right: left + request.width, bottom: top + request.height };
    for (;;) {
      const hits = boxes.filter((other) => overlaps(box, other, gap));
      if (hits.length === 0) break;
      top = Math.max(...hits.map((hit) => hit.bottom)) + gap;
      box = { left, top, right: left + request.width, bottom: top + request.height };
    }
    boxes.push(box);
    placed[index] = box;
  }
  return placed;
}
