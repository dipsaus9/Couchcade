import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Room } from "../src/room/room.ts";
import type { RoomSnapshot } from "../src/room/snapshot.ts";
import { RoomStorage } from "../src/room/storage.ts";
import { roomStub } from "../src/worker.ts";
import { connectHost, createRoom, joinPhone } from "./helpers.ts";

// The relay side of docs/architecture/session-flow.md, "Host refresh and deploy recovery": it stores
// the host's last room:snapshot with one write and sends it back to a host that rejoins.

const snapshot = (round: number, gameId: string | null = "quick-draw"): RoomSnapshot => ({
  round,
  gameId,
  data: gameId === null ? null : { p: ["AAAAAAAA"], t: 12_000, g: { round: round + 1 } },
});

const send = (d: RoomSnapshot) => ({ t: "room:snapshot", d });

async function stored(code: string): Promise<{ rows: number; snapshot: RoomSnapshot | null }> {
  return runInDurableObject(roomStub(env, code), (_room: Room, state) => {
    const [count] = state.storage.sql
      .exec<{ n: number }>("SELECT COUNT(*) AS n FROM snapshot")
      .toArray();
    return {
      rows: count?.n ?? 0,
      snapshot: new RoomStorage(state.storage.sql).readSnapshot(),
    };
  });
}

describe("room:snapshot", () => {
  it("stores the host's snapshot, replacing the previous one", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    expect(await stored(code)).toEqual({ rows: 0, snapshot: null });

    host.send(send(snapshot(0)));
    host.send(send(snapshot(1)));
    expect(await host.drain()).toEqual([]);
    expect(await stored(code)).toEqual({ rows: 1, snapshot: snapshot(1) });

    // A new game's round 0 replaces what the last game left, and a game without snapshots sends null.
    host.send(send(snapshot(0, null)));
    await host.drain();
    expect(await stored(code)).toEqual({ rows: 1, snapshot: snapshot(0, null) });
  });

  it("sends the stored snapshot to a host that rejoins, after its player:joined messages", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    const bob = await joinPhone(code, host, "Bob");
    host.send({ t: "room:phase", d: { phase: "playing" } });
    host.send(send(snapshot(3)));
    await host.drain();

    // The TV tab reloads: the old socket closes and a new one connects.
    host.close();
    expect(await ann.socket.expect("room:host")).toMatchObject({ d: { connected: false } });
    await bob.socket.expect("room:host");
    const again = await connectHost(code);
    const burst = await again.drain();
    expect(burst.map((message) => (typeof message === "string" ? message : message.t))).toEqual([
      "player:joined",
      "player:joined",
      "room:snapshot",
    ]);
    expect(burst[2]).toEqual({ t: "room:snapshot", d: snapshot(3) });
    expect(await ann.socket.expect("room:host")).toMatchObject({ d: { connected: true } });
  });

  it("sends no snapshot to a host when none is stored", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    await joinPhone(code, host, "Ann");
    host.close();
    const again = await connectHost(code);
    expect(await again.drain()).toEqual([expect.objectContaining({ t: "player:joined" })]);
  });

  it("drops a room:snapshot from a phone", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const ann = await joinPhone(code, host, "Ann");
    ann.socket.send(send(snapshot(2)));
    await ann.socket.drain();
    expect(await stored(code)).toEqual({ rows: 0, snapshot: null });
  });

  it("adds the snapshot table to a room created before it existed", async () => {
    const code = await createRoom();
    const saved = await runInDurableObject(roomStub(env, code), (_room: Room, state) => {
      state.storage.sql.exec("DROP TABLE snapshot");
      const storage = new RoomStorage(state.storage.sql);
      storage.readMeta();
      storage.saveSnapshot(snapshot(1), 1);
      return storage.readSnapshot();
    });
    expect(saved).toEqual(snapshot(1));
  });
});
