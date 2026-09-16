import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createFixtureRepo, removeFixtureRepo } from "./fixture-repo.ts";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));
const fixtures: string[] = [];

afterEach(() => {
  for (const rootDir of fixtures.splice(0)) removeFixtureRepo(rootDir);
});

/** Runs the check:deps entry point against a fixture repo. */
async function checkDepsCli(files: Record<string, string>) {
  const rootDir = createFixtureRepo(files);
  fixtures.push(rootDir);
  try {
    const { stdout } = await run(process.execPath, [cli, rootDir]);
    return { exitCode: 0, stdout };
  } catch (error) {
    const { code, stdout } = error as { code: number; stdout: string };
    return { exitCode: code, stdout };
  }
}

describe("check:deps entry point", () => {
  it("exits 1 and names the rule when a game imports an app", async () => {
    const { exitCode, stdout } = await checkDepsCli({
      "apps/host/src/main.ts": "export default 1;\n",
      "games/sumo/src/shared/rules.ts":
        'import main from "../../../../apps/host/src/main.ts";\nexport default main;\n',
    });
    expect(exitCode).toBe(1);
    expect(stdout).toContain("no-import-from-apps");
    expect(stdout).toContain("games/sumo/src/shared/rules.ts → apps/host/src/main.ts");
  });

  it("exits 0 when the fixture follows the rules", async () => {
    const { exitCode, stdout } = await checkDepsCli({
      "games/sumo/src/shared/rules.ts":
        'import { utils } from "@couchcade/utils";\nexport default utils;\n',
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("no dependency violations found");
  });
});
