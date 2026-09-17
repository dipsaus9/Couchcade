import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checklist,
  toCamelCase,
  toPascalCase,
  validateId,
  validateTitle,
  writeGame,
} from "../src/generate.ts";

const dirs: string[] = [];

function tempGamesDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "create-game-validate-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("validateId", () => {
  it("accepts a kebab-case id that doesn't collide with an existing folder", () => {
    expect(validateId("paddle-panic", tempGamesDir())).toEqual([]);
  });

  it("rejects an id that isn't kebab-case", () => {
    expect(validateId("PaddlePanic", tempGamesDir())).not.toEqual([]);
    expect(validateId("paddle_panic", tempGamesDir())).not.toEqual([]);
    expect(validateId("1paddle", tempGamesDir())).not.toEqual([]);
    expect(validateId("-paddle", tempGamesDir())).not.toEqual([]);
    expect(validateId("p", tempGamesDir())).not.toEqual([]);
  });

  it("rejects an id whose games/<id> folder already exists", () => {
    const gamesDir = tempGamesDir();
    mkdirSync(join(gamesDir, "quick-draw"));
    expect(validateId("quick-draw", gamesDir)).toEqual([
      expect.stringContaining("games/quick-draw already exists"),
    ]);
  });

  it("accepts a 24-character id and rejects a 25-character one", () => {
    const gamesDir = tempGamesDir();
    expect(validateId("a".repeat(24), gamesDir)).toEqual([]);
    expect(validateId("a".repeat(25), gamesDir)).not.toEqual([]);
  });
});

describe("validateTitle", () => {
  it("accepts a sentence-case title at most 16 characters", () => {
    expect(validateTitle("Paddle Panic")).toEqual([]);
    expect(validateTitle("A".repeat(16))).toEqual([]);
  });

  it("rejects a title over 16 characters (the menu view size)", () => {
    expect(validateTitle("A".repeat(17))).not.toEqual([]);
  });

  it("rejects a title that isn't sentence case", () => {
    expect(validateTitle("paddle panic")).not.toEqual([]);
  });

  it("rejects an empty or padded title", () => {
    expect(validateTitle("")).not.toEqual([]);
    expect(validateTitle(" Paddle")).not.toEqual([]);
    expect(validateTitle("Paddle ")).not.toEqual([]);
  });
});

describe("toPascalCase and toCamelCase", () => {
  it("matches the naming games/quick-draw uses", () => {
    expect(toPascalCase("quick-draw")).toBe("QuickDraw");
    expect(toCamelCase("quick-draw")).toBe("quickDraw");
  });

  it("handles a single-word id", () => {
    expect(toPascalCase("sumo")).toBe("Sumo");
    expect(toCamelCase("sumo")).toBe("sumo");
  });
});

describe("writeGame", () => {
  it("writes every template file with placeholders replaced, and nothing else", () => {
    const gamesDir = tempGamesDir();
    writeGame({ id: "paddle-panic", title: "Paddle Panic", gamesDir });

    const read = (path: string) => readFileSync(join(gamesDir, "paddle-panic", path), "utf8");
    expect(read("package.json")).toContain('"name": "@couchcade/game-paddle-panic"');
    expect(read("src/index.ts")).toContain('id: "paddle-panic"');
    expect(read("src/index.ts")).toContain('title: "Paddle Panic"');
    expect(read("src/shared/rules.ts")).toContain("PaddlePanicState");
    expect(read("src/host/scene.ts")).toContain("paddlePanicSceneKey");
    expect(read("src/host/scene.ts")).toContain("class PaddlePanicScene");
    for (const file of [
      "package.json",
      "tsconfig.json",
      "vitest.config.ts",
      "src/index.ts",
      "src/shared/input.ts",
      "src/shared/rules.ts",
      "src/host/scene.ts",
      "src/controller/Controller.vue",
      "src/controller/index.ts",
      "assets/.gitkeep",
      "test/contract.test.ts",
      "test/rules.test.ts",
      "CREDITS.md",
    ]) {
      const content = read(file);
      expect(content).not.toContain("__ID__");
      expect(content).not.toContain("__TITLE__");
      expect(content).not.toContain("__ID_PASCAL__");
      expect(content).not.toContain("__ID_CAMEL__");
    }
  });
});

describe("checklist", () => {
  it("tells the owner what's left before the game can merge", () => {
    const text = checklist("paddle-panic");
    expect(text).toContain("Created games/paddle-panic");
    expect(text).toContain("docs/games/paddle-panic.md");
    expect(text).toContain("packages/theme/src/scenes/paddle-panic.ts");
    expect(text).toContain("e2e/games/paddle-panic.spec.ts");
    expect(text).toContain("games/paddle-panic/CREDITS.md");
  });
});
