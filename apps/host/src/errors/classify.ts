/**
 * Tells "the Cloudflare Workers Free daily budget is spent" apart from an ordinary app-level
 * error, without counting requests ourselves (docs/architecture/platform.md, "Free-tier budget
 * rules", rule 12: "We don't count requests ourselves. That would cost requests."). Mirrors
 * apps/controller/src/errors/classify.ts.
 *
 * Every error our own Worker returns is valid JSON, `{ error: code }`
 * (apps/server/src/api/errors.ts's `errorResponse`). The one response shape our Worker can never
 * produce is a failed request with no parseable JSON body: that only happens when Cloudflare's own
 * edge answers instead of our code running at all, which is what an exhausted daily budget looks
 * like from here. So a non-JSON error response, on a status Cloudflare's edge plausibly answers
 * with under load, is read as "quota reached"; a JSON body we don't recognise is a genuine
 * app-level surprise and stays "unexpected".
 */
const quotaCandidateStatus = new Set([
  429, 500, 502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527,
]);

/** `body` is the parsed JSON from a failed request, or `null` when it didn't parse as JSON. */
export function isQuotaFailure(status: number, body: unknown): boolean {
  return body === null && quotaCandidateStatus.has(status);
}
