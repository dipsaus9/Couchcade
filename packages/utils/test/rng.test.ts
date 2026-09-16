import { array, assert, integer, property } from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng } from "../src/rng/index.ts";

const seed = integer({ min: 0, max: 2 ** 32 - 1 });

function draw(rngSeed: number, count: number): number[] {
  const rng = createRng(rngSeed);
  return Array.from({ length: count }, () => rng.next());
}

describe("createRng", () => {
  it("returns the same sequence for the same seed", () => {
    assert(
      property(seed, (s) => {
        expect(draw(s, 20)).toEqual(draw(s, 20));
      }),
    );
  });

  it("keeps the algorithm stable, so saved replays stay valid", () => {
    // Pinned output. If this fails, the generator changed and every recording breaks.
    expect(draw(42, 3)).toEqual([0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
    expect(createRng(0).int(1, 6)).toBe(2);
  });

  it("gives different sequences for different seeds", () => {
    expect(draw(1, 5)).not.toEqual(draw(2, 5));
  });

  it("reduces any number to a 32-bit seed", () => {
    expect(draw(2 ** 32 + 7, 5)).toEqual(draw(7, 5));
    expect(draw(-1, 5)).toEqual(draw(2 ** 32 - 1, 5));
    expect(draw(Number.NaN, 5)).toEqual(draw(0, 5));
  });

  it("continues the same sequence from a saved state", () => {
    assert(
      property(seed, integer({ min: 0, max: 50 }), (s, skip) => {
        const rng = createRng(s);
        for (let i = 0; i < skip; i++) rng.next();
        const resumed = createRng(rng.state);
        expect(Array.from({ length: 10 }, () => resumed.next())).toEqual(
          Array.from({ length: 10 }, () => rng.next()),
        );
      }),
    );
  });

  it("stores its state as a JSON-safe unsigned 32-bit integer", () => {
    assert(
      property(seed, (s) => {
        const rng = createRng(s);
        rng.next();
        expect(Number.isInteger(rng.state)).toBe(true);
        expect(rng.state).toBeGreaterThanOrEqual(0);
        expect(rng.state).toBeLessThan(2 ** 32);
        expect(JSON.parse(JSON.stringify(rng.state))).toBe(rng.state);
      }),
    );
  });
});

describe("next", () => {
  it("returns floats in [0, 1)", () => {
    assert(
      property(seed, (s) => {
        for (const value of draw(s, 50)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1);
        }
      }),
    );
  });

  it("spreads values roughly evenly", () => {
    const buckets = Array.from({ length: 10 }, () => 0);
    for (const value of draw(123, 10_000)) {
      const index = Math.floor(value * 10);
      buckets[index] = (buckets[index] ?? 0) + 1;
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(900);
      expect(count).toBeLessThan(1100);
    }
  });
});

describe("int", () => {
  it("returns integers inside the inclusive range", () => {
    assert(
      property(
        seed,
        integer({ min: -1000, max: 1000 }),
        integer({ min: 0, max: 1000 }),
        (s, min, width) => {
          const value = createRng(s).int(min, min + width);
          expect(Number.isInteger(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThanOrEqual(min + width);
        },
      ),
    );
  });

  it("reaches both ends of the range", () => {
    const rng = createRng(9);
    const seen = new Set(Array.from({ length: 200 }, () => rng.int(1, 6)));
    expect([...seen].toSorted()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rejects invalid ranges", () => {
    const rng = createRng(1);
    expect(() => rng.int(5, 4)).toThrow(RangeError);
    expect(() => rng.int(0, 1.5)).toThrow(RangeError);
    expect(() => rng.int(0, 2 ** 32)).toThrow(RangeError);
  });
});

describe("pick", () => {
  it("returns an item of the array", () => {
    assert(
      property(seed, array(integer(), { minLength: 1 }), (s, items) => {
        expect(items).toContain(createRng(s).pick(items));
      }),
    );
  });

  it("rejects an empty array", () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });
});

describe("shuffle", () => {
  it("returns a permutation without changing the input", () => {
    assert(
      property(seed, array(integer()), (s, items) => {
        const before = [...items];
        const shuffled = createRng(s).shuffle(items);
        expect(items).toEqual(before);
        expect(shuffled.toSorted((a, b) => a - b)).toEqual(items.toSorted((a, b) => a - b));
      }),
    );
  });

  it("is deterministic for the same seed", () => {
    assert(
      property(seed, array(integer()), (s, items) => {
        expect(createRng(s).shuffle(items)).toEqual(createRng(s).shuffle(items));
      }),
    );
  });
});
