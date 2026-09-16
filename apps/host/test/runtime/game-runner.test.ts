import { createPlayers } from "@couchcade/game-sdk/testing";
import { describe, expect, it } from "vitest";
import { createGameRunner } from "../../src/runtime/game-runner.ts";
import { echoGame, type EchoState } from "./fixtures.ts";

const [sam, noor, mees] = createPlayers(3).map((player) => player.id) as [string, string, string];

function runner(realtime = true, { leaves = false, players = 2 } = {}) {
  return createGameRunner(echoGame({ realtime, leaves }), {
    players: createPlayers(players),
    seed: 42,
    displayLagMs: 0,
  });
}

const stateOf = (r: ReturnType<typeof runner>) => r.state as EchoState;

describe("createGameRunner", () => {
  it("calls init with the seated players and the seed", () => {
    const r = runner();
    expect(stateOf(r).players).toEqual([sam, noor]);
    expect(stateOf(r).seed).toBe(42);
    expect(r.tick).toBe(0);
  });

  it("applies queued inputs in arrival order, then onTick, once per step", () => {
    const r = runner();
    r.begin(10_000);
    r.queue(noor, { type: "say", payload: { text: "b" }, at: 10_000 });
    r.queue(sam, { type: "say", payload: { text: "a" }, at: 10_000 });
    r.step();
    r.queue(sam, { type: "say", payload: { text: "c" }, at: 10_010 });
    r.step();
    expect(stateOf(r).log).toEqual([
      `${noor}:say@0/${1000 / 60}`,
      `${sam}:say@0/${1000 / 60}`,
      "tick",
      `${sam}:say@10/${2000 / 60}`,
      "tick",
    ]);
    expect(r.tick).toBe(2);
  });

  it("skips onTick for games that aren't real-time", () => {
    const r = runner(false);
    r.step();
    r.step();
    expect(stateOf(r).ticks).toBe(0);
    expect(r.tick).toBe(2);
  });

  it("drops inputs that fail the game's inputSchema", () => {
    const r = runner();
    expect(r.queue(sam, { type: "say", at: 0 })).toBe(false);
    expect(r.queue(sam, { type: "say", payload: { text: 7 }, at: 0 })).toBe(false);
    expect(r.queue(sam, { type: "dance", at: 0 })).toBe(false);
    expect(r.queue(sam, { type: "say", payload: { text: "ok" }, at: 0 })).toBe(true);
    r.step();
    expect(stateOf(r).log).toEqual([`${sam}:say@0/${1000 / 60}`, "tick"]);
  });

  it("drops inputs from phones that aren't in this game", () => {
    const r = runner();
    expect(r.queue(mees, { type: "end", at: 0 })).toBe(false);
    expect(r.step()).toBeNull();
  });

  it("judges input time on game time from begin, clamped to 500 ms in the past", () => {
    const r = runner();
    r.begin(50_000);
    for (let i = 0; i < 60; i++) r.step();
    r.queue(sam, { type: "say", payload: { text: "late" }, at: 50_100 });
    r.queue(noor, { type: "say", payload: { text: "future" }, at: 99_000 });
    r.step();
    const nowMs = (61 * 1000) / 60;
    expect(stateOf(r).log.slice(-3)).toEqual([
      `${sam}:say@${nowMs - 500}/${nowMs}`,
      `${noor}:say@${nowMs}/${nowMs}`,
      "tick",
    ]);
  });

  it("returns the outcome and stops once the game ends", () => {
    const r = runner();
    r.queue(noor, { type: "end", at: 0 });
    const outcome = r.step();
    expect(outcome?.placements).toHaveLength(2);
    expect(r.outcome).toBe(outcome);
    expect(r.queue(sam, { type: "say", payload: { text: "x" }, at: 0 })).toBe(false);
    r.step();
    expect(r.tick).toBe(1);
  });

  it("computes a view for every in-game player", () => {
    const r = runner();
    r.queue(sam, { type: "say", payload: { text: "hi" }, at: 0 });
    r.step();
    expect([...r.views()]).toEqual([
      [sam, { screen: "echo", data: { text: "hi" } }],
      [noor, { screen: "echo", data: { text: "" } }],
    ]);
  });

  it("calls onPlayerLeft once for an in-game player, then drops their inputs and view", () => {
    const r = runner(false, { leaves: true, players: 3 });
    r.queue(noor, { type: "say", payload: { text: "queued" }, at: 0 });
    r.leave(noor);
    r.leave(noor);
    r.leave("NOTINGAM");
    expect(stateOf(r).log).toEqual([`${noor}:left`]);
    expect(r.queue(noor, { type: "say", payload: { text: "late" }, at: 0 })).toBe(false);
    r.step();
    expect(stateOf(r).said).toEqual({});
    expect([...r.views().keys()]).toEqual([sam, mees]);
    // Placements still list every player init received, so a leaver keeps their points.
    expect(r.players.map((player) => player.id)).toEqual([sam, noor, mees]);
  });

  it("takes the outcome onPlayerLeft leads to", () => {
    const r = runner(false, { leaves: true });
    r.leave(sam);
    expect(r.outcome?.placements).toHaveLength(2);
    expect(r.step()).toBe(r.outcome);
  });

  it("drops a leaver's inputs in a game without onPlayerLeft", () => {
    const r = runner();
    r.leave(sam);
    expect(stateOf(r).log).toEqual([]);
    expect(r.queue(sam, { type: "say", payload: { text: "x" }, at: 0 })).toBe(false);
    expect(r.outcome).toBeNull();
  });
});
