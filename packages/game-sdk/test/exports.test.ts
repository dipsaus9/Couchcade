import { describe, expect, it } from "vitest";
import * as root from "@couchcade/game-sdk";
import * as contract from "@couchcade/game-sdk/contract";
import * as registry from "@couchcade/game-sdk/registry";
import * as testing from "@couchcade/game-sdk/testing";
import pkg from "../package.json" with { type: "json" };

describe("package exports", () => {
  it("expose every module through one wildcard subpath pattern, plus ./testing", () => {
    // A new module is a folder with an index.ts under src/. It needs no package.json edit.
    expect(pkg.exports).toEqual({
      ".": "./src/index.ts",
      "./*": "./src/*/index.ts",
      "./testing": "./testing/index.ts",
    });
  });

  it("re-export the contract and the registry from the root", () => {
    expect(root.defineGame).toBe(contract.defineGame);
    expect(root.defineController).toBe(contract.defineController);
    expect(root.createRegistry).toBe(registry.createRegistry);
    expect(root.createControllerRegistry).toBe(registry.createControllerRegistry);
  });

  it("keep the Vitest-based test kit out of the root", () => {
    expect(root).not.toHaveProperty("testGameContract");
    expect(testing.testGameContract).toBeTypeOf("function");
    expect(testing.createFakeRoom).toBeTypeOf("function");
    expect(testing.replay).toBeTypeOf("function");
  });

  it("depend only on protocol, theme and utils among internal packages", () => {
    const internal = Object.keys(pkg.dependencies).filter((name) => name.startsWith("@couchcade/"));
    expect(internal.toSorted()).toEqual([
      "@couchcade/protocol",
      "@couchcade/theme",
      "@couchcade/utils",
    ]);
    expect(pkg.dependencies).not.toHaveProperty("vitest");
    expect(pkg.dependencies).not.toHaveProperty("vue");
    expect(pkg.dependencies).not.toHaveProperty("phaser");
  });
});
