import { array, assert, double, integer, nat, property, record, tuple } from "fast-check";
import { describe, expect, it } from "vitest";
import { circleBody, stepWorld, wallLoop } from "@couchcade/physics";
import type { BodyState, Push, StepResult, WorldSpec } from "@couchcade/physics";
import { run, scenes } from "./scenes.ts";

const STEPS = 600;

/**
 * Every number as its exact shortest decimal, with the sign of zero kept. Two fingerprints are
 * equal only when every double is bit-for-bit the same.
 */
function exact(bodies: readonly BodyState[]): string[][] {
  return bodies.map((body) => [
    body.id,
    ...[body.x, body.y, body.vx, body.vy, body.a, body.w].map((value) =>
      Object.is(value, -0) ? "-0" : String(value),
    ),
  ]);
}

describe.each(Object.entries(scenes))("the %s scene", (_name, makeScene) => {
  it("gives identical final positions when the same inputs run twice", () => {
    const first = run(makeScene(), STEPS);
    const second = run(makeScene(), STEPS);
    expect(exact(second)).toStrictEqual(exact(first));
  });

  it("gives identical results when the state round-trips through JSON every step", () => {
    expect(exact(run(makeScene(), STEPS, true))).toStrictEqual(exact(run(makeScene(), STEPS)));
  });

  it("can stop half way, save to JSON and carry on to the same end", () => {
    const scene = makeScene();
    const saved = JSON.stringify(run(scene, STEPS / 2));
    let bodies = JSON.parse(saved) as BodyState[];
    for (let tick = STEPS / 2; tick < STEPS; tick++) {
      bodies = stepWorld(scene.spec, bodies, scene.pushes(tick, bodies)).bodies;
    }
    expect(exact(bodies)).toStrictEqual(exact(run(makeScene(), STEPS)));
  });

  it("really moves and collides bodies, so the determinism checks compare something", () => {
    const scene = makeScene();
    let end = scene.bodies;
    let collisions = 0;
    for (let tick = 0; tick < STEPS; tick++) {
      const result = stepWorld(scene.spec, end, scene.pushes(tick, end));
      end = result.bodies;
      collisions += result.contacts.length;
    }
    expect(collisions).toBeGreaterThan(0);
    const moved = end.filter((body, i) => {
      const start = scene.bodies[i] as BodyState;
      return Math.hypot(body.x - start.x, body.y - start.y) > 0.1;
    });
    expect(moved.length).toBeGreaterThan(0);
  });
});

describe("stepWorld purity", () => {
  it("doesn't depend on what ran before it in the same process", () => {
    const scene = scenes.bowling();
    const midway = run(scene, 50);
    const fresh = stepWorld(scene.spec, midway, scene.pushes(50, midway));
    run(scenes.sumo(), 200);
    run(scenes.artillery(), 200);
    const later = stepWorld(scene.spec, midway, scene.pushes(50, midway));
    expect(exact(later.bodies)).toStrictEqual(exact(fresh.bodies));
    expect(later.contacts).toStrictEqual(fresh.contacts);
  });

  it("doesn't depend on the order of the bodies array", () => {
    const scene = scenes.sumo();
    const bodies = run(scene, 30);
    const pushes = scene.pushes(30, bodies);
    const forward = stepWorld(scene.spec, bodies, pushes);
    const reversed = stepWorld(scene.spec, bodies.toReversed(), pushes);
    expect(exact(reversed.bodies.toReversed())).toStrictEqual(exact(forward.bodies));
    expect(reversed.contacts).toStrictEqual(forward.contacts);
  });

  it("never mutates its arguments", () => {
    const scene = scenes.bowling();
    const pushes = scene.pushes(0, scene.bodies);
    const before = structuredClone({ spec: scene.spec, bodies: scene.bodies, pushes });
    stepWorld(scene.spec, scene.bodies, pushes);
    expect({ spec: scene.spec, bodies: scene.bodies, pushes }).toStrictEqual(before);
  });
});

const finite = (min: number, max: number) =>
  double({ min, max, noNaN: true, noDefaultInfinity: true });

const randomWorld = record({
  gravity: tuple(finite(-20, 20), finite(-20, 20)),
  bodies: array(
    record({
      x: finite(1, 19),
      y: finite(1, 9),
      vx: finite(-20, 20),
      vy: finite(-20, 20),
      a: finite(-Math.PI, Math.PI),
      w: finite(-20, 20),
      radius: finite(0.1, 0.8),
      restitution: finite(0, 1),
      damping: finite(0, 5),
    }),
    { minLength: 1, maxLength: 8 },
  ),
  pushes: array(tuple(nat(7), finite(-50, 50), finite(-50, 50)), { maxLength: 12 }),
  steps: integer({ min: 1, max: 60 }),
});

const box = wallLoop(
  [
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
  ],
  { restitution: 0.5 },
);

describe("determinism over random worlds (property)", () => {
  it("gives identical results across runs and JSON round trips", () => {
    assert(
      property(randomWorld, (input) => {
        const spec: WorldSpec = { gravity: input.gravity, walls: [box], bodies: {} };
        const start: BodyState[] = input.bodies.map((b, i) => {
          const id = `b${i}`;
          const { radius, restitution, damping } = b;
          spec.bodies[id] = circleBody({ radius, restitution, damping });
          return { id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, a: b.a, w: b.w };
        });
        const pushes: Push[] = input.pushes
          .filter(([index]) => index < start.length)
          .map(([index, fx, fy]) => ({ id: `b${index}`, fx, fy }));

        const simulate = (roundTrip: boolean): StepResult => {
          let result: StepResult = { bodies: start, contacts: [] };
          for (let i = 0; i < input.steps; i++) {
            result = stepWorld(spec, result.bodies, pushes);
            if (roundTrip) result = JSON.parse(JSON.stringify(result)) as StepResult;
          }
          return result;
        };

        const first = simulate(false);
        const again = simulate(false);
        const restored = simulate(true);
        expect(exact(again.bodies)).toStrictEqual(exact(first.bodies));
        expect(exact(restored.bodies)).toStrictEqual(exact(first.bodies));
        expect(again.contacts).toStrictEqual(first.contacts);
        expect(restored.contacts).toStrictEqual(first.contacts);
      }),
      { numRuns: 100 },
    );
  });
});
