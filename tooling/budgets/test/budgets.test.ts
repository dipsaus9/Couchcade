import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runBudgets } from "../src/budgets.ts";

// Builds the real apps/controller and apps/host (write: false, no dist/ output), so this proves
// the checks in the repo's own .size-limit.json actually run against real, hashed build output —
// not just a fixture. Slower than a unit test; see vitest.config.ts's testTimeout.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("runBudgets against the real repo", () => {
  it("passes every configured budget at the sizes measured for CC-9.1", async () => {
    const { pass, results, report } = await runBudgets({ rootDir: repoRoot });

    // On failure, the printed report names which check(s) broke their budget and by how much.
    expect(report).not.toContain("FAIL");
    expect(pass).toBe(true);
    expect(results.filter((r) => !r.pass)).toEqual([]);
  });

  it("discovers quick-draw's controller chunk from the build output, with no maintained list", async () => {
    const { results } = await runBudgets({ rootDir: repoRoot });
    const quickDraw = results.find((r) => r.name.includes("quick-draw"));
    expect(quickDraw).toBeDefined();
    expect(quickDraw!.measuredBytes).toBeGreaterThan(0);
  });

  it("keeps the host platform total well clear of each game's own scene chunk", async () => {
    const { results } = await runBudgets({ rootDir: repoRoot });
    const hostPlatform = results.find((r) => r.name === "Host platform JS");
    expect(hostPlatform).toBeDefined();
    // Platform JS (index + boot + Phaser) measured well under the 450 KB budget; a per-game scene
    // chunk (Target Range's is 14 KB) leaking in would push this close to or over it. Raised from
    // 430 KB for @couchcade/audio, which callouts import to duck the music (docs/architecture/audio.md
    // estimates 3 KB): this test measured 427.9 KB before it and 430.3 KB after.
    expect(hostPlatform!.measuredBytes).toBeLessThan(440 * 1024);
  });
});
