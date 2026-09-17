import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { aggregateCredits, parseCreditsFile } from "../src/credits.ts";
import { repoRoot } from "../src/repo-root.ts";
import { createFixtureRoot, removeFixtureRoot } from "./fixture-root.ts";

const VALID_TABLE = [
  "| Asset | Author | Source | Licence |",
  "| --- | --- | --- | --- |",
  "| cactus.png | Kenney | https://kenney.nl/assets/tiny-dungeon | CC0 |",
  "| rock.png | opengameart user | https://opengameart.org/content/rocks | CC0 1.0 |",
  "",
].join("\n");

describe("parseCreditsFile", () => {
  it("parses every valid row", () => {
    const { entries, errors } = parseCreditsFile(VALID_TABLE, "games/x/CREDITS.md");
    expect(errors).toEqual([]);
    expect(entries).toEqual([
      {
        asset: "cactus.png",
        author: "Kenney",
        source: "https://kenney.nl/assets/tiny-dungeon",
        licence: "CC0",
      },
      {
        asset: "rock.png",
        author: "opengameart user",
        source: "https://opengameart.org/content/rocks",
        licence: "CC0 1.0",
      },
    ]);
  });

  it("parses a header-only file (no assets yet) with no entries and no errors", () => {
    const { entries, errors } = parseCreditsFile(
      "| Asset | Author | Source | Licence |\n| --- | --- | --- | --- |\n",
      "games/x/CREDITS.md",
    );
    expect(entries).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("rejects an empty asset name", () => {
    const table = [
      "| Asset | Author | Source | Licence |",
      "| --- | --- | --- | --- |",
      "|  | Kenney | https://kenney.nl/x | CC0 |",
    ].join("\n");
    const { errors } = parseCreditsFile(table, "games/x/CREDITS.md");
    expect(errors).toEqual(["games/x/CREDITS.md row 1: asset is empty"]);
  });

  it("rejects a non-CC0 licence", () => {
    const table = [
      "| Asset | Author | Source | Licence |",
      "| --- | --- | --- | --- |",
      "| cactus.png | Kenney | https://kenney.nl/x | CC-BY 4.0 |",
    ].join("\n");
    const { errors } = parseCreditsFile(table, "games/x/CREDITS.md");
    expect(errors).toEqual([
      'games/x/CREDITS.md row 1: licence must be CC0 (HOUSE_STYLE.md, "Assets and credits"), got "CC-BY 4.0"',
    ]);
  });

  it("rejects a source that isn't a URL", () => {
    const table = [
      "| Asset | Author | Source | Licence |",
      "| --- | --- | --- | --- |",
      "| cactus.png | Kenney | kenney.nl/x | CC0 |",
    ].join("\n");
    const { errors } = parseCreditsFile(table, "games/x/CREDITS.md");
    expect(errors).toEqual([
      'games/x/CREDITS.md row 1: source must be a http(s) URL, got "kenney.nl/x"',
    ]);
  });

  it("rejects a row with the wrong number of columns", () => {
    const table = [
      "| Asset | Author | Source | Licence |",
      "| --- | --- | --- | --- |",
      "| cactus.png | Kenney |",
    ].join("\n");
    const { errors } = parseCreditsFile(table, "games/x/CREDITS.md");
    expect(errors).toEqual([
      "games/x/CREDITS.md row 1: expected 4 columns (asset, author, source, licence), got 2",
    ]);
  });
});

describe("aggregateCredits (fixture repo)", () => {
  let root: string;

  afterEach(() => {
    if (root) removeFixtureRoot(root);
  });

  it("aggregates valid games, errors on a missing file only when assets/ exists", async () => {
    root = createFixtureRoot({
      "games/empty/package.json": "{}", // no assets/, no CREDITS.md: not an error
      "games/credited/assets/cactus.png": Buffer.from([0]),
      "games/credited/CREDITS.md": VALID_TABLE,
      "games/uncredited/assets/rock.png": Buffer.from([0]), // assets/ but no CREDITS.md: an error
    });

    const result = await aggregateCredits(root);
    expect(result.errors).toEqual([
      "games/uncredited/CREDITS.md is missing, but games/uncredited/assets/ has files " +
        '(HOUSE_STYLE.md, "Assets and credits": every CC0 asset needs a credit)',
    ]);
    expect(result.games).toEqual([{ game: "credited", entries: expect.any(Array) }]);
    expect(result.markdown).toContain("## Credited");
    expect(result.markdown).toContain("cactus.png");
    expect(result.markdown).not.toContain("Quick Draw");
  });

  it("surfaces a malformed CREDITS.md as an aggregate error", async () => {
    root = createFixtureRoot({
      "games/bad/assets/x.png": Buffer.from([0]),
      "games/bad/CREDITS.md": [
        "| Asset | Author | Source | Licence |",
        "| --- | --- | --- | --- |",
        "| x.png | Someone | not-a-url | CC0 |",
      ].join("\n"),
    });
    const result = await aggregateCredits(root);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("source must be a http(s) URL");
  });

  it("writes 'No CC0 assets are in use yet.' when nothing is credited", async () => {
    root = createFixtureRoot({ "games/empty/package.json": "{}" });
    const result = await aggregateCredits(root);
    expect(result.errors).toEqual([]);
    expect(result.markdown).toContain("No CC0 assets are in use yet.");
  });

  it("validates apps/*/CREDITS.md too, erroring on a missing file only when public/ exists", async () => {
    root = createFixtureRoot({
      "apps/controller/package.json": "{}", // no public/, no CREDITS.md: not an error
      "apps/host/public/audio/press.ogg": Buffer.from([0]),
      "apps/host/CREDITS.md": VALID_TABLE,
      "apps/server/public/foo.png": Buffer.from([0]), // public/ but no CREDITS.md: an error
    });

    const result = await aggregateCredits(root);
    expect(result.errors).toEqual([
      "apps/server/CREDITS.md is missing, but apps/server/public/ has files " +
        '(HOUSE_STYLE.md, "Assets and credits": every CC0 asset needs a credit)',
    ]);
    expect(result.platform).toEqual(expect.any(Array));
    expect(result.platform.length).toBeGreaterThan(0);
    expect(result.markdown).toContain("## Platform");
    expect(result.markdown).toContain("cactus.png");
  });

  it("collects every app's CREDITS.md into one shared Platform section, ahead of the game sections", async () => {
    root = createFixtureRoot({
      "games/credited/assets/cactus.png": Buffer.from([0]),
      "games/credited/CREDITS.md": VALID_TABLE,
      "apps/host/public/audio/press.ogg": Buffer.from([0]),
      "apps/host/CREDITS.md": VALID_TABLE,
    });

    const result = await aggregateCredits(root);
    expect(result.errors).toEqual([]);
    expect(result.markdown.indexOf("## Platform")).toBeGreaterThanOrEqual(0);
    expect(result.markdown.indexOf("## Platform")).toBeLessThan(
      result.markdown.indexOf("## Credited"),
    );
  });
});

describe("aggregateCredits (real repo)", () => {
  it("passes validation on the current tree", async () => {
    const result = await aggregateCredits(repoRoot);
    expect(result.errors).toEqual([]);
  });

  it("matches the committed docs/CREDITS.md exactly (run `pnpm --filter ./tooling/assets run credits` to update it)", async () => {
    const result = await aggregateCredits(repoRoot);
    const committed = await readFile(join(repoRoot, "docs/CREDITS.md"), "utf8");
    expect(committed).toBe(result.markdown);
  });
});
