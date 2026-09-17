import { assert, integer, property, record } from "fast-check";
import { describe, expect, it } from "vitest";
import { pipParts, randomPip } from "@couchcade/utils/pips";
import { utf8ByteLength } from "../src/codec/index.ts";
import { pipPartCounts, pipProfileSchema } from "../src/shared/index.ts";

describe("pipPartCounts", () => {
  it("is derived from @couchcade/utils's pipParts, not its own copy", () => {
    expect(pipPartCounts).toEqual({
      skin: pipParts.skin,
      hair: pipParts.hair.length,
      hairColour: pipParts.hairColour,
    });
  });
});

describe("pipProfileSchema", () => {
  it("accepts every in-range profile", () => {
    assert(
      property(
        integer({ min: 0, max: pipPartCounts.skin - 1 }),
        integer({ min: 0, max: pipPartCounts.hair - 1 }),
        integer({ min: 0, max: pipPartCounts.hairColour - 1 }),
        (skin, hair, hairColour) => {
          const result = pipProfileSchema.safeParse({ skin, hair, hairColour });
          expect(result.success).toBe(true);
        },
      ),
    );
  });

  it("accepts every look randomPip can draw", () => {
    assert(
      property(integer({ min: 0, max: 2 ** 32 - 1 }), (seed) => {
        expect(pipProfileSchema.safeParse(randomPip(seed)).success).toBe(true);
      }),
    );
  });

  it("rejects a value below range", () => {
    expect(pipProfileSchema.safeParse({ skin: -1, hair: 0, hairColour: 0 }).success).toBe(false);
  });

  it("rejects a value at or above each part's count", () => {
    expect(
      pipProfileSchema.safeParse({ skin: pipPartCounts.skin, hair: 0, hairColour: 0 }).success,
    ).toBe(false);
    expect(
      pipProfileSchema.safeParse({ skin: 0, hair: pipPartCounts.hair, hairColour: 0 }).success,
    ).toBe(false);
    expect(
      pipProfileSchema.safeParse({ skin: 0, hair: 0, hairColour: pipPartCounts.hairColour })
        .success,
    ).toBe(false);
  });

  it("rejects a non-integer field", () => {
    expect(pipProfileSchema.safeParse({ skin: 1.5, hair: 0, hairColour: 0 }).success).toBe(false);
  });

  it("rejects a missing field", () => {
    expect(pipProfileSchema.safeParse({ skin: 0, hairColour: 0 }).success).toBe(false);
  });

  it("rejects out-of-range fields (property)", () => {
    assert(
      property(
        record({
          skin: integer({ min: -100, max: 100 }),
          hair: integer({ min: -100, max: 100 }),
          hairColour: integer({ min: -100, max: 100 }),
        }),
        (profile) => {
          const inRange =
            profile.skin >= 0 &&
            profile.skin < pipPartCounts.skin &&
            profile.hair >= 0 &&
            profile.hair < pipPartCounts.hair &&
            profile.hairColour >= 0 &&
            profile.hairColour < pipPartCounts.hairColour;
          expect(pipProfileSchema.safeParse(profile).success).toBe(inRange);
        },
      ),
    );
  });

  it("strips unknown keys instead of rejecting them (pips.md: an old host ignores a new field)", () => {
    const result = pipProfileSchema.safeParse({
      skin: 0,
      hair: 0,
      hairColour: 0,
      glasses: 3,
    });
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual({ skin: 0, hair: 0, hairColour: 0 });
  });

  it("stays within the 34 byte JSON budget from docs/architecture/pips.md at its largest values", () => {
    const largest = {
      skin: pipPartCounts.skin - 1,
      hair: pipPartCounts.hair - 1,
      hairColour: pipPartCounts.hairColour - 1,
    };
    const result = pipProfileSchema.safeParse(largest);
    expect(result.success).toBe(true);
    expect(utf8ByteLength(JSON.stringify(result.success && result.data))).toBeLessThanOrEqual(34);
  });

  it("keeps any valid profile's JSON well under the 1 KB frame cap", () => {
    assert(
      property(integer({ min: 0, max: 2 ** 32 - 1 }), (seed) => {
        const profile = randomPip(seed);
        expect(utf8ByteLength(JSON.stringify(profile))).toBeLessThan(100);
      }),
    );
  });
});
