import { describe, expect, it } from "vitest";
import { showsQuota } from "../../src/errors/join-quota.ts";
import { initialState } from "../../src/session/state.ts";

describe("showsQuota", () => {
  it("is true once the join screen carries a quota notice", () => {
    const state = initialState(null, null);
    if (state.status !== "join") throw new Error("expected the join state");
    expect(showsQuota({ ...state, notice: { kind: "join-failed", failure: "quota" } })).toBe(true);
  });

  it("is false for any other notice or status", () => {
    const state = initialState(null, null);
    if (state.status !== "join") throw new Error("expected the join state");
    expect(showsQuota(state)).toBe(false);
    expect(showsQuota({ ...state, notice: { kind: "join-failed", failure: "room-full" } })).toBe(
      false,
    );
    expect(
      showsQuota({ ...state, notice: { kind: "ended", reason: "room-full", code: "BEAN" } }),
    ).toBe(false);
  });
});
