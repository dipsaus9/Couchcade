import { existsSync } from "node:fs";
import { join } from "node:path";
import { cruise, format } from "dependency-cruiser";
import type {
  ICruiseOptions,
  ICruiseResult,
  IForbiddenRuleType,
  IViolation,
} from "dependency-cruiser";
import extractDepcruiseOptions from "dependency-cruiser/config-utl/extract-depcruise-options";

/** The workspace folders the boundaries cover. spikes/ is throwaway and stays out. */
export const WORKSPACE_ROOTS = ["apps", "games", "packages", "tooling", "e2e"] as const;

/** The rules live at the repo root, next to the code they guard. */
export const CONFIG_FILE_NAME = ".dependency-cruiser.cjs";

export interface CheckDepsOptions {
  /** The folder the rule paths are relative to: the repo root, or a fixture repo in tests. */
  rootDir: string;
  /** The rules file. Defaults to `.dependency-cruiser.cjs` in `rootDir`. */
  configFile?: string;
}

export interface CheckDepsResult {
  /** Every rule violation, errors and warnings alike. */
  violations: IViolation[];
  /** Number of `error` violations. Any error fails the check. */
  errorCount: number;
  /** Human-readable report for the terminal and CI log. */
  report: string;
}

/** A rule with `to.reachable` follows imports transitively instead of checking one import. */
function isReachableRule(rule: IForbiddenRuleType): boolean {
  const { to } = rule as { to?: object };
  return to !== undefined && "reachable" in to;
}

/**
 * Cruises the workspace folders that exist in `rootDir` and validates them against the rules.
 * dependency-cruiser parses .ts with `typescript` and .vue with `@vue/compiler-sfc` (from `vue`),
 * both devDependencies here. Without the Vue compiler it would silently skip .vue files.
 *
 * It cruises twice. Import rules see type-only imports too, so a type that points up a tier still
 * fails. Reachable rules ask what ships at runtime, so they run on a second cruise without
 * type-only imports, which the build erases: game-sdk's contract type-imports phaser, and that
 * never reaches a phone.
 */
export async function checkDeps({
  rootDir,
  configFile = join(rootDir, CONFIG_FILE_NAME),
}: CheckDepsOptions): Promise<CheckDepsResult> {
  const roots = WORKSPACE_ROOTS.filter((dir) => existsSync(join(rootDir, dir)));
  if (roots.length === 0) {
    return { violations: [], errorCount: 0, report: "check:deps: no workspace folders to check\n" };
  }

  const options: ICruiseOptions = await extractDepcruiseOptions(configFile);
  const forbidden = options.ruleSet?.forbidden ?? [];
  const reachableRules = forbidden.filter(isReachableRule);

  const result = await cruiseWith(roots, {
    ...options,
    baseDir: rootDir,
    ruleSet: { ...options.ruleSet, forbidden: forbidden.filter((rule) => !isReachableRule(rule)) },
  });
  if (reachableRules.length > 0) {
    const runtime = await cruiseWith(roots, {
      ...options,
      baseDir: rootDir,
      tsPreCompilationDeps: false,
      ruleSet: { forbidden: reachableRules },
    });
    const { summary } = result;
    summary.violations = [...summary.violations, ...runtime.summary.violations];
    summary.error += runtime.summary.error;
    summary.warn += runtime.summary.warn;
    summary.info += runtime.summary.info;
  }
  const { output } = await format(result, { outputType: "err" });

  return {
    violations: result.summary.violations,
    errorCount: result.summary.error,
    report: String(output),
  };
}

async function cruiseWith(
  roots: readonly string[],
  options: ICruiseOptions,
): Promise<ICruiseResult> {
  const cruised = await cruise([...roots], options);
  return cruised.output as ICruiseResult;
}
