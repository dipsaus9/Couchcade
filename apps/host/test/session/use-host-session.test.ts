import type { PlayerInfo, RelayToHostMessage } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { initialLobby } from "../../src/screens/lobby/lobby-state.ts";
import { isNewLobbyJoin } from "../../src/session/use-host-session.ts";

const profile = { skin: 0, hair: 0, hairColour: 0 };

function player(id: string, slot: number | null, joinedAt: number, connected = true): PlayerInfo {
  return { id, name: id.slice(0, 4), slot, profile, joinedAt, connected };
}

const sam = player("SAMSAMSA", 0, 1000);
const noor = player("NRNRNRNR", 1, 2000);

const joined = (p: PlayerInfo): RelayToHostMessage => ({ t: "player:joined", d: { player: p } });

describe("isNewLobbyJoin", () => {
  it("is true the first time a player id appears", () => {
    const lobby = initialLobby("BEAN");
    expect(isNewLobbyJoin(lobby, joined(sam))).toBe(true);
  });

  it("is false for a player already in the lobby (a rename or a reconnect replay)", () => {
    const lobby = { ...initialLobby("BEAN"), players: [sam] };
    expect(isNewLobbyJoin(lobby, joined(sam))).toBe(false);
  });

  it("is false for every message type other than player:joined", () => {
    const lobby = initialLobby("BEAN");
    const others: RelayToHostMessage[] = [
      { t: "room:welcome", d: { role: "host", code: "BEAN", phase: "lobby", locked: false } },
      { t: "player:left", d: { id: sam.id, reason: "disconnected" } },
      { t: "player:reconnected", d: { id: sam.id } },
    ];
    for (const message of others) expect(isNewLobbyJoin(lobby, message)).toBe(false);
  });

  it("only the genuinely new id is true when several players are already seated", () => {
    const lobby = { ...initialLobby("BEAN"), players: [sam] };
    expect(isNewLobbyJoin(lobby, joined(sam))).toBe(false);
    expect(isNewLobbyJoin(lobby, joined(noor))).toBe(true);
  });
});
