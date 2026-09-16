import { env } from "cloudflare:workers";
import { runDurableObjectAlarm, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import {
  closeDeadline,
  hostAwayTimeoutMs,
  idleTimeoutMs,
  maxRoomAgeMs,
  roomState,
} from "../src/room/lifecycle.ts";
import type { Room, RoomStatus } from "../src/room/room.ts";
import type { SocketState } from "../src/room/sockets.ts";
import { roomStub } from "../src/worker.ts";
import { connectHost, createRoom, freshCode, joinPhone, origin } from "./helpers.ts";

const minute = 60_000;

async function status(code: string): Promise<{ status: number; body: RoomStatus }> {
  const response = await roomStub(env, code).fetch(`${origin}/internal/status`);
  return { status: response.status, body: await response.json() };
}

/** Moves the room's stored times and every socket's last activity back by `ms`. */
async function travel(code: string, ms: number): Promise<void> {
  await runInDurableObject(roomStub(env, code), (room: Room, state) => {
    state.storage.sql.exec(
      "UPDATE meta SET created_at = created_at - ?, host_seen_at = host_seen_at - ?",
      ms,
      ms,
    );
    for (const connection of room.getConnections<SocketState>()) {
      const socket = connection.state as SocketState;
      connection.setState({ ...socket, lastActiveAt: socket.lastActiveAt - ms });
    }
  });
}

async function storedKeys(code: string): Promise<{ tables: number; alarm: number | null }> {
  return runInDurableObject(roomStub(env, code), async (_room: Room, state) => ({
    tables: state.storage.sql.exec("SELECT name FROM sqlite_master WHERE type = 'table'").toArray()
      .length,
    alarm: await state.storage.getAlarm(),
  }));
}

describe("deadlines", () => {
  const createdAt = 1_000_000;

  it("names the room states", () => {
    const base = { createdAt, lastActivityAt: null };
    expect(roomState({ ...base, hostConnected: false, hostSeenAt: null })).toBe("waiting-for-host");
    expect(roomState({ ...base, hostConnected: true, hostSeenAt: null })).toBe("live");
    expect(roomState({ ...base, hostConnected: false, hostSeenAt: createdAt })).toBe("host-away");
  });

  it("closes a room without its host 30 minutes after it was created or the host left", () => {
    const base = { createdAt, hostConnected: false, lastActivityAt: null };
    expect(closeDeadline({ ...base, hostSeenAt: null })).toBe(createdAt + hostAwayTimeoutMs);
    expect(closeDeadline({ ...base, hostSeenAt: createdAt + 5 * minute })).toBe(
      createdAt + 5 * minute + hostAwayTimeoutMs,
    );
  });

  it("closes a live room 30 minutes after the last activity, and never after 4 hours", () => {
    const base = { createdAt, hostConnected: true, hostSeenAt: null };
    const active = createdAt + 10 * minute;
    expect(closeDeadline({ ...base, lastActivityAt: active })).toBe(active + idleTimeoutMs);
    expect(closeDeadline({ ...base, lastActivityAt: createdAt + maxRoomAgeMs })).toBe(
      createdAt + maxRoomAgeMs,
    );
  });
});

describe("room lifecycle", () => {
  it("creates a room once, waiting for its host, with an alarm 30 minutes out", async () => {
    const before = Date.now();
    const code = await createRoom();
    const again = await roomStub(env, code).fetch(`${origin}/internal/create`, { method: "POST" });
    expect(again.status).toBe(409);

    expect(await status(code)).toEqual({
      status: 200,
      body: { state: "waiting-for-host", locked: false, phones: 0 },
    });
    const { alarm } = await storedKeys(code);
    expect(alarm).toBeGreaterThanOrEqual(before + hostAwayTimeoutMs);
    expect(alarm).toBeLessThanOrEqual(Date.now() + hostAwayTimeoutMs);
  });

  it("reports a room that was never created as not found and stores nothing", async () => {
    const code = freshCode();
    expect((await status(code)).status).toBe(404);
    expect(await storedKeys(code)).toEqual({ tables: 0, alarm: null });
  });

  it("is live with a host and host-away after the host leaves", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    await joinPhone(code, host);
    expect((await status(code)).body).toEqual({ state: "live", locked: false, phones: 1 });

    host.close();
    await host.closed;
    expect((await status(code)).body.state).toBe("host-away");
  });

  it("closes a room whose host never came after 30 minutes", async () => {
    const code = await createRoom();
    await travel(code, hostAwayTimeoutMs + minute);

    expect(await runDurableObjectAlarm(roomStub(env, code))).toBe(true);
    expect((await status(code)).status).toBe(404);
    expect(await storedKeys(code)).toEqual({ tables: 0, alarm: null });
  });

  it("expires an idle room through the alarm after 30 minutes", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phone = await joinPhone(code, host);
    await travel(code, idleTimeoutMs + minute);

    expect(await runDurableObjectAlarm(roomStub(env, code))).toBe(true);
    expect((await host.closed).code).toBe(4004);
    expect((await phone.socket.closed).code).toBe(4004);
    expect(await storedKeys(code)).toEqual({ tables: 0, alarm: null });
  });

  it("keeps an active room and sets the alarm again", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phone = await joinPhone(code, host);
    await travel(code, hostAwayTimeoutMs + minute);
    // Activity since: the phone's socket counts as active again.
    await runInDurableObject(roomStub(env, code), (room: Room) => {
      for (const connection of room.getConnections<SocketState>("phone")) {
        connection.setState({ ...(connection.state as SocketState), lastActiveAt: Date.now() });
      }
    });

    expect(await runDurableObjectAlarm(roomStub(env, code))).toBe(true);
    expect((await status(code)).body.state).toBe("live");
    const { alarm } = await storedKeys(code);
    expect(alarm).toBeGreaterThan(Date.now() + idleTimeoutMs - minute);
    phone.socket.send({ t: "input", d: { type: "draw", at: 1 } });
    await host.expect("input");
  });

  it("does not count clock pings as activity", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    await travel(code, idleTimeoutMs + minute);
    host.send({ t: "clock:ping", d: { id: 1, t0: 0 } });
    await host.expect("clock:pong");

    expect(await runDurableObjectAlarm(roomStub(env, code))).toBe(true);
    expect((await host.closed).code).toBe(4004);
  });

  it("closes a room after 4 hours even when it is active", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    await runInDurableObject(roomStub(env, code), (_room: Room, state) => {
      state.storage.sql.exec("UPDATE meta SET created_at = created_at - ?", maxRoomAgeMs);
    });

    expect(await runDurableObjectAlarm(roomStub(env, code))).toBe(true);
    expect((await host.closed).code).toBe(4004);
  });

  it("closes a room 30 minutes after the host left", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phone = await joinPhone(code, host);
    host.close();
    await host.closed;
    await phone.socket.expect("room:host");
    await travel(code, hostAwayTimeoutMs + minute);

    expect(await runDurableObjectAlarm(roomStub(env, code))).toBe(true);
    expect((await phone.socket.closed).code).toBe(4004);
    expect((await status(code)).status).toBe(404);
  });

  it("closes every socket with 4004 and deletes the room when the host ends it", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phone = await joinPhone(code, host);

    host.send({ t: "room:end", d: {} });
    expect((await host.closed).code).toBe(4004);
    expect((await phone.socket.closed).code).toBe(4004);
    expect(await storedKeys(code)).toEqual({ tables: 0, alarm: null });
  });
});
