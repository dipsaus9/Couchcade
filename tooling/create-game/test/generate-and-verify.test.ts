/**
 * Proves the generator's output actually works: generates a real game into a temporary folder
 * inside the workspace, runs its typecheck and tests, and deletes it
 * (docs/architecture/session-flow.md, "Create-game template"). It also runs the same
 * dependency-cruiser rules `pnpm check:deps` runs, scoped to the whole repo, so the generated
 * game's import boundaries (src/shared/, src/host/, src/controller/) are proven too.
 *
 * The generated package needs its own `node_modules` to typecheck and test (workspace:* and
 * catalog: dependencies). Rather than running a real `pnpm install` here - which would rewrite the
 * repo's own pnpm-lock.yaml as a side effect of running a test - this copies the already-linked
 * node_modules entries from this package's own node_modules. tooling/create-game declares the
 * exact same dependency set the template does (see package.json), and games/<id> sits at the same
 * folder depth as tooling/create-game (two segments below the repo root), so every relative
 * symlink pnpm already created resolves correctly at the new location without another install.
 */
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { writeGame } from "../src/generate.ts";

const run = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const gamesDir = join(repoRoot, "games");
const ownNodeModules = join(repoRoot, "tooling/create-game/node_modules");
const checkDepsCli = join(repoRoot, "tooling/check-deps/src/cli.ts");

const id = "cg-selftest";
const title = "Cg Selftest";
const targetDir = join(gamesDir, id);

afterEach(() => {
  rmSync(targetDir, { recursive: true, force: true });
});

/** Links `games/<id>` the way `pnpm install` would, without touching the repo's lockfile. */
function linkNodeModules(): void {
  const target = join(targetDir, "node_modules");
  mkdirSync(target, { recursive: true });
  for (const entry of readdirSync(ownNodeModules)) {
    cpSync(join(ownNodeModules, entry), join(target, entry), {
      recursive: true,
      dereference: false,
    });
  }
}

describe("the generated game", () => {
  it("passes typecheck, its tests (including testGameContract) and check:deps", async () => {
    expect(existsSync(targetDir), `games/${id} must not already exist`).toBe(false);
    expect(existsSync(ownNodeModules), "run pnpm install in this worktree first").toBe(true);

    writeGame({ id, title, gamesDir });
    linkNodeModules();

    const pkgName = `@couchcade/game-${id}`;
    await expect(
      run("pnpm", ["--filter", pkgName, "run", "typecheck"], { cwd: repoRoot }),
    ).resolves.toBeDefined();
    await expect(
      run("pnpm", ["--filter", pkgName, "run", "test"], { cwd: repoRoot }),
    ).resolves.toBeDefined();

    // The check:deps CLI cruises the whole repo (tooling/check-deps/src/check-deps.ts), so this
    // also proves the new game doesn't break any other package's boundaries. Spawned as a
    // subprocess, not imported, so it doesn't trip the no-tool-imports-another-tool rule.
    await expect(run(process.execPath, [checkDepsCli], { cwd: repoRoot })).resolves.toBeDefined();
  });
});
