import { describe, expect, it } from "vitest";
import {
  circleBody,
  floorFriction,
  stepWorld,
  wallLoop,
  wallPath,
  wallSegment,
} from "@couchcade/physics";
import type { BodySpec, BodyState, Point, WallSpec, WorldSpec } from "@couchcade/physics";
import { at } from "./scenes.ts";

function simulate(spec: WorldSpec, bodies: BodyState[], steps: number): BodyState[] {
  let current = bodies;
  for (let i = 0; i < steps; i++) current = stepWorld(spec, current, []).bodies;
  return current;
}

const floor = (options: Parameters<typeof wallSegment>[2] = {}): WallSpec =>
  wallSegment([-50, 0], [50, 0], options);

describe("circleBody", () => {
  it("fills in defaults", () => {
    expect(circleBody({ radius: 0.3 })).toEqual({
      shape: "circle",
      radius: 0.3,
      density: 1,
      friction: 0.2,
      restitution: 0,
      linearDamping: 0,
      angularDamping: 0,
      bullet: false,
    });
  });

  it("uses damping for both linear and angular damping unless angular is given", () => {
    expect(circleBody({ radius: 1, damping: 2 })).toMatchObject({
      linearDamping: 2,
      angularDamping: 2,
    });
    expect(circleBody({ radius: 1, damping: 2, angularDamping: 0.5 })).toMatchObject({
      linearDamping: 2,
      angularDamping: 0.5,
    });
  });

  it("gets its mass from density and radius", () => {
    const heavy = circleBody({ radius: 0.5, density: 4 });
    const spec: WorldSpec = { gravity: [0, 0], walls: [], bodies: { a: heavy } };
    const [pushed] = stepWorld(spec, [at("a", 0, 0)], [{ id: "a", fx: 60, fy: 0 }]).bodies;
    expect(pushed?.vx).toBeCloseTo(60 / (4 * Math.PI * 0.25) / 60, 12);
  });

  it("collides at its radius: a dropped ball comes to rest on the floor", () => {
    const spec: WorldSpec = {
      gravity: [0, -9.8],
      walls: [floor()],
      bodies: { a: circleBody({ radius: 0.4 }) },
    };
    const [rested] = simulate(spec, [at("a", 0, 3)], 180);
    expect(rested?.y).toBeCloseTo(0.4, 1);
    expect(Math.abs(rested?.vy ?? 1)).toBeLessThan(0.05);
  });

  it.each([
    [{ radius: 0 }, /radius/],
    [{ radius: -1 }, /radius/],
    [{ radius: Number.POSITIVE_INFINITY }, /radius/],
    [{ radius: 1, density: 0 }, /density/],
    [{ radius: 1, friction: -0.1 }, /friction/],
    [{ radius: 1, restitution: Number.NaN }, /restitution/],
    [{ radius: 1, damping: -1 }, /damping/],
  ])("rejects %o", (options, message) => {
    expect(() => circleBody(options)).toThrow(message);
  });
});

describe("walls", () => {
  it("wallSegment is an open two-point wall", () => {
    expect(wallSegment([0, 0], [4, 0], { id: "floor", friction: 0.5, restitution: 0.1 })).toEqual({
      id: "floor",
      points: [
        [0, 0],
        [4, 0],
      ],
      loop: false,
      friction: 0.5,
      restitution: 0.1,
    });
  });

  it("wallPath and wallLoop copy their points and default the material", () => {
    const points: Point[] = [
      [0, 0],
      [4, 0],
      [4, 3],
    ];
    const path = wallPath(points);
    const loop = wallLoop(points);
    points[0] = [9, 9];
    expect(path).toEqual({
      points: [
        [0, 0],
        [4, 0],
        [4, 3],
      ],
      loop: false,
      friction: 0.2,
      restitution: 0,
    });
    expect(loop).toMatchObject({
      points: [
        [0, 0],
        [4, 0],
        [4, 3],
      ],
      loop: true,
    });
    expect(path).not.toHaveProperty("id");
  });

  it("a path blocks a falling body: shells land on terrain", () => {
    const spec: WorldSpec = {
      gravity: [0, -9.8],
      walls: [
        wallPath(
          [
            [0, 2],
            [5, 1],
            [10, 2],
          ],
          { id: "terrain" },
        ),
      ],
      bodies: { shell: circleBody({ radius: 0.2 }) },
    };
    const [landed] = simulate(spec, [at("shell", 5, 6)], 240);
    expect(landed?.y).toBeGreaterThan(1);
    expect(landed?.y).toBeLessThan(1.5);
  });

  it("a loop keeps a fast body in from every side", () => {
    const spec: WorldSpec = {
      gravity: [0, 0],
      walls: [
        wallLoop(
          [
            [0, 0],
            [8, 0],
            [8, 8],
            [0, 8],
          ],
          { restitution: 1 },
        ),
      ],
      bodies: { puck: circleBody({ radius: 0.3, restitution: 1 }) },
    };
    let bodies = [at("puck", 4, 4, 37, -23)];
    for (let i = 0; i < 600; i++) {
      bodies = stepWorld(spec, bodies, []).bodies;
      const [puck] = bodies;
      expect(puck?.x).toBeGreaterThan(0);
      expect(puck?.x).toBeLessThan(8);
      expect(puck?.y).toBeGreaterThan(0);
      expect(puck?.y).toBeLessThan(8);
    }
  });

  it.each([
    ["a path with one point", () => wallPath([[0, 0]]), /at least 2/],
    [
      "a loop with two points",
      () =>
        wallLoop([
          [0, 0],
          [1, 0],
        ]),
      /at least 3/,
    ],
    [
      "points on top of each other",
      () =>
        wallPath([
          [0, 0],
          [0, 0.001],
          [1, 1],
        ]),
      /closer/,
    ],
    [
      "a loop that repeats its first point",
      () =>
        wallLoop([
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ]),
      /closer/,
    ],
    ["a non-finite point", () => wallSegment([0, 0], [Number.NaN, 1]), /finite/],
    ["negative restitution", () => wallSegment([0, 0], [1, 0], { restitution: -1 }), /restitution/],
  ])("rejects %s", (_name, build, message) => {
    expect(build).toThrow(message);
  });
});

describe("friction and restitution", () => {
  function slide(friction: number): BodyState | undefined {
    const spec: WorldSpec = {
      gravity: [0, -9.8],
      walls: [floor({ friction })],
      bodies: { ball: circleBody({ radius: 0.5, friction }) },
    };
    return simulate(spec, [at("ball", 0, 0.5, 5, 0)], 60)[0];
  }

  it("contact friction makes a sliding ball roll and slow down", () => {
    const rough = slide(0.8);
    const smooth = slide(0);
    expect(rough?.w).toBeLessThan(-1);
    expect(smooth?.w).toBe(0);
    expect(rough?.vx).toBeLessThan(smooth?.vx ?? 0);
  });

  it("restitution makes a dropped ball bounce", () => {
    const bounce = (restitution: number): number => {
      const spec: WorldSpec = {
        gravity: [0, -9.8],
        walls: [floor({ restitution })],
        bodies: { ball: circleBody({ radius: 0.5, restitution }) },
      };
      const trace = [];
      let bodies = [at("ball", 0, 3)];
      for (let i = 0; i < 90; i++) {
        bodies = stepWorld(spec, bodies, []).bodies;
        trace.push(bodies[0]?.vy ?? 0);
      }
      return Math.max(...trace);
    };
    expect(bounce(0.9)).toBeGreaterThan(3);
    expect(bounce(0)).toBeLessThan(0.1);
  });
});

describe("floorFriction", () => {
  function speedAfter(spec: BodySpec, ms: number): number {
    const world: WorldSpec = { gravity: [0, 0], walls: [], bodies: { puck: spec } };
    const steps = Math.round(ms / (1000 / 60));
    const [puck] = simulate(world, [at("puck", 0, 0, 3, 4)], steps);
    return Math.hypot(puck?.vx ?? 0, puck?.vy ?? 0);
  }

  it("halves a sliding body's speed every half-life", () => {
    const puck = circleBody({ radius: 0.3, damping: floorFriction(500) });
    expect(speedAfter(puck, 500)).toBeCloseTo(2.5, 9);
    expect(speedAfter(puck, 1000)).toBeCloseTo(1.25, 9);
  });

  it("gives less damping for a longer half-life, and none for Infinity", () => {
    expect(floorFriction(2000)).toBeLessThan(floorFriction(200));
    expect(floorFriction(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it.each([0, -100, Number.NaN])("rejects a half-life of %s", (halfLifeMs) => {
    expect(() => floorFriction(halfLifeMs)).toThrow(/halfLifeMs/);
  });
});
