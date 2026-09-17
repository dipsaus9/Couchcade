import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { closeCodes, type PlayerId } from "@couchcade/protocol";
import { describe, expect, it } from "vitest";
import {
  isRoomFull,
  maxPhones,
  memberCount,
  planPromotions,
  promotesIn,
} from "../src/room/audience.ts";
import { seatWindowMs } from "../src/room/reconnect.ts";
import type { Room } from "../src/room/room.ts";
import { roomStub } from "../src/worker.ts";
import {
  connect,
  connectHost,
  createRoom,
  joinPhone,
  playerIdentity,
  type TestSocket,
} from "./helpers.ts";

type Phone = Awaited<ReturnType<typeof joinPhone>>;

/** Joins `count` phones one after the other, so their join order is their place in line. */
async function joinPhones(code: string, host: TestSocket, count: number): Promise<Phone[]> {
  const phones: Phone[] = [];
  for (let i = 0; i < count; i++) phones.push(await joinPhone(code, host));
  return phones;
}

function nth(phones: readonly Phone[], index: number): Phone {
  const phone = phones[index];
  if (!phone) throw new Error(`no phone ${index}`);
  return phone;
}

const promoted = (id: PlayerId, slot: number) => ({ t: "player:promoted", d: { id, slot } });

async function slotOf(code: string, id: PlayerId): Promise<number | null> {
  return runInDurableObject(roomStub(env, code), (_room: Room, state) => {
    const [row] = state.storage.sql
      .exec<{ slot: number | null }>("SELECT slot FROM players WHERE id = ?", id)
      .toArray();
    return row?.slot ?? null;
  });
}

describe("audience rules", () => {
  it("caps a room at 16 phones", () => {
    expect(maxPhones).toBe(16);
    expect(isRoomFull(15)).toBe(false);
    expect(isRoomFull(16)).toBe(true);
  });

  it("counts connected phones and held places once per player", () => {
    const connected = [{ id: "AAAAAAAA" }, { id: "AAAAAAAB" }, { id: "AAAAAAAA" }];
    expect(memberCount(connected, [{ id: "AAAAAAAB" }, { id: "AAAAAAAC" }])).toBe(3);
  });

  it("promotes only outside a running game", () => {
    expect(promotesIn("playing")).toBe(false);
    for (const phase of ["lobby", "menu", "calibration", "motion-check", "results"] as const) {
      expect(promotesIn(phase)).toBe(true);
    }
  });

  it("gives the lowest free seats to the longest-waiting audience members", () => {
    const waiting = [
      { id: "CCCCCCCC", joinedAt: 30 },
      { id: "AAAAAAAA", joinedAt: 10 },
      { id: "BBBBBBBB", joinedAt: 10 },
    ];
    expect(planPromotions(new Set([0, 1, 3, 4, 5, 6, 7]), waiting)).toEqual([
      { id: "AAAAAAAA", slot: 2 },
    ]);
    expect(planPromotions(new Set([1, 2, 3, 4, 5, 7]), waiting)).toEqual([
      { id: "AAAAAAAA", slot: 0 },
      { id: "BBBBBBBB", slot: 6 },
    ]);
    expect(planPromotions(new Set([0, 1, 2, 3, 4, 5, 6, 7]), waiting)).toEqual([]);
  });
});

describe("audience", () => {
  it("makes the 9th to 16th joiners audience", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = await joinPhones(code, host, maxPhones);
    expect(
      phones.map(({ welcome }) => [welcome.role, (welcome.you as { slot: unknown }).slot]),
    ).toEqual([
      ...Array.from({ length: 8 }, (_, slot) => ["player", slot]),
      ...Array.from({ length: 8 }, () => ["audience", null]),
    ]);
  });

  it("refuses a 17th phone at connect with 4012, even when it got past the join API", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    await joinPhones(code, host, maxPhones);

    const extra = await connect(code, playerIdentity());
    expect((await extra.closed).code).toBe(closeCodes.roomFull);
    expect(await host.drain()).toEqual([]);
  });

  it("counts a dropped phone's place, and still lets that phone back in", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = await joinPhones(code, host, maxPhones);
    const away = nth(phones, 12);
    away.socket.close();
    await host.expect("player:left");

    const extra = await connect(code, playerIdentity());
    expect((await extra.closed).code).toBe(closeCodes.roomFull);

    const back = await connect(code, { role: "player", playerId: away.id, name: "Pat" });
    expect((await back.expect("room:welcome")).d).toMatchObject({ role: "audience" });
    expect(await host.expect("player:reconnected")).toMatchObject({ d: { id: away.id } });
  });

  it("drops input, calibration taps and ui actions from audience phones", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const audience = nth(await joinPhones(code, host, 9), 8);

    audience.socket.send({ t: "input", d: { type: "draw", at: 1_000 } });
    audience.socket.send({ t: "calibration:tap", d: { at: 1_000 } });
    audience.socket.send({ t: "ui:action", d: { action: "start" } });
    audience.socket.send({ t: "motion:status", d: { status: "granted" } });
    expect(await audience.socket.drain()).toEqual([]);
    expect(await host.drain()).toEqual([]);
  });
});

describe("promotion", () => {
  it("seats the longest-waiting audience member when a player leaves between games", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = await joinPhones(code, host, 10);
    const [leaver, first, second] = [nth(phones, 2), nth(phones, 8), nth(phones, 9)];

    leaver.socket.send({ t: "player:leave", d: {} });
    expect(await host.expect("player:left")).toMatchObject({
      d: { id: leaver.id, reason: "left" },
    });
    expect(await host.expect("player:promoted")).toEqual(promoted(first.id, 2));
    expect(await first.socket.expect("player:promoted")).toEqual(promoted(first.id, 2));
    expect(await second.socket.drain()).toEqual([]);
    expect(await slotOf(code, first.id)).toBe(2);

    // The promoted phone is a player now: its input reaches the host.
    first.socket.send({ t: "input", d: { type: "draw", at: 1_000 } });
    expect(await host.expect("input")).toMatchObject({ from: first.id });

    // A reconnect keeps the new seat.
    first.socket.close();
    await host.expect("player:left");
    const back = await connect(code, { role: "player", playerId: first.id, name: "Pat" });
    expect((await back.expect("room:welcome")).d).toMatchObject({
      role: "player",
      you: { slot: 2 },
    });
  });

  it("keeps freed seats empty during a game and fills them when the game is over", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = await joinPhones(code, host, 10);
    host.send({ t: "room:phase", d: { phase: "playing" } });
    await host.drain();

    nth(phones, 0).socket.send({ t: "player:leave", d: {} });
    expect(await host.expect("player:left")).toMatchObject({ d: { reason: "left" } });
    host.send({ t: "room:kick", d: { id: nth(phones, 5).id } });
    expect(await host.expect("player:left")).toMatchObject({ d: { reason: "kicked" } });
    expect(await host.drain()).toEqual([]);
    expect(await nth(phones, 8).socket.drain()).toEqual([]);

    host.send({ t: "room:phase", d: { phase: "results" } });
    expect(await host.expect("player:promoted")).toEqual(promoted(nth(phones, 8).id, 0));
    expect(await host.expect("player:promoted")).toEqual(promoted(nth(phones, 9).id, 5));
    expect(await host.drain()).toEqual([]);
  });

  it("seats audience when a player is kicked between games", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = await joinPhones(code, host, 9);

    host.send({ t: "room:kick", d: { id: nth(phones, 4).id } });
    expect(await host.expect("player:left")).toMatchObject({ d: { reason: "kicked" } });
    expect(await host.expect("player:promoted")).toEqual(promoted(nth(phones, 8).id, 4));
  });

  it("seats audience when a dropped player's seat window runs out", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = await joinPhones(code, host, 9);
    const away = nth(phones, 1);
    away.socket.close();
    await host.expect("player:left");
    // A held seat isn't free.
    expect(await nth(phones, 8).socket.drain()).toEqual([]);

    await runInDurableObject(roomStub(env, code), (_room: Room, state) => {
      state.storage.sql.exec(
        "UPDATE players SET left_at = left_at - ? WHERE id = ?",
        seatWindowMs,
        away.id,
      );
    });
    expect(await runDurableObjectAlarm(roomStub(env, code))).toBe(true);
    expect(await host.expect("player:left")).toMatchObject({
      d: { id: away.id, reason: "expired" },
    });
    expect(await host.expect("player:promoted")).toEqual(promoted(nth(phones, 8).id, 1));
  });

  it("skips audience phones that are away, and tells the host when one comes back to a free seat", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = await joinPhones(code, host, 9);
    const audience = nth(phones, 8);
    audience.socket.close();
    await host.expect("player:left");

    nth(phones, 3).socket.send({ t: "player:leave", d: {} });
    expect(await host.expect("player:left")).toMatchObject({ d: { reason: "left" } });
    expect(await host.drain()).toEqual([]);

    const back = await connect(code, { role: "player", playerId: audience.id, name: "Pat" });
    expect((await back.expect("room:welcome")).d).toMatchObject({
      role: "player",
      you: { slot: 3 },
    });
    expect(await host.expect("player:reconnected")).toMatchObject({ d: { id: audience.id } });
    expect(await host.expect("player:promoted")).toEqual(promoted(audience.id, 3));
  });
});
