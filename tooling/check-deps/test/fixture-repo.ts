import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The real repo root and its rules. Fixtures are checked against the same rules as the repo. */
export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const configFile = join(repoRoot, ".dependency-cruiser.cjs");

/** Every package in the tier map. A fixture repo gets a stub of each, linked as @couchcade/<name>. */
const PACKAGES = [
  "utils",
  "protocol",
  "theme",
  "game-sdk",
  "physics",
  "audio",
  "stage",
  "ui",
  "motion",
  "config",
];

/** Stand-ins for npm packages the rules care about. They're never run, only resolved. */
const NPM_PACKAGES = ["phaser", "vue", "zod"];

export type Files = Record<string, string>;

function write(rootDir: string, path: string, content: string): void {
  const file = join(rootDir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function baseFiles(): Files {
  const files: Files = {};
  for (const name of PACKAGES) {
    files[`packages/${name}/package.json`] = JSON.stringify({
      name: `@couchcade/${name}`,
      type: "module",
      exports: { ".": "./src/index.ts", "./*": "./src/*/index.ts" },
    });
    files[`packages/${name}/src/index.ts`] = `export const ${name.replace("-", "")} = 1;\n`;
  }
  for (const name of NPM_PACKAGES) {
    files[`node_modules/${name}/package.json`] = JSON.stringify({ name, main: "index.js" });
    files[`node_modules/${name}/index.js`] = "module.exports = {};\n";
  }
  return files;
}

/**
 * Writes a throwaway monorepo to a temp folder: stubs of every package and npm stand-ins, plus
 * `files` on top. Returns its path. Call `removeFixtureRepo` when done.
 */
export function createFixtureRepo(files: Files): string {
  const rootDir = realpathSync(mkdtempSync(join(tmpdir(), "check-deps-")));
  for (const [path, content] of Object.entries({ ...baseFiles(), ...files })) {
    write(rootDir, path, content);
  }
  // Workspace links, the way pnpm makes them: node_modules/@couchcade/<name> -> packages/<name>.
  mkdirSync(join(rootDir, "node_modules/@couchcade"), { recursive: true });
  for (const name of PACKAGES) {
    symlinkSync(join(rootDir, "packages", name), join(rootDir, "node_modules/@couchcade", name));
  }
  return rootDir;
}

export function removeFixtureRepo(rootDir: string): void {
  rmSync(rootDir, { recursive: true, force: true });
}
