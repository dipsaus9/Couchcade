import { describe, expect, it, vi } from "vitest";
import {
  isTestSecret,
  maxTokenLength,
  siteverifyTimeoutMs,
  siteverifyUrl,
  verifyTurnstile,
  type TurnstileCheck,
} from "../src/security/turnstile.ts";

// Siteverify is replaced by an injected fetch here, so a production secret's action and hostname
// checks can be tested. The API tests go through the stand-in in test/siteverify.ts.

const productionSecret = "0x4AAAAAAAtest-only-production-secret";
const check: TurnstileCheck = {
  token: "a-token",
  secret: productionSecret,
  action: "create",
  hostname: "couchcade.test",
};

function siteverify(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => Response.json(body, { status }));
}

describe("verifyTurnstile", () => {
  it("posts only the secret and the token to Siteverify, with a 3 second timeout", async () => {
    const fetchFn = siteverify({ success: true, action: "create", hostname: "couchcade.test" });
    expect(await verifyTurnstile(check, fetchFn)).toBe("passed");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(siteverifyUrl);
    expect(init?.method).toBe("POST");
    expect([...new URLSearchParams(init?.body as URLSearchParams)]).toEqual([
      ["secret", productionSecret],
      ["response", "a-token"],
    ]);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(siteverifyTimeoutMs).toBe(3000);
  });

  it("requires the action and hostname to match with a production secret", async () => {
    const answer = (action: string, hostname: string) =>
      verifyTurnstile(check, siteverify({ success: true, action, hostname }));
    expect(await answer("create", "couchcade.test")).toBe("passed");
    expect(await answer("join", "couchcade.test")).toBe("failed");
    expect(await answer("create", "evil.test")).toBe("failed");
    expect(await verifyTurnstile({ ...check, action: "join" }, siteverify({ success: true }))).toBe(
      "failed",
    );
  });

  it("skips the action and hostname checks for Cloudflare's test secrets", async () => {
    const testAnswer = { success: true, hostname: "example.com" };
    for (const secret of [
      "1x0000000000000000000000000000000AA",
      "2x0000000000000000000000000000000AA",
    ]) {
      expect(isTestSecret(secret)).toBe(true);
      expect(await verifyTurnstile({ ...check, secret }, siteverify(testAnswer))).toBe("passed");
    }
    expect(isTestSecret(productionSecret)).toBe(false);
    expect(await verifyTurnstile(check, siteverify(testAnswer))).toBe("failed");
  });

  it("fails a token Siteverify refuses", async () => {
    for (const code of [
      "invalid-input-response",
      "timeout-or-duplicate",
      "missing-input-response",
    ]) {
      const fetchFn = siteverify({ success: false, "error-codes": [code] });
      expect(await verifyTurnstile(check, fetchFn)).toBe("failed");
    }
    expect(await verifyTurnstile(check, siteverify(null))).toBe("failed");
  });

  it("fails an empty or overlong token without calling Siteverify", async () => {
    const fetchFn = siteverify({ success: true, action: "create", hostname: "couchcade.test" });
    expect(await verifyTurnstile({ ...check, token: "" }, fetchFn)).toBe("failed");
    const overlong = "x".repeat(maxTokenLength + 1);
    expect(await verifyTurnstile({ ...check, token: overlong }, fetchFn)).toBe("failed");
    expect(maxTokenLength).toBe(2048);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fails closed as unavailable without a secret, without calling Siteverify", async () => {
    const fetchFn = siteverify({ success: true });
    expect(await verifyTurnstile({ ...check, secret: undefined }, fetchFn)).toBe("unavailable");
    expect(await verifyTurnstile({ ...check, secret: "" }, fetchFn)).toBe("unavailable");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fails closed as unavailable when Siteverify errors, times out or blames the secret", async () => {
    const timedOut = vi.fn<typeof fetch>(async () => {
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    expect(await verifyTurnstile(check, timedOut)).toBe("unavailable");
    expect(await verifyTurnstile(check, siteverify({ success: true }, 500))).toBe("unavailable");
    const notJson = vi.fn<typeof fetch>(async () => new Response("<html>"));
    expect(await verifyTurnstile(check, notJson)).toBe("unavailable");
    for (const code of ["internal-error", "invalid-input-secret", "missing-input-secret"]) {
      const fetchFn = siteverify({ success: false, "error-codes": [code] });
      expect(await verifyTurnstile(check, fetchFn)).toBe("unavailable");
    }
  });

  it("gives up after the timeout when Siteverify never answers", async () => {
    const hanging = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const started = Date.now();
    expect(await verifyTurnstile(check, hanging)).toBe("unavailable");
    expect(Date.now() - started).toBeGreaterThanOrEqual(siteverifyTimeoutMs - 100);
  }, 10_000);
});
