import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import {
  runSmoke,
  type SmokeOptions,
  type SmokeSocket,
  turnstileDummyToken,
} from "../src/smoke.ts";

const site = "https://couchcade.test";
const ticket = "host-ticket";

type Listener = (event: never) => void;

/** What the fake room does: the room code it welcomes (null for none) and how room:end closes. */
interface SocketBehaviour {
  welcomeCode?: string | null;
  endCloseCode?: number;
}

/** A socket that behaves like the room, unless a test tells it otherwise. */
class FakeRoomSocket implements SmokeSocket {
  readonly sent: string[] = [];
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly #endCloseCode: number;
  readonly #listeners = new Map<string, Listener[]>();

  constructor(url: string, headers: Record<string, string>, behaviour: SocketBehaviour = {}) {
    this.url = url;
    this.headers = headers;
    const { welcomeCode = "ABCD", endCloseCode = 4004 } = behaviour;
    this.#endCloseCode = endCloseCode;
    queueMicrotask(() => {
      if (welcomeCode === null) return;
      this.#emit("message", {
        data: JSON.stringify({
          t: "room:welcome",
          d: { role: "host", code: welcomeCode, phase: "lobby", locked: false },
        }),
      });
    });
  }

  send(data: string): void {
    this.sent.push(data);
    if (JSON.parse(data).t === "room:end") {
      queueMicrotask(() => this.#emit("close", { code: this.#endCloseCode }));
    }
  }

  close(): void {}

  addEventListener(type: string, listener: Listener): void {
    this.#listeners.set(type, [...(this.#listeners.get(type) ?? []), listener]);
  }

  #emit(type: string, event: object): void {
    for (const listener of this.#listeners.get(type) ?? []) listener(event as never);
  }
}

interface Site {
  pages?: number;
  create?: { status: number; body: unknown };
  socket?: SocketBehaviour;
}

/** Smoke options wired to a fake site, plus a record of what the smoke test did. */
function fakeSite({ pages = 200, create, socket }: Site = {}) {
  const requests: Array<{ method: string; path: string; body?: string }> = [];
  const sockets: FakeRoomSocket[] = [];
  const options: SmokeOptions = {
    baseUrl: site,
    passcode: "four random words here",
    timeoutMs: 200,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({
        method: init?.method ?? "GET",
        path: url.pathname,
        body: init?.body as string,
      });
      if (url.pathname === "/api/rooms") {
        const { status, body } = create ?? {
          status: 201,
          body: { code: "ABCD", ticket, rejoinToken: "r" },
        };
        return Response.json(body, { status });
      }
      return new Response("<!doctype html>", {
        status: pages,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },
    openSocket: (url, headers) => {
      const fake = new FakeRoomSocket(url, headers, socket);
      sockets.push(fake);
      return fake;
    },
  };
  return { options, requests, sockets };
}

const unreachableFetch: typeof fetch = async () => {
  throw new TypeError("fetch failed");
};

describe("runSmoke", () => {
  it("loads both apps, creates a room, gets welcome and ends the room", async () => {
    const { options, requests, sockets } = fakeSite();
    const log: string[] = [];
    await runSmoke({ ...options, log: (line) => log.push(line) });

    expect(requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /",
      "GET /host/",
      "POST /api/rooms",
    ]);
    expect(JSON.parse(requests[2]?.body ?? "")).toEqual({
      passcode: "four random words here",
      turnstile: turnstileDummyToken,
    });
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe(`wss://couchcade.test/ws/ABCD?ticket=${ticket}&v=1`);
    expect(sockets[0]?.headers).toEqual({ Origin: site });
    expect(sockets[0]?.sent.map((frame) => JSON.parse(frame))).toEqual([{ t: "room:end", d: {} }]);
    expect(log).toHaveLength(5);
  });

  it("uses ws: for an http site", async () => {
    const { options, sockets } = fakeSite();
    await runSmoke({ ...options, baseUrl: "http://localhost:5173" });
    expect(sockets[0]?.url).toMatch(/^ws:\/\/localhost:5173\/ws\/ABCD\?/);
    expect(sockets[0]?.headers).toEqual({ Origin: "http://localhost:5173" });
  });

  it("fails when an app page doesn't load", async () => {
    const { options } = fakeSite({ pages: 404 });
    await expect(runSmoke(options)).rejects.toThrow("GET / returned 404");
  });

  it("fails with a hint when the passcode is wrong", async () => {
    const { options, sockets } = fakeSite({
      create: { status: 401, body: { error: "wrong-passcode" } },
    });
    await expect(runSmoke(options)).rejects.toThrow(/401.*SMOKE_HOST_PASSCODE/);
    expect(sockets).toHaveLength(0);
  });

  it("fails when the create response has the wrong shape", async () => {
    const { options } = fakeSite({ create: { status: 201, body: { code: "ABCD" } } });
    await expect(runSmoke(options)).rejects.toThrow("unexpected body");
  });

  it("fails when the room never says welcome", async () => {
    const { options } = fakeSite({ socket: { welcomeCode: null } });
    await expect(runSmoke(options)).rejects.toThrow("waiting for room:welcome");
  });

  it("fails when the welcome is for another room", async () => {
    const { options } = fakeSite({ socket: { welcomeCode: "WXYZ" } });
    await expect(runSmoke(options)).rejects.toThrow("room WXYZ, expected ABCD");
  });

  it("fails when room:end doesn't close the room with 4004", async () => {
    const { options } = fakeSite({ socket: { endCloseCode: 1006 } });
    await expect(runSmoke(options)).rejects.toThrow("closed the socket with 1006");
  });

  it("fails when the site can't be reached", async () => {
    const { options } = fakeSite();
    await expect(runSmoke({ ...options, fetch: unreachableFetch })).rejects.toThrow("GET / failed");
  });
});

describe("smoke entry point", () => {
  const cli = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

  async function smokeCli(env: Record<string, string>) {
    try {
      const { stdout } = await promisify(execFile)(process.execPath, [cli], {
        env: { PATH: process.env.PATH, ...env },
      });
      return { exitCode: 0, output: stdout };
    } catch (error) {
      const { code, stdout, stderr } = error as { code: number; stdout: string; stderr: string };
      return { exitCode: code, output: stdout + stderr };
    }
  }

  it("exits 1 when the passcode isn't set", async () => {
    const { exitCode, output } = await smokeCli({ SMOKE_URL: site });
    expect(exitCode).toBe(1);
    expect(output).toContain("SMOKE_HOST_PASSCODE isn't set");
  });

  it("exits 1 when the site can't be reached", async () => {
    const { exitCode, output } = await smokeCli({
      SMOKE_URL: "http://127.0.0.1:9",
      SMOKE_HOST_PASSCODE: "anything",
    });
    expect(exitCode).toBe(1);
    expect(output).toContain("Smoke test failed: GET / failed");
  });
});
