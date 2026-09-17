import { assert, integer, property, string } from "fast-check";
import { describe, expect, it } from "vitest";
import type { Rng } from "../src/rng/index.ts";
import { createRng } from "../src/rng/index.ts";
import { BLOCKED_ROOM_CODES } from "../src/room-code/blocklist.ts";
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  isRoomCode,
  roomCode,
} from "../src/room-code/index.ts";

const seed = integer({ min: 0, max: 2 ** 32 - 1 });

describe("ROOM_CODE_ALPHABET", () => {
  it("is A to Z without the ambiguous I and O", () => {
    expect(ROOM_CODE_ALPHABET).toHaveLength(24);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[IO]/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(24);
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z]+$/);
  });
});

describe("BLOCKED_ROOM_CODES", () => {
  it("is a non-empty list of codes buildable from the room-code alphabet", () => {
    expect(BLOCKED_ROOM_CODES.length).toBeGreaterThan(0);
    for (const word of BLOCKED_ROOM_CODES) {
      expect(word).toHaveLength(ROOM_CODE_LENGTH);
      expect([...word].every((letter) => ROOM_CODE_ALPHABET.includes(letter))).toBe(true);
    }
  });

  it("has no duplicate entries", () => {
    expect(new Set(BLOCKED_ROOM_CODES).size).toBe(BLOCKED_ROOM_CODES.length);
  });
});

describe("roomCode", () => {
  it("returns 4 uppercase letters without I or O", () => {
    expect(ROOM_CODE_LENGTH).toBe(4);
    for (let i = 0; i < 1000; i++) {
      const code = roomCode();
      expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);
    }
  });

  it("uses every letter of the alphabet and nothing else", () => {
    const letters = new Set(Array.from({ length: 2000 }, () => roomCode()).join(""));
    expect([...letters].toSorted().join("")).toBe(ROOM_CODE_ALPHABET);
  });

  it("returns valid codes from a seeded RNG", () => {
    assert(
      property(seed, (s) => {
        expect(isRoomCode(roomCode(createRng(s)))).toBe(true);
      }),
    );
  });

  it("is repeatable with the same seeded RNG", () => {
    assert(
      property(seed, (s) => {
        expect(roomCode(createRng(s))).toBe(roomCode(createRng(s)));
      }),
    );
  });

  it("redraws when the seeded path first lands on a blocked code", () => {
    const blocked = BLOCKED_ROOM_CODES[0] as string;
    const valid = "ABCD";
    expect(BLOCKED_ROOM_CODES).not.toContain(valid);
    const draws = [...blocked, ...valid].map((letter) => ROOM_CODE_ALPHABET.indexOf(letter));
    let call = 0;
    const rng: Pick<Rng, "int"> = { int: () => draws[call++] as number };
    const code = roomCode(rng);
    expect(code).toBe(valid);
    expect(call).toBe(draws.length);
  });

  it("never returns a blocked code and always returns a valid one (property, seeded path)", () => {
    assert(
      property(seed, (s) => {
        const code = roomCode(createRng(s));
        expect(BLOCKED_ROOM_CODES).not.toContain(code);
        expect(isRoomCode(code)).toBe(true);
      }),
    );
  });

  it("never returns a blocked code (crypto path, many draws)", () => {
    for (let i = 0; i < 5000; i++) {
      const code = roomCode();
      expect(BLOCKED_ROOM_CODES).not.toContain(code);
      expect(isRoomCode(code)).toBe(true);
    }
  });
});

describe("isRoomCode", () => {
  it("accepts valid codes", () => {
    expect(isRoomCode("ABCD")).toBe(true);
    expect(isRoomCode("ZZZZ")).toBe(true);
  });

  it("rejects wrong length, lowercase, I, O, digits and padding", () => {
    for (const value of ["", "ABC", "ABCDE", "abcd", "ABCI", "OABC", "AB1D", " ABCD", "ABCD\n"]) {
      expect(isRoomCode(value)).toBe(false);
    }
  });

  it("accepts exactly the strings built from the alphabet", () => {
    assert(
      property(string({ unit: "grapheme-ascii", minLength: 0, maxLength: 6 }), (value) => {
        const expected =
          value.length === ROOM_CODE_LENGTH &&
          [...value].every((letter) => ROOM_CODE_ALPHABET.includes(letter));
        expect(isRoomCode(value)).toBe(expected);
      }),
    );
  });
});
