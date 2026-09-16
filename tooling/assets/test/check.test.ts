import { color } from "@couchcade/theme";
import { afterEach, describe, expect, it } from "vitest";
import { toPaletteEntries } from "../src/color-distance.ts";
import {
  checkAllGameAssets,
  checkGameAssets,
  checkSpriteImage,
  formatCheckReport,
  hasViolations,
} from "../src/check.ts";
import { WORLD_GRID } from "../src/grid.ts";
import { decodePng } from "../src/png.ts";
import { repoRoot } from "../src/repo-root.ts";
import { createFixtureRoot, removeFixtureRoot } from "./fixture-root.ts";
import { solidPng } from "./png-fixtures.ts";

const palette = toPaletteEntries(["#000000", "#FFFFFF"]);

describe("checkSpriteImage", () => {
  it("passes an on-palette sprite sized on the world grid", () => {
    const image = decodePng(solidPng(WORLD_GRID.width, WORLD_GRID.height, [0, 0, 0, 255]));
    expect(checkSpriteImage(image, palette)).toEqual([]);
  });

  it("flags an off-palette colour", () => {
    const image = decodePng(solidPng(WORLD_GRID.width, WORLD_GRID.height, [10, 200, 30, 255]));
    const violations = checkSpriteImage(image, palette);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "off-palette" });
  });

  it("ignores fully transparent pixels for the palette check", () => {
    const image = decodePng(solidPng(WORLD_GRID.width, WORLD_GRID.height, [10, 200, 30, 0]));
    expect(checkSpriteImage(image, palette)).toEqual([]);
  });

  it("flags a frame size that isn't a multiple of the world grid", () => {
    const image = decodePng(solidPng(WORLD_GRID.width - 1, WORLD_GRID.height, [0, 0, 0, 255]));
    const violations = checkSpriteImage(image, palette);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ kind: "frame-size" });
  });

  it("can flag both an off-palette colour and a bad frame size at once", () => {
    const image = decodePng(solidPng(WORLD_GRID.width + 1, WORLD_GRID.height, [10, 200, 30, 255]));
    const violations = checkSpriteImage(image, palette);
    expect(violations.map((v) => v.kind).toSorted()).toEqual(["frame-size", "off-palette"]);
  });
});

describe("checkGameAssets / checkAllGameAssets (fixture repo)", () => {
  let root: string;

  afterEach(() => {
    if (root) removeFixtureRoot(root);
  });

  it("reports no violations when a game has no assets/ folder", async () => {
    root = createFixtureRoot({ "games/empty/package.json": "{}" });
    const result = await checkGameAssets("empty", root);
    expect(result.violations.size).toBe(0);
  });

  it("errors when a game's assets/ has no registered scene palette", async () => {
    root = createFixtureRoot({
      "games/orphan/assets/sprite.png": solidPng(
        WORLD_GRID.width,
        WORLD_GRID.height,
        [0, 0, 0, 255],
      ),
    });
    const result = await checkGameAssets("orphan", root);
    expect(result.violations.size).toBe(1);
    const [violations] = [...result.violations.values()];
    expect(violations![0]!.message).toMatch(/no scene palette registered/);
  });

  it("passes a clean sprite and fails an off-palette one against a fixture scene", async () => {
    const ink = color.ink; // a real core colour, always in the allowed set
    root = createFixtureRoot({
      "packages/theme/src/scenes/tester.ts": `export default { id: "test-scene", colors: ["#FF00FF"] };\n`,
      "games/tester/assets/good.png": solidPng(WORLD_GRID.width, WORLD_GRID.height, [
        ...hexTriple(ink),
        255,
      ]),
      "games/tester/assets/bad.png": solidPng(WORLD_GRID.width, WORLD_GRID.height, [9, 9, 9, 255]),
    });

    const result = await checkGameAssets("tester", root);
    expect(result.violations.size).toBe(1);
    expect([...result.violations.keys()]).toEqual(["games/tester/assets/bad.png"]);
  });

  it("checkAllGameAssets and formatCheckReport surface every game's violations", async () => {
    root = createFixtureRoot({
      "packages/theme/src/scenes/tester.ts": `export default { id: "test-scene", colors: ["#FF00FF"] };\n`,
      "games/tester/assets/bad.png": solidPng(WORLD_GRID.width, WORLD_GRID.height, [9, 9, 9, 255]),
      "games/clean/package.json": "{}",
    });

    const results = await checkAllGameAssets(root);
    expect(hasViolations(results)).toBe(true);
    expect(formatCheckReport(results)).toContain("games/tester/assets/bad.png");
  });
});

describe("checkAllGameAssets (real repo)", () => {
  it("passes on the current tree (no game has shipped assets yet)", async () => {
    const results = await checkAllGameAssets(repoRoot);
    expect(results.some((r) => r.game === "quick-draw")).toBe(true);
    expect(hasViolations(results)).toBe(false);
  });
});

function hexTriple(hex: string): readonly [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}
