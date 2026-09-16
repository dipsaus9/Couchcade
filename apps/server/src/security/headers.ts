// The README's security headers (README.md, "Security headers") and
// docs/architecture/security.md, "XSS, CSP and headers". This is the single source: the Worker
// sets these on every response it answers itself, and `scripts/write-headers-file.ts` copies the
// same values into a generated `_headers` file for Cloudflare Static Assets at build time, so a
// page load (never touching the Worker) and an API response never disagree.

/**
 * `script-src` and `frame-src` allow `challenges.cloudflare.com` for the Turnstile widget
 * (docs/architecture/security.md, "Where Turnstile runs"). `connect-src 'self'` covers the
 * same-origin `wss:` socket; older Safari's `'self'` vs `wss:` mismatch is a known risk to revisit
 * on the first deploy (security.md, "Headers", point 5), not something a header can preempt.
 * `style-src 'self'` needs no relaxation: every app ships its CSS as build-time stylesheets, never
 * an inline `<style>` or `style="…"` attribute (this story's own pre-deploy CSP check found and
 * fixed apps/host's one runtime style injection; see apps/host/src/main.ts).
 */
const cspDirectives: ReadonlyArray<readonly [string, string]> = [
  ["default-src", "'self'"],
  ["script-src", "'self' https://challenges.cloudflare.com"],
  ["frame-src", "https://challenges.cloudflare.com"],
  ["connect-src", "'self'"],
  ["img-src", "'self' data:"],
  ["style-src", "'self'"],
  ["font-src", "'self'"],
  ["object-src", "'none'"],
  ["base-uri", "'none'"],
  ["frame-ancestors", "'none'"],
];

/** A single-line CSP header value. HTTP header values can't contain literal newlines. */
export const contentSecurityPolicy = cspDirectives
  .map(([name, value]) => `${name} ${value}`)
  .join("; ");

/**
 * Every header the README promises, in the order the README lists them. HSTS, nosniff,
 * Referrer-Policy, COOP and Permissions-Policy don't change per response, so they're constants
 * alongside the computed CSP.
 */
export const securityHeaders: Readonly<Record<string, string>> = {
  "Content-Security-Policy": contentSecurityPolicy,
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy":
    "accelerometer=(self), gyroscope=(self), camera=(), microphone=(), geolocation=()",
};

export const securityHeaderNames = Object.keys(securityHeaders);

/**
 * Adds the security headers to a Worker response without disturbing any header it already set
 * (`Content-Type`, `Allow`, etc). Never call this on a WebSocket upgrade response (`status 101`):
 * rebuilding a `Response` from one drops its `webSocket` pair. `createWorker`'s `fetch` skips those.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(securityHeaders)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * The `_headers` file Cloudflare Static Assets reads from the assets directory root and applies to
 * every response it serves, without running the Worker (docs/architecture/security.md, "Headers",
 * point 1). One `/*` rule covers both apps: the controller at `/` and the host under `/host/`.
 * Syntax: https://developers.cloudflare.com/pages/configuration/headers/
 */
export function buildHeadersFile(): string {
  const lines = Object.entries(securityHeaders).map(([name, value]) => `  ${name}: ${value}`);
  return ["/*", ...lines, ""].join("\n");
}
