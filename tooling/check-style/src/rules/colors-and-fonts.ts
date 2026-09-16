import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COLOR_AND_FONT_ALLOWLIST, isAllowlisted } from "../allowlist.ts";
import { scanFiles } from "../scan.ts";
import { lineAt, stripComments } from "../text.ts";
import type { StyleViolation } from "../types.ts";

const SCAN_DIRS = ["apps", "games", "packages", "tooling", "e2e"] as const;
const SCAN_EXTENSIONS = [".vue", ".css", ".ts", ".tsx"] as const;

/** `#abc`, `#abcd`, `#aabbcc` or `#aabbccdd`, not immediately followed by another hex/word char. */
const HEX_COLOR =
  /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-zA-Z])/g;
const RGB_HSL_FN = /\b(rgba?|hsla?)\s*\(/gi;
const CSS_FONT_FAMILY = /font-family\s*:\s*([^;]+);/g;
/** A Phaser/CSS-in-JS `fontFamily: "..."` with a literal string value (not a theme identifier). */
const JS_FONT_FAMILY = /\bfontFamily\s*:\s*(["'])((?:(?!\1)[^\\]|\\.)*)\1/g;
const CSS_VAR_FONT = /^var\(--cc-[\w-]+\)$/;

/**
 * AC1: fails on raw hex/rgb()/hsl() colours or hardcoded font-family values anywhere outside
 * `@couchcade/theme` (HOUSE_STYLE.md "How the style is enforced").
 *
 * Scope, by design (see tooling/check-style/src/allowlist.ts for the excluded paths):
 * - Raw hex/rgb()/hsl() and CSS `font-family:` are only meaningful as *declarations*, so they're
 *   only checked inside `.vue` `<style>` blocks and `.css` files - the only places this codebase
 *   authors CSS (every colour there is meant to be a `var(--cc-*)` reference).
 * - `.ts`/`.tsx` files are additionally checked for a literal `fontFamily: "..."` property (the
 *   Phaser text-style shape), since that's a real, historically easy house-style slip - but not
 *   for hex/rgb()/hsl(), which would false-positive on legitimate non-CSS code (a hex-to-rgb()
 *   test helper, a JSDoc example) that plain text scanning can't tell apart from a real CSS value.
 */
export function checkColorsAndFonts(rootDir: string): StyleViolation[] {
  const violations: StyleViolation[] = [];
  const files = scanFiles(rootDir, { dirs: SCAN_DIRS, extensions: SCAN_EXTENSIONS });

  for (const file of files) {
    if (isAllowlisted(file, COLOR_AND_FONT_ALLOWLIST)) continue;
    const source = stripComments(readFileSync(join(rootDir, file), "utf8"));
    const isStyleFile = file.endsWith(".vue") || file.endsWith(".css");

    if (isStyleFile) {
      for (const match of source.matchAll(HEX_COLOR)) {
        violations.push({
          file,
          line: lineAt(source, match.index ?? 0),
          message: `raw hex colour "${match[0]}" outside @couchcade/theme`,
        });
      }
      for (const match of source.matchAll(RGB_HSL_FN)) {
        violations.push({
          file,
          line: lineAt(source, match.index ?? 0),
          message: `raw "${match[1]!.toLowerCase()}(...)" colour outside @couchcade/theme`,
        });
      }
      for (const match of source.matchAll(CSS_FONT_FAMILY)) {
        const value = match[1]!.trim();
        if (CSS_VAR_FONT.test(value)) continue;
        violations.push({
          file,
          line: lineAt(source, match.index ?? 0),
          message: `font-family "${value}" outside @couchcade/theme (use var(--cc-font-...))`,
        });
      }
    }

    for (const match of source.matchAll(JS_FONT_FAMILY)) {
      violations.push({
        file,
        line: lineAt(source, match.index ?? 0),
        message: `fontFamily "${match[2]}" outside @couchcade/theme (use theme's font.ui / font.pixel)`,
      });
    }
  }

  return violations;
}
