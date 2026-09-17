import type { CouchcadeGame } from "@couchcade/game-sdk/contract";
import { describe, expect, it } from "vitest";
import {
  createMotionCheck,
  motionWaitMs,
  type MotionPermissionView,
} from "../../src/motion/motion-check.ts";
import type { LobbyState } from "../../src/screens/lobby/lobby-state.ts";
import { createVirtualTime, echoGame, lobbyWith } from "../runtime/fixtures.ts";

const motionGame = { ...echoGame({ id: "strike" }), title: "Strike", needsMotion: true };

function setup(players = 3) {
  const time = createVirtualTime(10_000);
  let lobby: LobbyState = lobbyWith(players);
  const done: Array<string[]> = [];
  let changes = 0;
  const check = createMotionCheck({
    game: motionGame as CouchcadeGame,
    step: 2,
    lobby: () => lobby,
    schedule: time.schedule,
    onDone: (touch) => done.push([...touch]),
    onChange: () => (changes += 1),
  });
  const ids = lobby.players.map((player) => player.id);
  return {
    time,
    check,
    ids,
    done,
    changes: () => changes,
    setLobby: (next: LobbyState) => {
      lobby = next;
    },
    lobby: () => lobby,
  };
}

describe("createMotionCheck", () => {
  it("shows every seated phone the motion permission view with the game's title", () => {
    const { check, ids } = setup();
    const data: MotionPermissionView = { gameId: "strike", title: "Strike", step: 2 };
    expect([...check.views()]).toEqual(
      ids.map((id) => [id, { screen: "motion-permission", data }]),
    );
    expect(check.players().map(({ state }) => state)).toEqual(["waiting", "waiting", "waiting"]);
  });

  it("finishes once every seated phone answered, with the touch players", () => {
    const { check, ids, done, changes } = setup();
    const [a, b, c] = ids as [string, string, string];
    check.answer(a, "granted");
    check.answer(b, "denied");
    expect(done).toEqual([]);
    expect(changes()).toBe(2);
    expect(check.players().map(({ state }) => state)).toEqual(["motion", "touch", "waiting"]);

    check.answer(c, "unsupported");
    expect(done).toEqual([[b, c]]);
  });

  it("starts after 20 seconds anyway, and phones that never answered play with touch", () => {
    const { check, ids, done, time } = setup();
    const [a, b, c] = ids as [string, string, string];
    check.answer(a, "granted");
    time.advance(motionWaitMs - 1);
    expect(done).toEqual([]);
    time.advance(1);
    expect(done).toEqual([[b, c]]);
    // Answers after the end change nothing.
    check.answer(b, "granted");
    expect(done).toHaveLength(1);
  });

  it("ignores answers from phones without a seat, and the latest answer wins", () => {
    const { check, ids, done, changes } = setup(2);
    const [a, b] = ids as [string, string];
    check.answer("AUDIENCE", "granted");
    expect(changes()).toBe(0);
    check.answer(a, "denied");
    check.answer(a, "denied");
    expect(changes()).toBe(1);
    check.answer(a, "granted");
    check.answer(b, "granted");
    expect(done).toEqual([[]]);
  });

  it("stops waiting for a player whose seat was freed", () => {
    const { check, ids, done, setLobby, lobby } = setup();
    const [a, b, c] = ids as [string, string, string];
    check.answer(a, "granted");
    check.answer(b, "granted");
    check.refresh();
    expect(done).toEqual([]);
    setLobby({ ...lobby(), players: lobby().players.filter((player) => player.id !== c) });
    check.refresh();
    expect(done).toEqual([[]]);
  });

  it("keeps waiting for a dropped phone whose seat is kept, until the 20 seconds end", () => {
    const { check, ids, done, setLobby, lobby, time } = setup(2);
    const [a, b] = ids as [string, string];
    setLobby({
      ...lobby(),
      players: lobby().players.map((p) => (p.id === b ? { ...p, connected: false } : p)),
    });
    check.answer(a, "granted");
    check.refresh();
    expect(done).toEqual([]);
    time.advance(motionWaitMs);
    expect(done).toEqual([[b]]);
  });

  it("does nothing more after dispose", () => {
    const { check, ids, done, time } = setup(1);
    check.dispose();
    expect(time.pending).toBe(0);
    check.answer(ids[0]!, "granted");
    time.advance(motionWaitMs);
    expect(done).toEqual([]);
  });
});
