import { repoRoot } from "./repo-root.ts";
import { checkAllGameAssets, formatCheckReport, hasViolations } from "./check.ts";

// Usage: pnpm --filter ./tooling/assets run check-sprites [rootDir]. rootDir defaults to the repo
// root (mirroring tooling/check-deps/src/cli.ts); tooling/check-style passes a fixture root in its
// own tests. Checks every games/*/assets/**/*.png against its scene palette and the world grid.
// Wired into `pnpm check:style` by tooling/check-style/src/sprite-check.ts (CC-4.10), which spawns
// this CLI as a child process rather than importing it, since dependency-cruiser's
// no-tool-imports-another-tool rule forbids one tool statically importing another.
const rootDir = process.argv[2] ?? repoRoot;

const results = await checkAllGameAssets(rootDir);
process.stdout.write(formatCheckReport(results));
process.exitCode = hasViolations(results) ? 1 : 0;
