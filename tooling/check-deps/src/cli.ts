import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE_NAME, checkDeps } from "./check-deps.ts";

// Usage: node src/cli.ts [rootDir]. rootDir defaults to the repo root; tests pass a fixture repo.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const rootDir = process.argv[2] ?? repoRoot;

const { errorCount, report } = await checkDeps({
  rootDir,
  configFile: join(repoRoot, CONFIG_FILE_NAME),
});

process.stdout.write(report);
process.exitCode = errorCount > 0 ? 1 : 0;
