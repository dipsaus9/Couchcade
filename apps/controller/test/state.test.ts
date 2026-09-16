import type { JsonValue, PlayerInfo, RelayToPhoneMessage } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { lookForSlot } from "../src/session/look.ts";
import {
  endReasonForClose,
  initialState,
  reduce,
  screenOf,
  type PhoneEvent,
  type PhoneState,
} from "../src/session/state.ts";
import type { StoredSession } from "../src/session/storage.ts";
import { waitingCopy } from "../src/screens/waiting/copy.ts";

const session: StoredSession = { code: "BEAN", playerId: "ABCDEFGH", rejoinToken: "r.sig" };
const sam: PlayerInfo = {
  id: "ABCDEFGH",
  name: "Sam",
  slot: 1,
  profile: { skin: 0, hair: 0, hairColour: 0 },
  joinedAt: 1_789_000_000_000,
  connected: true,
};
const draft = { code: "BEAN", name: "Sam", codeFromUrl: true };

const message = (m: RelayToPhoneMessage): PhoneEvent => ({ type: "message", message: m });
const welcome = (you = sam, role: "player" | "audience" = "player") =>
  message({ t: "room:welcome", d: { role, code: "BEAN", phase: "lobby", you } });

function run(state: PhoneState, ...events: PhoneEvent[]): PhoneState {
  return events.reduce(reduce, state);
}

function inRoom(state: PhoneState): Extract<PhoneState, { status: "room" }> {
  if (state.status !== "room") throw new Error(`Expected room, got ${state.status}`);
  return state;
}

const joinState = initialState("BEAN", null);

describe("initialState", () => {
  it("opens the join screen with the code from the QR link", () => {
    expect(joinState).toEqual({
      status: "join",
      draft: { code: "BEAN", name: "", codeFromUrl: true },
      submitting: false,
      notice: null,
    });
    expect(screenOf(joinState)).toBe("join");
  });

  it("opens an empty join screen without a link", () => {
    expect(initialState(null, null)).toMatchObject({ draft: { code: "", codeFromUrl: false } });
  });

  it("resumes a stored session after a reload", () => {
    expect(initialState(null, session)).toEqual({ status: "connecting", session });
    expect(initialState("BEAN", session)).toEqual({ status: "connecting", session });
  });

  it("starts a fresh join when the QR link is for another room", () => {
    expect(initialState("KZPW", session)).toMatchObject({
      status: "join",
      draft: { code: "KZPW" },
    });
  });
});

describe("joining", () => {
  it("marks the form as submitting, then shows why a join failed", () => {
    const submitting = reduce(joinState, { type: "join-submitted", draft });
    expect(submitting).toMatchObject({ status: "join", submitting: true, notice: null, draft });

    const failed = reduce(submitting, { type: "join-failed", failure: "not-found" });
    expect(failed).toEqual({
      status: "join",
      draft,
      submitting: false,
      notice: { kind: "join-failed", failure: "not-found" },
    });
  });

  it("clears an old notice when the player tries again", () => {
    const failed = run(
      joinState,
      { type: "join-submitted", draft },
      { type: "join-failed", failure: "room-full" },
    );
    expect(reduce(failed, { type: "join-submitted", draft })).toMatchObject({ notice: null });
  });

  it("connects after the API hands out a ticket, then shows the lobby on room:welcome", () => {
    const connecting = run(
      joinState,
      { type: "join-submitted", draft },
      { type: "joined", session },
    );
    expect(connecting).toEqual({ status: "connecting", session });
    expect(screenOf(connecting)).toBe("connecting");

    const room = inRoom(reduce(connecting, welcome()));
    expect(room).toMatchObject({
      you: sam,
      role: "player",
      phase: "lobby",
      online: true,
      hostConnected: true,
      view: null,
    });
    expect(screenOf(room)).toBe("lobby");
  });

  it("ignores room messages before joining", () => {
    expect(reduce(joinState, welcome())).toBe(joinState);
  });
});

describe("lobby", () => {
  const lobby = run(initialState(null, session), welcome());

  it("shows the player's colour and shape from their seat", () => {
    expect(lookForSlot(inRoom(lobby).you.slot)).toEqual({
      colourName: "Ocean",
      shape: "square",
      fill: "var(--cc-player-ocean)",
      seatLabel: "Player 2",
    });
    expect(lookForSlot(0)).toMatchObject({ colourName: "Cherry", shape: "circle" });
    expect(lookForSlot(7)).toMatchObject({
      colourName: "Teal",
      shape: "plus",
      seatLabel: "Player 8",
    });
    expect(lookForSlot(null)).toBeNull();
  });

  it("stays on the lobby for a lobby view and waits for anything else", () => {
    const lobbyView = message({
      t: "controller:state",
      d: { gameId: null, view: { screen: "lobby", data: null } },
    });
    const waiting = message({
      t: "controller:state",
      d: { gameId: null, view: { screen: "vip-choosing", data: null } },
    });
    const game = message({
      t: "controller:state",
      d: { gameId: "quick-draw", view: { screen: "lobby", data: null } },
    });

    expect(screenOf(reduce(lobby, lobbyView))).toBe("lobby");
    const choosing = inRoom(reduce(lobby, waiting));
    expect(screenOf(choosing)).toBe("waiting");
    expect(waitingCopy(choosing)).toEqual({
      title: "Watch the TV",
      body: "The VIP is choosing a game.",
      hint: "Your controller shows up here when it starts.",
    });
    expect(screenOf(reduce(lobby, game))).toBe("waiting");
  });

  it("names the VIP while they choose and shows the menu only to the phone that gets it", () => {
    const choosing = inRoom(
      reduce(
        lobby,
        message({
          t: "controller:state",
          d: { gameId: null, view: { screen: "vip-choosing", data: { name: "Noor" } } },
        }),
      ),
    );
    expect(waitingCopy(choosing).body).toBe("Noor is choosing a game.");

    const menuView = message({
      t: "controller:state",
      d: {
        gameId: null,
        view: {
          screen: "menu",
          data: { games: [["quick-draw", "Quick Draw", 1]], picked: null, startsAt: null },
        },
      },
    });
    const menu = inRoom(reduce(lobby, menuView));
    expect(screenOf(menu)).toBe("menu");
    expect(screenOf({ ...menu, hostConnected: false })).toBe("waiting");
    expect(screenOf({ ...menu, online: false })).toBe("waiting");

    const broken = message({
      t: "controller:state",
      d: { gameId: null, view: { screen: "menu", data: { games: "nope" } } },
    });
    expect(screenOf(reduce(lobby, broken))).toBe("waiting");
  });

  it("waits when it joins a room that isn't in the lobby phase", () => {
    const late = message({
      t: "room:welcome",
      d: { role: "player", code: "BEAN", phase: "playing", you: sam },
    });
    expect(screenOf(run(initialState(null, session), late))).toBe("waiting");
  });

  it("tracks the TV going away and coming back", () => {
    const away = inRoom(reduce(lobby, message({ t: "room:host", d: { connected: false } })));
    expect(away.hostConnected).toBe(false);
    expect(
      inRoom(reduce(away, message({ t: "room:host", d: { connected: true } }))).hostConnected,
    ).toBe(true);
  });

  it("marks the phone offline while its socket reconnects, keeping the last view", () => {
    const view = message({
      t: "controller:state",
      d: { gameId: null, view: { screen: "waiting", data: null } },
    });
    const lost = inRoom(run(lobby, view, { type: "socket-lost" }));
    expect(lost.online).toBe(false);
    expect(waitingCopy(lost).title).toBe("Connection lost");

    const back = inRoom(run(lost, welcome()));
    expect(back).toMatchObject({ online: true, view: { screen: "waiting" } });
  });

  it("seats an audience member when they are promoted", () => {
    const audience = run(initialState(null, session), welcome({ ...sam, slot: null }, "audience"));
    expect(inRoom(audience).role).toBe("audience");

    const other = inRoom(
      reduce(audience, message({ t: "player:promoted", d: { id: "JKLMNPQR", slot: 3 } })),
    );
    expect(other.role).toBe("audience");

    const promoted = inRoom(
      reduce(audience, message({ t: "player:promoted", d: { id: sam.id, slot: 3 } })),
    );
    expect(promoted).toMatchObject({ role: "player", you: { slot: 3 } });
  });

  it("goes back to the join screen with the code and name filled in when the session ends", () => {
    expect(reduce(lobby, { type: "ended", reason: "kicked" })).toEqual({
      status: "join",
      draft: { code: "BEAN", name: "Sam", codeFromUrl: false },
      submitting: false,
      notice: { kind: "ended", reason: "kicked", code: "BEAN" },
    });
  });
});

describe("results", () => {
  const lobby = run(initialState(null, session), welcome());
  const resultsView = (data: JsonValue) =>
    message({ t: "controller:state", d: { gameId: null, view: { screen: "results", data } } });

  it("shows the results screen for a valid results view", () => {
    const view = inRoom(
      reduce(lobby, resultsView({ title: "Quick Draw", vipName: "Sam", place: 2, of: 3 })),
    );
    expect(screenOf(view)).toBe("results");
  });

  it("waits instead, offline or while the TV is away", () => {
    const view = inRoom(reduce(lobby, resultsView({ title: "Quick Draw", vipName: "Sam" })));
    expect(screenOf({ ...view, online: false })).toBe("waiting");
    expect(screenOf({ ...view, hostConnected: false })).toBe("waiting");
  });

  it("waits on a malformed results view", () => {
    expect(screenOf(inRoom(reduce(lobby, resultsView({ vipName: "Sam" }))))).toBe("waiting");
  });
});

describe("endReasonForClose", () => {
  it("ends the session on the relay's own close codes", () => {
    expect(endReasonForClose(4003)).toBe("kicked");
    expect(endReasonForClose(4004)).toBe("room-closed");
    expect(endReasonForClose(4008)).toBe("flooding");
    expect(endReasonForClose(4009)).toBe("replaced");
    expect(endReasonForClose(4011)).toBe("seat-expired");
  });

  it("reconnects after a normal close, a deploy or network loss", () => {
    for (const code of [1000, 1001, 1006, 1011, 1012]) expect(endReasonForClose(code)).toBeNull();
  });
});
