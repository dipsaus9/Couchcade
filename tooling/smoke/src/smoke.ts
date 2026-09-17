import {
  closeCodes,
  createRoomResponseSchema,
  decode,
  encode,
  protocolVersion,
  relayToHostSchema,
} from "@couchcade/protocol";

/**
 * Cloudflare's documented Turnstile dummy token. A test secret accepts it and a production secret
 * doesn't, so on the live site the smoke token is what gets the room created
 * (docs/architecture/security.md, "Where Turnstile runs").
 */
export const turnstileDummyToken = "XXXX.DUMMY.TOKEN.XXXX";

/** The header `POST /api/rooms` reads the smoke token from (security.md, decision 19). */
export const smokeHeader = "x-cc-smoke";

/** The part of a WebSocket the smoke test uses. The global `WebSocket` in Node 24 fits. */
export interface SmokeSocket {
  send(data: string): void;
  close(): void;
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  addEventListener(type: "close", listener: (event: { code: number }) => void): void;
  addEventListener(type: "error", listener: () => void): void;
}

export interface SmokeOptions {
  /** The site, for example `https://couchcade.dipsaus9.workers.dev`. */
  baseUrl: string;
  /** The host passcode the site was deployed with. */
  passcode: string;
  /** The SMOKE_TOKEN Worker secret. It lets room creation skip only the Turnstile check. */
  smokeToken: string;
  /** How long each step may take. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Opens a socket that sends these headers on the upgrade. */
  openSocket?: (url: string, headers: Record<string, string>) => SmokeSocket;
  log?: (line: string) => void;
}

/** A failed smoke step. The message says what broke and what to check. */
export class SmokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmokeError";
  }
}

const defaultOpenSocket = (url: string, headers: Record<string, string>): SmokeSocket =>
  // Node's WebSocket (undici) accepts headers. The Worker refuses an upgrade without `Origin`.
  new WebSocket(url, { headers } as unknown as string[]);

/**
 * Checks a deployed site end to end, the way the TV does it: both apps load, `POST /api/rooms`
 * creates a room with the passcode, the host socket gets `room:welcome`, and `room:end` closes the
 * room again with 4004 so no room is left behind. Throws `SmokeError` on the first failure.
 */
export async function runSmoke(options: SmokeOptions): Promise<void> {
  const {
    passcode,
    smokeToken,
    timeoutMs = 15_000,
    fetch: fetchFn = fetch,
    openSocket = defaultOpenSocket,
    log = () => {},
  } = options;
  const site = new URL(options.baseUrl);

  for (const path of ["/", "/host/"]) {
    const page = await request(fetchFn, new URL(path, site), { method: "GET" }, timeoutMs);
    const type = page.headers.get("Content-Type") ?? "";
    if (page.status !== 200 || !type.includes("text/html")) {
      throw new SmokeError(`GET ${path} returned ${page.status} ${type}, expected 200 text/html`);
    }
    log(`ok  GET ${path} serves the app`);
  }

  const created = await request(
    fetchFn,
    new URL("/api/rooms", site),
    {
      method: "POST",
      headers: { "Content-Type": "application/json", [smokeHeader]: smokeToken },
      body: JSON.stringify({ passcode, turnstile: turnstileDummyToken }),
    },
    timeoutMs,
  );
  if (created.status !== 201) {
    const hint = createHints[created.status] ?? "";
    throw new SmokeError(
      `POST /api/rooms returned ${created.status} ${await created.text()}${hint}`,
    );
  }
  const room = createRoomResponseSchema.safeParse(await created.json().catch(() => null));
  if (!room.success) throw new SmokeError("POST /api/rooms returned 201 with an unexpected body");
  const { code, ticket } = room.data;
  log(`ok  POST /api/rooms created room ${code}`);

  const socketUrl = new URL(`/ws/${code}`, site);
  socketUrl.protocol = site.protocol === "https:" ? "wss:" : "ws:";
  socketUrl.searchParams.set("ticket", ticket);
  socketUrl.searchParams.set("v", String(protocolVersion));
  const socket = openSocket(socketUrl.href, { Origin: site.origin });
  const events = watch(socket);
  try {
    await within(timeoutMs, "room:welcome", events.welcome(code));
    log(`ok  /ws/${code} opened and the room said welcome`);
    socket.send(encode({ t: "room:end", d: {} }));
    const closed = await within(timeoutMs, "the room to close", events.closed);
    if (closed !== closeCodes.roomClosed) {
      throw new SmokeError(`room:end closed the socket with ${closed}, expected 4004`);
    }
    log(`ok  room:end closed room ${code}`);
  } finally {
    socket.close();
  }
}

/** What a failed room creation most likely means. */
const createHints: Record<number, string> = {
  401: " (SMOKE_HOST_PASSCODE doesn't match the HOST_PASSCODE secret)",
  403: " (SMOKE_TOKEN doesn't match the SMOKE_TOKEN Worker secret, so Turnstile refused the request)",
};

async function request(
  fetchFn: typeof fetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetchFn(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new SmokeError(`${init.method} ${url.pathname} failed: ${String(error)}`);
  }
}

/** Listens to a socket from the start, so no event is missed between steps. */
function watch(socket: SmokeSocket) {
  socket.addEventListener("error", () => {});
  const closed = new Promise<number>((resolve) => {
    socket.addEventListener("close", (event) => resolve(event.code));
  });
  const welcomed = new Promise<string>((resolve) => {
    socket.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      const decoded = decode(relayToHostSchema, event.data);
      if (decoded.ok && decoded.message.t === "room:welcome") resolve(decoded.message.d.code);
    });
  });

  return {
    closed,
    /** Resolves on `room:welcome` for room `code`. Rejects if the socket closes first. */
    welcome: (code: string) =>
      Promise.race([
        welcomed.then((got) => {
          if (got !== code)
            throw new SmokeError(`room:welcome was for room ${got}, expected ${code}`);
        }),
        closed.then((closeCode) => {
          throw new SmokeError(`the socket closed with ${closeCode} before room:welcome`);
        }),
      ]),
  };
}

async function within<T>(timeoutMs: number, what: string, promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new SmokeError(`timed out after ${timeoutMs} ms waiting for ${what}`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
