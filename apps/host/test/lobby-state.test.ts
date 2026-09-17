import type { PlayerInfo, RelayToHostMessage } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import {
  applyRelayMessage,
  audience,
  initialLobby,
  seatedPlayers,
  seats,
  setLocked,
  vip,
  type LobbyState,
} from "../src/screens/lobby/lobby-state.ts";

const profile = { skin: 0, hair: 0, hairColour: 0 };

function player(id: string, slot: number | null, joinedAt: number, connected = true): PlayerInfo {
  return { id, name: id.slice(0, 4), slot, profile, joinedAt, connected };
}

const sam = player("SAMSAMSA", 0, 1000);
const noor = player("NRNRNRNR", 1, 2000);
const mees = player("MEESMEES", null, 3000);

function apply(state: LobbyState, ...messages: RelayToHostMessage[]): LobbyState {
  return messages.reduce(applyRelayMessage, state);
}

const joined = (p: PlayerInfo): RelayToHostMessage => ({ t: "player:joined", d: { player: p } });

const welcome: RelayToHostMessage = {
  t: "room:welcome",
  d: { role: "host", code: "BEAN", phase: "lobby", locked: false },
};

describe("applyRelayMessage", () => {
  it("lists players live as they join, in join order", () => {
    const state = apply(initialLobby("BEAN"), welcome, joined(noor), joined(sam));
    expect(state.players.map((p) => p.id)).toEqual([sam.id, noor.id]);
  });

  it("rebuilds the list after a new welcome, as on a host reconnect", () => {
    const before = apply(initialLobby("BEAN"), welcome, joined(sam), joined(noor));
    const after = apply(before, { ...welcome, d: { ...welcome.d, locked: true } }, joined(noor));
    expect(after.players).toEqual([noor]);
    expect(after.locked).toBe(true);
  });

  it("replaces a player who joins again instead of listing them twice", () => {
    const renamed = { ...sam, name: "Sammy" };
    const state = apply(initialLobby("BEAN"), joined(sam), joined(renamed));
    expect(state.players).toEqual([renamed]);
  });

  it("keeps a disconnected player's seat and marks them away", () => {
    const state = apply(initialLobby("BEAN"), joined(sam), {
      t: "player:left",
      d: { id: sam.id, reason: "disconnected" },
    });
    expect(state.players).toEqual([{ ...sam, connected: false }]);
    expect(seats(state)[0]?.player?.id).toBe(sam.id);
  });

  it.each(["left", "kicked", "expired"] as const)("frees the seat when a player %s", (reason) => {
    const state = apply(initialLobby("BEAN"), joined(sam), joined(noor), {
      t: "player:left",
      d: { id: sam.id, reason },
    });
    expect(state.players).toEqual([noor]);
  });

  it("gives a seat to a new player when the relay reuses a disconnected player's slot", () => {
    const daan = player("DAANDAAN", 0, 4000);
    const state = apply(
      initialLobby("BEAN"),
      joined(sam),
      { t: "player:left", d: { id: sam.id, reason: "disconnected" } },
      joined(daan),
    );
    expect(state.players).toEqual([daan]);
  });

  it("marks a returning player connected again", () => {
    const state = apply(
      initialLobby("BEAN"),
      joined(sam),
      { t: "player:left", d: { id: sam.id, reason: "disconnected" } },
      { t: "player:reconnected", d: { id: sam.id } },
    );
    expect(state.players).toEqual([sam]);
  });

  it("seats a promoted audience member", () => {
    const state = apply(initialLobby("BEAN"), joined(mees), {
      t: "player:promoted",
      d: { id: mees.id, slot: 7 },
    });
    expect(state.players).toEqual([{ ...mees, slot: 7 }]);
  });

  it("stores a profile change from the player who sent it", () => {
    const next = { skin: 2, hair: 3, hairColour: 1 };
    const state = apply(initialLobby("BEAN"), joined(sam), joined(noor), {
      t: "player:profile",
      d: { profile: next },
      from: noor.id,
    });
    expect(state.players).toEqual([sam, { ...noor, profile: next }]);
  });

  it("returns the same state for messages about unknown players or outside the lobby", () => {
    const state = apply(initialLobby("BEAN"), joined(sam));
    expect(applyRelayMessage(state, { t: "player:reconnected", d: { id: noor.id } })).toBe(state);
    expect(applyRelayMessage(state, { t: "clock:pong", d: { id: 1, t0: 1.5, t1: 1000 } })).toBe(
      state,
    );
  });

  it("never mutates the state it was given", () => {
    const state = apply(initialLobby("BEAN"), joined(sam));
    const copy = structuredClone(state);
    apply(state, joined(noor), { t: "player:left", d: { id: sam.id, reason: "left" } });
    expect(state).toEqual(copy);
  });
});

describe("seats", () => {
  it("has 8 seats, each with the colour and shape its player gets, filled or not", () => {
    const list = seats(apply(initialLobby("BEAN"), joined(sam), joined(noor), joined(mees)));
    expect(list.map((seat) => seat.style.shape)).toEqual([
      "circle",
      "square",
      "triangle",
      "diamond",
      "star",
      "hexagon",
      "heart",
      "plus",
    ]);
    expect(list.map((seat) => seat.player?.id ?? null)).toEqual([
      sam.id,
      noor.id,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe("seated players, audience and VIP", () => {
  it("splits players from the audience", () => {
    const state = apply(initialLobby("BEAN"), joined(sam), joined(mees), joined(noor));
    expect(seatedPlayers(state)).toEqual([sam, noor]);
    expect(audience(state)).toEqual([mees]);
  });

  it("makes the connected seated player who joined first the VIP", () => {
    const state = apply(initialLobby("BEAN"), joined(mees), joined(noor), joined(sam));
    expect(vip(state)?.id).toBe(sam.id);
  });

  it("passes VIP on when the first player is away, and has none without players", () => {
    const away = apply(initialLobby("BEAN"), joined(sam), joined(noor), {
      t: "player:left",
      d: { id: sam.id, reason: "disconnected" },
    });
    expect(vip(away)?.id).toBe(noor.id);
    expect(vip(apply(initialLobby("BEAN"), joined(mees)))).toBeUndefined();
  });
});

describe("Kick and Lock room", () => {
  it("frees a kicked player's card, so the card's Kick button goes with them", () => {
    const state = apply(initialLobby("BEAN"), welcome, joined(sam), joined(noor), {
      t: "player:left",
      d: { id: noor.id, reason: "kicked" },
    });
    expect(seats(state)[1]?.player).toBeNull();
    expect(vip(state)?.id).toBe(sam.id);
  });

  it("locks and unlocks the room on the TV without touching the players", () => {
    const open = apply(initialLobby("BEAN"), welcome, joined(sam));
    const locked = setLocked(open, true);
    expect(locked).toEqual({ ...open, locked: true });
    expect(setLocked(locked, false)).toEqual(open);
    // Nothing changed, so the TV doesn't redraw.
    expect(setLocked(locked, true)).toBe(locked);
    expect(open.locked).toBe(false);
  });

  it("keeps the lock through player messages until the next welcome says otherwise", () => {
    const locked = setLocked(apply(initialLobby("BEAN"), welcome), true);
    expect(apply(locked, joined(sam)).locked).toBe(true);
    expect(apply(locked, welcome).locked).toBe(false);
  });
});
