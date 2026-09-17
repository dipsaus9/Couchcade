import { fileURLToPath } from "node:url";
import { runBudgets } from "./budgets.ts";

// Usage: node src/cli.ts [rootDir]. rootDir defaults to the repo root; tests pass a fixture repo.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const rootDir = process.argv[2] ?? repoRoot;

const { pass, report } = await runBudgets({ rootDir });

process.stdout.write(report);
process.exitCode = pass ? 0 : 1;
