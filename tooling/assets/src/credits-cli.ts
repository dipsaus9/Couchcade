import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { aggregateCredits } from "./credits.ts";
import { repoRoot } from "./repo-root.ts";

// Usage: pnpm --filter ./tooling/assets run credits
// Validates every games/*/CREDITS.md and apps/*/CREDITS.md and (re)writes docs/CREDITS.md from
// them. Run this after adding or editing a game's or app's CREDITS.md; test/credits.test.ts fails
// CI if docs/CREDITS.md drifts.
const { markdown, errors } = await aggregateCredits(repoRoot);

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n\ncredits: ${errors.length} error(s)\n`);
  process.exitCode = 1;
} else {
  await writeFile(join(repoRoot, "docs/CREDITS.md"), markdown);
  process.stdout.write("Wrote docs/CREDITS.md\n");
}
