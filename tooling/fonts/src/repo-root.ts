import { fileURLToPath } from "node:url";

/** The real repo root, resolved from this file's own location (tooling/fonts/src/repo-root.ts). */
export const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
