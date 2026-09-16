import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repoRoot } from "./repo-root.ts";
import { FONT_SOURCES } from "./sources.ts";
import { subsetFredoka, subsetPixelifySans } from "./subset.ts";

// Usage: pnpm fonts:subset (root script) or pnpm --filter ./tooling/fonts run fonts:subset.
// Downloads the two upstream OFL variable fonts (sources.ts, pinned to one commit), subsets each
// to the English charset in charset.ts, and writes the WOFF2 + its OFL.txt to
// packages/theme/fonts/<id>/. Network is only needed to re-run this; the committed output is
// what ships. AC1: the two WOFF2 files together must stay at or under 40 KB.

const BUDGET_BYTES = 40 * 1024;

const SUBSETTERS: Record<string, (ttf: Buffer) => Promise<Buffer>> = {
  fredoka: subsetFredoka,
  "pixelify-sans": subsetPixelifySans,
};

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

let total = 0;
for (const source of FONT_SOURCES) {
  const subset = SUBSETTERS[source.id];
  if (!subset) throw new Error(`No subsetter registered for "${source.id}"`);

  const [ttf, ofl] = await Promise.all([fetchBuffer(source.ttfUrl), fetchBuffer(source.oflUrl)]);
  const woff2 = await subset(ttf);

  const outDir = join(repoRoot, "packages/theme/fonts", source.id);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, source.outputFile), woff2);
  await writeFile(join(outDir, "OFL.txt"), ofl);

  total += woff2.length;
  process.stdout.write(
    `${source.id}: ${woff2.length} bytes -> packages/theme/fonts/${source.id}/${source.outputFile}\n`,
  );
}

process.stdout.write(`total: ${total} bytes (budget ${BUDGET_BYTES} bytes)\n`);
if (total > BUDGET_BYTES) {
  process.stderr.write(`Over budget by ${total - BUDGET_BYTES} bytes.\n`);
  process.exitCode = 1;
}
