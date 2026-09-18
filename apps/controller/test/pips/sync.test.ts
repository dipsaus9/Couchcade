import type { PipProfile } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { profileToReconcile } from "../../src/pips/sync.ts";

const a: PipProfile = { skin: 1, hair: 2, hairColour: 3 };
const b: PipProfile = { skin: 0, hair: 2, hairColour: 3 };

describe("profileToReconcile", () => {
  it("returns null when the remembered Pip already matches what the room seated", () => {
    expect(profileToReconcile(a, { ...a })).toBeNull();
  });

  it("returns the remembered Pip when it differs from what the room seated", () => {
    // Covers the room seating every new player as {0,0,0} until it reads the join body's profile
    // (docs/architecture/pips.md "Found while writing this spec", item 1).
    expect(profileToReconcile(a, b)).toEqual(a);
  });
});
