import { repoRoot } from "./repo-root.ts";
import { checkAllGameAssets, formatCheckReport, hasViolations } from "./check.ts";

// Usage: pnpm --filter ./tooling/assets run check-sprites
// Checks every games/*/assets/**/*.png against its scene palette and the world grid. Not wired
// into a root script yet: CC-4.10 (check:style) is expected to call checkAllGameAssets() itself.
const results = await checkAllGameAssets(repoRoot);
process.stdout.write(formatCheckReport(results));
process.exitCode = hasViolations(results) ? 1 : 0;
