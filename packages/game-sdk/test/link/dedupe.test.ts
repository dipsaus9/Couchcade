import { describe, expect, it } from "vitest";
import { createEventDedupe, eventDedupeWindow } from "@couchcade/game-sdk/link";

describe("createEventDedupe", () => {
  it("applies an event once and rejects it again for the same player", () => {
    const dedupe = createEventDedupe();
    expect(dedupe.apply("p1", 1)).toBe(true);
    expect(dedupe.apply("p1", 1)).toBe(false);
    expect(dedupe.apply("p1", 1)).toBe(false);
  });

  it("keeps ids independent per player", () => {
    const dedupe = createEventDedupe();
    expect(dedupe.apply("p1", 1)).toBe(true);
    expect(dedupe.apply("p2", 1)).toBe(true);
    expect(dedupe.apply("p1", 1)).toBe(false);
    expect(dedupe.apply("p2", 1)).toBe(false);
  });

  it("applies ids out of order the same way", () => {
    const dedupe = createEventDedupe();
    expect(dedupe.apply("p1", 5)).toBe(true);
    expect(dedupe.apply("p1", 2)).toBe(true);
    expect(dedupe.apply("p1", 5)).toBe(false);
    expect(dedupe.apply("p1", 2)).toBe(false);
  });

  it("defaults to remembering the last 64 ids per player", () => {
    expect(eventDedupeWindow).toBe(64);
    const dedupe = createEventDedupe();
    for (let id = 0; id < 64; id++) expect(dedupe.apply("p1", id)).toBe(true);
    // The window is full: one more id pushes out the oldest (0).
    expect(dedupe.apply("p1", 64)).toBe(true);
    // Every id from 1 through 64 is still remembered. Checked before re-applying 0 below, since
    // that call evicts another id in turn and would otherwise muddy which one.
    for (let id = 1; id <= 64; id++) expect(dedupe.apply("p1", id)).toBe(false);
    expect(dedupe.apply("p1", 0)).toBe(true); // forgotten, so it's treated as new again
  });

  it("honours a custom remembered window", () => {
    const dedupe = createEventDedupe(2);
    expect(dedupe.apply("p1", 1)).toBe(true);
    expect(dedupe.apply("p1", 2)).toBe(true);
    expect(dedupe.apply("p1", 3)).toBe(true); // pushes out id 1
    expect(dedupe.apply("p1", 2)).toBe(false); // still remembered
    expect(dedupe.apply("p1", 1)).toBe(true); // forgotten
  });
});
