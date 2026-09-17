import { circleBody, floorFriction, stepWorld, wallLoop, wallPath } from "@couchcade/physics";
import type { BodyState, Push, WorldSpec } from "@couchcade/physics";

/** A body at rest at a point. */
export function at(id: string, x: number, y: number, vx = 0, vy = 0): BodyState {
  return { id, x, y, vx, vy, a: 0, w: 0 };
}

export interface Scene {
  spec: WorldSpec;
  bodies: BodyState[];
  /** The pushes for step `tick`, derived only from the tick so a replay gets the same ones. */
  pushes: (tick: number, bodies: readonly BodyState[]) => Push[];
}

/** Top-down bowling lane: a fast bullet ball into ten pins inside a walled lane. */
export function bowlingScene(): Scene {
  const pin = circleBody({
    radius: 0.12,
    density: 3,
    restitution: 0.4,
    damping: floorFriction(700),
  });
  const spec: WorldSpec = {
    gravity: [0, 0],
    walls: [
      wallLoop(
        [
          [0, 0],
          [3, 0],
          [3, 16],
          [0, 16],
        ],
        { id: "lane", restitution: 0.3 },
      ),
    ],
    bodies: {
      ball: circleBody({ radius: 0.22, density: 8, bullet: true, damping: floorFriction(4000) }),
    },
  };
  const bodies: BodyState[] = [at("ball", 1.45, 1, 0.4, 14)];
  let n = 0;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col <= row; col++) {
      const id = `pin-${n++}`;
      spec.bodies[id] = pin;
      bodies.push(at(id, 1.5 + (col - row / 2) * 0.3, 13 + row * 0.26));
    }
  }
  // A curl: a small sideways force on the ball while it rolls, like spin.
  return { spec, bodies, pushes: (tick) => (tick < 40 ? [{ id: "ball", fx: -6, fy: 0 }] : []) };
}

/** Top-down sumo: eight damped balls pushed around an arena with no walls, bumping each other. */
export function sumoScene(): Scene {
  const ball = circleBody({ radius: 0.5, restitution: 0.8, damping: floorFriction(500) });
  const spec: WorldSpec = { gravity: [0, 0], walls: [], bodies: {} };
  const bodies: BodyState[] = [];
  for (let i = 0; i < 8; i++) {
    const id = `p${i + 1}`;
    const angle = (i / 8) * Math.PI * 2;
    spec.bodies[id] = ball;
    bodies.push(at(id, 15 + Math.cos(angle) * 5, 8 + Math.sin(angle) * 5));
  }
  return {
    spec,
    bodies,
    pushes: (tick, current) =>
      current.map((body, i) => {
        const turn = (tick / 60 + i) * 1.3;
        return {
          id: body.id,
          fx: Math.cos(turn) * 9 + (15 - body.x),
          fy: Math.sin(turn) * 9 + (8 - body.y),
        };
      }),
  };
}

/** Side-on artillery: shells under gravity and wind, landing on a hilly terrain line between two cliffs. */
export function artilleryScene(): Scene {
  const shell = circleBody({ radius: 0.15, density: 2, restitution: 0.2, friction: 0.6 });
  const spec: WorldSpec = {
    gravity: [0, -9.8],
    walls: [
      wallPath(
        [
          [0, 20],
          [0, 3],
          [5, 4.5],
          [9, 2],
          [14, 6],
          [20, 3],
          [26, 5],
          [30, 2],
          [30, 20],
        ],
        { id: "terrain", friction: 0.9 },
      ),
    ],
    bodies: { "shell-a": shell, "shell-b": shell },
  };
  return {
    spec,
    bodies: [at("shell-a", 2, 6, 7, 9), at("shell-b", 27, 7, -8, 6)],
    pushes: (_tick, current) => current.map((body) => ({ id: body.id, fx: 0.3, fy: 0 })),
  };
}

export const scenes = { bowling: bowlingScene, sumo: sumoScene, artillery: artilleryScene };

/** Runs a scene for `steps` steps. `roundTrip` sends the state through JSON between every step. */
export function run(scene: Scene, steps: number, roundTrip = false): BodyState[] {
  let bodies = scene.bodies;
  for (let tick = 0; tick < steps; tick++) {
    bodies = stepWorld(scene.spec, bodies, scene.pushes(tick, bodies)).bodies;
    if (roundTrip) bodies = JSON.parse(JSON.stringify(bodies)) as BodyState[];
  }
  return bodies;
}
