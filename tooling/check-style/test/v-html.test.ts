import { afterEach, describe, expect, it } from "vitest";
import { checkVHtml } from "../src/rules/v-html.ts";
import { createFixtureRoot, removeFixtureRoot } from "./fixture-root.ts";

describe("checkVHtml", () => {
  let root: string;
  afterEach(() => {
    if (root) removeFixtureRoot(root);
  });

  it("fails on v-html in a .vue file", () => {
    root = createFixtureRoot({
      "apps/controller/src/screens/Announce.vue": `<template>\n  <div v-html="message" />\n</template>\n`,
    });
    const violations = checkVHtml(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      file: "apps/controller/src/screens/Announce.vue",
      line: 2,
    });
  });

  it("passes a .vue file that renders text content instead", () => {
    root = createFixtureRoot({
      "apps/controller/src/screens/Announce.vue": `<template>\n  <div>{{ message }}</div>\n</template>\n`,
    });
    expect(checkVHtml(root)).toEqual([]);
  });

  it("passes the current repo tree (real repo, no fixture)", async () => {
    const { repoRoot } = await import("../src/repo-root.ts");
    expect(checkVHtml(repoRoot)).toEqual([]);
  });
});
