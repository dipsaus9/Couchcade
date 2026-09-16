import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export type FixtureFiles = Record<string, string | Buffer>;

function write(rootDir: string, path: string, content: string | Buffer): void {
  const file = join(rootDir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * A throwaway temp folder with `files` written into it, for tests that need a small repo-shaped
 * tree without touching the real repo. Call `removeFixtureRoot` when done.
 */
export function createFixtureRoot(files: FixtureFiles): string {
  const rootDir = realpathSync(mkdtempSync(join(tmpdir(), "couchcade-check-style-")));
  for (const [path, content] of Object.entries(files)) write(rootDir, path, content);
  return rootDir;
}

export function removeFixtureRoot(rootDir: string): void {
  rmSync(rootDir, { recursive: true, force: true });
}
