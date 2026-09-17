import { assert, integer, property } from "fast-check";
import { describe, expect, it } from "vitest";
import { type PipProfile, pipParts, randomPip } from "../src/pips/index.ts";

const seed = integer({ min: 0, max: 2 ** 32 - 1 });

/** Every part index in range, per the counts in `pipParts`. */
function isValid(profile: PipProfile): boolean {
  return (
    Number.isInteger(profile.skin) &&
    profile.skin >= 0 &&
    profile.skin < pipParts.skin &&
    Number.isInteger(profile.hair) &&
    profile.hair >= 0 &&
    profile.hair < pipParts.hair.length &&
    Number.isInteger(profile.hairColour) &&
    profile.hairColour >= 0 &&
    profile.hairColour < pipParts.hairColour
  );
}

describe("pipParts", () => {
  it("matches the frozen order and counts from docs/architecture/pips.md", () => {
    expect(pipParts.skin).toBe(6);
    expect(pipParts.hair).toEqual([
      "short",
      "bun",
      "cap",
      "long",
      "curls",
      "buzz",
      "ponytail",
      "bald",
    ]);
    expect(pipParts.hairColour).toBe(6);
  });

  it("gives 288 possible looks", () => {
    expect(pipParts.skin * pipParts.hair.length * pipParts.hairColour).toBe(288);
  });
});

describe("randomPip", () => {
  it("returns a profile with every field in range (defaults valid) for any seed", () => {
    assert(
      property(seed, (s) => {
        expect(isValid(randomPip(s))).toBe(true);
      }),
    );
  });

  it("returns integer fields only", () => {
    assert(
      property(seed, (s) => {
        const profile = randomPip(s);
        expect(Number.isInteger(profile.skin)).toBe(true);
        expect(Number.isInteger(profile.hair)).toBe(true);
        expect(Number.isInteger(profile.hairColour)).toBe(true);
      }),
    );
  });

  it("is deterministic: the same seed always gives the same Pip", () => {
    assert(
      property(seed, (s) => {
        expect(randomPip(s)).toEqual(randomPip(s));
      }),
    );
  });

  it("gives different seeds different Pips (not a constant)", () => {
    const looks = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(randomPip(i))));
    expect(looks.size).toBeGreaterThan(1);
  });

  it("reaches every skin, hairstyle and hair colour option across many seeds", () => {
    const seenSkin = new Set<number>();
    const seenHair = new Set<number>();
    const seenHairColour = new Set<number>();
    for (let s = 0; s < 5000; s++) {
      const profile = randomPip(s);
      seenSkin.add(profile.skin);
      seenHair.add(profile.hair);
      seenHairColour.add(profile.hairColour);
    }
    expect(seenSkin.size).toBe(pipParts.skin);
    expect(seenHair.size).toBe(pipParts.hair.length);
    expect(seenHairColour.size).toBe(pipParts.hairColour);
  });

  it("is uniform enough across all 288 looks", () => {
    const total = pipParts.skin * pipParts.hair.length * pipParts.hairColour; // 288
    const draws = total * 200; // 200 draws per look on average
    const counts = new Map<string, number>();
    for (let s = 0; s < draws; s++) {
      const profile = randomPip(s);
      const key = `${profile.skin}-${profile.hair}-${profile.hairColour}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // Every one of the 288 combinations is reached at least once, and none is wildly over- or
    // under-represented next to the 200-per-look average.
    expect(counts.size).toBe(total);
    const expected = draws / total;
    for (const count of counts.values()) {
      expect(count).toBeGreaterThan(expected * 0.4);
      expect(count).toBeLessThan(expected * 1.8);
    }
  });

  it("is a pure function of the seed (no shared state between calls)", () => {
    const first = randomPip(7);
    randomPip(1);
    randomPip(2);
    const second = randomPip(7);
    expect(first).toEqual(second);
  });
});
