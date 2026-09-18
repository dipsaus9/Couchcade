import { describe, expect, it } from "vitest";
import { createPlayers } from "@couchcade/game-sdk/testing";
import { createCrosshairPlayback, crosshairSnapMs } from "../../src/host/aim-playback.ts";
import { aimPoint, init, onPlayerInput } from "../../src/shared/index.ts";
import type { TargetRangeState } from "../../src/shared/index.ts";
import { aim, ctxAt, tickUntil } from "../helpers.ts";

const [alice, bob] = createPlayers(2) as [
  ReturnType<typeof createPlayers>[number],
  ReturnType<typeof createPlayers>[number],
];

function opened(): TargetRangeState {
  return tickUntil(init([alice, bob], 1), "open");
}

describe("createCrosshairPlayback", () => {
  it("shows nothing outside open, and nothing for a player who isn't aiming or has left", () => {
    const state = opened();
    const playback = createCrosshairPlayback();
    expect(playback.at({ ...state, phase: "landing" }, 0, () => 0)).toEqual([]);
    expect(playback.at(state, 0, () => 0)).toEqual([]);
  });

  it("plays each aiming player's track back delayMs behind, in seat order", () => {
    const openAtMs = opened().openAtMs as number;
    let state = onPlayerInput(opened(), bob, aim(0.2, 0.4), ctxAt(openAtMs + 100));
    state = onPlayerInput(state, bob, aim(0.6, 0.8), ctxAt(openAtMs + 200));
    state = onPlayerInput(state, alice, aim(-0.5, 0), ctxAt(openAtMs + 200));
    state = { ...state, nowMs: openAtMs + 300 };

    const playback = createCrosshairPlayback();
    // The first call has no earlier `shown` value to ease from: it lands on the delayed sample.
    const first = playback.at(state, 0, () => 100);
    const aliceHome = Math.round(aimPoint({ yaw: -0.5, pitch: 0 }).x);
    expect(first.map((c) => c.id)).toEqual([alice.id, bob.id]);
    expect(first.find((c) => c.id === alice.id)?.x).toBe(aliceHome);
  });

  it("snaps a player's crosshair to a shot's aim over crosshairSnapMs, once per arrow", () => {
    const openAtMs = opened().openAtMs as number;
    const state = onPlayerInput(opened(), alice, aim(0, 0), ctxAt(openAtMs + 50));
    // A hand-built state isolates the playback module from rules.ts's own "hide on shoot": the
    // arrow lands while `aiming` is artificially kept true, so the snap is observable here.
    const shotAim = { yaw: 0.9, pitch: -0.6 };
    const withArrow: TargetRangeState = {
      ...state,
      arrows: [
        {
          playerId: alice.id,
          volley: 1,
          atMs: state.nowMs,
          aim: shotAim,
          power: 1,
          x: 240,
          y: 140,
          flightMs: 350,
          landsAtMs: state.nowMs + 350,
          points: 7,
          landed: false,
        },
      ],
    };

    const playback = createCrosshairPlayback();
    // Seeds `shown` at alice's aim before the shot, so the snap has somewhere real to tween from.
    const home = playback.at(state, 0, () => 0).find((c) => c.id === alice.id);
    expect(home).toEqual({ id: alice.id, x: 240, y: 140 });

    playback.at(withArrow, 0, () => 0); // The frame the arrow first appears: starts the snap.
    const target = aimPoint(shotAim);

    const partway = playback.at(withArrow, crosshairSnapMs / 2, () => 0);
    const alicePartway = partway.find((c) => c.id === alice.id);
    expect(alicePartway?.x).not.toBe(Math.round(target.x));

    const done = playback.at(withArrow, crosshairSnapMs, () => 0);
    const aliceDone = done.find((c) => c.id === alice.id);
    expect(aliceDone?.x).toBe(Math.round(target.x));
    expect(aliceDone?.y).toBe(Math.round(target.y));

    // Calling `at` again for the same arrow, the same frame, doesn't restart the snap.
    const again = playback.at(withArrow, 0, () => 0);
    expect(again.find((c) => c.id === alice.id)).toEqual(aliceDone);
  });
});
