import { describe, expect, it } from "vitest";
import { repoRoot } from "../src/repo-root.ts";
import {
  loadScenePalette,
  loadScenePaletteForGame,
  loadSceneRegistry,
} from "../src/scene-loader.ts";

// Loads the real packages/theme/src/scenes/*.ts files by filesystem path, the same way the CLI
// does, instead of packages/theme/src/scenes/index.ts (which uses Vite's import.meta.glob and
// throws outside Vite/Vitest).
describe("loadSceneRegistry (real repo)", () => {
  it("finds the scenes HOUSE_STYLE.md defines, keyed by their owning game", async () => {
    const registry = await loadSceneRegistry(repoRoot);
    const byId = new Map(registry.map((entry) => [entry.id, entry]));

    expect(byId.get("desert")?.game).toBe("quick-draw");
    for (const entry of registry) {
      expect(entry.world.length).toBeLessThanOrEqual(16);
      expect(new Set(entry.world).size).toBe(entry.world.length); // no duplicate colours
      for (const hex of entry.colors) expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe("loadScenePalette (real repo)", () => {
  it("resolves the desert scene with the core colours folded in", async () => {
    const palette = await loadScenePalette("desert", repoRoot);
    expect(palette.game).toBe("quick-draw");
    expect(palette.world).toEqual(expect.arrayContaining(["#1E2A4A", "#FAFCFF"])); // core Ink, Chalk
    expect(palette.world).toEqual(expect.arrayContaining([...palette.colors]));
  });

  it("throws on an unknown scene id, naming the known ones", async () => {
    await expect(loadScenePalette("nonexistent-scene", repoRoot)).rejects.toThrow(
      /Unknown scene palette "nonexistent-scene"/,
    );
  });
});

describe("loadScenePaletteForGame (real repo)", () => {
  it("resolves by the scene file's name (the game id)", async () => {
    const palette = await loadScenePaletteForGame("quick-draw", repoRoot);
    expect(palette?.id).toBe("desert");
  });

  it("returns undefined for a game with no registered scene file", async () => {
    expect(await loadScenePaletteForGame("no-such-game", repoRoot)).toBeUndefined();
  });
});
