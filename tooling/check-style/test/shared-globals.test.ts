import { afterEach, describe, expect, it } from "vitest";
import { checkSharedGlobals } from "../src/rules/shared-globals.ts";
import { createFixtureRoot, removeFixtureRoot } from "./fixture-root.ts";

describe("checkSharedGlobals", () => {
  let root: string;
  afterEach(() => {
    if (root) removeFixtureRoot(root);
  });

  const cases: readonly string[] = [
    "window",
    "document",
    "setTimeout",
    "setInterval",
    "requestAnimationFrame",
  ];

  for (const name of cases) {
    it(`fails on ${name} inside games/*/src/shared/`, () => {
      root = createFixtureRoot({
        "games/sumo/src/shared/rules.ts": `export const x = ${name};\n`,
      });
      const violations = checkSharedGlobals(root);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.message).toContain(`"${name}"`);
    });
  }

  it("ignores a banned global outside games/*/src/shared/ (e.g. src/host/)", () => {
    root = createFixtureRoot({
      "games/sumo/src/host/scene.ts": `window.addEventListener("resize", () => {});\n`,
    });
    expect(checkSharedGlobals(root)).toEqual([]);
  });

  it("does not double-report Math.random, Date.now or performance.now (already Oxlint's job)", () => {
    root = createFixtureRoot({
      "games/sumo/src/shared/rules.ts": `export const a = Math.random();\nexport const b = Date.now();\nexport const c = performance.now();\n`,
    });
    expect(checkSharedGlobals(root)).toEqual([]);
  });

  it("passes shared/ code with no DOM globals or timers", () => {
    root = createFixtureRoot({
      "games/sumo/src/shared/rules.ts": `export function tick(state: unknown, dtMs: number) {\n  return state;\n}\n`,
    });
    expect(checkSharedGlobals(root)).toEqual([]);
  });

  it("passes the current repo tree (real repo, no fixture)", async () => {
    const { repoRoot } = await import("../src/repo-root.ts");
    expect(checkSharedGlobals(repoRoot)).toEqual([]);
  });
});
