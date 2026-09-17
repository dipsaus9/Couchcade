// docs/architecture/security.md, "XSS, CSP and headers": headers.ts is the single source, and a
// test asserts every header the README promises, on both the generated `_headers` file and on
// Worker responses (CC-2.7 acceptance criterion 3).
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  buildHeadersFile,
  contentSecurityPolicy,
  securityHeaders,
} from "../src/security/headers.ts";
import { signTicket } from "../src/security/tickets.ts";
import defaultWorker from "../src/worker.ts";
import { clientHeaders, createRoom, origin, TestSocket, upgradeRequest } from "./helpers.ts";

const secret = env.TICKET_SIGNING_SECRET;

// The README's headers, copied verbatim (README.md, "Security headers"). If this ever drifts from
// securityHeaders, security.md says the doc wins and this test is the trip wire.
const readmeHeaders: Readonly<Record<string, string>> = {
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; " +
    "frame-src https://challenges.cloudflare.com; connect-src 'self'; img-src 'self' data:; " +
    "style-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy":
    "accelerometer=(self), gyroscope=(self), camera=(), microphone=(), geolocation=()",
};

const passcode = env.HOST_PASSCODE ?? "";
const turnstile = "XXXX.DUMMY.TOKEN.XXXX";

function post(path: string, body: unknown): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: clientHeaders({ "Content-Type": "application/json", Origin: origin }),
    body: JSON.stringify(body),
  });
}

/** Asserts a Response carries every header the README lists, with the README's exact value. */
function expectSecurityHeaders(response: Response): void {
  for (const [name, value] of Object.entries(readmeHeaders)) {
    expect(response.headers.get(name)).toBe(value);
  }
}

describe("securityHeaders", () => {
  it("matches the README's headers exactly (security.md: 'The headers are the README's, unchanged')", () => {
    expect(securityHeaders).toEqual(readmeHeaders);
  });

  it("allows challenges.cloudflare.com for Turnstile in script-src and frame-src", () => {
    expect(contentSecurityPolicy).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(contentSecurityPolicy).toContain("frame-src https://challenges.cloudflare.com");
  });

  it("scopes connect-src to same-origin, for the wss: socket", () => {
    expect(contentSecurityPolicy).toContain("connect-src 'self'");
  });

  it("has no literal newline in the CSP value (a header value is one line)", () => {
    expect(contentSecurityPolicy).not.toContain("\n");
  });
});

describe("buildHeadersFile", () => {
  it("emits a Cloudflare _headers file with one /* rule carrying every header", () => {
    const lines = buildHeadersFile().split("\n");
    expect(lines[0]).toBe("/*");
    for (const [name, value] of Object.entries(readmeHeaders)) {
      expect(lines).toContain(`  ${name}: ${value}`);
    }
    // Exactly the rule line, one line per header, and the trailing newline's empty segment.
    expect(lines).toHaveLength(2 + Object.keys(readmeHeaders).length);
  });
});

describe("Worker responses carry the security headers", () => {
  it("on a 404 from an unknown /api/ route", async () => {
    const response = await defaultWorker.fetch(new Request(`${origin}/api/unknown`), env);
    expect(response.status).toBe(404);
    expectSecurityHeaders(response);
  });

  it("on a 400 for a non-WebSocket request to /ws/:code", async () => {
    const code = await createRoom();
    const response = await defaultWorker.fetch(new Request(`${origin}/ws/${code}?v=1`), env);
    expect(response.status).toBe(400);
    expectSecurityHeaders(response);
  });

  it("on a 426 for an unsupported protocol version on /ws/:code", async () => {
    const code = await createRoom();
    const response = await defaultWorker.fetch(
      new Request(`${origin}/ws/${code}?v=2`, {
        headers: { Upgrade: "websocket", Origin: origin },
      }),
      env,
    );
    expect(response.status).toBe(426);
    expectSecurityHeaders(response);
  });

  it("on a 401 for an invalid ticket on /ws/:code", async () => {
    const code = await createRoom();
    const response = await defaultWorker.fetch(upgradeRequest(code, "a-forged-ticket"), env);
    expect(response.status).toBe(401);
    expectSecurityHeaders(response);
  });

  it("on a successful 201 from POST /api/rooms", async () => {
    const response = await defaultWorker.fetch(post("/api/rooms", { passcode, turnstile }), env);
    expect(response.status).toBe(201);
    expectSecurityHeaders(response);
    // The headers wrapper must not have disturbed the JSON body or its content type.
    expect(response.headers.get("Content-Type")).toContain("application/json");
    expect(await response.json()).toMatchObject({ code: expect.any(String) });
  });

  it("on a 401 for a wrong passcode on POST /api/rooms", async () => {
    const response = await defaultWorker.fetch(
      post("/api/rooms", { passcode: "wrong", turnstile }),
      env,
    );
    expect(response.status).toBe(401);
    expectSecurityHeaders(response);
  });

  it("never sets them on a successful WebSocket upgrade (status 101 carries no page content)", async () => {
    const code = await createRoom();
    const ticket = await signTicket(secret, code, { role: "host" });
    const response = await defaultWorker.fetch(upgradeRequest(code, ticket), env);
    expect(response.status).toBe(101);
    expect(response.webSocket).toBeDefined();
    for (const name of Object.keys(readmeHeaders)) expect(response.headers.get(name)).toBeNull();
    new TestSocket(response.webSocket as WebSocket).close();
  });
});
