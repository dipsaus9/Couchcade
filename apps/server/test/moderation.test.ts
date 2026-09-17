import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import {
  closeCodes,
  createRoomResponseSchema,
  joinRoomResponseSchema,
  rejoinResponseSchema,
  type PlayerId,
} from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { refusalFor } from "../src/room/moderation.ts";
import type { Room } from "../src/room/room.ts";
import { RoomStorage, type PlayerRecord } from "../src/room/storage.ts";
import defaultWorker, { roomStub } from "../src/worker.ts";
import {
  connect,
  connectHost,
  createRoom,
  joinPhone,
  origin,
  TestSocket,
  upgradeRequest,
} from "./helpers.ts";

const passcode = env.HOST_PASSCODE ?? "";
const turnstile = "XXXX.DUMMY.TOKEN.XXXX";

/** The identity a phone from `joinPhone` reconnects with. */
const again = (id: PlayerId, name = "Pat") => ({ role: "player" as const, playerId: id, name });
const kick = (id: PlayerId) => ({ t: "room:kick", d: { id } });
const lock = (locked: boolean) => ({ t: "room:lock", d: { locked } });

function post(path: string, body: unknown): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
}

/** Opens a socket with a signed ticket through the real Worker. */
async function open(code: string, ticket: string): Promise<TestSocket> {
  const response = await defaultWorker.fetch(upgradeRequest(code, ticket), env);
  if (!response.webSocket) throw new Error(`upgrade failed: ${response.status}`);
  return new TestSocket(response.webSocket);
}

/** A room created through the API with its host connected, so phones can join through `/join`. */
async function liveRoom(): Promise<{ code: string; host: TestSocket }> {
  const response = await defaultWorker.fetch(post("/api/rooms", { passcode, turnstile }), env);
  const created = createRoomResponseSchema.parse(await response.json());
  const host = await open(created.code, created.ticket);
  await host.expect("room:welcome");
  return { code: created.code, host };
}

async function joinThroughApi(code: string, name = "Pat") {
  const response = await defaultWorker.fetch(
    post(`/api/rooms/${code}/join`, { name, turnstile }),
    env,
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function playerRow(code: string, id: PlayerId): Promise<PlayerRecord | null> {
  return runInDurableObject(roomStub(env, code), (_room: Room, state) =>
    new RoomStorage(state.storage.sql).readPlayer(id),
  );
}

async function lockedFlag(code: string): Promise<boolean | undefined> {
  return runInDurableObject(
    roomStub(env, code),
    (_room: Room, state) => new RoomStorage(state.storage.sql).readMeta()?.locked,
  );
}

const record = (change: Partial<PlayerRecord>): PlayerRecord => ({
  id: "ABCDEFGH",
  name: "Pat",
  slot: 0,
  profile: { skin: 0, hair: 0, hairColour: 0 },
  joinedAt: 0,
  leftAt: null,
  released: false,
  revoked: false,
  kicked: false,
  ...change,
});

describe("refusalFor", () => {
  it("refuses kicked players with 4003 and revoked players with 4008", () => {
    expect(refusalFor(null)).toBeNull();
    expect(refusalFor(record({}))).toBeNull();
    expect(refusalFor(record({ kicked: true }))?.code).toBe(closeCodes.kicked);
    expect(refusalFor(record({ revoked: true }))?.code).toBe(closeCodes.flooding);
    // A flooder the host kicked afterwards is told they were kicked.
    expect(refusalFor(record({ kicked: true, revoked: true }))?.code).toBe(closeCodes.kicked);
  });
});

describe("room:kick", () => {
  it("closes the phone with 4003, frees the seat and tells the host once", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    const bob = await joinPhone(code, host, "Bob");

    host.send(kick(bob.id));
    expect((await bob.socket.closed).code).toBe(closeCodes.kicked);
    expect(await host.expect("player:left")).toEqual({
      t: "player:left",
      d: { id: bob.id, reason: "kicked" },
    });
    expect(await host.drain()).toEqual([]);
    expect(await playerRow(code, bob.id)).toMatchObject({ kicked: true, released: true });

    // Ann plays on, and a second kick of Bob changes nothing.
    host.send(kick(bob.id));
    expect(await host.drain()).toEqual([]);
    expect(await ann.socket.drain()).toEqual([]);
  });

  it("ignores ids the room never seated", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    host.send(kick("ZZZZZZZZ"));
    expect(await host.drain()).toEqual([]);
    expect(await ann.socket.drain()).toEqual([]);
  });

  it("refuses the kicked player's rejoin with 4003 and gives the seat to the next joiner", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    host.send(kick(ann.id));
    await ann.socket.closed;
    await host.drain();

    // Well inside the 2-minute seat window.
    const back = await connect(code, again(ann.id, "Ann"));
    expect((await back.closed).code).toBe(closeCodes.kicked);
    expect(await host.drain()).toEqual([]);

    const bob = await joinPhone(code, host, "Bob");
    expect(bob.welcome.you).toMatchObject({ slot: 0 });
  });

  it("kicks a player who is away: their seat frees at once and the rejoin closes with 4003", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    ann.socket.close();
    expect(await host.expect("player:left")).toMatchObject({ d: { reason: "disconnected" } });

    host.send(kick(ann.id));
    expect(await host.expect("player:left")).toEqual({
      t: "player:left",
      d: { id: ann.id, reason: "kicked" },
    });
    expect(await host.drain()).toEqual([]);

    const back = await connect(code, again(ann.id, "Ann"));
    expect((await back.closed).code).toBe(closeCodes.kicked);
  });

  it("makes the signed rejoin token useless: /rejoin still swaps it, the socket closes with 4003", async () => {
    const { code, host } = await liveRoom();
    const joined = joinRoomResponseSchema.parse((await joinThroughApi(code, "Ann")).body);
    const ann = await open(code, joined.ticket);
    await ann.expect("room:welcome");
    await host.expect("player:joined");

    host.send(kick(joined.playerId));
    expect((await ann.closed).code).toBe(closeCodes.kicked);

    const response = await defaultWorker.fetch(
      post(`/api/rooms/${code}/rejoin`, { rejoinToken: joined.rejoinToken }),
      env,
    );
    // No room call on /rejoin (docs/architecture/security.md, "Check order per endpoint").
    expect(response.status).toBe(200);
    const { ticket } = rejoinResponseSchema.parse(await response.json());
    const back = await open(code, ticket);
    expect((await back.closed).code).toBe(closeCodes.kicked);
  });
});

describe("room:lock", () => {
  it("answers new joins with 423 while locked and lets them in again once unlocked", async () => {
    const { code, host } = await liveRoom();
    expect((await joinThroughApi(code)).status).toBe(200);

    host.send(lock(true));
    await host.drain();
    expect(await lockedFlag(code)).toBe(true);
    expect(await joinThroughApi(code)).toEqual({ status: 423, body: { error: "room-locked" } });

    host.send(lock(false));
    await host.drain();
    expect(await lockedFlag(code)).toBe(false);
    expect((await joinThroughApi(code)).status).toBe(200);
  });

  it("still lets a seated player rejoin while locked", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    host.send(lock(true));
    ann.socket.close();
    expect(await host.expect("player:left")).toMatchObject({ d: { reason: "disconnected" } });

    const back = await connect(code, again(ann.id, "Ann"));
    expect((await back.expect("room:welcome")).d).toMatchObject({ you: { id: ann.id, slot: 0 } });
    expect(await host.expect("player:reconnected")).toMatchObject({ d: { id: ann.id } });
  });

  it("tells a reconnecting host the room is locked", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    host.send(lock(true));
    await host.drain();

    const next = await connect(code, { role: "host" });
    expect((await next.expect("room:welcome")).d).toMatchObject({ locked: true });
  });
});
