import type { ControllerView, PlayerInfo, RelayToPhoneMessage } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { noticeCopy } from "../../src/join/copy.ts";
import { lineLabel, parseAudienceView } from "../../src/screens/audience/audience-view.ts";
import { showsRoomFull } from "../../src/screens/room-full/room-full.ts";
import { waitingCopy } from "../../src/screens/waiting/copy.ts";
import {
  initialState,
  reduce,
  screenOf,
  type PhoneEvent,
  type PhoneState,
} from "../../src/session/state.ts";
import type { StoredSession } from "../../src/session/storage.ts";

const session: StoredSession = { code: "BEAN", playerId: "ABCDEFGH", rejoinToken: "r.sig" };
const mees: PlayerInfo = {
  id: "ABCDEFGH",
  name: "Mees",
  slot: null,
  profile: { skin: 0, hair: 0, hairColour: 0 },
  joinedAt: 1_789_000_000_000,
  connected: true,
};

const message = (m: RelayToPhoneMessage): PhoneEvent => ({ type: "message", message: m });
const view = (gameId: string | null, v: ControllerView) =>
  message({ t: "controller:state", d: { gameId, view: v } });

function run(state: PhoneState, ...events: PhoneEvent[]): PhoneState {
  return events.reduce(reduce, state);
}

const audience = run(
  initialState(null, session),
  message({ t: "room:welcome", d: { role: "audience", code: "BEAN", phase: "lobby", you: mees } }),
);

describe("audience view", () => {
  it("reads the place in line", () => {
    expect(parseAudienceView({ screen: "audience", data: { position: 3 } })).toEqual({
      position: 3,
    });
    expect(parseAudienceView(null)).toBeNull();
    expect(parseAudienceView({ screen: "lobby", data: { position: 1 } })).toBeNull();
    for (const data of [null, [], { position: 0 }, { position: 1.5 }, { position: "1" }]) {
      expect(parseAudienceView({ screen: "audience", data })).toBeNull();
    }
  });

  it("says You're next, then 2nd, 3rd and 11th in line", () => {
    expect(lineLabel(1)).toBe("You're next");
    expect(lineLabel(2)).toBe("2nd in line");
    expect(lineLabel(3)).toBe("3rd in line");
    expect(lineLabel(8)).toBe("8th in line");
    expect(lineLabel(11)).toBe("11th in line");
  });
});

describe("audience screen", () => {
  it("shows Watching to audience phones in every phase, with or without a view", () => {
    expect(screenOf(audience)).toBe("audience");
    expect(screenOf(run(audience, view(null, { screen: "audience", data: { position: 1 } })))).toBe(
      "audience",
    );
    // Whatever the host sends a group, an audience phone keeps watching.
    expect(screenOf(run(audience, view("quick-draw", { screen: "tap", data: null })))).toBe(
      "audience",
    );
    expect(screenOf(run(audience, view(null, { screen: "lobby", data: { vip: false } })))).toBe(
      "audience",
    );
  });

  it("waits instead while offline or while the TV is away", () => {
    expect(screenOf(reduce(audience, { type: "socket-lost" }))).toBe("waiting");
    expect(screenOf(run(audience, message({ t: "room:host", d: { connected: false } })))).toBe(
      "waiting",
    );
  });

  it("leaves Watching once the phone is promoted to a seat", () => {
    const promoted = run(
      audience,
      view(null, { screen: "audience", data: { position: 1 } }),
      message({ t: "player:promoted", d: { id: mees.id, slot: 4 } }),
    );
    expect(screenOf(promoted)).toBe("waiting");
    expect(screenOf(run(promoted, view(null, { screen: "lobby", data: { vip: false } })))).toBe(
      "lobby",
    );
  });
});

describe("next game", () => {
  const seated = run(
    initialState(null, session),
    message({
      t: "room:welcome",
      d: { role: "player", code: "BEAN", phase: "playing", you: { ...mees, slot: 2 } },
    }),
  );

  it("shows Next game soon to a seated player who isn't in the running game", () => {
    const waiting = run(seated, view("quick-draw", { screen: "next-game", data: null }));
    expect(screenOf(waiting)).toBe("next-game");
    if (waiting.status !== "room") throw new Error("not in the room");
    expect(waitingCopy(waiting)).toEqual({
      title: "Next game soon",
      body: "You're in. You play from the next game.",
      hint: "Watch the TV until then.",
    });
    // Losing the socket still says so first.
    const offline = reduce(waiting, { type: "socket-lost" });
    if (offline.status !== "room") throw new Error("not in the room");
    expect(waitingCopy(offline).title).toBe("Connection lost");
  });
});

describe("room is full", () => {
  it("shows the Room is full screen after a 409 or a 4012 close, and the join form after", () => {
    const failed = run(
      initialState("BEAN", null),
      { type: "join-submitted", draft: { code: "BEAN", name: "Mees", codeFromUrl: true } },
      { type: "join-failed", failure: "room-full" },
    );
    expect(showsRoomFull(failed)).toBe(true);

    const closed = reduce(audience, { type: "ended", reason: "room-full" });
    expect(showsRoomFull(closed)).toBe(true);
    if (closed.status !== "join" || closed.notice === null) throw new Error("no notice");
    expect(noticeCopy(closed.notice)).toBe("Room is full. Ask the host to start a new one.");

    const next = reduce(closed, { type: "notice-dismissed" });
    expect(showsRoomFull(next)).toBe(false);
    expect(next).toMatchObject({ draft: { code: "", name: "Mees" } });

    expect(showsRoomFull(audience)).toBe(false);
    expect(showsRoomFull(reduce(audience, { type: "ended", reason: "kicked" }))).toBe(false);
    expect(
      showsRoomFull(
        run(
          initialState("BEAN", null),
          { type: "join-submitted", draft: { code: "BEAN", name: "Mees", codeFromUrl: true } },
          { type: "join-failed", failure: "room-locked" },
        ),
      ),
    ).toBe(false);
  });
});
