import { env } from "cloudflare:workers";
import { createRoomResponseSchema, joinRoomResponseSchema } from "@couchcade/protocol";
import { beforeEach, describe, expect, it } from "vitest";
import { smokeHeader } from "../src/api/turnstile.ts";
import { clientKey } from "../src/security/rate-limits.ts";
import { signTicket } from "../src/security/tickets.ts";
import defaultWorker from "../src/worker.ts";
import { origin, TestSocket, upgradeRequest, watchRooms } from "./helpers.ts";

// These tests use the real Rate Limiting bindings from wrangler.jsonc, simulated by miniflare, so
// they also prove the configured limits. Every test sends its own CF-Connecting-IP.

const passcode = env.HOST_PASSCODE ?? "";
const turnstile = "XXXX.DUMMY.TOKEN.XXXX";
const rateLimited = { error: "rate-limited" };

let ipCounter = 0;
/** An IP from the documentation range that no other test uses. */
function freshIp(): string {
  ipCounter++;
  return `198.51.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

function post(path: string, body: unknown, ip: string): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, "CF-Connecting-IP": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Sends a request and records every room the Worker asked for (an empty list means no room call). */
async function call(request: Request) {
  const watched = watchRooms();
  const response = await defaultWorker.fetch(request, watched.env);
  const body = response.webSocket ? null : ((await response.json()) as Record<string, unknown>);
  response.webSocket?.accept();
  response.webSocket?.close();
  return { status: response.status, body, rooms: watched.rooms };
}

/** Sends `request()` `count` times and returns the statuses. */
async function repeat(count: number, request: () => Request | Promise<Request>) {
  const statuses: number[] = [];
  for (let i = 0; i < count; i++) statuses.push((await call(await request())).status);
  return statuses;
}

// Miniflare counts in fixed windows aligned to the wall clock minute. A burst that crossed into the
// next window would start counting again, so each test starts well inside a window.
beforeEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const left = 60_000 - (Date.now() % 60_000);
  if (left < 10_000) await new Promise((resolve) => setTimeout(resolve, left + 100));
});

const timeout = 20_000;

describe("clientKey", () => {
  const key = (ip?: string) =>
    clientKey(new Headers(ip === undefined ? {} : { "CF-Connecting-IP": ip }));

  it("uses an IPv4 address as it is", () => {
    expect(key("203.0.113.7")).toBe("203.0.113.7");
  });

  it("cuts an IPv6 address to its /64 block, however it is written", () => {
    const block = "2001:db8:0:12";
    expect(key("2001:db8:0:12::1")).toBe(block);
    expect(key("2001:0DB8:0000:0012:abcd:ef01:2345:6789")).toBe(block);
    expect(key("2001:db8::12:0:0:0:1")).toBe(block);
    expect(key("2001:db8:0:13::1")).not.toBe(block);
    expect(key("::1")).toBe("0:0:0:0");
    expect(key("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("keeps a header it can't parse as it is, so it still gets a bucket", () => {
    expect(key("not:an:ip::address::")).toBe("not:an:ip::address::");
  });

  it("puts every request without the header in one shared bucket", () => {
    expect(key()).toBe("unknown");
    expect(key("")).toBe("unknown");
  });
});

describe("POST /api/rooms", () => {
  it(
    "answers the 4th room creation in a minute with 429 without calling a room",
    async () => {
      const ip = freshIp();
      const create = () => post("/api/rooms", { passcode, turnstile }, ip);
      expect(await repeat(3, create)).toEqual([201, 201, 201]);

      expect(await call(create())).toEqual({ status: 429, body: rateLimited, rooms: [] });
      // Another address has its own bucket.
      expect((await call(post("/api/rooms", { passcode, turnstile }, freshIp()))).status).toBe(201);
    },
    timeout,
  );

  it(
    "counts every passcode attempt and answers the 6th with 429 before reading the body",
    async () => {
      const ip = freshIp();
      const attempts: Array<[unknown, number]> = [
        [{ passcode: "wrong", turnstile }, 401],
        ["{", 400],
        [{ turnstile }, 401],
        [{ passcode, turnstile }, 201],
        [{ passcode, turnstile }, 201],
      ];
      for (const [body, status] of attempts) {
        expect((await call(post("/api/rooms", body, ip))).status).toBe(status);
      }

      // Two rooms created, so the creation limit isn't what answers here.
      expect(await call(post("/api/rooms", { passcode, turnstile }, ip))).toEqual({
        status: 429,
        body: rateLimited,
        rooms: [],
      });
      expect(await call(post("/api/rooms", "{", ip))).toEqual({
        status: 429,
        body: rateLimited,
        rooms: [],
      });
    },
    timeout,
  );
  it(
    "applies both limits to requests with the smoke token too",
    async () => {
      const ip = freshIp();
      const smoke = (body: unknown) => {
        const request = post("/api/rooms", body, ip);
        request.headers.set(smokeHeader, env.SMOKE_TOKEN ?? "");
        return request;
      };
      expect(await repeat(4, () => smoke({ passcode }))).toEqual([201, 201, 201, 429]);
      expect(await call(smoke({ passcode: "wrong" }))).toMatchObject({ status: 401 });
      expect(await call(smoke({ passcode }))).toEqual({
        status: 429,
        body: rateLimited,
        rooms: [],
      });
    },
    timeout,
  );
});

describe("POST /api/rooms/:code/join", () => {
  it(
    "answers the 21st join attempt in a minute with 429 without calling a room",
    async () => {
      const created = createRoomResponseSchema.parse(
        (await call(post("/api/rooms", { passcode, turnstile }, freshIp()))).body,
      );
      const host = new TestSocket(
        (await defaultWorker.fetch(upgradeRequest(created.code, created.ticket), env))
          .webSocket as WebSocket,
      );
      await host.expect("room:welcome");

      const ip = freshIp();
      const join = () => post(`/api/rooms/${created.code}/join`, { name: "Pat", turnstile }, ip);
      expect(await repeat(20, join)).toEqual(Array<number>(20).fill(200));

      expect(await call(join())).toEqual({ status: 429, body: rateLimited, rooms: [] });
      // A malformed code would get 404 without a room call, but the limit answers first.
      expect(await call(post("/api/rooms/abcd/join", { name: "Pat", turnstile }, ip))).toEqual({
        status: 429,
        body: rateLimited,
        rooms: [],
      });
      host.close();
    },
    timeout,
  );
});

describe("POST /api/rooms/:code/rejoin", () => {
  it(
    "answers the 31st rejoin in a minute with 429",
    async () => {
      const created = createRoomResponseSchema.parse(
        (await call(post("/api/rooms", { passcode, turnstile }, freshIp()))).body,
      );
      const ip = freshIp();
      const rejoin = () =>
        post(`/api/rooms/${created.code}/rejoin`, { rejoinToken: created.rejoinToken }, ip);
      expect(await repeat(30, rejoin)).toEqual(Array<number>(30).fill(200));

      expect(await call(rejoin())).toEqual({ status: 429, body: rateLimited, rooms: [] });
    },
    timeout,
  );
});

describe("GET /ws/:code", () => {
  it(
    "answers the 31st upgrade in a minute with 429 without calling the room",
    async () => {
      const created = createRoomResponseSchema.parse(
        (await call(post("/api/rooms", { passcode, turnstile }, freshIp()))).body,
      );
      const ip = freshIp();
      const headers = { "CF-Connecting-IP": ip };
      const forged = () => upgradeRequest(created.code, "a-forged-ticket", { headers });
      expect(await repeat(30, forged)).toEqual(Array<number>(30).fill(401));

      const ticket = await signTicket(env.TICKET_SIGNING_SECRET, created.code, { role: "host" });
      expect(await call(upgradeRequest(created.code, ticket, { headers }))).toEqual({
        status: 429,
        body: rateLimited,
        rooms: [],
      });
      // The same ticket from another address still connects.
      const other = await call(
        upgradeRequest(created.code, ticket, { headers: { "CF-Connecting-IP": freshIp() } }),
      );
      expect(other).toMatchObject({ status: 101, rooms: [created.code] });
    },
    timeout,
  );

  it(
    "counts every address in one IPv6 /64 block in one bucket",
    async () => {
      const created = createRoomResponseSchema.parse(
        (await call(post("/api/rooms", { passcode, turnstile }, freshIp()))).body,
      );
      const host = new TestSocket(
        (await defaultWorker.fetch(upgradeRequest(created.code, created.ticket), env))
          .webSocket as WebSocket,
      );
      await host.expect("room:welcome");
      const ip = "2001:db8:aa:1::10";
      const joined = joinRoomResponseSchema.parse(
        (await call(post(`/api/rooms/${created.code}/join`, { name: "Pat", turnstile }, ip))).body,
      );
      // Another address in the same /64 shares the upgrade bucket.
      const headers = { "CF-Connecting-IP": "2001:db8:aa:1::20" };
      expect(
        await repeat(30, () => upgradeRequest(created.code, "a-forged-ticket", { headers })),
      ).toEqual(Array<number>(30).fill(401));
      const phone = upgradeRequest(created.code, joined.ticket, {
        headers: { "CF-Connecting-IP": ip },
      });
      expect(await call(phone)).toEqual({ status: 429, body: rateLimited, rooms: [] });
      host.close();
    },
    timeout,
  );
});
