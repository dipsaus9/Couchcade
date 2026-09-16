import { describe, expect, it } from "vitest";
import * as root from "@couchcade/utils";
import { roomCode } from "@couchcade/utils/room-code";
import { createRng } from "@couchcade/utils/rng";
import pkg from "../package.json" with { type: "json" };

describe("package exports", () => {
  it("expose every module through one wildcard subpath pattern", () => {
    // A new module is a folder with an index.ts under src/. It needs no package.json edit.
    expect(pkg.exports).toEqual({ ".": "./src/index.ts", "./*": "./src/*/index.ts" });
  });

  it("resolve subpath imports by package name", () => {
    expect(roomCode(createRng(1))).toMatch(/^[A-HJ-NP-Z]{4}$/);
    expect(root.createRng).toBe(createRng);
    expect(root.roomCode).toBe(roomCode);
  });

  it("have no runtime dependencies, as tier 0 requires", () => {
    expect(pkg).not.toHaveProperty("dependencies");
    expect(pkg).not.toHaveProperty("peerDependencies");
  });
});
