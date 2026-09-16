import { checkStyle } from "./check-style.ts";
import { repoRoot } from "./repo-root.ts";

// Usage: node src/cli.ts [rootDir]. rootDir defaults to the repo root; tests pass a fixture repo.
const rootDir = process.argv[2] ?? repoRoot;

const { exitCode, report } = await checkStyle({ rootDir, toolingRoot: repoRoot });

process.stdout.write(report);
process.exitCode = exitCode;
