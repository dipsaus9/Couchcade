import { afterEach, describe, expect, it } from "vitest";
import { checkNewDate } from "../src/rules/new-date.ts";
import { createFixtureRoot, removeFixtureRoot } from "./fixture-root.ts";

describe("checkNewDate", () => {
  let root: string;
  afterEach(() => {
    if (root) removeFixtureRoot(root);
  });

  it("fails on new Date( inside games/*/src/shared/", () => {
    root = createFixtureRoot({
      "games/sumo/src/shared/rules.ts": `export const startedAt = new Date();\n`,
    });
    const violations = checkNewDate(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: "games/sumo/src/shared/rules.ts", line: 1 });
  });

  it("ignores new Date( outside games/*/src/shared/ (e.g. src/host/)", () => {
    root = createFixtureRoot({
      "games/sumo/src/host/scene.ts": `export const startedAt = new Date();\n`,
    });
    expect(checkNewDate(root)).toEqual([]);
  });

  it("passes shared/ code that takes dtMs instead", () => {
    root = createFixtureRoot({
      "games/sumo/src/shared/rules.ts": `export function tick(state: unknown, dtMs: number) {\n  return state;\n}\n`,
    });
    expect(checkNewDate(root)).toEqual([]);
  });

  it("ignores a new Date( example inside a comment", () => {
    root = createFixtureRoot({
      "games/sumo/src/shared/rules.ts": `// don't do new Date() here\nexport const ok = 1;\n`,
    });
    expect(checkNewDate(root)).toEqual([]);
  });

  it("passes the current repo tree (real repo, no fixture)", async () => {
    const { repoRoot } = await import("../src/repo-root.ts");
    expect(checkNewDate(repoRoot)).toEqual([]);
  });
});
