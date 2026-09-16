import { afterEach, describe, expect, it } from "vitest";
import { checkColorsAndFonts } from "../src/rules/colors-and-fonts.ts";
import { createFixtureRoot, removeFixtureRoot } from "./fixture-root.ts";

describe("checkColorsAndFonts", () => {
  let root: string;
  afterEach(() => {
    if (root) removeFixtureRoot(root);
  });

  it("fails on a raw hex colour in a .vue <style> block outside packages/theme", () => {
    root = createFixtureRoot({
      "apps/host/src/App.vue": `<template><div /></template>\n<style>\n.foo { color: #1E2A4A; }\n</style>\n`,
    });
    const violations = checkColorsAndFonts(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: "apps/host/src/App.vue", line: 3 });
    expect(violations[0]!.message).toContain("#1E2A4A");
  });

  it("fails on a raw rgb()/hsl() colour outside packages/theme", () => {
    root = createFixtureRoot({
      "apps/host/src/App.vue": `<style>\n.a { background: rgb(30, 42, 74); }\n.b { color: hsl(220 40% 20%); }\n</style>\n`,
    });
    const violations = checkColorsAndFonts(root);
    expect(violations.map((v) => v.message).join("\n")).toContain('"rgb(...)"');
    expect(violations.map((v) => v.message).join("\n")).toContain('"hsl(...)"');
  });

  it("fails on a hardcoded font-family outside packages/theme", () => {
    root = createFixtureRoot({
      "apps/controller/src/App.vue": `<style>\nbody { font-family: Arial, sans-serif; }\n</style>\n`,
    });
    const violations = checkColorsAndFonts(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain("Arial, sans-serif");
  });

  it("passes a font-family that references a theme CSS variable", () => {
    root = createFixtureRoot({
      "apps/controller/src/App.vue": `<style>\nbody { font-family: var(--cc-font-ui); }\n</style>\n`,
    });
    expect(checkColorsAndFonts(root)).toEqual([]);
  });

  it("fails on a literal Phaser fontFamily string outside packages/theme", () => {
    root = createFixtureRoot({
      "games/sumo/src/host/scene.ts": `export const style = { fontFamily: "Comic Sans MS" };\n`,
    });
    const violations = checkColorsAndFonts(root);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.message).toContain("Comic Sans MS");
  });

  it("passes a Phaser fontFamily that references the theme's font tokens", () => {
    root = createFixtureRoot({
      "games/sumo/src/host/scene.ts": `import { font } from "@couchcade/theme";\nexport const style = { fontFamily: font.pixel };\n`,
    });
    expect(checkColorsAndFonts(root)).toEqual([]);
  });

  it("ignores packages/theme itself", () => {
    root = createFixtureRoot({
      "packages/theme/src/tokens.ts": `export const color = { ink: "#1E2A4A" };\n`,
    });
    expect(checkColorsAndFonts(root)).toEqual([]);
  });

  it("ignores the CC0 asset pipeline in tooling/assets", () => {
    root = createFixtureRoot({
      "tooling/assets/src/color-distance.ts": `export const black = "#000000";\n`,
    });
    expect(checkColorsAndFonts(root)).toEqual([]);
  });

  it("ignores test fixtures (a computed-style rgb() helper)", () => {
    root = createFixtureRoot({
      "packages/ui/test/components/helpers.ts": `export function rgb(hex: string): string {\n  return \`rgb(0, 0, 0)\`;\n}\n`,
      "packages/ui/test/components/button.test.ts": `import { rgb } from "./helpers.ts";\nrgb("#1E2A4A");\n`,
    });
    expect(checkColorsAndFonts(root)).toEqual([]);
  });

  it("ignores a hex colour example inside a comment", () => {
    root = createFixtureRoot({
      "apps/host/src/palette.ts": `/** \`#1E2A4A\` is the core Ink colour. */\nexport const x = 1;\n`,
    });
    expect(checkColorsAndFonts(root)).toEqual([]);
  });

  it("passes the current repo tree (real repo, no fixture)", async () => {
    const { repoRoot } = await import("../src/repo-root.ts");
    expect(checkColorsAndFonts(repoRoot)).toEqual([]);
  });
});
