import { describe, expect, it } from "vitest";
import {
  STEP_MS,
  STEP_SECONDS,
  circleBody,
  stepWorld,
  wallLoop,
  wallSegment,
} from "@couchcade/physics";
import type { BodyState, WorldSpec } from "@couchcade/physics";
import { at } from "./scenes.ts";

const ball = circleBody({ radius: 0.5 });
const ballMass = Math.PI * 0.5 ** 2;

function openWorld(ids: string[], gravity: [number, number] = [0, 0]): WorldSpec {
  return { gravity, walls: [], bodies: Object.fromEntries(ids.map((id) => [id, ball])) };
}

function runSteps(spec: WorldSpec, bodies: BodyState[], steps: number) {
  let result = { bodies, contacts: [] as Array<[string, string]> };
  const seen = new Set<string>();
  for (let i = 0; i < steps; i++) {
    result = stepWorld(spec, result.bodies, []);
    for (const pair of result.contacts) seen.add(pair.join("|"));
  }
  return { bodies: result.bodies, seen };
}

describe("stepWorld", () => {
  it("takes one fixed 60 Hz step per call", () => {
    expect(STEP_MS).toBe(1000 / 60);
    expect(STEP_SECONDS).toBe(1 / 60);
    const [moved] = stepWorld(openWorld(["a"]), [at("a", 1, 1, 6, -3)], []).bodies;
    expect(moved?.x).toBeCloseTo(1 + 6 / 60, 12);
    expect(moved?.y).toBeCloseTo(1 - 3 / 60, 12);
  });

  it("applies gravity from the spec", () => {
    const [falling] = stepWorld(openWorld(["a"], [0, -9.8]), [at("a", 0, 10)], []).bodies;
    expect(falling?.vy).toBeCloseTo(-9.8 / 60, 12);
    expect(falling?.vx).toBe(0);
  });

  it("applies each push as a force for one step only", () => {
    const spec = openWorld(["a"]);
    const pushed = stepWorld(spec, [at("a", 0, 0)], [{ id: "a", fx: 30, fy: 0 }]).bodies;
    expect(pushed[0]?.vx).toBeCloseTo(30 / ballMass / 60, 12);
    const coasting = stepWorld(spec, pushed, []).bodies;
    expect(coasting[0]?.vx).toBe(pushed[0]?.vx);
  });

  it("adds up several pushes on the same body", () => {
    const spec = openWorld(["a"]);
    const [twice] = stepWorld(
      spec,
      [at("a", 0, 0)],
      [
        { id: "a", fx: 10, fy: 0 },
        { id: "a", fx: 10, fy: 5 },
      ],
    ).bodies;
    expect(twice?.vx).toBeCloseTo(20 / ballMass / 60, 12);
    expect(twice?.vy).toBeCloseTo(5 / ballMass / 60, 12);
  });

  it("returns bodies in the input order with the same ids", () => {
    const spec = openWorld(["zed", "alpha", "mid"]);
    const result = stepWorld(spec, [at("zed", 0, 0), at("alpha", 5, 0), at("mid", 10, 0)], []);
    expect(result.bodies.map((body) => body.id)).toEqual(["zed", "alpha", "mid"]);
  });

  it("never returns -0, so state survives JSON exactly", () => {
    const [still] = stepWorld(
      openWorld(["a"]),
      [{ id: "a", x: -0, y: -0, vx: -0, vy: -0, a: -0, w: -0 }],
      [],
    ).bodies;
    expect(Object.values(still ?? {}).filter((value) => Object.is(value, -0))).toEqual([]);
    expect(still).toMatchObject({ x: 0, y: 0, vx: 0, vy: 0, a: 0, w: 0 });
  });

  it("keeps bodies inside a wall loop and reports the contact", () => {
    const spec: WorldSpec = {
      gravity: [0, 0],
      walls: [
        wallLoop(
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
          ],
          { id: "arena", restitution: 1 },
        ),
      ],
      bodies: { a: ball },
    };
    const { bodies, seen } = runSteps(spec, [at("a", 5, 5, 30, 0)], 120);
    expect(seen).toContain("a|arena");
    const [end] = bodies;
    expect(end?.x).toBeGreaterThan(0);
    expect(end?.x).toBeLessThan(10);
  });

  it("reports body pairs sorted, with default wall ids by index", () => {
    const spec: WorldSpec = {
      gravity: [0, 0],
      walls: [wallSegment([-5, -5], [-5, 5]), wallSegment([3, -5], [3, 5])],
      bodies: { b: ball, a: ball },
    };
    const result = stepWorld(spec, [at("b", 0.95, 0), at("a", 0, 0)], []);
    expect(result.contacts).toEqual([["a", "b"]]);
    const againstWall = stepWorld(spec, [at("b", 2.6, 0, 10, 0), at("a", -4.6, 0, -10, 0)], []);
    expect(againstWall.contacts).toEqual([
      ["a", "wall:0"],
      ["b", "wall:1"],
    ]);
  });

  it("rejects a body without a spec", () => {
    expect(() => stepWorld(openWorld([]), [at("ghost", 0, 0)], [])).toThrow(/no spec/);
  });

  it("rejects ids used twice, across bodies and walls", () => {
    expect(() => stepWorld(openWorld(["a"]), [at("a", 0, 0), at("a", 3, 0)], [])).toThrow(/twice/);
    const spec: WorldSpec = {
      ...openWorld(["rim"]),
      walls: [wallSegment([0, 0], [1, 0], { id: "rim" })],
    };
    expect(() => stepWorld(spec, [at("rim", 0, 5)], [])).toThrow(/twice/);
  });

  it("rejects pushes for bodies that aren't in the world", () => {
    expect(() => stepWorld(openWorld(["a"]), [at("a", 0, 0)], [{ id: "b", fx: 1, fy: 0 }])).toThrow(
      /unknown body/,
    );
  });

  it("rejects numbers that can't be state", () => {
    expect(() => stepWorld(openWorld(["a"]), [at("a", Number.NaN, 0)], [])).toThrow(/non-finite x/);
    expect(() =>
      stepWorld(
        openWorld(["a"]),
        [at("a", 0, 0)],
        [{ id: "a", fx: Number.POSITIVE_INFINITY, fy: 0 }],
      ),
    ).toThrow(/finite/);
  });
});
