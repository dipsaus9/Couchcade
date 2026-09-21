import { describe, expect, it } from "vitest";
import { nextQuotaResetLabel } from "../../src/errors/quota.ts";

describe("nextQuotaResetLabel", () => {
  it("is 02:00 Amsterdam time (CEST) for a summer reset", () => {
    expect(nextQuotaResetLabel(new Date("2026-09-21T10:00:00Z"))).toBe("02:00");
  });

  it("is 01:00 Amsterdam time (CET) for a winter reset", () => {
    expect(nextQuotaResetLabel(new Date("2026-01-15T10:00:00Z"))).toBe("01:00");
  });
});
