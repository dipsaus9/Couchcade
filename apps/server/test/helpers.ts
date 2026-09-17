import { env } from "cloudflare:workers";
import type { PlayerId } from "@couchcade/protocol";
import { roomCode } from "@couchcade/utils";
import type { SocketIdentity } from "../src/room/identity.ts";
import { createWorker, roomStub, type TicketVerifier } from "../src/worker.ts";

/**
 * A stand-in for the signed ticket verifier: the ticket is the identity as JSON. It lets room tests
 * connect through the real Worker routing without signing tickets.
 */
export const jsonTickets: TicketVerifier = async (ticket) => {
  if (!ticket) return null;
  return JSON.parse(ticket) as SocketIdentity;
};

export const worker = createWorker({ verifyTicket: jsonTickets });

export const origin = "https://couchcade.test";

/** A room code no other test uses, so tests never share a room. */
const usedCodes = new Set<string>();
export function freshCode(): string {
  for (;;) {
    const code = roomCode();
    if (!usedCodes.has(code)) {
      usedCodes.add(code);
      return code;
    }
  }
}

export async function createRoom(code = freshCode()): Promise<string> {
  const response = await roomStub(env, code).fetch(`${origin}/internal/create`, { method: "POST" });
  if (response.status !== 201) throw new Error(`create failed: ${response.status}`);
  return code;
}

let clientCounter = 0;

/**
 * Headers with a `CF-Connecting-IP` no other request used, unless one is set. Every rate limit is
 * per IP, so without it unrelated tests would share one bucket and get 429s
 * (docs/architecture/security.md, "Rate limits": in local tests, pass the header explicitly).
 */
export function clientHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  if (!headers.has("CF-Connecting-IP")) {
    clientCounter++;
    headers.set(
      "CF-Connecting-IP",
      `10.${(clientCounter >> 16) & 255}.${(clientCounter >> 8) & 255}.${clientCounter & 255}`,
    );
  }
  return headers;
}

export function upgradeRequest(code: string, ticket: string, init: RequestInit = {}): Request {
  const url = `${origin}/ws/${code}?v=1&ticket=${encodeURIComponent(ticket)}`;
  const headers = clientHeaders(init.headers);
  headers.set("Upgrade", "websocket");
  if (!headers.has("Origin")) headers.set("Origin", origin);
  return new Request(url, { ...init, headers });
}

/** A message a test socket received: parsed JSON, or the raw text when it isn't JSON. */
export type Received = { t: string; d: Record<string, unknown>; from?: string } | string;

/** A client socket with a queue of received messages. */
export class TestSocket {
  readonly #ws: WebSocket;
  readonly #queue: Received[] = [];
  readonly #waiters: Array<() => void> = [];
  #pingId = 0;
  readonly closed: Promise<{ code: number; reason: string }>;

  constructor(ws: WebSocket) {
    this.#ws = ws;
    this.closed = new Promise((resolve) => {
      ws.addEventListener("close", (event) => {
        resolve({ code: event.code, reason: event.reason });
        this.#wake();
      });
    });
    ws.addEventListener("message", (event) => {
      const data = event.data as string;
      try {
        this.#queue.push(JSON.parse(data) as Received);
      } catch {
        this.#queue.push(data);
      }
      this.#wake();
    });
    ws.accept();
  }

  send(message: unknown): void {
    this.#ws.send(typeof message === "string" ? message : JSON.stringify(message));
  }

  sendRaw(data: string | ArrayBuffer | ArrayBufferView): void {
    this.#ws.send(data);
  }

  close(code = 1000): void {
    this.#ws.close(code, "test");
  }

  /** The next message, waiting for it when the queue is empty. */
  async next(): Promise<Received> {
    for (let attempt = 0; attempt < 200; attempt++) {
      const message = this.#queue.shift();
      if (message !== undefined) return message;
      await new Promise<void>((resolve) => this.#waiters.push(resolve));
    }
    throw new Error("no message arrived");
  }

  /** The next message, which must have type `t`. */
  async expect(t: string): Promise<{ t: string; d: Record<string, unknown>; from?: string }> {
    const message = await this.next();
    if (typeof message === "string" || message.t !== t) {
      throw new Error(`expected ${t}, got ${JSON.stringify(message)}`);
    }
    return message;
  }

  /**
   * Round-trips a clock ping and returns every message that arrived before its pong. The room
   * handles frames in order, so anything it forwarded earlier has arrived by then.
   */
  async drain(): Promise<Received[]> {
    const id = ++this.#pingId;
    this.send({ t: "clock:ping", d: { id, t0: 0 } });
    const before: Received[] = [];
    for (;;) {
      const message = await this.next();
      if (typeof message !== "string" && message.t === "clock:pong" && message.d.id === id) {
        return before;
      }
      before.push(message);
    }
  }

  #wake(): void {
    for (const resolve of this.#waiters.splice(0)) resolve();
  }
}

export async function connect(code: string, identity: SocketIdentity): Promise<TestSocket> {
  const response = await worker.fetch(upgradeRequest(code, JSON.stringify(identity)), env);
  if (!response.webSocket) throw new Error(`upgrade failed: ${response.status}`);
  return new TestSocket(response.webSocket);
}

export const hostIdentity: SocketIdentity = { role: "host" };

let playerCounter = 0;
/** A player identity with a fresh id: 8 letters from the room code alphabet. */
export function playerIdentity(name = "Pat"): Extract<SocketIdentity, { role: "player" }> {
  playerCounter++;
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let n = playerCounter;
  let id = "";
  for (let i = 0; i < 8; i++) {
    id = letters[n % letters.length] + id;
    n = Math.floor(n / letters.length);
  }
  return { role: "player", playerId: id, name };
}

/** Connects a host and waits for its welcome. */
export async function connectHost(code: string): Promise<TestSocket> {
  const host = await connect(code, hostIdentity);
  await host.expect("room:welcome");
  return host;
}

/** Connects a phone, reads its welcome and host status, and the host's player:joined. */
export async function joinPhone(
  code: string,
  host: TestSocket | null,
  name = "Pat",
): Promise<{ socket: TestSocket; id: PlayerId; welcome: Record<string, unknown> }> {
  const identity = playerIdentity(name);
  const socket = await connect(code, identity);
  const welcome = await socket.expect("room:welcome");
  await socket.expect("room:host");
  if (host) await host.expect("player:joined");
  return { socket, id: identity.playerId, welcome: welcome.d };
}

/** An env whose Room namespace records the code of every room it is asked for. */
export function watchRooms(base: Cloudflare.Env = env): { env: Cloudflare.Env; rooms: string[] } {
  const rooms: string[] = [];
  const Room = {
    idFromName: (name: string) => {
      rooms.push(name);
      return base.Room.idFromName(name);
    },
    get: (id: DurableObjectId, options?: DurableObjectNamespaceGetDurableObjectOptions) =>
      base.Room.get(id, options),
  } as unknown as Cloudflare.Env["Room"];
  return { env: { ...base, Room }, rooms };
}
