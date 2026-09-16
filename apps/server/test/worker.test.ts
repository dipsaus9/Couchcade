import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { Room } from "../src/room/room.ts";
import defaultWorker, { roomLocationHint, roomStub } from "../src/worker.ts";
import {
  connect,
  connectHost,
  createRoom,
  joinPhone,
  origin,
  playerIdentity,
  TestSocket,
  upgradeRequest,
  worker,
} from "./helpers.ts";

const hostTicket = JSON.stringify({ role: "host" });

describe("worker routing", () => {
  it.each(["/api/rooms", "/ws/", "/ws/ABCD/extra", "/internal/create"])(
    "answers 404 for %s",
    async (path) => {
      const response = await worker.fetch(new Request(`${origin}${path}`), env);
      expect(response.status).toBe(404);
    },
  );

  it.each(["abcd", "ABCDE", "ABCI", "AB0D"])(
    "answers 404 for the malformed room code %s",
    async (code) => {
      const response = await worker.fetch(upgradeRequest(code, hostTicket), env);
      expect(response.status).toBe(404);
    },
  );

  it("answers 400 when the request isn't a WebSocket upgrade", async () => {
    const code = await createRoom();
    const plain = await worker.fetch(new Request(`${origin}/ws/${code}?v=1`), env);
    expect(plain.status).toBe(400);
    const post = await worker.fetch(upgradeRequest(code, hostTicket, { method: "POST" }), env);
    expect(post.status).toBe(400);
  });

  it("answers 426 for a protocol version it doesn't speak", async () => {
    const code = await createRoom();
    for (const v of ["", "2"]) {
      const request = new Request(`${origin}/ws/${code}?v=${v}`, {
        headers: { Upgrade: "websocket" },
      });
      expect((await worker.fetch(request, env)).status).toBe(426);
    }
  });

  it("refuses every socket with 401 until tickets are signed (CC-1.10)", async () => {
    const code = await createRoom();
    const response = await defaultWorker.fetch(upgradeRequest(code, hostTicket), env);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid-ticket" });
  });
});

describe("worker forwarding", () => {
  it("addresses rooms by code with locationHint weur", async () => {
    expect(roomLocationHint).toBe("weur");
    const calls: unknown[] = [];
    const Room = {
      idFromName: (name: string) => env.Room.idFromName(name),
      get: (id: DurableObjectId, options?: DurableObjectNamespaceGetDurableObjectOptions) => {
        calls.push(options);
        return env.Room.get(id, options);
      },
    } as unknown as typeof env.Room;

    const code = await createRoom();
    roomStub({ Room }, code);
    const response = await worker.fetch(upgradeRequest(code, hostTicket), { ...env, Room });
    expect(response.status).toBe(101);
    new TestSocket(response.webSocket as WebSocket).close();
    expect(calls).toEqual([{ locationHint: "weur" }, { locationHint: "weur" }]);
  });

  it("declares the Room and rate limit bindings", () => {
    expect(typeof env.Room.idFromName).toBe("function");
    for (const binding of [
      env.RL_PASSCODE,
      env.RL_CREATE,
      env.RL_JOIN,
      env.RL_REJOIN,
      env.RL_UPGRADE,
    ]) {
      expect(typeof binding.limit).toBe("function");
    }
  });

  it("sets the identity from the ticket and ignores identity headers a client sends", async () => {
    const code = await createRoom();
    const identity = playerIdentity();
    const request = upgradeRequest(code, JSON.stringify(identity), {
      headers: { "x-cc-role": "host", "x-cc-player-id": "host", "x-partykit-room": "ZZZZ" },
    });
    const response = await worker.fetch(request, env);
    const phone = new TestSocket(response.webSocket as WebSocket);
    expect((await phone.expect("room:welcome")).d).toMatchObject({
      role: "player",
      code,
      you: { id: identity.playerId },
    });
  });

  it("doesn't let a client choose its connection id and pose as the host", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const identity = playerIdentity();
    const request = new Request(
      `${origin}/ws/${code}?v=1&_pk=host&ticket=${encodeURIComponent(JSON.stringify(identity))}`,
      { headers: { Upgrade: "websocket" } },
    );
    const impostor = new TestSocket((await worker.fetch(request, env)).webSocket as WebSocket);
    await impostor.expect("room:welcome");
    await impostor.expect("room:host");
    await host.expect("player:joined");

    const sender = await joinPhone(code, host);
    sender.socket.send({ t: "input", d: { type: "draw", at: 1 } });
    await host.expect("input");
    expect(await impostor.drain()).toEqual([]);

    const ids = await runInDurableObject(roomStub(env, code), (room: Room) =>
      [...room.getConnections()].map((connection) => connection.id),
    );
    expect(ids).toHaveLength(3);
    expect(ids).not.toContain("host");
  });

  it("connects a host through the worker", async () => {
    const code = await createRoom();
    const host = await connect(code, { role: "host" });
    expect((await host.expect("room:welcome")).d.role).toBe("host");
  });
});
