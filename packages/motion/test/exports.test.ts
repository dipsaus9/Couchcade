import { describe, expect, it } from "vitest";
import * as root from "@couchcade/motion";
import * as sensors from "@couchcade/motion/sensors";
import pkg from "../package.json" with { type: "json" };

describe("package exports", () => {
  it("expose every module through one wildcard subpath pattern", () => {
    // A new module (calibration, gestures, fallbacks) is a folder with an index.ts under src/.
    expect(pkg.exports).toEqual({
      ".": "./src/index.ts",
      "./*": "./src/*/index.ts",
    });
  });

  it("re-export the sensors from the root", () => {
    expect(root.createBrowserAdapter).toBe(sensors.createBrowserAdapter);
    expect(root.createFakeAdapter).toBe(sensors.createFakeAdapter);
    expect(root.waitForCapability).toBe(sensors.waitForCapability);
    expect(root.synthetic).toBe(sensors.synthetic);
  });

  it("have no npm dependencies, only workspace packages (motion.md adapter rule 9)", () => {
    // Gestures stream through @couchcade/game-sdk/input (CC-5.5); nothing comes from npm.
    for (const version of Object.values(pkg.dependencies)) {
      expect(version).toBe("workspace:*");
    }
  });
});
