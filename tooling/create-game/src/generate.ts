/**
 * Generates a new game package from tooling/create-game/template/ (docs/architecture/session-flow.md,
 * "Create-game template"). Pure file work: nothing here runs `pnpm install` or talks to the network,
 * so it's cheap to call from a test.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { maxTitleLength } from "@couchcade/game-sdk/contract";

/** `tooling/create-game/template/`, resolved relative to this module. */
export const templateDir = fileURLToPath(new URL("../template/", import.meta.url));

/** `^[a-z][a-z0-9-]{1,23}$` (docs/architecture/session-flow.md, "Checks before writing anything"). */
const idPattern = /^[a-z][a-z0-9-]{1,23}$/;

export interface GenerateOptions {
  id: string;
  title: string;
  /** The `games/` folder to write into. Defaults to `<repo root>/games`. */
  gamesDir: string;
}

/**
 * The problems with `id`: not kebab-case, or `games/<id>` already exists. An empty list means the
 * id is safe to scaffold.
 */
export function validateId(id: string, gamesDir: string): string[] {
  const problems: string[] = [];
  if (!idPattern.test(id)) {
    problems.push(`id ${JSON.stringify(id)} must match ${idPattern.source} (kebab-case)`);
  }
  if (existsSync(join(gamesDir, id))) {
    problems.push(`games/${id} already exists`);
  }
  return problems;
}

/**
 * The problems with `title`: empty, not sentence case (doesn't start with an uppercase letter),
 * padded with whitespace, or over the menu view's 16-character limit
 * (`@couchcade/game-sdk/contract`'s `maxTitleLength`). An empty list means the title is safe to use.
 */
export function validateTitle(title: string): string[] {
  const problems: string[] = [];
  if (title.trim() !== title || title === "") {
    problems.push("title must not be empty or padded with whitespace");
  } else if (!/^[A-Z]/.test(title)) {
    problems.push(`title ${JSON.stringify(title)} must be sentence case (start with a capital)`);
  }
  if (title.length > maxTitleLength) {
    problems.push(`title ${JSON.stringify(title)} is longer than ${maxTitleLength} characters`);
  }
  return problems;
}

/** `quick-draw` -> `QuickDraw`. Used for exported type and class names. */
export function toPascalCase(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** `quick-draw` -> `quickDraw`. Used for constant names like a scene key. */
export function toCamelCase(id: string): string {
  const pascal = toPascalCase(id);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

/** The placeholder tokens a template file may contain, and what replaces them. */
function placeholders(id: string, title: string): Record<string, string> {
  return {
    __ID_PASCAL__: toPascalCase(id),
    __ID_CAMEL__: toCamelCase(id),
    __ID__: id,
    __TITLE__: title,
  };
}

/** Every file path in the template, relative to `templateDir`, in a stable order. */
function listTemplateFiles(dir: string = templateDir): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir).toSorted()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...listTemplateFiles(full));
    } else {
      files.push(relative(templateDir, full));
    }
  }
  return files;
}

function render(content: string, tokens: Record<string, string>): string {
  let result = content;
  for (const [token, value] of Object.entries(tokens)) {
    result = result.split(token).join(value);
  }
  return result;
}

/**
 * Writes a new game package to `<gamesDir>/<id>`, with every template file's placeholders
 * replaced. Doesn't check `validateId`/`validateTitle` itself: call them first.
 */
export function writeGame({ id, title, gamesDir }: GenerateOptions): void {
  const tokens = placeholders(id, title);
  const targetDir = join(gamesDir, id);
  for (const file of listTemplateFiles()) {
    const source = readFileSync(join(templateDir, file), "utf8");
    const target = join(targetDir, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, render(source, tokens));
  }
}

/** The checklist `pnpm create-game` prints once it's done (session-flow.md, "What it generates"). */
export function checklist(id: string): string {
  return [
    `Created games/${id}. Before this game can merge:`,
    `1. Write the spec in docs/games/${id}.md`,
    `2. Add the scene palette in packages/theme/src/scenes/${id}.ts (needs review) and set \`scene\``,
    `3. Add the bot match in e2e/games/${id}.spec.ts`,
    `4. Credit every CC0 asset in games/${id}/CREDITS.md`,
    "",
  ].join("\n");
}
