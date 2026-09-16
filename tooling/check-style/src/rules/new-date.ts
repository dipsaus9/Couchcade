import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanGamesShared } from "../scan.ts";
import { lineAt, stripComments } from "../text.ts";
import type { StyleViolation } from "../types.ts";

const NEW_DATE = /\bnew\s+Date\s*\(/g;

/**
 * AC3: fails on `new Date(` inside `games/*\/src/shared/`. Game rules are pure functions of
 * players, seed and inputs (docs/architecture/platform.md rule 10); time only arrives as `dtMs` or
 * `InputContext` (platform.md line 591). `Math.random`/`Date.now`/`performance.now` are already
 * banned there by Oxlint (.oxlintrc.json); `new Date()` is the one Oxlint doesn't cover, which is
 * why it's `check:style`'s job (README "Scripts": "new Date() in shared/").
 */
export function checkNewDate(rootDir: string): StyleViolation[] {
  const violations: StyleViolation[] = [];
  const files = scanGamesShared(rootDir, [".ts", ".tsx"]);

  for (const file of files) {
    const source = stripComments(readFileSync(join(rootDir, file), "utf8"));
    for (const match of source.matchAll(NEW_DATE)) {
      violations.push({
        file,
        line: lineAt(source, match.index ?? 0),
        message: `new Date(...) is banned in games/*/src/shared/ - game rules only see game time (dtMs / InputContext)`,
      });
    }
  }

  return violations;
}
