import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { signRejoinToken, signTicket } from "../src/security/tickets.ts";
import defaultWorker from "../src/worker.ts";
import {
  createRoom,
  freshCode,
  origin,
  playerIdentity,
  TestSocket,
  upgradeRequest,
  watchRooms,
} from "./helpers.ts";

const secret = env.TICKET_SIGNING_SECRET;

async function upgrade(request: Request) {
  const watched = watchRooms();
  const response = await defaultWorker.fetch(request, watched.env);
  return { response, rooms: watched.rooms };
}

describe("socket upgrades with signed tickets", () => {
  it("connects a valid host ticket", async () => {
    const code = await createRoom();
    const { response, rooms } = await upgrade(
      upgradeRequest(code, await signTicket(secret, code, { role: "host" })),
    );
    expect(response.status).toBe(101);
    expect(rooms).toEqual([code]);
    const host = new TestSocket(response.webSocket as WebSocket);
    expect((await host.expect("room:welcome")).d.role).toBe("host");
  });

  it("refuses bad tickets with 401 before calling the room", async () => {
    const code = await createRoom();
    const player = playerIdentity();
    const tickets: Array<[string, string | null]> = [
      ["no ticket", null],
      ["a forged ticket", "eyJrIjoidGlja2V0In0.c2lnbmF0dXJl"],
      ["a ticket signed with another secret", await signTicket(`${secret}-other`, code, player)],
      ["an expired ticket", await signTicket(secret, code, player, Date.now() - 60_001)],
      ["another room's ticket", await signTicket(secret, freshCode(), player)],
      ["a rejoin token", await signRejoinToken(secret, code, player)],
    ];
    for (const [label, ticket] of tickets) {
      const request =
        ticket === null
          ? new Request(`${origin}/ws/${code}?v=1`, {
              headers: { Upgrade: "websocket", Origin: origin },
            })
          : upgradeRequest(code, ticket);
      const { response, rooms } = await upgrade(request);
      expect({ label, status: response.status, rooms }).toEqual({ label, status: 401, rooms: [] });
      expect(await response.json()).toEqual({ error: "invalid-ticket" });
    }
  });

  it("refuses a missing or foreign Origin with 403 before calling the room", async () => {
    const code = await createRoom();
    const ticket = await signTicket(secret, code, { role: "host" });
    for (const headers of [{ Origin: "https://evil.test" }, { Origin: "null" }]) {
      const { response, rooms } = await upgrade(upgradeRequest(code, ticket, { headers }));
      expect({ status: response.status, rooms }).toEqual({ status: 403, rooms: [] });
    }
    const bare = new Request(`${origin}/ws/${code}?v=1&ticket=${ticket}`, {
      headers: { Upgrade: "websocket" },
    });
    const { response, rooms } = await upgrade(bare);
    expect({ status: response.status, rooms }).toEqual({ status: 403, rooms: [] });
  });

  it("connects a player ticket as a player even with a forged x-cc-role header", async () => {
    const code = await createRoom();
    const player = playerIdentity();
    const request = upgradeRequest(code, await signTicket(secret, code, player), {
      headers: { "x-cc-role": "host", "x-cc-player-id": "host" },
    });
    const { response } = await upgrade(request);
    const phone = new TestSocket(response.webSocket as WebSocket);
    expect((await phone.expect("room:welcome")).d).toMatchObject({
      role: "player",
      you: { id: player.playerId },
    });
  });

  it("never routes /internal/* from outside to a room", async () => {
    for (const path of ["/internal/create", "/internal/status", "/api/../internal/create"]) {
      const { response, rooms } = await upgrade(
        new Request(`${origin}${path}`, { method: "POST" }),
      );
      expect({ path, status: response.status, rooms }).toEqual({ path, status: 404, rooms: [] });
    }
  });
});
