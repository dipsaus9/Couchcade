/**
 * `pnpm create-game <id> "<Title>"` (docs/architecture/session-flow.md, "Create-game template").
 * Validates the id and title, scaffolds `games/<id>` from tooling/create-game/template/, links it
 * into the workspace with `pnpm install`, and prints the checklist for what's left before the
 * game can merge.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checklist, validateId, validateTitle, writeGame } from "./generate.ts";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const gamesDir = join(repoRoot, "games");

const usage = [
  'Usage: pnpm create-game <id> "<Title>"',
  "  id: kebab-case, e.g. paddle-panic",
  '  Title: sentence case, at most 16 characters, e.g. "Paddle Panic"',
].join("\n");

const [id, title] = process.argv.slice(2);
if (id === undefined || title === undefined) {
  process.stderr.write(`${usage}\n`);
  process.exit(1);
}

const problems = [...validateId(id, gamesDir), ...validateTitle(title)];
if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.stderr.write(`\n${usage}\n`);
  process.exit(1);
}

writeGame({ id, title, gamesDir });

const install = spawnSync("pnpm", ["install"], { cwd: repoRoot, stdio: "inherit" });
if (install.status !== 0) {
  process.stderr.write(
    `games/${id} was written, but \`pnpm install\` failed. Run it yourself to link it.\n`,
  );
  process.exit(1);
}

process.stdout.write(checklist(id));
