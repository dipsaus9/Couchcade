import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scanFiles } from "../scan.ts";
import { lineAt } from "../text.ts";
import type { StyleViolation } from "../types.ts";

const V_HTML = /\bv-html\b/g;

/** AC2: fails on `v-html` in any `.vue` file (README "Security": "XSS: ... v-html banned by check:style"). */
export function checkVHtml(rootDir: string): StyleViolation[] {
  const violations: StyleViolation[] = [];
  const files = scanFiles(rootDir, {
    dirs: ["apps", "games", "packages", "e2e"],
    extensions: [".vue"],
  });

  for (const file of files) {
    const source = readFileSync(join(rootDir, file), "utf8");
    for (const match of source.matchAll(V_HTML)) {
      violations.push({
        file,
        line: lineAt(source, match.index ?? 0),
        message: `v-html is banned - all user text renders as text (XSS)`,
      });
    }
  }

  return violations;
}
