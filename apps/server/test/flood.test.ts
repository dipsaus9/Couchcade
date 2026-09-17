import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { closeCodes, rejoinResponseSchema, type PlayerId } from "@couchcade/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { floodBurst, fullBucket, takeToken, type FloodBucket } from "../src/room/flood.ts";
import { Room } from "../src/room/room.ts";
import { RoomStorage } from "../src/room/storage.ts";
import { signRejoinToken } from "../src/security/tickets.ts";
import defaultWorker, { roomStub } from "../src/worker.ts";
import {
  connect,
  connectHost,
  createRoom,
  hostIdentity,
  joinPhone,
  origin,
  TestSocket,
  upgradeRequest,
} from "./helpers.ts";

const start = 50_000_000;
const input = (at: number) => ({ t: "input", d: { type: "tap", at } });
const again = (id: PlayerId, name = "Pat") => ({ role: "player" as const, playerId: id, name });

/**
 * Feeds `sends` (room times in ms, ascending) through a fresh bucket. Returns the time of the
 * first refused frame, or null when every frame passed.
 */
function firstRefused(sends: readonly number[]): number | null {
  let bucket: FloodBucket = fullBucket(sends[0] ?? 0);
  for (const at of sends) {
    const next = takeToken(bucket, at);
    if (!next) return at;
    bucket = next;
  }
  return null;
}

/** Times from `from` to `to` (exclusive), `every` ms apart. */
function times(from: number, to: number, every: number): number[] {
  const result: number[] = [];
  for (let at = from; at < to; at += every) result.push(at);
  return result;
}

/** A phone's clock traffic: 5 pings 200 ms apart on connect, then 1 every 30 seconds. */
function clockPings(connectedAt: number, until: number): number[] {
  return [
    ...times(connectedAt, connectedAt + 1_000, 200),
    ...times(connectedAt + 30_000, until, 30_000),
  ];
}

const merge = (...lists: number[][]) => lists.flat().toSorted((a, b) => a - b);

async function readRoom(code: string) {
  return runInDurableObject(roomStub(env, code), (_room: Room, state) => {
    return { meta: new RoomStorage(state.storage.sql).readMeta() };
  });
}

async function revokedPlayer(code: string, id: PlayerId) {
  return runInDurableObject(roomStub(env, code), (_room: Room, state) =>
    new RoomStorage(state.storage.sql).readPlayer(id),
  );
}

describe("flood bucket", () => {
  it("lets a burst of 40 through at once and refuses the 41st", () => {
    expect(firstRefused(Array.from({ length: floodBurst }, () => start))).toBeNull();
    expect(firstRefused(Array.from({ length: floodBurst + 1 }, () => start))).toBe(start);
  });

  it("refills 20 tokens per second from the time since the last frame", () => {
    let bucket: FloodBucket = { tokens: 0, at: start };
    expect(takeToken(bucket, start + 49)).toBeNull();
    const refilled = takeToken(bucket, start + 50);
    expect(refilled).toEqual({ tokens: 0, at: start + 50 });

    bucket = { tokens: 0, at: start };
    expect(takeToken(bucket, start + 1_000)?.tokens).toBeCloseTo(19);
  });

  it("never holds more than the burst, however long the socket was quiet", () => {
    expect(takeToken({ tokens: 3, at: start }, start + 3_600_000)).toEqual({
      tokens: floodBurst - 1,
      at: start + 3_600_000,
    });
  });

  it("gives no tokens when the clock goes backwards", () => {
    expect(takeToken({ tokens: 0.5, at: start }, start - 10_000)).toBeNull();
  });

  it("stops a socket sending 25 per second once its burst is spent, after about 8 seconds", () => {
    const refused = firstRefused(times(start, start + 60_000, 40));
    expect(refused).not.toBeNull();
    expect((refused ?? 0) - start).toBeGreaterThan(7_500);
    expect((refused ?? 0) - start).toBeLessThan(8_500);
  });

  it("never throttles an honest phone at 4 inputs per second with clock pings, for an hour", () => {
    const hour = start + 3_600_000;
    expect(firstRefused(merge(times(start, hour, 250), clockPings(start, hour)))).toBeNull();
    // Taps bunched at the start of each second, and a reconnect every 5 minutes with its own
    // clock burst, still pass.
    const bunched = times(start, hour, 1_000).flatMap((at) => [at, at, at, at]);
    const reconnects = times(start, hour, 300_000).flatMap((at) => clockPings(at, at + 1_000));
    expect(firstRefused(merge(bunched, reconnects, clockPings(start, hour)))).toBeNull();
  });

  it("never throttles an honest host at 1.5 controller states per second with clock pings", () => {
    const hour = start + 3_600_000;
    const states = times(start, hour, 667);
    // A phase change and a burst of view sends when 8 phones join at once.
    const extras = [...times(start + 10_000, start + 10_008, 1), start + 20_000];
    expect(firstRefused(merge(states, extras, clockPings(start, hour)))).toBeNull();
  });
});

describe("flooding sockets", () => {
  beforeEach(() => {
    // Frozen room time, so the bucket refills only when a test moves the clock.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(start);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("closes a phone that floods with 4008, revokes it and tells the host once", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");

    for (let i = 0; i < 100; i++) ann.socket.send(input(i));
    expect((await ann.socket.closed).code).toBe(closeCodes.flooding);

    for (let i = 0; i < floodBurst; i++) {
      expect(await host.expect("input")).toMatchObject({ from: ann.id, d: { at: i } });
    }
    expect(await host.expect("player:left")).toEqual({
      t: "player:left",
      d: { id: ann.id, reason: "kicked" },
    });
    expect(await host.drain()).toEqual([]);
    expect(await revokedPlayer(code, ann.id)).toMatchObject({ revoked: true, released: true });
  });

  it("counts frames the relay drops: oversized, not JSON, binary and not allowed", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");

    const dropped = [
      JSON.stringify({ t: "input", d: { type: "x".repeat(1_100), at: 0 } }),
      "{not json",
      JSON.stringify({ t: "room:end", d: {} }),
    ];
    for (let i = 0; i < floodBurst; i++) {
      if (i % 4 === 3) ann.socket.sendRaw(new Uint8Array([1, 2, 3]));
      else ann.socket.sendRaw(dropped[i % 4] ?? "");
    }
    ann.socket.send(input(1));
    expect((await ann.socket.closed).code).toBe(closeCodes.flooding);
    expect(await host.expect("player:left")).toMatchObject({ d: { id: ann.id, reason: "kicked" } });
    expect(await host.drain()).toEqual([]);
  });

  it("refuses the revoked player's rejoin with 4008 and gives the seat to the next joiner", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    for (let i = 0; i <= floodBurst; i++) ann.socket.send(input(i));
    await ann.socket.closed;
    await host.drain();

    // Well inside the 2-minute seat window.
    const back = await connect(code, again(ann.id, "Ann"));
    expect((await back.closed).code).toBe(closeCodes.flooding);
    expect(await host.drain()).toEqual([]);

    const bob = await joinPhone(code, host, "Bob");
    expect(bob.welcome.you).toMatchObject({ slot: 0 });
  });

  it("makes the signed rejoin token useless: /rejoin still swaps it, the socket closes with 4008", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    for (let i = 0; i <= floodBurst; i++) ann.socket.send(input(i));
    await ann.socket.closed;

    const secret = env.TICKET_SIGNING_SECRET;
    const rejoinToken = await signRejoinToken(secret, code, again(ann.id, "Ann"));
    const response = await defaultWorker.fetch(
      new Request(`${origin}/api/rooms/${code}/rejoin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({ rejoinToken }),
      }),
      env,
    );
    // No room call on /rejoin (docs/architecture/security.md, "Check order per endpoint").
    expect(response.status).toBe(200);
    const { ticket } = rejoinResponseSchema.parse(await response.json());
    const upgrade = await defaultWorker.fetch(upgradeRequest(code, ticket), env);
    const socket = new TestSocket(upgrade.webSocket as WebSocket);
    expect((await socket.closed).code).toBe(closeCodes.flooding);
  });

  it("keeps the bucket in socket state, so a woken room still counts earlier frames", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    for (let i = 0; i < floodBurst; i++) ann.socket.send(input(i));
    for (let i = 0; i < floodBurst; i++) await host.expect("input");

    // A woken room is a new instance with empty memory. Hand one the next frame.
    await runInDurableObject(roomStub(env, code), async (_room: Room, state) => {
      const woken = new Room(state, env);
      const [socket] = state.getWebSockets("phone");
      if (!socket) throw new Error("no phone socket");
      await woken.webSocketMessage(socket, JSON.stringify(input(99)));
    });
    expect((await ann.socket.closed).code).toBe(closeCodes.flooding);
    expect(await host.expect("player:left")).toMatchObject({ d: { reason: "kicked" } });
  });

  it("closes a flooding host with 4008 and refuses its rejoin", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");

    for (let i = 0; i <= floodBurst; i++) host.send({ t: "room:phase", d: { phase: "lobby" } });
    expect((await host.closed).code).toBe(closeCodes.flooding);
    expect(await ann.socket.expect("room:host")).toEqual({
      t: "room:host",
      d: { connected: false },
    });
    expect((await readRoom(code)).meta).toMatchObject({ hostRevoked: true });

    const back = await connect(code, hostIdentity);
    expect((await back.closed).code).toBe(closeCodes.flooding);
    expect(await ann.socket.drain()).toEqual([]);
  });

  it("never throttles an honest phone at 4 inputs per second with clock pings", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");

    // Two simulated minutes: the connect clock burst, 4 inputs per second, a ping every 30 s.
    let now = start;
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(now);
      await ann.socket.drain();
      now += 200;
    }
    for (let tick = 0; tick < 480; tick++) {
      vi.setSystemTime(now);
      ann.socket.send(input(tick));
      expect(await host.expect("input")).toMatchObject({ from: ann.id, d: { at: tick } });
      if (tick % 120 === 119) await ann.socket.drain();
      now += 250;
    }
    expect(await host.drain()).toEqual([]);
    expect(await revokedPlayer(code, ann.id)).toMatchObject({ revoked: false, leftAt: null });
  });

  it("lets a phone send a full burst again after a quiet second", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");

    for (let i = 0; i < floodBurst; i++) ann.socket.send(input(i));
    for (let i = 0; i < floodBurst; i++) await host.expect("input");
    vi.setSystemTime(start + 2_000);
    // 39 inputs and the drain's clock ping: 40 frames.
    for (let i = 0; i < floodBurst - 1; i++) ann.socket.send(input(i));
    for (let i = 0; i < floodBurst - 1; i++) await host.expect("input");
    expect(await ann.socket.drain()).toEqual([]);
  });
});

describe("storage", () => {
  it("adds the host_revoked column to a room created before it existed", async () => {
    const code = await createRoom();
    const meta = await runInDurableObject(roomStub(env, code), (_room: Room, state) => {
      state.storage.sql.exec("ALTER TABLE meta DROP COLUMN host_revoked");
      return new RoomStorage(state.storage.sql).readMeta();
    });
    expect(meta).toMatchObject({ code, hostRevoked: false });
  });
});
