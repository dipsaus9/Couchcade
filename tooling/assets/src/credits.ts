import { existsSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** One row of a `CREDITS.md` asset table: HOUSE_STYLE.md's "asset, author, source URL and licence". */
export interface CreditEntry {
  readonly asset: string;
  readonly author: string;
  readonly source: string;
  readonly licence: string;
}

export interface ParsedCreditsFile {
  readonly entries: readonly CreditEntry[];
  readonly errors: readonly string[];
}

const URL_PATTERN = /^https?:\/\/\S+$/;
// CC0 only (HOUSE_STYLE.md, "Assets and credits"). Accepts "CC0" and versioned forms like
// "CC0 1.0" so a copy-pasted licence string from a CC0 pack still validates.
const CC0_PATTERN = /^CC0(\s|$)/i;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

/**
 * Parses and validates a `CREDITS.md` asset table: `| Asset | Author | Source | Licence |`. The
 * first `|`-prefixed line is the header, the next (if a `---` separator) is skipped, and every
 * other `|`-prefixed line is one entry. `location` (e.g. `games/quick-draw/CREDITS.md`) names the
 * file in error messages. A file with no table at all parses to zero entries and no errors: a game
 * can ship a `CREDITS.md` that just says it has no CC0 assets yet.
 */
export function parseCreditsFile(content: string, location: string): ParsedCreditsFile {
  const rows = content.split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  const entries: CreditEntry[] = [];
  const errors: string[] = [];

  const dataRows = rows.slice(rows.length > 0 ? 1 : 0); // drop the header row
  let rowNumber = 0;
  for (const line of dataRows) {
    const cells = splitRow(line);
    if (isSeparatorRow(cells)) continue;
    rowNumber++;

    if (cells.length !== 4) {
      errors.push(
        `${location} row ${rowNumber}: expected 4 columns (asset, author, source, licence), got ${cells.length}`,
      );
      continue;
    }
    const [asset, author, source, licence] = cells as [string, string, string, string];
    if (!asset) errors.push(`${location} row ${rowNumber}: asset is empty`);
    if (!author) errors.push(`${location} row ${rowNumber}: author is empty`);
    if (!source || !URL_PATTERN.test(source)) {
      errors.push(`${location} row ${rowNumber}: source must be a http(s) URL, got "${source}"`);
    }
    if (!licence || !CC0_PATTERN.test(licence)) {
      errors.push(
        `${location} row ${rowNumber}: licence must be CC0 (HOUSE_STYLE.md, "Assets and credits"), got "${licence}"`,
      );
    }
    if (asset && author && URL_PATTERN.test(source) && CC0_PATTERN.test(licence)) {
      entries.push({ asset, author, source, licence });
    }
  }

  return { entries, errors };
}

export interface GameCredits {
  readonly game: string;
  readonly entries: readonly CreditEntry[];
}

export interface AggregatedCredits {
  /** The generated `docs/CREDITS.md` content. */
  readonly markdown: string;
  /** Validation errors across every game's and app's `CREDITS.md`. Non-empty means don't write `markdown`. */
  readonly errors: readonly string[];
  readonly games: readonly GameCredits[];
  /** Every app's `CREDITS.md` entry, collected into one "Platform" section of `docs/CREDITS.md`. */
  readonly platform: readonly CreditEntry[];
}

function titleCase(id: string): string {
  return id
    .split("-")
    .map((word) => (word.length > 0 ? word[0]!.toUpperCase() + word.slice(1) : word))
    .join(" ");
}

function hasFiles(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir, { recursive: true }).length > 0;
}

/**
 * Validates one directory of id-named subdirectories (`games/` or `apps/`), each optionally
 * carrying a `<parent>/<id>/CREDITS.md`, against the id's shipped-asset directory. A missing
 * `CREDITS.md` is only an error when that directory has files — an id with nothing shipped yet
 * has nothing to credit, so it isn't required to have the file.
 */
async function collectCredits(
  parentDir: string,
  parentLabel: string,
  assetsSubdir: string,
): Promise<{ errors: string[]; entries: Map<string, readonly CreditEntry[]> }> {
  const errors: string[] = [];
  const entries = new Map<string, readonly CreditEntry[]>();
  if (!existsSync(parentDir)) return { errors, entries };

  const ids = readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .toSorted();

  for (const id of ids) {
    const dir = join(parentDir, id);
    const assetsDir = join(dir, assetsSubdir);
    const creditsPath = join(dir, "CREDITS.md");

    if (!existsSync(creditsPath)) {
      if (hasFiles(assetsDir)) {
        errors.push(
          `${parentLabel}/${id}/CREDITS.md is missing, but ${parentLabel}/${id}/${assetsSubdir}/ has files ` +
            `(HOUSE_STYLE.md, "Assets and credits": every CC0 asset needs a credit)`,
        );
      }
      continue;
    }

    const location = `${parentLabel}/${id}/CREDITS.md`;
    const content = await readFile(creditsPath, "utf8");
    const { entries: fileEntries, errors: fileErrors } = parseCreditsFile(content, location);
    errors.push(...fileErrors);
    if (fileEntries.length > 0) entries.set(id, fileEntries);
  }

  return { errors, entries };
}

/**
 * Validates and aggregates every game's and every app's `CREDITS.md` into one `docs/CREDITS.md`:
 * each game gets its own section, and every app's `CREDITS.md` entry (platform sounds, platform
 * sprites, …) is collected into one shared "Platform" section
 * (`docs/architecture/audio.md`, CC-7.3 conflict #1). A missing `CREDITS.md` is only an error when
 * the game or app has shipped assets (`games/<id>/assets/` or `apps/<id>/public/` exists and isn't
 * empty) — an id with no CC0 assets yet, like `games/quick-draw` today, has nothing to credit, so
 * it isn't required to have the file.
 */
export async function aggregateCredits(repoRoot: string): Promise<AggregatedCredits> {
  const gameResult = await collectCredits(join(repoRoot, "games"), "games", "assets");
  const appResult = await collectCredits(join(repoRoot, "apps"), "apps", "public");

  const games: GameCredits[] = Array.from(gameResult.entries, ([game, entries]) => ({
    game,
    entries,
  }));
  const platform: CreditEntry[] = Array.from(appResult.entries.values()).flat();

  return {
    markdown: renderCreditsMarkdown(games, platform),
    errors: [...gameResult.errors, ...appResult.errors],
    games,
    platform,
  };
}

function renderCreditsMarkdown(
  games: readonly GameCredits[],
  platform: readonly CreditEntry[],
): string {
  const lines = [
    "# Credits",
    "",
    "Every CC0 asset Couchcade uses, collected from each game's `CREDITS.md` and every " +
      "`apps/*/CREDITS.md` (see [`docs/HOUSE_STYLE.md`](HOUSE_STYLE.md#assets-and-credits)). " +
      "Generated by `tooling/assets`; run `pnpm --filter ./tooling/assets run credits` after " +
      "adding or changing a `CREDITS.md`. Don't hand-edit this file.",
    "",
  ];

  const renderTable = (entries: readonly CreditEntry[]) => {
    lines.push("| Asset | Author | Source | Licence |", "| --- | --- | --- | --- |");
    for (const entry of entries) {
      lines.push(`| ${entry.asset} | ${entry.author} | ${entry.source} | ${entry.licence} |`);
    }
    lines.push("");
  };

  if (games.length === 0 && platform.length === 0) {
    lines.push("No CC0 assets are in use yet.", "");
  } else {
    if (platform.length > 0) {
      lines.push("## Platform", "");
      renderTable(platform);
    }
    for (const game of games) {
      lines.push(`## ${titleCase(game.game)}`, "");
      renderTable(game.entries);
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
