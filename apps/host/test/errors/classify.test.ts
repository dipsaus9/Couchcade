import { describe, expect, it } from "vitest";
import { isQuotaFailure } from "../../src/errors/classify.ts";

describe("isQuotaFailure", () => {
  it("is true for a non-JSON body on a platform-load status", () => {
    expect(isQuotaFailure(429, null)).toBe(true);
    expect(isQuotaFailure(500, null)).toBe(true);
    expect(isQuotaFailure(503, null)).toBe(true);
    expect(isQuotaFailure(524, null)).toBe(true);
  });

  it("is false once a JSON body parsed, whatever it says", () => {
    expect(isQuotaFailure(429, { error: "rate-limited" })).toBe(false);
    expect(isQuotaFailure(503, {})).toBe(false);
  });

  it("is false for a non-JSON body on a status our Worker answers directly", () => {
    expect(isQuotaFailure(401, null)).toBe(false);
  });
});
