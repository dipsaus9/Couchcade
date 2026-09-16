import { describe, expect, it } from "vitest";
import { joinAddress, joinUrl } from "../src/screens/lobby/join-url.ts";

describe("joinUrl", () => {
  it("points at the site root with ?room=CODE", () => {
    expect(joinUrl("https://couchcade.example.workers.dev", "BEAN")).toBe(
      "https://couchcade.example.workers.dev/?room=BEAN",
    );
  });

  it("keeps the dev server port", () => {
    expect(joinUrl("http://localhost:5173", "WXYZ")).toBe("http://localhost:5173/?room=WXYZ");
  });

  it("drops any path, query or hash, because the phone app lives at /", () => {
    expect(joinUrl("https://couchcade.example.workers.dev/host/?x=1#top", "BEAN")).toBe(
      "https://couchcade.example.workers.dev/?room=BEAN",
    );
  });

  it.each(["bean", "BEA", "BEANS", "BOIL", "", "BE N"])(
    "refuses %j, which isn't a room code",
    (code) => {
      expect(() => joinUrl("https://couchcade.example.workers.dev", code)).toThrow(RangeError);
    },
  );
});

describe("joinAddress", () => {
  it("is the host name players can type", () => {
    expect(joinAddress("https://couchcade.example.workers.dev")).toBe(
      "couchcade.example.workers.dev",
    );
    expect(joinAddress("http://localhost:5173")).toBe("localhost:5173");
  });
});
