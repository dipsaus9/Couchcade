import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanGamesShared } from "../scan.ts";
import { lineAt, stripComments } from "../text.ts";
import type { StyleViolation } from "../types.ts";

/**
 * Orchestrator-requested scope (2026-09-16, from docs/HOUSE_STYLE.md's enforcement list and
 * docs/architecture/platform.md: "src/shared/ ... No phaser, vue, DOM or timers"): games/*\/src/
 * shared/ never reaches the DOM or a browser timer, because it runs on the TV, replays
 * deterministically and is unit-tested outside a browser.
 *
 * `Math.random`, `Date.now` and `performance.now` are deliberately NOT in this list: they're
 * already banned for this exact path by Oxlint's `no-restricted-properties` override
 * (.oxlintrc.json) - repeating them here would double-report the same violation from two tools.
 */
const BANNED_GLOBALS: ReadonlyMap<string, string> = new Map([
  ["window", "no DOM in game rules - games/*/src/shared/ runs on the TV and in tests alike"],
  ["document", "no DOM in game rules - games/*/src/shared/ runs on the TV and in tests alike"],
  ["setTimeout", "no timers in game rules - take dtMs on the fixed step instead"],
  ["setInterval", "no timers in game rules - take dtMs on the fixed step instead"],
  ["requestAnimationFrame", "no timers in game rules - take dtMs on the fixed step instead"],
]);

export function checkSharedGlobals(rootDir: string): StyleViolation[] {
  const violations: StyleViolation[] = [];
  const files = scanGamesShared(rootDir, [".ts", ".tsx"]);

  for (const file of files) {
    const source = stripComments(readFileSync(join(rootDir, file), "utf8"));
    for (const [name, reason] of BANNED_GLOBALS) {
      const pattern = new RegExp(`\\b${name}\\b`, "g");
      for (const match of source.matchAll(pattern)) {
        violations.push({
          file,
          line: lineAt(source, match.index ?? 0),
          message: `"${name}" is banned in games/*/src/shared/ - ${reason}`,
        });
      }
    }
  }

  return violations;
}
