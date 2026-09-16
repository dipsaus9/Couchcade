import { afterEach, describe, expect, it } from "vitest";
import { repoRoot } from "../src/repo-root.ts";
import { runSpriteCheck } from "../src/sprite-check.ts";
import { createFixtureRoot, removeFixtureRoot } from "./fixture-root.ts";
import { solidPng } from "./png-fixtures.ts";

/**
 * Exercises the real tooling/assets CLI (CC-4.9's checkAllGameAssets) end to end, spawned exactly
 * the way tooling/check-style's own CLI spawns it - proving the wiring, not a re-implementation of
 * it. `repoRoot` supplies the real tooling/assets/src/check-cli.ts; `targetRoot` is a throwaway
 * fixture with its own games/ and packages/theme/src/scenes/ folders.
 */
describe("runSpriteCheck (wired to tooling/assets, CC-4.9)", () => {
  let root: string;
  afterEach(() => {
    if (root) removeFixtureRoot(root);
  });

  it("fails on an off-palette sprite", async () => {
    root = createFixtureRoot({
      "packages/theme/src/scenes/tester.ts": `export default { id: "test-scene", colors: ["#FF00FF"] };\n`,
      "games/tester/assets/bad.png": solidPng(8, 8, [9, 9, 9, 255]),
    });
    const result = await runSpriteCheck(repoRoot, root);
    expect(result.exitCode).toBe(1);
    expect(result.report).toContain("games/tester/assets/bad.png");
    expect(result.report).toContain("off-palette");
  });

  it("passes a fixture with no game assets", async () => {
    root = createFixtureRoot({ "games/empty/package.json": "{}" });
    const result = await runSpriteCheck(repoRoot, root);
    expect(result.exitCode).toBe(0);
  });
});
