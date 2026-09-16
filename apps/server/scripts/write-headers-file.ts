// Run by `pnpm build` after the static assets are assembled into dist/public
// (docs/architecture/security.md, "Headers", point 1). Node 24 runs this .ts file directly; no
// build step of its own.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { buildHeadersFile } from "../src/security/headers.ts";

const outDir = fileURLToPath(new URL("../dist/public", import.meta.url));
await mkdir(outDir, { recursive: true });
await writeFile(`${outDir}/_headers`, buildHeadersFile());
