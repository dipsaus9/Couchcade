import { describe, expect, it, vi } from "vitest";
import { joinFailureFor, requestJoin, requestRejoin, type FetchFn } from "../src/join/api.ts";

const joined = { playerId: "ABCDEFGH", name: "Sam", ticket: "t.sig", rejoinToken: "r.sig" };

const offlineFetch: FetchFn = async () => {
  throw new TypeError("Failed to fetch");
};

function answer(status: number, body: unknown): FetchFn {
  return vi.fn<FetchFn>(async () => Response.json(body, { status }));
}

describe("requestJoin", () => {
  it("posts the name and Turnstile token to /api/rooms/:code/join", async () => {
    const fetchFn = answer(200, joined);
    const result = await requestJoin("BEAN", { name: "Sam", turnstile: "" }, fetchFn);
    expect(result).toEqual({ ok: true, joined });
    expect(fetchFn).toHaveBeenCalledWith("/api/rooms/BEAN/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Sam", turnstile: "" }),
    });
  });

  it.each([
    [404, "not-found", "not-found"],
    [400, "name-not-allowed", "name-not-allowed"],
    [409, "room-full", "room-full"],
    [423, "room-locked", "room-locked"],
    [429, "rate-limited", "rate-limited"],
    [403, "turnstile-unavailable", "turnstile"],
    [403, "forbidden-origin", "unavailable"],
    [400, "bad-request", "unavailable"],
    [500, "not-configured", "unavailable"],
  ])("maps %i %s to %s", async (status, error, failure) => {
    const result = await requestJoin(
      "BEAN",
      { name: "Sam", turnstile: "" },
      answer(status, { error }),
    );
    expect(result).toEqual({ ok: false, failure });
  });

  it("falls back on the status when the body isn't an API error", () => {
    expect(joinFailureFor(409, "<html>")).toBe("room-full");
    expect(joinFailureFor(502, null)).toBe("unavailable");
  });

  it("reports offline when the request never gets an answer", async () => {
    expect(await requestJoin("BEAN", { name: "Sam", turnstile: "" }, offlineFetch)).toEqual({
      ok: false,
      failure: "offline",
    });
  });

  it("treats a malformed success body as unavailable", async () => {
    const result = await requestJoin(
      "BEAN",
      { name: "Sam", turnstile: "" },
      answer(200, { ticket: "x" }),
    );
    expect(result).toEqual({ ok: false, failure: "unavailable" });
  });
});

describe("requestRejoin", () => {
  it("swaps the rejoin token for a fresh ticket", async () => {
    const fetchFn = answer(200, { ticket: "fresh.sig" });
    expect(await requestRejoin("BEAN", "r.sig", fetchFn)).toEqual({
      ok: true,
      ticket: "fresh.sig",
    });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/rooms/BEAN/rejoin",
      expect.objectContaining({ body: JSON.stringify({ rejoinToken: "r.sig" }) }),
    );
  });

  it("is refused on 401, so the player joins again", async () => {
    expect(await requestRejoin("BEAN", "r.sig", answer(401, { error: "invalid-token" }))).toEqual({
      ok: false,
      failure: "refused",
    });
  });

  it("keeps trying on a rate limit", async () => {
    expect(await requestRejoin("BEAN", "r.sig", answer(429, { error: "rate-limited" }))).toEqual({
      ok: false,
      failure: "unavailable",
    });
  });
});
