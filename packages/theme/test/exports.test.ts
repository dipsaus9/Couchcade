import { describe, expect, it } from "vitest";
import * as root from "@couchcade/theme";
import * as generate from "@couchcade/theme/generate";
import pkg from "../package.json" with { type: "json" };

describe("package exports", () => {
  it("expose every module through one wildcard subpath pattern", () => {
    expect(pkg.exports).toEqual({ ".": "./src/index.ts", "./*": "./src/*/index.ts" });
  });

  it("re-export the tokens and generators from the root", () => {
    expect(root.color.ink).toBe("#1E2A4A");
    expect(root.toCssVars).toBe(generate.toCssVars);
    expect(root.toPhaserColor).toBe(generate.toPhaserColor);
  });

  it("keep the Vite-only scene registry out of the root", () => {
    expect(root).not.toHaveProperty("scenePalettes");
  });

  it("have no runtime dependencies", () => {
    expect(pkg).not.toHaveProperty("dependencies");
  });
});
