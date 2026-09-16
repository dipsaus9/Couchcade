import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import type { PlayerId } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import { idleTimeoutMs } from "../src/room/lifecycle.ts";
import { arrivalOf, seatWindowMs } from "../src/room/reconnect.ts";
import type { Room } from "../src/room/room.ts";
import { RoomStorage } from "../src/room/storage.ts";
import { roomStub } from "../src/worker.ts";
import { connect, connectHost, createRoom, joinPhone, type TestSocket } from "./helpers.ts";

const now = 10_000_000;

/** The identity a phone from `joinPhone` reconnects with. */
const again = (id: PlayerId, name = "Pat") => ({ role: "player" as const, playerId: id, name });

/** Moves every stored disconnect time back by `ms`. */
async function travel(code: string, ms: number): Promise<void> {
  await runInDurableObject(roomStub(env, code), (_room: Room, state) => {
    state.storage.sql.exec(
      "UPDATE players SET left_at = left_at - ? WHERE left_at IS NOT NULL",
      ms,
    );
  });
}

async function alarmOf(code: string): Promise<number | null> {
  return runInDurableObject(roomStub(env, code), (_room: Room, state) => state.storage.getAlarm());
}

/** Closes a phone's socket and waits for the host's `player:left { reason: "disconnected" }`. */
async function drop(host: TestSocket, phone: TestSocket, id: PlayerId): Promise<void> {
  phone.close();
  expect(await host.expect("player:left")).toEqual({
    t: "player:left",
    d: { id, reason: "disconnected" },
  });
}

describe("arrivalOf", () => {
  it("is new for an unknown player", () => {
    expect(arrivalOf(null, now)).toBe("new");
  });

  it("is returning while connected or inside the 2-minute window", () => {
    expect(arrivalOf({ leftAt: null, released: false }, now)).toBe("returning");
    expect(arrivalOf({ leftAt: now - seatWindowMs + 1, released: false }, now)).toBe("returning");
  });

  it("is expired once the window ran out or the seat was released", () => {
    expect(arrivalOf({ leftAt: now - seatWindowMs, released: false }, now)).toBe("expired");
    expect(arrivalOf({ leftAt: now - 1, released: true }, now)).toBe("expired");
  });
});

describe("seat window", () => {
  it("gives a phone that comes back within 2 minutes its seat, and tells the host", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    await joinPhone(code, host, "Ann");
    const bob = await joinPhone(code, host, "Bob");
    await drop(host, bob.socket, bob.id);
    await travel(code, seatWindowMs - 5_000);

    const back = await connect(code, again(bob.id, "Bob"));
    const welcome = await back.expect("room:welcome");
    expect(welcome.d).toMatchObject({ role: "player", you: { id: bob.id, slot: 1 } });
    expect(await host.expect("player:reconnected")).toEqual({
      t: "player:reconnected",
      d: { id: bob.id },
    });
    expect(await host.drain()).toEqual([]);
  });

  it("keeps a dropped phone's seat from new joiners", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    await joinPhone(code, host, "Bob");
    await drop(host, ann.socket, ann.id);

    const cleo = await joinPhone(code, host, "Cleo");
    expect(cleo.welcome.you).toMatchObject({ slot: 2 });
  });

  it("makes new joiners audience when every seat is taken or kept", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = [];
    for (let i = 0; i < 8; i++) phones.push(await joinPhone(code, host));
    const [first] = phones;
    if (!first) throw new Error("missing phone");
    await drop(host, first.socket, first.id);

    const late = await joinPhone(code, host);
    expect(late.welcome).toMatchObject({ role: "audience", you: { slot: null } });
  });

  it("sets the alarm for the end of the seat window", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host);
    const before = Date.now();
    await drop(host, ann.socket, ann.id);

    const alarm = await alarmOf(code);
    expect(alarm).toBeGreaterThanOrEqual(before + seatWindowMs);
    expect(alarm).toBeLessThanOrEqual(Date.now() + seatWindowMs);
  });

  it("releases the seat through the alarm after 2 minutes and refuses a later rejoin with 4011", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    await joinPhone(code, host, "Bob");
    await drop(host, ann.socket, ann.id);
    await travel(code, seatWindowMs);

    expect(await runDurableObjectAlarm(roomStub(env, code))).toBe(true);
    expect(await host.expect("player:left")).toEqual({
      t: "player:left",
      d: { id: ann.id, reason: "expired" },
    });
    // Nothing else is due, so the alarm goes back to the idle deadline.
    expect(await alarmOf(code)).toBeGreaterThan(Date.now() + idleTimeoutMs - 60_000);

    const late = await connect(code, again(ann.id, "Ann"));
    expect((await late.closed).code).toBe(4011);
    const cleo = await joinPhone(code, host, "Cleo");
    expect(cleo.welcome.you).toMatchObject({ slot: 0 });
    expect(await host.drain()).toEqual([]);
  });

  it("refuses a late rejoin with 4011 even before the alarm ran, and tells the host once", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    await drop(host, ann.socket, ann.id);
    await travel(code, seatWindowMs + 1_000);

    const late = await connect(code, again(ann.id, "Ann"));
    expect((await late.closed).code).toBe(4011);
    expect(await host.expect("player:left")).toMatchObject({
      d: { id: ann.id, reason: "expired" },
    });

    expect(await runDurableObjectAlarm(roomStub(env, code))).toBe(true);
    expect(await host.drain()).toEqual([]);
  });

  it("refuses a rejoin after the player left the room with 4011", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    ann.socket.send({ t: "player:leave", d: {} });
    expect(await host.expect("player:left")).toMatchObject({ d: { reason: "left" } });

    const back = await connect(code, again(ann.id, "Ann"));
    expect((await back.closed).code).toBe(4011);
  });

  it("tells a reconnecting host about kept seats as away players", async () => {
    const code = await createRoom();
    const first = await connectHost(code);
    const ann = await joinPhone(code, first, "Ann");
    const bob = await joinPhone(code, first, "Bob");
    await drop(first, ann.socket, ann.id);
    first.close();
    await first.closed;

    const host = await connectHost(code);
    const joined = [await host.expect("player:joined"), await host.expect("player:joined")];
    const players = joined.map((message) => message.d.player);
    expect(players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: bob.id, slot: 1, connected: true }),
        expect.objectContaining({ id: ann.id, slot: 0, connected: false }),
      ]),
    );
  });

  it("adds the released column to a room created before it existed", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");

    const record = await runInDurableObject(roomStub(env, code), (_room: Room, state) => {
      state.storage.sql.exec("ALTER TABLE players DROP COLUMN released");
      const storage = new RoomStorage(state.storage.sql);
      expect(storage.readMeta()).not.toBeNull();
      return storage.readPlayer(ann.id);
    });
    expect(record).toMatchObject({ id: ann.id, leftAt: null, released: false });
  });
});
