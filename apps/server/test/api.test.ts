import { env } from "cloudflare:workers";
import { runInDurableObject } from "cloudflare:test";
import {
  createRoomResponseSchema,
  joinRoomResponseSchema,
  rejoinResponseSchema,
} from "@couchcade/protocol";
import { EN_NAME_BLOCKLIST, NL_NAME_BLOCKLIST } from "@couchcade/utils/names";
import { describe, expect, it, vi } from "vitest";
import { apiErrorCodes, apiErrorStatus } from "../src/api/index.ts";
import { maxPhones } from "../src/room/audience.ts";
import { passcodeMatches } from "../src/api/passcode.ts";
import { smokeHeader } from "../src/api/turnstile.ts";
import { maxTokenLength } from "../src/security/turnstile.ts";
import { signRejoinToken, signTicket } from "../src/security/tickets.ts";
import defaultWorker, { createWorker, roomStub, signedTickets } from "../src/worker.ts";
import {
  clientHeaders,
  connectHost,
  createRoom,
  freshCode,
  joinPhone,
  origin,
  playerIdentity,
  TestSocket,
  upgradeRequest,
  watchRooms,
} from "./helpers.ts";
import { siteverifyTokens } from "./siteverify.ts";

const passcode = env.HOST_PASSCODE ?? "";
const secret = env.TICKET_SIGNING_SECRET;
const turnstile = "XXXX.DUMMY.TOKEN.XXXX";

function post(path: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: clientHeaders({ "Content-Type": "application/json", Origin: origin, ...headers }),
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function call(request: Request, worker = defaultWorker, base: Cloudflare.Env = env) {
  const watched = watchRooms(base);
  const response = await worker.fetch(request, watched.env);
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, body, rooms: watched.rooms };
}

/** Opens a socket with a signed ticket through the real Worker. */
async function open(code: string, ticket: string): Promise<TestSocket> {
  const response = await defaultWorker.fetch(upgradeRequest(code, ticket), env);
  if (!response.webSocket) throw new Error(`upgrade failed: ${response.status}`);
  return new TestSocket(response.webSocket);
}

/** A room created through the API with its host connected, so phones can join. */
async function liveRoom(): Promise<{ code: string; host: TestSocket; rejoinToken: string }> {
  const { body } = await call(post("/api/rooms", { passcode, turnstile }));
  const created = createRoomResponseSchema.parse(body);
  const host = await open(created.code, created.ticket);
  await host.expect("room:welcome");
  return { code: created.code, host, rejoinToken: created.rejoinToken };
}

describe("error codes", () => {
  it("lists every code once, each with one status", () => {
    expect(new Set(apiErrorCodes).size).toBe(apiErrorCodes.length);
    expect(apiErrorStatus["wrong-passcode"]).toBe(401);
    expect(apiErrorStatus["room-full"]).toBe(409);
    expect(apiErrorStatus["room-locked"]).toBe(423);
  });
});

describe("POST /api/rooms", () => {
  it("returns a room code, a host ticket and a rejoin token for the right passcode", async () => {
    const { status, body, rooms } = await call(post("/api/rooms", { passcode, turnstile }));
    expect(status).toBe(201);
    const created = createRoomResponseSchema.parse(body);
    expect(rooms).toEqual([created.code]);

    const host = await open(created.code, created.ticket);
    expect((await host.expect("room:welcome")).d).toMatchObject({
      role: "host",
      code: created.code,
    });
  });

  it.each([
    ["a wrong passcode", { passcode: `${passcode}x`, turnstile }],
    ["an empty passcode", { passcode: "", turnstile }],
    ["no passcode", { turnstile }],
  ])("answers 401 for %s without calling a room", async (_case, body) => {
    const response = await call(post("/api/rooms", body));
    expect(response).toEqual({ status: 401, body: { error: "wrong-passcode" }, rooms: [] });
  });

  it("never creates rooms when HOST_PASSCODE isn't set", async () => {
    const unset = { ...env, HOST_PASSCODE: undefined };
    const response = await call(
      post("/api/rooms", { passcode: "", turnstile }),
      defaultWorker,
      unset,
    );
    expect(response).toEqual({ status: 401, body: { error: "wrong-passcode" }, rooms: [] });
  });

  it.each([
    ["invalid JSON", "{"],
    ["a JSON array", "[]"],
    ["a passcode that isn't text", { passcode: 1234, turnstile }],
    ["a body over 4 KB", { passcode, turnstile, padding: "x".repeat(4096) }],
  ])("answers 400 for %s without calling a room", async (_case, body) => {
    const response = await call(post("/api/rooms", body));
    expect(response).toEqual({ status: 400, body: { error: "bad-request" }, rooms: [] });
  });

  it("tries another code when a room is already active, up to 5 codes", async () => {
    const taken = await createRoom();
    const fresh = freshCode();
    const codes = [taken, taken, fresh];
    const worker = createWorker({
      verifyTicket: signedTickets,
      newRoomCode: () => codes.shift() ?? "",
    });
    const { status, body, rooms } = await call(post("/api/rooms", { passcode, turnstile }), worker);
    expect(status).toBe(201);
    expect(body.code).toBe(fresh);
    expect(rooms).toEqual([taken, taken, fresh]);

    const stuck = createWorker({ verifyTicket: signedTickets, newRoomCode: () => taken });
    const refused = await call(post("/api/rooms", { passcode, turnstile }), stuck);
    expect(refused).toMatchObject({ status: 503, body: { error: "no-free-code" } });
    expect(refused.rooms).toHaveLength(5);
  });
});

describe("POST /api/rooms/:code/join", () => {
  it("returns a player ticket that connects to the room", async () => {
    const { code, host } = await liveRoom();
    const { status, body, rooms } = await call(
      post(`/api/rooms/${code}/join`, { name: " Zoë ", turnstile }),
    );
    expect(status).toBe(200);
    expect(rooms).toEqual([code]);
    const joined = joinRoomResponseSchema.parse(body);
    expect(joined.name).toBe("Zoë");

    const phone = await open(code, joined.ticket);
    expect((await phone.expect("room:welcome")).d).toMatchObject({
      role: "player",
      you: { id: joined.playerId, name: "Zoë" },
    });
    expect((await host.expect("player:joined")).d).toMatchObject({
      player: { id: joined.playerId },
    });
  });

  it("gives every join a new player id", async () => {
    const { code } = await liveRoom();
    const first = await call(post(`/api/rooms/${code}/join`, { name: "Pat", turnstile }));
    const second = await call(post(`/api/rooms/${code}/join`, { name: "Pat", turnstile }));
    expect(first.body.playerId).not.toBe(second.body.playerId);
  });

  it("answers 404 for a room that was never created", async () => {
    const response = await call(post(`/api/rooms/${freshCode()}/join`, { name: "Pat", turnstile }));
    expect(response).toMatchObject({ status: 404, body: { error: "not-found" } });
  });

  it("answers 404 while the room has no TV connected", async () => {
    const code = await createRoom();
    const join = () => call(post(`/api/rooms/${code}/join`, { name: "Pat", turnstile }));
    expect(await join()).toMatchObject({ status: 404, body: { error: "not-found" } });

    const host = await connectHost(code);
    expect((await join()).status).toBe(200);
    host.close();
    await host.closed;
    expect(await join()).toMatchObject({ status: 404, body: { error: "not-found" } });
  });

  it.each(["abcd", "ABCI", "ABCDE"])(
    "answers 404 for the malformed code %s without calling a room",
    async (code) => {
      const response = await call(post(`/api/rooms/${code}/join`, { name: "Pat", turnstile }));
      expect(response).toEqual({ status: 404, body: { error: "not-found" }, rooms: [] });
    },
  );

  it("stores the name normalised: NFKC, trimmed and with single spaces", async () => {
    const { code } = await liveRoom();
    const { status, body } = await call(
      post(`/api/rooms/${code}/join`, { name: "  Ｐａｔ   de  Wit ", turnstile }),
    );
    expect(status).toBe(200);
    expect(joinRoomResponseSchema.parse(body).name).toBe("Pat de Wit");
  });

  it("answers 400 for a bad body or name without calling a room", async () => {
    const { code } = await liveRoom();
    for (const [body, error] of [
      ["{", "bad-request"],
      [{ turnstile }, "bad-request"],
      [{ name: "Pat", turnstile, profile: { skin: 99, hair: 0, hairColour: 0 } }, "bad-request"],
      [{ name: "   ", turnstile }, "name-not-allowed"],
      [{ name: "Thirteen chrs", turnstile }, "name-not-allowed"],
      [{ name: "Pat 🙂", turnstile }, "name-not-allowed"],
      [{ name: "P\u200Bat", turnstile }, "name-not-allowed"],
      [{ name: "P\u0430t", turnstile }, "name-not-allowed"],
      [{ name: "...", turnstile }, "name-not-allowed"],
      [{ name: EN_NAME_BLOCKLIST.anywhere[0], turnstile }, "name-not-allowed"],
      [{ name: NL_NAME_BLOCKLIST.whole[0]?.toUpperCase(), turnstile }, "name-not-allowed"],
    ] as const) {
      const response = await call(post(`/api/rooms/${code}/join`, body));
      expect(response).toEqual({ status: 400, body: { error }, rooms: [] });
    }
  });

  it("answers 423 while the room is locked", async () => {
    const { code } = await liveRoom();
    await runInDurableObject(roomStub(env, code), (_room, state) => {
      state.storage.sql.exec("UPDATE meta SET locked = 1");
    });
    const response = await call(post(`/api/rooms/${code}/join`, { name: "Pat", turnstile }));
    expect(response).toMatchObject({ status: 423, body: { error: "room-locked" } });
  });

  it("answers 409 room-full once 16 phones are in the room", async () => {
    const { code, host } = await liveRoom();
    const join = () => call(post(`/api/rooms/${code}/join`, { name: "Pat", turnstile }));
    expect(maxPhones).toBe(16);
    for (let phone = 0; phone < maxPhones - 1; phone++) await joinPhone(code, null);
    expect((await join()).status).toBe(200);

    await joinPhone(code, null);
    expect(await join()).toMatchObject({ status: 409, body: { error: "room-full" } });
    host.close();
  });
});
describe("Turnstile", () => {
  // Cloudflare's test secret that refuses every token, and a missing secret.
  const refusing = { ...env, TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA" };
  const unset = { ...env, TURNSTILE_SECRET_KEY: undefined };
  const failed = { error: "turnstile-failed" };

  it("sends the dummy token XXXX.DUMMY.TOKEN.XXXX to Siteverify once per create and join", async () => {
    siteverifyTokens.splice(0);
    const { code } = await liveRoom();
    expect((await call(post(`/api/rooms/${code}/join`, { name: "Pat", turnstile }))).status).toBe(
      200,
    );
    expect(siteverifyTokens).toEqual([turnstile, turnstile]);
  });

  it.each([
    ["a missing token", { passcode }],
    ["an empty token", { passcode, turnstile: "" }],
    [
      "a token longer than Cloudflare's 2,048 characters",
      { passcode, turnstile: "x".repeat(2049) },
    ],
  ])("answers 403 to room creation with %s, without calling a room", async (_case, body) => {
    const response = await call(post("/api/rooms", body));
    expect(response).toEqual({ status: 403, body: failed, rooms: [] });
  });

  it("answers 403 to an invalid token before the passcode is checked", async () => {
    for (const body of [
      { passcode, turnstile },
      { passcode: "wrong", turnstile },
    ]) {
      const response = await call(post("/api/rooms", body), defaultWorker, refusing);
      expect(response).toEqual({ status: 403, body: failed, rooms: [] });
    }
  });

  it("fits a token of the longest length Cloudflare issues in the body", async () => {
    const long = "x".repeat(maxTokenLength);
    expect((await call(post("/api/rooms", { passcode, turnstile: long }))).status).toBe(201);
  });

  it("fails closed with 403 turnstile-unavailable when no secret is set", async () => {
    const created = await call(post("/api/rooms", { passcode, turnstile }), defaultWorker, unset);
    expect(created).toEqual({ status: 403, body: { error: "turnstile-unavailable" }, rooms: [] });
  });

  it.each([
    ["a missing token", { name: "Pat" }],
    ["an empty token", { name: "Pat", turnstile: "" }],
  ])("answers 403 to a join with %s, without calling a room", async (_case, body) => {
    const response = await call(post(`/api/rooms/${freshCode()}/join`, body));
    expect(response).toEqual({ status: 403, body: failed, rooms: [] });
  });

  it("answers 403 to a join with an invalid token or no secret, without calling a room", async () => {
    const join = post(`/api/rooms/${freshCode()}/join`, { name: "Pat", turnstile });
    expect(await call(join.clone(), defaultWorker, refusing)).toEqual({
      status: 403,
      body: failed,
      rooms: [],
    });
    expect(await call(join, defaultWorker, unset)).toEqual({
      status: 403,
      body: { error: "turnstile-unavailable" },
      rooms: [],
    });
  });

  it("checks the name before Turnstile, so a rejected name doesn't spend the token", async () => {
    siteverifyTokens.splice(0);
    for (const name of ["  ", NL_NAME_BLOCKLIST.anywhere[0]]) {
      const response = await call(post(`/api/rooms/${freshCode()}/join`, { name, turnstile }));
      expect(response).toMatchObject({ status: 400, body: { error: "name-not-allowed" } });
    }
    expect(siteverifyTokens).toEqual([]);
  });
});

describe("smoke token", () => {
  const smokeToken = env.SMOKE_TOKEN ?? "";
  // Every Turnstile token fails here, so only the smoke token can get a room created.
  const refusing = { ...env, TURNSTILE_SECRET_KEY: "2x0000000000000000000000000000000AA" };
  const smoke = (body: unknown, token: string, headers: HeadersInit = {}) =>
    post("/api/rooms", body, { [smokeHeader]: token, ...headers });

  it("skips only Turnstile on room creation when x-cc-smoke matches SMOKE_TOKEN", async () => {
    siteverifyTokens.splice(0);
    const response = await call(smoke({ passcode }, smokeToken), defaultWorker, refusing);
    expect(response.status).toBe(201);
    expect(createRoomResponseSchema.parse(response.body).code).toBe(response.rooms[0]);
    expect(siteverifyTokens).toEqual([]);
  });

  it("still checks the passcode and Origin", async () => {
    const wrong = await call(smoke({ passcode: "wrong" }, smokeToken), defaultWorker, refusing);
    expect(wrong).toEqual({ status: 401, body: { error: "wrong-passcode" }, rooms: [] });
    const foreign = await call(
      smoke({ passcode }, smokeToken, { Origin: "https://evil.test" }),
      defaultWorker,
      refusing,
    );
    expect(foreign).toEqual({ status: 403, body: { error: "forbidden-origin" }, rooms: [] });
  });

  it.each([
    ["a wrong smoke token", `${env.SMOKE_TOKEN}x`],
    ["an empty smoke token", ""],
  ])("falls back to the Turnstile check for %s", async (_case, token) => {
    const response = await call(smoke({ passcode, turnstile }, token), defaultWorker, refusing);
    expect(response).toEqual({ status: 403, body: { error: "turnstile-failed" }, rooms: [] });
    // With a Turnstile token that passes, the request goes through like any other.
    expect((await call(smoke({ passcode, turnstile }, token))).status).toBe(201);
  });

  it("never matches when SMOKE_TOKEN isn't set", async () => {
    const unset = { ...refusing, SMOKE_TOKEN: undefined };
    for (const token of ["", smokeToken]) {
      const response = await call(smoke({ passcode }, token), defaultWorker, unset);
      expect(response).toEqual({ status: 403, body: { error: "turnstile-failed" }, rooms: [] });
    }
  });

  it("compares the smoke token in constant time", async () => {
    const compare = vi.spyOn(crypto.subtle, "timingSafeEqual");
    try {
      await call(smoke({ passcode: "wrong" }, "a-guess"), defaultWorker, refusing);
      // The smoke token compare, then no passcode compare because Turnstile refused first.
      expect(compare).toHaveBeenCalledTimes(1);
      const [a, b] = compare.mock.calls[0] ?? [];
      expect((a as ArrayBuffer).byteLength).toBe(32);
      expect((b as ArrayBuffer).byteLength).toBe(32);
    } finally {
      compare.mockRestore();
    }
  });

  it("doesn't skip Turnstile on a join", async () => {
    const { code } = await liveRoom();
    const response = await call(
      post(`/api/rooms/${code}/join`, { name: "Pat", turnstile }, { [smokeHeader]: smokeToken }),
      defaultWorker,
      refusing,
    );
    expect(response).toEqual({ status: 403, body: { error: "turnstile-failed" }, rooms: [] });
  });
});

describe("POST /api/rooms/:code/rejoin", () => {
  it("swaps a rejoin token for a fresh ticket without calling the room", async () => {
    const { code, rejoinToken } = await liveRoom();
    const response = await call(post(`/api/rooms/${code}/rejoin`, { rejoinToken }));
    expect(response.status).toBe(200);
    expect(response.rooms).toEqual([]);
    const { ticket } = rejoinResponseSchema.parse(response.body);
    const host = await open(code, ticket);
    expect((await host.expect("room:welcome")).d.role).toBe("host");
  });

  it("keeps the player's id and name", async () => {
    const { code } = await liveRoom();
    const joined = joinRoomResponseSchema.parse(
      (await call(post(`/api/rooms/${code}/join`, { name: "Pat", turnstile }))).body,
    );
    const { body } = await call(
      post(`/api/rooms/${code}/rejoin`, { rejoinToken: joined.rejoinToken }),
    );
    const phone = await open(code, rejoinResponseSchema.parse(body).ticket);
    expect((await phone.expect("room:welcome")).d).toMatchObject({
      you: { id: joined.playerId, name: "Pat" },
    });
  });

  it("answers 401 for anything but a rejoin token for this room, without calling a room", async () => {
    const player = playerIdentity();
    const code = freshCode();
    const cases: Array<[string, unknown]> = [
      [code, { rejoinToken: await signTicket(secret, code, player) }],
      [code, { rejoinToken: await signRejoinToken(secret, freshCode(), player) }],
      [code, { rejoinToken: await signRejoinToken(`${secret}-other`, code, player) }],
      [code, { rejoinToken: "forged.token" }],
      [code, {}],
      [code, "{"],
      ["abcd", { rejoinToken: await signRejoinToken(secret, code, player) }],
    ];
    for (const [path, body] of cases) {
      const response = await call(post(`/api/rooms/${path}/rejoin`, body));
      expect(response).toEqual({ status: 401, body: { error: "invalid-token" }, rooms: [] });
    }
  });
});

describe("shared API checks", () => {
  it("answers 403 to another site's Origin without calling a room", async () => {
    const response = await call(
      post("/api/rooms", { passcode, turnstile }, { Origin: "https://evil.test" }),
    );
    expect(response).toEqual({ status: 403, body: { error: "forbidden-origin" }, rooms: [] });
  });

  it("accepts requests without an Origin, like the smoke test's", async () => {
    const request = new Request(`${origin}/api/rooms`, {
      method: "POST",
      headers: clientHeaders(),
      body: JSON.stringify({ passcode, turnstile }),
    });
    expect((await call(request)).status).toBe(201);
  });

  it("answers 405 for another method", async () => {
    const response = await defaultWorker.fetch(new Request(`${origin}/api/rooms`), env);
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("POST");
  });

  it("answers 500 without calling a room when the signing secret is missing", async () => {
    const unset = { ...env, TICKET_SIGNING_SECRET: "too-short" };
    const response = await call(post("/api/rooms", { passcode, turnstile }), defaultWorker, unset);
    expect(response).toEqual({ status: 500, body: { error: "not-configured" }, rooms: [] });
  });
});

describe("passcode check", () => {
  it("compares SHA-256 digests with crypto.subtle.timingSafeEqual", async () => {
    const compare = vi.spyOn(crypto.subtle, "timingSafeEqual");
    try {
      expect(await passcodeMatches("four random words here", "four random words here")).toBe(true);
      expect(await passcodeMatches("short", "four random words here")).toBe(false);
      expect(compare).toHaveBeenCalledTimes(2);
      for (const [a, b] of compare.mock.calls) {
        expect((a as ArrayBuffer).byteLength).toBe(32);
        expect((b as ArrayBuffer).byteLength).toBe(32);
      }
    } finally {
      compare.mockRestore();
    }
  });

  it("never matches an unset or empty HOST_PASSCODE", async () => {
    expect(await passcodeMatches("", "")).toBe(false);
    expect(await passcodeMatches("", undefined)).toBe(false);
  });
});
