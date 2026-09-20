import { readFileSync } from "node:fs";
import { join } from "node:path";
import { build } from "vite";
import type { AppMeasurements, BuiltItem, LazyChunkMatcher } from "./classify.ts";
import { measureApp } from "./classify.ts";
import { formatReport, type CheckResult } from "./report.ts";
import { parseSize } from "./size.ts";

/** One row of `.size-limit.json` at the repo root. */
export interface BudgetCheckConfig {
  name: string;
  /** Which app's build to measure. Its Vite config is read from `apps/<app>/vite.config.ts`. */
  app: "controller" | "host";
  /**
   * - `platform`: everything the app loads before a game is picked or a lazy screen opens (see `classify.ts`).
   * - `per-game`: checked once per `games/<id>/` the build actually emits a chunk for.
   * - `fonts`: raw size of every `.woff2` asset the app's build emits.
   * - `vendor`: gzip size of chunks built from the npm package named in `vendor`.
   * - `lazy`: gzip size of the chunk(s) whose `facadeModuleId` contains `path` — a platform screen
   *   loaded through a dynamic `import()`, so it's excluded from `platform` (it never loads before
   *   the screen it belongs to opens).
   */
  kind: "platform" | "per-game" | "fonts" | "vendor" | "lazy";
  vendor?: string;
  /** Required for `kind: "lazy"`: a substring of the matching chunk's `facadeModuleId`. */
  path?: string;
  /** `true` measures gzip size (code budgets); `false` measures the file as built (fonts). */
  gzip: boolean;
  limit: string;
  note?: string;
}

export interface RunBudgetsOptions {
  /** Repo root. Defaults resolve relative to it: `apps/<app>/vite.config.ts`, `.size-limit.json`. */
  rootDir: string;
  configFile?: string;
}

export interface BudgetsResult {
  results: CheckResult[];
  pass: boolean;
  report: string;
}

function loadConfig(configFile: string): BudgetCheckConfig[] {
  const parsed: unknown = JSON.parse(readFileSync(configFile, "utf8"));
  if (!Array.isArray(parsed))
    throw new Error(`${configFile} must be a JSON array of budget checks.`);
  for (const entry of parsed as Record<string, unknown>[]) {
    if (typeof entry.name !== "string" || typeof entry.limit !== "string") {
      throw new Error(`${configFile}: every budget check needs a "name" and a "limit".`);
    }
    if (entry.kind === "vendor" && typeof entry.vendor !== "string") {
      throw new Error(
        `${configFile}: "${entry.name as string}" has kind "vendor" but no "vendor".`,
      );
    }
    if (entry.kind === "lazy" && typeof entry.path !== "string") {
      throw new Error(`${configFile}: "${entry.name as string}" has kind "lazy" but no "path".`);
    }
  }
  return parsed as BudgetCheckConfig[];
}

/**
 * The slice of Rolldown's `RolldownOutput` this file reads. Typed locally instead of imported
 * from `rolldown` (an undeclared transitive dependency pulled in only through `vite`), so the
 * budgets tool depends on nothing beyond its own `package.json`.
 */
interface BuildOutput {
  output: ReadonlyArray<
    | {
        type: "chunk";
        fileName: string;
        facadeModuleId: string | null;
        moduleIds: readonly string[];
        code: string;
      }
    | { type: "asset"; fileName: string; source: string | Uint8Array }
  >;
}

/** Builds one app (in memory, `write: false`) and returns its chunks and assets. */
async function buildApp(rootDir: string, app: BudgetCheckConfig["app"]): Promise<BuiltItem[]> {
  const root = join(rootDir, "apps", app);
  // `root` must be passed explicitly: Vite otherwise resolves the html entry against
  // `process.cwd()`, not the config file's own directory, and this CLI runs from elsewhere.
  const result = await build({
    root,
    configFile: join(root, "vite.config.ts"),
    // Forced explicitly: this file is also called from inside Vitest (NODE_ENV=test), which
    // otherwise makes Vite build a larger, unminified-equivalent bundle and inflates every
    // measurement here well past what actually ships.
    mode: "production",
    build: { write: false },
    logLevel: "warn",
  });
  const outputs = Array.isArray(result) ? result : [result];

  const items: BuiltItem[] = [];
  for (const output of outputs as unknown as BuildOutput[]) {
    for (const item of output.output) {
      items.push(
        item.type === "chunk"
          ? {
              type: "chunk",
              fileName: item.fileName,
              facadeModuleId: item.facadeModuleId,
              moduleIds: item.moduleIds,
              code: item.code,
            }
          : { type: "asset", fileName: item.fileName, source: item.source },
      );
    }
  }
  return items;
}

function checkResult(
  name: string,
  measuredBytes: number,
  limitBytes: number,
  note: string | undefined,
): CheckResult {
  return { name, measuredBytes, limitBytes, pass: measuredBytes <= limitBytes, note };
}

/**
 * Runs every budget check in `.size-limit.json`, building each referenced app once via the Vite
 * API. Self-contained (it builds `apps/controller` and `apps/host` itself), so `pnpm budgets` works
 * as its own CI job without depending on a prior `pnpm build`.
 */
export async function runBudgets({
  rootDir,
  configFile = join(rootDir, ".size-limit.json"),
}: RunBudgetsOptions): Promise<BudgetsResult> {
  const checks = loadConfig(configFile);

  const apps = [...new Set(checks.map((c) => c.app))];
  const measurements = new Map<string, AppMeasurements>();
  for (const app of apps) {
    const vendors = checks
      .filter((c) => c.app === app && c.kind === "vendor")
      .map((c) => c.vendor as string);
    const lazyChunks: LazyChunkMatcher[] = checks
      .filter((c) => c.app === app && c.kind === "lazy")
      .map((c) => ({ name: c.name, path: c.path as string }));
    measurements.set(app, measureApp(await buildApp(rootDir, app), vendors, lazyChunks));
  }

  const results: CheckResult[] = [];
  for (const check of checks) {
    const measurement = measurements.get(check.app);
    if (!measurement) continue; // unreachable: every app in checks was just measured above
    const limitBytes = parseSize(check.limit);

    switch (check.kind) {
      case "platform":
        results.push(
          checkResult(check.name, measurement.platformGzipBytes, limitBytes, check.note),
        );
        break;
      case "fonts":
        results.push(checkResult(check.name, measurement.fontsRawBytes, limitBytes, check.note));
        break;
      case "vendor":
        results.push(
          checkResult(
            check.name,
            measurement.vendorGzipBytes.get(check.vendor as string) ?? 0,
            limitBytes,
            check.note,
          ),
        );
        break;
      case "per-game":
        if (measurement.perGame.size === 0) {
          results.push(
            checkResult(`${check.name} (no games built yet)`, 0, limitBytes, check.note),
          );
        } else {
          for (const [gameId, bytes] of measurement.perGame) {
            results.push(checkResult(`${check.name} (${gameId})`, bytes, limitBytes, check.note));
          }
        }
        break;
      case "lazy":
        results.push(
          checkResult(
            check.name,
            measurement.lazyGzipBytes.get(check.name) ?? 0,
            limitBytes,
            check.note,
          ),
        );
        break;
    }
  }

  const pass = results.every((r) => r.pass);
  return { results, pass, report: formatReport(results) };
}
