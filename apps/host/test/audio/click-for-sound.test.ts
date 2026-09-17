import { describe, expect, it } from "vitest";
import { isClickForSoundVisible } from "../../src/audio/click-for-sound.ts";

describe("isClickForSoundVisible", () => {
  it("shows only while audio is locked", () => {
    expect(isClickForSoundVisible("locked")).toBe(true);
    expect(isClickForSoundVisible("running")).toBe(false);
    expect(isClickForSoundVisible("unsupported")).toBe(false);
  });
});
