import { pipParts } from "@couchcade/utils/pips";
import { describe, expect, it } from "vitest";
import { firstRandomPip, shufflePip } from "../../src/pips/random-pip.ts";

/** A `crypto.getRandomValues` fake that returns bytes counting up from a fixed seed. */
function fakeCrypto(...uint32s: number[]) {
  let call = 0;
  return {
    getRandomValues<T extends Uint8Array>(array: T): T {
      const value = uint32s[call % uint32s.length] ?? 0;
      call++;
      new DataView(array.buffer).setUint32(0, value, true);
      return array;
    },
  };
}

describe("firstRandomPip", () => {
  it("draws a profile inside every part's range", () => {
    const profile = firstRandomPip(fakeCrypto(123_456_789));
    expect(profile.skin).toBeGreaterThanOrEqual(0);
    expect(profile.skin).toBeLessThan(pipParts.skin);
    expect(profile.hair).toBeGreaterThanOrEqual(0);
    expect(profile.hair).toBeLessThan(pipParts.hair.length);
    expect(profile.hairColour).toBeGreaterThanOrEqual(0);
    expect(profile.hairColour).toBeLessThan(pipParts.hairColour);
  });

  it("is deterministic for the same crypto bytes", () => {
    expect(firstRandomPip(fakeCrypto(42))).toEqual(firstRandomPip(fakeCrypto(42)));
  });
});

describe("shufflePip", () => {
  it("changes the look for a seed that draws something different", () => {
    const current = firstRandomPip(fakeCrypto(1));
    const next = shufflePip(current, fakeCrypto(999_999));
    expect(next).not.toEqual(current);
  });

  it("redraws with seed + 1 when the first draw repeats the current look, so a tap always changes something", () => {
    const current = firstRandomPip(fakeCrypto(7));
    // The same seed as `current` was drawn from would repeat it; the redraw must differ.
    const next = shufflePip(current, fakeCrypto(7));
    expect(next).not.toEqual(current);
  });
});
