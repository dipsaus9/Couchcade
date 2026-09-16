import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The dev server reads local secrets from apps/server/.dev.vars (docs/architecture/platform.md,
// "Development topology"). E2E runs only ever use the committed test values from the example.
const example = fileURLToPath(new URL("../../apps/server/.dev.vars.example", import.meta.url));
const devVars = fileURLToPath(new URL("../../apps/server/.dev.vars", import.meta.url));

/**
 * Creates apps/server/.dev.vars from the example when it is missing, so a fresh checkout or a CI
 * runner can start the dev server. An existing file is never touched or read.
 */
export function ensureDevVars(): void {
  if (!existsSync(devVars)) copyFileSync(example, devVars);
}

/**
 * The host passcode the tests type into the TV's passcode form: `E2E_HOST_PASSCODE` when set
 * (for a local .dev.vars with its own passcode), else the test value from .dev.vars.example.
 */
export function hostPasscode(): string {
  const fromEnv = process.env["E2E_HOST_PASSCODE"];
  if (fromEnv) return fromEnv;
  const line = /^HOST_PASSCODE=(.+)$/m.exec(readFileSync(example, "utf8"));
  if (!line?.[1]) throw new Error("HOST_PASSCODE is missing from apps/server/.dev.vars.example");
  return line[1].trim();
}
