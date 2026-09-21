import type { GameMeta } from "@couchcade/game-sdk/contract";
import { describe, expect, it } from "vitest";
import {
  attractIdleMs,
  attractPreviewMs,
  createAttractState,
} from "../../src/attract/attract-state.ts";
import { createVirtualTime } from "../runtime/fixtures.ts";

const game = (id: string): GameMeta => ({
  id,
  title: id,
  players: { min: 1, max: 8 },
  realtime: true,
  needsMotion: false,
  scene: "desert",
});

function setup(games: GameMeta[] = [game("alpha"), game("bravo"), game("charlie")]) {
  const time = createVirtualTime();
  let changes = 0;
  const attract = createAttractState({
    games,
    schedule: time.schedule,
    onChange: () => (changes += 1),
  });
  return { time, attract, changes: () => changes };
}

describe("createAttractState", () => {
  it("stays inactive in a plain, non-empty lobby", () => {
    const { attract, time, changes } = setup();
    attract.lobbyChanged(false);
    time.advance(attractIdleMs * 2);
    expect(attract.active).toBe(false);
    expect(attract.preview).toBeNull();
    expect(changes()).toBe(0);
  });

  it("waits the full idle time before the first preview shows (AC1)", () => {
    const { attract, time, changes } = setup();
    attract.lobbyChanged(true);
    time.advance(attractIdleMs - 1);
    expect(attract.active).toBe(false);
    expect(attract.preview).toBeNull();
    expect(changes()).toBe(0);

    time.advance(1);
    expect(attract.active).toBe(true);
    expect(attract.preview).toEqual({
      game: expect.objectContaining({ id: "alpha" }),
      index: 0,
      total: 3,
    });
    expect(changes()).toBe(1);
  });

  it("cycles through every registered game on a timer, wrapping around (AC1)", () => {
    const { attract, time } = setup();
    attract.lobbyChanged(true);
    time.advance(attractIdleMs);
    expect(attract.preview?.game.id).toBe("alpha");

    time.advance(attractPreviewMs);
    expect(attract.preview?.game.id).toBe("bravo");

    time.advance(attractPreviewMs);
    expect(attract.preview?.game.id).toBe("charlie");

    time.advance(attractPreviewMs);
    expect(attract.preview?.game.id).toBe("alpha");
  });

  it("cancels the idle timer on a join before it fires, so attract mode never starts", () => {
    const { attract, time, changes } = setup();
    attract.lobbyChanged(true);
    time.advance(attractIdleMs / 2);
    attract.lobbyChanged(false);
    time.advance(attractIdleMs);
    expect(attract.active).toBe(false);
    expect(changes()).toBe(0);
    expect(time.pending).toBe(0);
  });

  it("returns to the lobby immediately on a join, synchronously, mid attract mode (AC2)", () => {
    const { attract, time } = setup();
    attract.lobbyChanged(true);
    time.advance(attractIdleMs + attractPreviewMs * 2);
    expect(attract.active).toBe(true);

    attract.lobbyChanged(false);
    expect(attract.active).toBe(false);
    expect(attract.preview).toBeNull();
    // The preview-advance timer is cancelled too: nothing left pending to fire later.
    expect(time.pending).toBe(0);
  });

  it("starts a fresh 60 s idle wait the next time the lobby empties out again", () => {
    const { attract, time } = setup();
    attract.lobbyChanged(true);
    time.advance(attractIdleMs / 2);
    attract.lobbyChanged(false);
    attract.lobbyChanged(true);
    time.advance(attractIdleMs - 1);
    expect(attract.active).toBe(false);
    time.advance(1);
    expect(attract.active).toBe(true);
  });

  it("ignores a repeat call with the same emptiness: it never restarts the idle timer", () => {
    const { attract, time } = setup();
    attract.lobbyChanged(true);
    time.advance(attractIdleMs / 2);
    attract.lobbyChanged(true); // still empty -- must not push the deadline out
    time.advance(attractIdleMs / 2);
    expect(attract.active).toBe(true);
  });

  it("never activates with no games registered: nothing to preview", () => {
    const { attract, time, changes } = setup([]);
    attract.lobbyChanged(true);
    time.advance(attractIdleMs * 3);
    expect(attract.active).toBe(false);
    expect(attract.preview).toBeNull();
    expect(changes()).toBe(0);
    expect(time.pending).toBe(0);
  });

  it("dispose cancels every pending timer", () => {
    const { attract, time } = setup();
    attract.lobbyChanged(true);
    time.advance(attractIdleMs);
    expect(time.pending).toBe(1); // the running preview-advance timer
    attract.dispose();
    expect(time.pending).toBe(0);
  });
});
