/**
 * A placeholder course: nine mechanically generated, identical-shape flat greens, so `init` and
 * `onTick` can play a whole match end to end (the game contract's `init(players, seed)` has no
 * room for a course argument, so the rules need *some* concrete `Hole[]` to run against).
 *
 * **This is not game design.** Every hole here is the same plain rectangle with no hazards and no
 * banks — nothing about which walls go where, which is deliberately CC-13.8's job, not this
 * story's (docs/games/putt-club.md, "The hole data shape"). CC-13.8 replaces this file's `course`
 * with the nine real holes designed inside `shared/holes/`; nothing else in `shared/` needs to
 * change, because every rule here is written against the generic `Hole` shape.
 *
 * The par pattern (six par-2s, three par-3s, course par 21) matches the spec's own timing model
 * ("Stroke flow and timings", the worked stroke table), so CC-13.2's own tests stay honest against
 * the numbers the spec documents.
 */
import { CAPTURE_RADIUS_MIN_M, holeCount } from "./constants.ts";
import type { Hole } from "./hole.ts";

/** Every third hole (3, 6, 9) is a par 3; the rest are par 2 (six par-2s, three par-3s). */
function parFor(id: number): number {
  return id % 3 === 0 ? 3 : 2;
}

/** A plain rectangle: a wall loop around `bounds`, the tee at the near end, the cup at the far. */
function placeholderHole(id: number): Hole {
  const par = parFor(id);
  const length = par === 3 ? 5 : 3;
  const width = 2;
  const margin = 0.3;
  return {
    id,
    name: `Hole ${id}`,
    par,
    tee: [margin, width / 2],
    cup: [length - margin, width / 2],
    captureRadius: CAPTURE_RADIUS_MIN_M + 0.03,
    walls: [
      {
        points: [
          [0, 0],
          [length, 0],
          [length, width],
          [0, width],
        ],
        loop: true,
      },
    ],
    hazards: [],
    bounds: [
      [0, 0],
      [length, width],
    ],
  };
}

/** The nine holes `init` and `onTick` play, in order. See this file's own doc comment. */
export const course: readonly Hole[] = Array.from({ length: holeCount }, (_, i) =>
  placeholderHole(i + 1),
);
