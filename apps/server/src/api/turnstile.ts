import { verifyTurnstile, type TurnstileAction } from "../security/turnstile.ts";
import type { ApiErrorCode } from "./errors.ts";
import { secretMatches } from "./passcode.ts";

/** The header the deploy smoke test sends its smoke token in (security.md, decision 19). */
export const smokeHeader = "x-cc-smoke";

/**
 * The Turnstile step of an endpoint (docs/architecture/security.md, "Where Turnstile runs").
 * Resolves to the error to answer with, or null when the token passed.
 */
export async function turnstileError(
  request: Request,
  token: string,
  action: TurnstileAction,
  env: Pick<Cloudflare.Env, "TURNSTILE_SECRET_KEY">,
): Promise<ApiErrorCode | null> {
  const result = await verifyTurnstile({
    token,
    secret: env.TURNSTILE_SECRET_KEY,
    action,
    hostname: new URL(request.url).hostname,
  });
  if (result === "passed") return null;
  return result === "failed" ? "turnstile-failed" : "turnstile-unavailable";
}

/**
 * True when the request carries the smoke token: an `x-cc-smoke` header equal to the SMOKE_TOKEN
 * secret, compared in constant time. Only `POST /api/rooms` asks, and it skips only Turnstile. A
 * wrong or missing header, or an unset secret, means the normal Turnstile check runs.
 */
export function hasSmokeToken(
  request: Request,
  env: Pick<Cloudflare.Env, "SMOKE_TOKEN">,
): Promise<boolean> {
  const header = request.headers.get(smokeHeader);
  return header === null ? Promise.resolve(false) : secretMatches(header, env.SMOKE_TOKEN);
}
