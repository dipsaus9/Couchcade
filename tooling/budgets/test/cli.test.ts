import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

describe("budgets entry point", () => {
  it("exits 0 and prints the report when every budget passes", async () => {
    const { stdout } = await run(process.execPath, [cli], { timeout: 30_000 });
    expect(stdout).toContain("Bundle size budgets");
    expect(stdout).toContain("All ");
    expect(stdout).not.toContain("FAIL");
  });
});
