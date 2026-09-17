// The Turnstile check on room creation and joining (docs/architecture/security.md, "Where Turnstile
// runs"). The Worker calls Siteverify once per request and fails closed.

export const siteverifyUrl = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Siteverify gets this long before the API gives up with 403 `turnstile-unavailable`. */
export const siteverifyTimeoutMs = 3_000;

/** Cloudflare's longest token. Anything longer can't pass, so it never costs a Siteverify call. */
export const maxTokenLength = 2048;

/** The endpoint a token was made for. A `join` token can't create a room. */
export type TurnstileAction = "create" | "join";

/**
 * `passed`: Siteverify said yes. `failed`: the token is missing, invalid, spent or for another
 * action or site, so the API answers 403 `turnstile-failed`. `unavailable`: no secret is set, or
 * Siteverify errored or timed out, so the API answers 403 `turnstile-unavailable`.
 */
export type TurnstileResult = "passed" | "failed" | "unavailable";

export interface TurnstileCheck {
  /** The token from the request body. */
  token: string;
  /** TURNSTILE_SECRET_KEY. Unset fails closed. */
  secret: string | undefined;
  action: TurnstileAction;
  /** The request's hostname, which a production token must match. */
  hostname: string;
}

/**
 * Cloudflare's test secrets start with these. Their Siteverify answers carry a fixed `hostname` and
 * no `action`, so those two checks are skipped for them (security.md, step 4).
 */
const testSecretPrefixes = ["1x0000", "2x0000", "3x0000"];

export function isTestSecret(secret: string): boolean {
  return testSecretPrefixes.some((prefix) => secret.startsWith(prefix));
}

/** The part of a Siteverify answer the Worker reads. */
interface SiteverifyAnswer {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
  "error-codes"?: unknown;
}

/**
 * Siteverify error codes that mean the Worker, not the token, is the problem: a wrong or missing
 * secret, or an error on Cloudflare's side. They answer `unavailable`, never `failed`.
 */
const serverSideErrors = new Set([
  "missing-input-secret",
  "invalid-input-secret",
  "internal-error",
]);

/**
 * Checks a Turnstile token with Siteverify. Only the secret and the token are sent, never the
 * client's IP (security.md, "Privacy and logs").
 */
export async function verifyTurnstile(
  { token, secret, action, hostname }: TurnstileCheck,
  fetchFn: typeof fetch = fetch,
): Promise<TurnstileResult> {
  if (!secret) return "unavailable";
  if (token === "" || token.length > maxTokenLength) return "failed";

  let answer: SiteverifyAnswer | null;
  try {
    const response = await fetchFn(siteverifyUrl, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token }),
      signal: AbortSignal.timeout(siteverifyTimeoutMs),
    });
    if (!response.ok) return "unavailable";
    answer = await response.json<SiteverifyAnswer | null>();
  } catch {
    return "unavailable";
  }

  if (answer?.success !== true) {
    const codes = Array.isArray(answer?.["error-codes"]) ? answer["error-codes"] : [];
    return codes.some((code) => serverSideErrors.has(code)) ? "unavailable" : "failed";
  }
  if (isTestSecret(secret)) return "passed";
  return answer.action === action && answer.hostname === hostname ? "passed" : "failed";
}
