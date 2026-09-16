import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { Room } from "../src/room/room.ts";
import { roomStub } from "../src/worker.ts";
import {
  connect,
  connectHost,
  createRoom,
  freshCode,
  hostIdentity,
  joinPhone,
  playerIdentity,
} from "./helpers.ts";

const input = { t: "input", d: { type: "draw", at: 1_000 } };
const view = (screen: string) => ({ screen, data: null });

describe("hibernation", () => {
  it("accepts sockets with the Hibernation API", async () => {
    expect(Room.options.hibernate).toBe(true);
    const code = await createRoom();
    const host = await connectHost(code);
    await joinPhone(code, host);

    const hibernatable = await runInDurableObject(roomStub(env, code), (_room, state) => {
      return state.getWebSockets().length;
    });
    expect(hibernatable).toBe(2);
  });

  it("answers the keep-alive ping without a handler", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    host.sendRaw("ping");
    expect(await host.next()).toBe("pong");
  });

  it("forwards from a fresh instance that only has the sockets and storage", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phone = await joinPhone(code, host);

    // A woken room is a new instance with empty memory. Hand one a frame from the hibernated socket.
    await runInDurableObject(roomStub(env, code), async (_room: Room, state) => {
      const woken = new Room(state, env);
      const [socket] = state.getWebSockets("phone");
      if (!socket) throw new Error("no phone socket");
      await woken.webSocketMessage(socket, JSON.stringify(input));
    });
    expect(await host.expect("input")).toMatchObject({ from: phone.id, d: input.d });
  });
});

describe("join", () => {
  it("welcomes the host with the room state", async () => {
    const code = await createRoom();
    const host = await connect(code, hostIdentity);
    expect(await host.expect("room:welcome")).toEqual({
      t: "room:welcome",
      d: { role: "host", code, phase: "lobby", locked: false },
    });
  });

  it("seats a phone, welcomes it and tells the host with player:joined", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const identity = playerIdentity("Émile");
    const phone = await connect(code, identity);

    const welcome = await phone.expect("room:welcome");
    expect(welcome.d).toMatchObject({
      role: "player",
      code,
      phase: "lobby",
      you: { id: identity.playerId, name: "Émile", slot: 0, connected: true },
    });
    expect(await phone.expect("room:host")).toMatchObject({ d: { connected: true } });

    const joined = await host.expect("player:joined");
    expect(joined.d.player).toEqual(welcome.d.you);
  });

  it("gives seats in order and makes the 9th phone audience", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const slots: unknown[] = [];
    for (let i = 0; i < 9; i++) {
      const { welcome } = await joinPhone(code, host);
      slots.push([welcome.role, (welcome.you as { slot: number | null }).slot]);
    }
    expect(slots).toEqual([
      ["player", 0],
      ["player", 1],
      ["player", 2],
      ["player", 3],
      ["player", 4],
      ["player", 5],
      ["player", 6],
      ["player", 7],
      ["audience", null],
    ]);
  });

  it("tells a phone when the host is not there yet", async () => {
    const code = await createRoom();
    const phone = await connect(code, playerIdentity());
    await phone.expect("room:welcome");
    expect(await phone.expect("room:host")).toMatchObject({ d: { connected: false } });
  });

  it("sends the host one player:joined per connected phone when it reconnects", async () => {
    const code = await createRoom();
    const first = await connectHost(code);
    const a = await joinPhone(code, first, "Ann");
    const b = await joinPhone(code, first, "Bob");

    first.close();
    await first.closed;
    expect(await a.socket.expect("room:host")).toMatchObject({ d: { connected: false } });
    expect(await b.socket.expect("room:host")).toMatchObject({ d: { connected: false } });

    const host = await connectHost(code);
    const joined = [await host.expect("player:joined"), await host.expect("player:joined")];
    expect(joined.map((m) => (m.d.player as { id: string }).id).toSorted()).toEqual(
      [a.id, b.id].toSorted(),
    );
    expect(await a.socket.expect("room:host")).toMatchObject({ d: { connected: true } });
  });

  it("closes the older socket with 4009 when the same player connects again", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const identity = playerIdentity();
    const older = await connect(code, identity);
    const olderWelcome = await older.expect("room:welcome");
    await host.expect("player:joined");

    const newer = await connect(code, identity);
    const newerWelcome = await newer.expect("room:welcome");
    expect((await older.closed).code).toBe(4009);
    expect(newerWelcome.d.you).toMatchObject({
      slot: (olderWelcome.d.you as { slot: number }).slot,
    });
    // The host already knows the player, and re-sends their view to the newer tab.
    expect(await host.expect("player:reconnected")).toMatchObject({ d: { id: identity.playerId } });
    expect(await host.drain()).toEqual([]);
  });

  it("closes a socket for a room that doesn't exist with 4004", async () => {
    const phone = await connect(freshCode(), playerIdentity());
    expect((await phone.closed).code).toBe(4004);
  });

  it("closes a socket whose identity is invalid with 1008", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const badId = await connect(code, { role: "player", playerId: "lowercase", name: "Pat" });
    const badName = await connect(code, { ...playerIdentity(), name: "x".repeat(13) });
    expect((await badId.closed).code).toBe(1008);
    expect((await badName.closed).code).toBe(1008);
    expect(await host.drain()).toEqual([]);
  });
});

describe("forward", () => {
  it("forwards phone input only to the host, with from set by the relay", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const sender = await joinPhone(code, host);
    const other = await joinPhone(code, host);

    sender.socket.send({ ...input, from: "FORGEDID" });
    expect(await host.expect("input")).toEqual({ t: "input", d: input.d, from: sender.id });
    expect(await other.socket.drain()).toEqual([]);
    expect(await sender.socket.drain()).toEqual([]);
  });

  it("forwards ui:action, calibration:tap and motion:status to the host", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phone = await joinPhone(code, host);

    phone.socket.send({ t: "ui:action", d: { action: "start" } });
    phone.socket.send({ t: "calibration:tap", d: { at: 5 } });
    phone.socket.send({ t: "motion:status", d: { status: "granted" } });
    expect(await host.expect("ui:action")).toMatchObject({ from: phone.id });
    expect(await host.expect("calibration:tap")).toMatchObject({ from: phone.id });
    expect(await host.expect("motion:status")).toMatchObject({ from: phone.id });
  });

  it("sends each targeted phone only its own controller:state view", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = [];
    for (let i = 0; i < 9; i++) phones.push(await joinPhone(code, host));
    const [named, seated, , , , , , , audience] = phones;
    if (!named || !seated || !audience) throw new Error("missing phones");

    host.send({
      t: "controller:state",
      d: {
        gameId: "quick-draw",
        views: [
          { to: [named.id], view: view("named") },
          { to: "players", view: view("players") },
          { to: "audience", view: view("audience") },
        ],
      },
    });

    expect(await named.socket.expect("controller:state")).toEqual({
      t: "controller:state",
      d: { gameId: "quick-draw", view: view("named") },
    });
    expect((await seated.socket.expect("controller:state")).d.view).toEqual(view("players"));
    expect((await audience.socket.expect("controller:state")).d.view).toEqual(view("audience"));
    expect(await named.socket.drain()).toEqual([]);
    expect(await host.drain()).toEqual([]);
  });

  it("sends a phone nothing when no entry targets it", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const target = await joinPhone(code, host);
    const bystander = await joinPhone(code, host);

    host.send({
      t: "controller:state",
      d: { gameId: null, views: [{ to: [target.id], view: { screen: "lobby", data: {} } }] },
    });
    await target.socket.expect("controller:state");
    expect(await bystander.socket.drain()).toEqual([]);
  });

  it("drops messages a role may not send, and bad frames", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phones = [];
    for (let i = 0; i < 9; i++) phones.push(await joinPhone(code, host));
    const player = phones[0];
    const audience = phones[8];
    if (!player || !audience) throw new Error("missing phones");

    // A phone may not kick, change views or end the room.
    player.socket.send({ t: "room:kick", d: { id: audience.id } });
    player.socket.send({ t: "room:end", d: {} });
    player.socket.send({
      t: "controller:state",
      d: { gameId: null, views: [{ to: "all", view: { screen: "lobby", data: {} } }] },
    });
    // Audience phones can't send input.
    audience.socket.send(input);
    // Oversized, malformed, wrong-schema and binary frames.
    player.socket.send({ ...input, d: { ...input.d, type: "x".repeat(1_100) } });
    player.socket.send("{not json");
    player.socket.send({ t: "input", d: { type: "draw" } });
    player.socket.sendRaw(new TextEncoder().encode(JSON.stringify(input)));
    // The host may not send phone messages.
    host.send(input);

    expect(await player.socket.drain()).toEqual([]);
    expect(await audience.socket.drain()).toEqual([]);
    expect(await host.drain()).toEqual([]);
    expect(await phones[1]?.socket.drain()).toEqual([]);
  });

  it("answers clock pings with room time", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const before = Date.now();
    host.send({ t: "clock:ping", d: { id: 7, t0: 123.5 } });
    const pong = await host.expect("clock:pong");
    expect(pong.d).toMatchObject({ id: 7, t0: 123.5 });
    expect(pong.d.t1).toBeGreaterThanOrEqual(before);
  });

  it("stores and forwards a player's profile", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phone = await joinPhone(code, host);
    const profile = { skin: 2, hair: 3, hairColour: 1 };

    phone.socket.send({ t: "player:profile", d: { profile } });
    expect(await host.expect("player:profile")).toEqual({
      t: "player:profile",
      d: { profile },
      from: phone.id,
    });

    host.close();
    await host.closed;
    const again = await connectHost(code);
    expect((await again.expect("player:joined")).d.player).toMatchObject({ profile });
  });

  it("stores the phase and sends it in the next welcome", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    host.send({ t: "room:phase", d: { phase: "playing" } });
    await host.drain();

    const phone = await connect(code, playerIdentity());
    expect((await phone.expect("room:welcome")).d.phase).toBe("playing");
  });
});

describe("leave", () => {
  it("sends player:left disconnected to the host when a phone's socket closes", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phone = await joinPhone(code, host);

    phone.socket.close();
    expect(await host.expect("player:left")).toEqual({
      t: "player:left",
      d: { id: phone.id, reason: "disconnected" },
    });
  });

  it("sends player:left left once when a phone leaves the room", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const phone = await joinPhone(code, host);

    phone.socket.send({ t: "player:leave", d: {} });
    expect(await host.expect("player:left")).toEqual({
      t: "player:left",
      d: { id: phone.id, reason: "left" },
    });
    await phone.socket.closed;
    expect(await host.drain()).toEqual([]);
  });

  it("frees the seat of a phone that left the room at once", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const first = await joinPhone(code, host);
    await joinPhone(code, host);

    first.socket.send({ t: "player:leave", d: {} });
    await host.expect("player:left");
    const next = await joinPhone(code, host);
    expect((next.welcome.you as { slot: number }).slot).toBe(0);
  });

  it("does not report a replaced socket as left", async () => {
    const code = await createRoom();
    const host = await connectHost(code);
    const identity = playerIdentity();
    const older = await connect(code, identity);
    await host.expect("player:joined");
    await connect(code, identity);
    await host.expect("player:reconnected");

    await older.closed;
    expect(await host.drain()).toEqual([]);
  });
});
