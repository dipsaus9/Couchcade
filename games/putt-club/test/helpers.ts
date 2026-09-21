import type { Hole } from "../src/shared/hole.ts";
import { isStrokeSettled, startStroke, stepStroke } from "../src/shared/physics.ts";
import type { ActiveStroke } from "../src/shared/state.ts";

/**
 * A plain rectangular green, generous enough that a test controls exactly what it wants to
 * exercise (a hazard, a kerb bounce, an out-of-bounds edge) through `overrides`. Not one of the
 * nine real holes (CC-13.8's job) — just a fixture for this story's own physics and rules tests.
 */
export function testHole(overrides: Partial<Hole> = {}): Hole {
  return {
    id: 1,
    name: "Test hole",
    par: 3,
    tee: [0, 1],
    cup: [2.6, 1],
    captureRadius: 0.07,
    walls: [
      {
        points: [
          [-1, -1],
          [9, -1],
          [9, 5],
          [-1, 5],
        ],
        loop: true,
      },
    ],
    hazards: [],
    bounds: [
      [-1, -1],
      [9, 5],
    ],
    ...overrides,
  };
}

/** Strikes a stroke and steps it to settled, returning the final `ActiveStroke`. */
export function playStroke(
  hole: Hole,
  options: {
    ball?: [number, number];
    yaw?: number;
    speed: number;
    angle?: number;
  },
): ActiveStroke {
  let stroke = startStroke({
    playerId: "p1",
    hole: hole.id,
    strokeNumber: 1,
    turn: 1,
    auto: false,
    atMs: 0,
    ball: options.ball ?? hole.tee,
    cup: hole.cup,
    yaw: options.yaw ?? 0,
    speed: options.speed,
    angle: options.angle ?? 0,
  });
  let nowMs = 0;
  for (let i = 0; i < 60 * 30 && !isStrokeSettled(stroke, nowMs); i++) {
    nowMs += 1000 / 60;
    stroke = stepStroke(stroke, hole);
  }
  return stroke;
}
