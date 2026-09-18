import { describe, expect, it } from "vitest";
import { realtimeLinkEnabled } from "../../src/runtime/link-switch.ts";

describe("link-switch", () => {
  it("is off unless VITE_REALTIME_LINK is on", () => {
    expect(realtimeLinkEnabled({ env: false, search: "" })).toBe(false);
    expect(realtimeLinkEnabled({ env: true, search: "" })).toBe(true);
  });

  it("lets ?link=1 and ?link=0 override the build default for one page load", () => {
    expect(realtimeLinkEnabled({ env: false, search: "?link=1" })).toBe(true);
    expect(realtimeLinkEnabled({ env: true, search: "?link=0" })).toBe(false);
    expect(realtimeLinkEnabled({ env: false, search: "?room=BEAN" })).toBe(false);
  });
});
