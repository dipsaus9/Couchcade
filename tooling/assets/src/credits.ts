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
  /** Validation errors across every game's `CREDITS.md`. Non-empty means don't write `markdown`. */
  readonly errors: readonly string[];
  readonly games: readonly GameCredits[];
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
 * Validates and aggregates every game's `CREDITS.md` into one `docs/CREDITS.md`.
 *
 * A missing `CREDITS.md` is only an error when the game has shipped assets
 * (`games/<id>/assets/` exists and isn't empty) — a game with no CC0 sprites yet, like
 * `games/quick-draw` today, has nothing to credit, so it isn't required to have the file.
 */
export async function aggregateCredits(repoRoot: string): Promise<AggregatedCredits> {
  const gamesDir = join(repoRoot, "games");
  const errors: string[] = [];
  const games: GameCredits[] = [];

  if (existsSync(gamesDir)) {
    const gameIds = readdirSync(gamesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .toSorted();

    for (const gameId of gameIds) {
      const gameDir = join(gamesDir, gameId);
      const assetsDir = join(gameDir, "assets");
      const creditsPath = join(gameDir, "CREDITS.md");

      if (!existsSync(creditsPath)) {
        if (hasFiles(assetsDir)) {
          errors.push(
            `games/${gameId}/CREDITS.md is missing, but games/${gameId}/assets/ has files ` +
              `(HOUSE_STYLE.md, "Assets and credits": every CC0 asset needs a credit)`,
          );
        }
        continue;
      }

      const location = `games/${gameId}/CREDITS.md`;
      const content = await readFile(creditsPath, "utf8");
      const { entries, errors: fileErrors } = parseCreditsFile(content, location);
      errors.push(...fileErrors);
      if (entries.length > 0) games.push({ game: gameId, entries });
    }
  }

  return { markdown: renderCreditsMarkdown(games), errors, games };
}

function renderCreditsMarkdown(games: readonly GameCredits[]): string {
  const lines = [
    "# Credits",
    "",
    "Every CC0 asset Couchcade uses, collected from each game's `CREDITS.md` (see " +
      "[`docs/HOUSE_STYLE.md`](HOUSE_STYLE.md#assets-and-credits)). Generated by `tooling/assets`; " +
      "run `pnpm --filter ./tooling/assets run credits` after adding or changing a game's " +
      "`CREDITS.md`. Don't hand-edit this file.",
    "",
  ];

  if (games.length === 0) {
    lines.push("No CC0 assets are in use yet.", "");
  } else {
    for (const game of games) {
      lines.push(
        `## ${titleCase(game.game)}`,
        "",
        "| Asset | Author | Source | Licence |",
        "| --- | --- | --- | --- |",
      );
      for (const entry of game.entries) {
        lines.push(`| ${entry.asset} | ${entry.author} | ${entry.source} | ${entry.licence} |`);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
