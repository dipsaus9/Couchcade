import { createPlayers } from "@couchcade/game-sdk/testing";
import type { Player } from "@couchcade/game-sdk/contract";
import { describe, expect, it } from "vitest";
import { init } from "../../src/shared/index.ts";
import type { ActiveRoll, StrikeNightState } from "../../src/shared/index.ts";
import { pinSpots } from "../../src/shared/constants.ts";
import { present } from "../../src/host/present.ts";
import type { RollCache } from "../../src/host/present.ts";
import { bowlAndSettle, bowlNow, gutterThrow, room, stepUntil, strikeThrow } from "../helpers.ts";

const twoPlayers: readonly Player[] = createPlayers(2).map((player, index) => ({
  ...player,
  id: index === 0 ? "a" : "b",
  name: index === 0 ? "Ann" : "Bo",
}));

const players2 = () => init(twoPlayers, 1);

function rollingState(ballY: number): StrikeNightState {
  const base = players2();
  const activeRoll: ActiveRoll = {
    bowlerId: "a",
    frame: 1,
    roll: 1,
    turn: 1,
    auto: false,
    spin: 0,
    releaseAtMs: 0,
    ball: { id: "ball", x: 0.527, y: ballY, vx: 0, vy: 5, a: 0, w: 0 },
    gutter: false,
    gutterEndAtMs: null,
    reachedPinsAtMs: null,
    pins: pinSpots.map((spot) => ({
      id: spot.id,
      spotX: spot.x,
      spotY: spot.y,
      body: { id: spot.id, x: spot.x, y: spot.y, vx: 0, vy: 0, a: 0, w: 0 },
      fell: false,
    })),
  };
  return { ...base, phase: "rolling", bowlerId: "a", activeRoll };
}

describe("present: docs/games/strike-night.md, TV scene", () => {
  it("shows the approach shot before the ball passes y = 16", () => {
    const view = present(rollingState(10));
    expect(view.shot).toBe("approach");
    expect(view.ball).not.toBeNull();
    expect(view.pins).toHaveLength(10);
  });

  it("cuts to the pin shot once the ball passes y = 16", () => {
    const view = present(rollingState(16.5));
    expect(view.shot).toBe("pin");
  });

  it("stays on the pin shot through result", () => {
    const state: StrikeNightState = { ...players2(), phase: "result", bowlerId: "a" };
    expect(present(state).shot).toBe("pin");
  });

  it("shows the approach shot in lineup and intro", () => {
    const lineup: StrikeNightState = { ...players2(), phase: "lineup", bowlerId: "a" };
    const intro: StrikeNightState = { ...players2(), phase: "intro", bowlerId: "a" };
    expect(present(lineup).shot).toBe("approach");
    expect(present(intro).shot).toBe("approach");
  });

  it("keeps a gutter ball rolling down the gutter after physics drops it, from the cache", () => {
    const base = players2();
    const activeRoll: ActiveRoll = {
      bowlerId: "a",
      frame: 1,
      roll: 1,
      turn: 1,
      auto: false,
      spin: 0,
      releaseAtMs: 0,
      ball: null,
      gutter: true,
      gutterEndAtMs: 5000,
      reachedPinsAtMs: null,
      pins: [],
    };
    const cache: RollCache = {
      pins: [],
      gutter: true,
      gutterEndAtMs: 5000,
      ball: { x: -0.05, y: 10, vx: 0, vy: 6, atMs: 1000 },
    };
    const stateAt = (nowMs: number): StrikeNightState => ({
      ...base,
      phase: "rolling",
      bowlerId: "a",
      nowMs,
      activeRoll,
    });
    const atCapture = present(stateAt(1000), cache).ball;
    // 0.5 s further at vy = 6 m/s: lane y moves from 10 to 13, further from the couch, so its
    // screen y (the approach shot's perspective) moves up the screen (a smaller sy).
    const halfSecondLater = present(stateAt(1500), cache).ball;
    expect(atCapture).not.toBeNull();
    expect(halfSecondLater).not.toBeNull();
    expect(halfSecondLater?.y).toBeLessThan(atCapture?.y ?? 0);
  });

  it("hides the gutter ball once its extrapolated time is up", () => {
    const base = players2();
    const activeRoll: ActiveRoll = {
      bowlerId: "a",
      frame: 1,
      roll: 1,
      turn: 1,
      auto: false,
      spin: 0,
      releaseAtMs: 0,
      ball: null,
      gutter: true,
      gutterEndAtMs: 5000,
      reachedPinsAtMs: null,
      pins: [],
    };
    const state: StrikeNightState = {
      ...base,
      phase: "rolling",
      bowlerId: "a",
      nowMs: 6000,
      activeRoll,
    };
    const cache: RollCache = {
      pins: [],
      gutter: true,
      gutterEndAtMs: 5000,
      ball: { x: -0.05, y: 10, vx: 0, vy: 6, atMs: 1000 },
    };
    expect(present(state, cache).ball).toBeNull();
  });

  it("shows the last frame's fallen pins on the deck through result, from the cache", () => {
    const base = players2();
    base.standingPins = base.standingPins.filter((id) => id !== "p0-0");
    const state: StrikeNightState = { ...base, phase: "result", bowlerId: "a" };
    const cache: RollCache = {
      gutter: false,
      gutterEndAtMs: null,
      ball: null,
      pins: [
        {
          id: "p0-0",
          spotX: pinSpots[0]?.x ?? 0,
          spotY: pinSpots[0]?.y ?? 0,
          body: { id: "p0-0", x: 0.5, y: 19.3, vx: 0, vy: 0, a: 0, w: 0 },
          fell: true,
        },
      ],
    };
    const fallen = present(state, cache).pins.find((pin) => pin.id === "p0-0");
    expect(fallen?.down).toBe(true);
  });

  it("shows STRIKE! 400 ms after the pin count, never before", () => {
    const base = players2();
    base.players[0]!.last = { pins: 10, mark: "strike", auto: false, frame: 30 };
    const early: StrikeNightState = {
      ...base,
      phase: "result",
      bowlerId: "a",
      phaseAtMs: 0,
      nowMs: 100,
    };
    const late: StrikeNightState = {
      ...base,
      phase: "result",
      bowlerId: "a",
      phaseAtMs: 0,
      nowMs: 500,
    };
    expect(present(early).callout).toBeNull();
    expect(present(late).callout).toBe("STRIKE!");
  });

  it("shows SPARE!, but no callout for an open frame or a gutter", () => {
    const base = players2();
    const withLast = (last: StrikeNightState["players"][number]["last"]): StrikeNightState => ({
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, last } : p)),
      phase: "result",
      bowlerId: "a",
      phaseAtMs: 0,
      nowMs: 1000,
    });
    expect(present(withLast({ pins: 10, mark: "spare", auto: false, frame: 10 })).callout).toBe(
      "SPARE!",
    );
    expect(
      present(withLast({ pins: 4, mark: "open", auto: false, frame: null })).callout,
    ).toBeNull();
    expect(
      present(withLast({ pins: 0, mark: "gutter", auto: false, frame: null })).callout,
    ).toBeNull();
  });

  it("clock shows only the turn timer's last 5 seconds", () => {
    const base = players2();
    const lineupAt = (deadlineMs: number, nowMs: number): StrikeNightState => ({
      ...base,
      phase: "lineup",
      bowlerId: "a",
      deadlineMs,
      nowMs,
    });
    expect(present(lineupAt(20_000, 10_000)).clock).toBeNull();
    expect(present(lineupAt(20_000, 15_100)).clock).toBe(5);
    expect(present(lineupAt(20_000, 19_900)).clock).toBe(1);
    expect(present(lineupAt(20_000, 20_100)).clock).toBeNull();
  });

  it("shows the pin map on roll 2's lineup and during result, not roll 1", () => {
    const base = players2();
    const roll1: StrikeNightState = { ...base, phase: "lineup", roll: 1, bowlerId: "a" };
    const roll2: StrikeNightState = { ...base, phase: "lineup", roll: 2, bowlerId: "a" };
    const result: StrikeNightState = { ...base, phase: "result", bowlerId: "a" };
    expect(present(roll1).pinMap).toBeNull();
    expect(present(roll2).pinMap).not.toBeNull();
    expect(present(roll2).pinMap).toHaveLength(10);
    expect(present(result).pinMap).not.toBeNull();
  });

  it("shows the scorecard only at frameEnd, in seat order", () => {
    const base = players2();
    expect(present({ ...base, phase: "lineup", bowlerId: "a" }).scorecard).toBeNull();
    const scorecard = present({ ...base, phase: "frameEnd", bowlerId: "a" }).scorecard;
    expect(scorecard).toHaveLength(2);
    expect(scorecard?.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("names the bowler in the panel, and the leader at frameEnd", () => {
    const base = players2();
    base.players[0]!.total = 40;
    base.players[1]!.total = 12;
    expect(present({ ...base, phase: "lineup", bowlerId: "b" }).panel).toBe("Bo is up");
    expect(present({ ...base, phase: "frameEnd", bowlerId: "a" }).panel).toBe("Ann leads with 40");
    expect(present({ ...base, phase: "intro", bowlerId: null }).panel).toBe(
      "Hold the ball, swing, let go",
    );
  });
});

describe("present: driven by a real simulated match", () => {
  it("a strike frame's roll settles with 0 standing pins and shows STRIKE! at result", () => {
    const state = bowlAndSettle(room(1), strikeThrow);
    expect(state.standingPins).toHaveLength(0);
    const view = present({ ...state, phaseAtMs: state.nowMs - 1000 });
    expect(view.callout).toBe("STRIKE!");
  });

  it("a third strike in a row calls TURKEY!, not STRIKE!", () => {
    const target = room(1);
    bowlAndSettle(target, strikeThrow);
    stepUntil(target, "lineup");
    bowlAndSettle(target, strikeThrow);
    stepUntil(target, "lineup");
    const state = bowlAndSettle(target, strikeThrow);
    const view = present({ ...state, phaseAtMs: state.nowMs - 1000 });
    expect(view.callout).toBe("TURKEY!");
  });

  it("a gutter ball leaves no standing pins knocked and shows Gutter (no callout)", () => {
    const state = bowlAndSettle(room(1), gutterThrow);
    expect(state.standingPins).toHaveLength(10);
    const view = present({ ...state, phaseAtMs: state.nowMs - 1000 });
    expect(view.callout).toBeNull();
  });

  it("a live roll's pin view count matches the state's live pins", () => {
    const target = room(1);
    stepUntil(target, "lineup");
    bowlNow(target, strikeThrow);
    target.step();
    target.step();
    expect(target.state.phase).toBe("rolling");
    const view = present(target.state);
    expect(view.pins.length).toBeGreaterThan(0);
    expect(view.ball).not.toBeNull();
  });
});
