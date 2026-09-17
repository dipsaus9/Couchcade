import { siteverifyUrl } from "../src/security/turnstile.ts";

// A stand-in for Cloudflare's Siteverify, so the tests never need the network. It answers the way
// the real endpoint answers Cloudflare's test secrets (checked against it on 17 September 2026):
// `1x0000…` passes any token with hostname "example.com" and no action, `2x0000…` always fails,
// `3x0000…` answers "timeout-or-duplicate". Any other secret is unknown to it.
// Loaded as a setup file (vitest.config.ts), so every Worker test goes through it.

/** The tokens Siteverify was asked about, in order. Tests clear it with `splice(0)`. */
export const siteverifyTokens: string[] = [];

const realFetch = globalThis.fetch;

function answer(body: Record<string, unknown>): Response {
  return Response.json({ "error-codes": [], messages: [], ...body });
}

async function siteverify(body: URLSearchParams): Promise<Response> {
  const secret = body.get("secret") ?? "";
  const token = body.get("response") ?? "";
  siteverifyTokens.push(token);
  if (!secret) return answer({ success: false, "error-codes": ["missing-input-secret"] });
  if (!token) return answer({ success: false, "error-codes": ["missing-input-response"] });
  const testing = { result_with_testing_key: true };
  if (secret.startsWith("1x0000")) {
    return answer({
      success: true,
      challenge_ts: new Date().toISOString(),
      hostname: "example.com",
      metadata: testing,
    });
  }
  if (secret.startsWith("2x0000")) {
    return answer({ success: false, "error-codes": ["invalid-input-response"], metadata: testing });
  }
  if (secret.startsWith("3x0000")) {
    return answer({ success: false, "error-codes": ["timeout-or-duplicate"], metadata: testing });
  }
  return answer({ success: false, "error-codes": ["invalid-input-secret"] });
}

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  if (request.url !== siteverifyUrl) return realFetch(input, init);
  return siteverify(new URLSearchParams(await request.text()));
};
