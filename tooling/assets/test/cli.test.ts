import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { decodePng } from "../src/png.ts";
import { solidPng } from "./png-fixtures.ts";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("assets:recolour CLI", () => {
  it("prints usage and exits 1 when an argument is missing", async () => {
    await expect(run(process.execPath, [cli, "only-one-arg"])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining("Usage: pnpm assets:recolour"),
    });
  });

  it("exits 1 with a clear message for an unknown scene", async () => {
    const dir = mkdtempSync(join(tmpdir(), "assets-cli-"));
    dirs.push(dir);
    const file = join(dir, "sprite.png");
    writeFileSync(file, solidPng(16, 24, [0, 0, 0, 255]));

    await expect(run(process.execPath, [cli, file, "nonexistent-scene"])).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Unknown scene palette "nonexistent-scene"'),
    });
  });

  it("recolours the file in place and reports a summary on stdout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "assets-cli-"));
    dirs.push(dir);
    const file = join(dir, "sprite.png");
    writeFileSync(file, solidPng(16, 24, [10, 200, 10, 255])); // off-palette green

    const { stdout } = await run(process.execPath, [cli, file, "desert"]);
    expect(stdout).toContain("Recoloured");
    expect(stdout).toContain('scene "desert"');

    const written = decodePng(await readFile(file));
    expect(written.width).toBe(16);
    expect(written.height).toBe(24);
  });
});
