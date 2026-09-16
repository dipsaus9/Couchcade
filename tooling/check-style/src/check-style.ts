import { checkColorsAndFonts } from "./rules/colors-and-fonts.ts";
import { checkNewDate } from "./rules/new-date.ts";
import { checkSharedGlobals } from "./rules/shared-globals.ts";
import { checkVHtml } from "./rules/v-html.ts";
import { runSpriteCheck } from "./sprite-check.ts";
import type { SpriteCheckResult } from "./sprite-check.ts";
import type { StyleViolation } from "./types.ts";

export interface CheckStyleOptions {
  /** The tree to scan for house-style violations - the repo root, or a fixture repo in tests. */
  rootDir: string;
  /**
   * Where tooling/assets/src/check-cli.ts actually lives - the real repo root, even when `rootDir`
   * is a fixture that doesn't have a tooling/ folder of its own. Defaults to `rootDir`.
   */
  toolingRoot?: string;
  /** Injectable for tests; defaults to the real subprocess-spawning sprite check. */
  runSprites?: (repoRoot: string, targetRoot: string) => Promise<SpriteCheckResult>;
}

export interface CheckStyleResult {
  readonly violations: readonly StyleViolation[];
  readonly sprites: SpriteCheckResult;
  readonly exitCode: number;
  readonly report: string;
}

/**
 * Runs every check:style rule (AC1-3, plus the orchestrator-requested DOM/timer ban) and the
 * sprite palette/grid check (CC-4.9, wired in per its own TODO), and combines them into one
 * report and exit code.
 */
export async function checkStyle({
  rootDir,
  toolingRoot = rootDir,
  runSprites = runSpriteCheck,
}: CheckStyleOptions): Promise<CheckStyleResult> {
  const violations = [
    ...checkColorsAndFonts(rootDir),
    ...checkVHtml(rootDir),
    ...checkNewDate(rootDir),
    ...checkSharedGlobals(rootDir),
  ].toSorted((a, b) => a.file.localeCompare(b.file) || a.line - b.line);

  const sprites = await runSprites(toolingRoot, rootDir);

  const ruleReport =
    violations.length === 0
      ? "check:style: colours, fonts, v-html and shared/ purity are clean"
      : violations.map((v) => `${v.file}:${v.line}: ${v.message}`).join("\n");

  const report = `${ruleReport}\n\n${sprites.report.trimEnd()}\n`;
  const exitCode = violations.length > 0 || sprites.exitCode !== 0 ? 1 : 0;

  return { violations, sprites, exitCode, report };
}
