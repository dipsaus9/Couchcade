import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, createRoom } from "../../src/net/api.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createRoom", () => {
  it("reads a known JSON error code straight through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "wrong-passcode" }, { status: 401 })),
    );
    await expect(createRoom("nope", "token")).rejects.toMatchObject(
      new ApiError("wrong-passcode", 401),
    );
  });

  it("reads a non-JSON error page on a platform-load status as quota, not unexpected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>error</html>", { status: 503 })),
    );
    await expect(createRoom("pw", "token")).rejects.toMatchObject(new ApiError("quota", 503));
  });

  it("keeps an unrecognised but valid JSON error as unexpected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({}, { status: 500 })),
    );
    await expect(createRoom("pw", "token")).rejects.toMatchObject(new ApiError("unexpected", 500));
  });
});
