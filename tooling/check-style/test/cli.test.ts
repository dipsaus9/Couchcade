import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureRoot, removeFixtureRoot } from "./fixture-root.ts";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const fixtures: string[] = [];

afterEach(() => {
  for (const rootDir of fixtures.splice(0)) removeFixtureRoot(rootDir);
});

async function checkStyleCli(files: Record<string, string>) {
  const rootDir = createFixtureRoot(files);
  fixtures.push(rootDir);
  try {
    const { stdout } = await run(process.execPath, [cli, rootDir]);
    return { exitCode: 0, stdout };
  } catch (error) {
    const { code, stdout } = error as { code: number; stdout: string };
    return { exitCode: code, stdout };
  }
}

describe("check:style entry point", () => {
  it("exits 1 and names the file and rule when a fixture violates house style", async () => {
    const { exitCode, stdout } = await checkStyleCli({
      "apps/host/src/App.vue": `<style>\nbody { color: #1E2A4A; }\n</style>\n`,
    });
    expect(exitCode).toBe(1);
    expect(stdout).toContain("apps/host/src/App.vue:2:");
    expect(stdout).toContain("#1E2A4A");
  });

  it("exits 0 on a fixture with no violations and no game assets", async () => {
    const { exitCode, stdout } = await checkStyleCli({
      "apps/host/src/App.vue": `<template><div>{{ label }}</div></template>\n`,
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("clean");
  });

  it("exits 0 on the real repo tree", async () => {
    const { repoRoot } = await import("../src/repo-root.ts");
    const { stdout } = await run(process.execPath, [cli, repoRoot]);
    expect(stdout).toContain("clean");
  });
});
