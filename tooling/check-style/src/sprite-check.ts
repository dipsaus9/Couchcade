import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface SpriteCheckResult {
  readonly exitCode: number;
  readonly report: string;
}

/**
 * Orchestrator-requested wiring (CC-4.9): runs tooling/assets' `checkAllGameAssets()` - the sprite
 * palette/grid check - as part of `check:style`, per the TODO its own CLI already carries
 * ("Not wired into a root script yet: CC-4.10 (check:style) is expected to call
 * checkAllGameAssets() itself", tooling/assets/src/check-cli.ts).
 *
 * It's spawned as a child process rather than imported, because dependency-cruiser's
 * `no-tool-imports-another-tool` rule (.dependency-cruiser.cjs) forbids one `tooling/*` package
 * from statically importing another - that's what keeps every tool independently buildable and
 * check:deps green. Shelling out to the real CLI reuses CC-4.9's implementation exactly, without
 * creating that import edge or re-implementing the check here.
 */
export async function runSpriteCheck(
  repoRoot: string,
  targetRoot: string,
): Promise<SpriteCheckResult> {
  const cli = join(repoRoot, "tooling/assets/src/check-cli.ts");
  try {
    const { stdout } = await run(process.execPath, [cli, targetRoot]);
    return { exitCode: 0, report: stdout };
  } catch (error) {
    const { code, stdout } = error as { code?: number; stdout?: string };
    return { exitCode: code ?? 1, report: stdout ?? "" };
  }
}
