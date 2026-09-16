import { runSmoke, SmokeError } from "./smoke.ts";

// Usage: SMOKE_URL=https://… SMOKE_HOST_PASSCODE=… node src/cli.ts
// Exits 1 on any failure, so the deploy workflow fails with it.
const baseUrl = process.env.SMOKE_URL;
const passcode = process.env.SMOKE_HOST_PASSCODE;

try {
  if (!baseUrl) throw new SmokeError("SMOKE_URL isn't set");
  if (!passcode) throw new SmokeError("SMOKE_HOST_PASSCODE isn't set");
  process.stdout.write(`Smoke test against ${baseUrl}\n`);
  await runSmoke({ baseUrl, passcode, log: (line) => process.stdout.write(`${line}\n`) });
  process.stdout.write("Smoke test passed\n");
} catch (error) {
  const message = error instanceof SmokeError ? error.message : String(error);
  process.stderr.write(`Smoke test failed: ${message}\n`);
  process.exitCode = 1;
}
