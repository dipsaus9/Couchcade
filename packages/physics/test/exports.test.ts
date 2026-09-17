import { describe, expect, it } from "vitest";
import * as physics from "@couchcade/physics";
import pkg from "../package.json" with { type: "json" };

describe("package", () => {
  it("exports the physics API from one entry", () => {
    expect(pkg.exports).toEqual({ ".": "./src/index.ts" });
    expect(Object.keys(physics).toSorted()).toEqual([
      "PIXELS_PER_METRE",
      "POSITION_ITERATIONS",
      "STEP_MS",
      "STEP_SECONDS",
      "VELOCITY_ITERATIONS",
      "circleBody",
      "floorFriction",
      "stepWorld",
      "wallLoop",
      "wallPath",
      "wallSegment",
    ]);
  });

  it("depends on Planck.js and nothing else at runtime", () => {
    expect(pkg.dependencies).toEqual({ planck: "catalog:" });
    expect(pkg).not.toHaveProperty("peerDependencies");
  });

  it("uses the fixed step and scale from the session-flow doc", () => {
    expect(physics.VELOCITY_ITERATIONS).toBe(8);
    expect(physics.POSITION_ITERATIONS).toBe(3);
    expect(physics.PIXELS_PER_METRE).toBe(16);
  });
});
