import { afterEach, describe, expect, it } from "vitest";
import { checkStyle } from "../src/check-style.ts";
import { createFixtureRoot, removeFixtureRoot } from "./fixture-root.ts";

describe("checkStyle (aggregator)", () => {
  let root: string;
  afterEach(() => {
    if (root) removeFixtureRoot(root);
  });

  it("exits 0 and reports clean when nothing violates and sprites are clean", async () => {
    root = createFixtureRoot({ "apps/host/src/App.vue": `<template><div /></template>\n` });
    const result = await checkStyle({
      rootDir: root,
      runSprites: async () => ({ exitCode: 0, report: "check-sprites: every sprite is clean\n" }),
    });
    expect(result.exitCode).toBe(0);
    expect(result.violations).toEqual([]);
    expect(result.report).toContain("clean");
  });

  it("exits 1 and reports a rule violation even when sprites are clean", async () => {
    root = createFixtureRoot({
      "apps/host/src/App.vue": `<style>\nbody { color: #1E2A4A; }\n</style>\n`,
    });
    const result = await checkStyle({
      rootDir: root,
      runSprites: async () => ({ exitCode: 0, report: "check-sprites: every sprite is clean\n" }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.violations).toHaveLength(1);
    expect(result.report).toContain("#1E2A4A");
  });

  it("exits 1 when only the sprite check fails, with no style-rule violations", async () => {
    root = createFixtureRoot({ "apps/host/src/App.vue": `<template><div /></template>\n` });
    const result = await checkStyle({
      rootDir: root,
      runSprites: async () => ({ exitCode: 1, report: "games/x/assets/bad.png: off-palette\n" }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.violations).toEqual([]);
    expect(result.report).toContain("off-palette");
  });

  it("combines violations from every rule, sorted by file then line", async () => {
    root = createFixtureRoot({
      "apps/host/src/App.vue": `<style>\nbody { color: #1E2A4A; }\n</style>\n`,
      "apps/controller/src/Announce.vue": `<template><div v-html="m" /></template>\n`,
      "games/sumo/src/shared/rules.ts": `export const x = new Date();\nexport const y = window;\n`,
    });
    const result = await checkStyle({
      rootDir: root,
      runSprites: async () => ({ exitCode: 0, report: "check-sprites: every sprite is clean\n" }),
    });
    expect(result.violations).toHaveLength(4);
    expect(result.violations.map((v) => v.file)).toEqual([
      "apps/controller/src/Announce.vue",
      "apps/host/src/App.vue",
      "games/sumo/src/shared/rules.ts",
      "games/sumo/src/shared/rules.ts",
    ]);
  });
});
