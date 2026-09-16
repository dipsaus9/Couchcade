import { playerIdSchema, playerNameSchema, roomCodeSchema } from "@couchcade/protocol";
import { hostPlayerId, type SocketIdentity } from "../room/identity.ts";

// Tickets and rejoin tokens (docs/architecture/platform.md, "Tickets and rejoin tokens", and
// docs/architecture/security.md, "Tickets, rejoin tokens and the room").
//
// Format: base64url(JSON payload) + "." + base64url(HMAC-SHA-256 over the first part), signed
// with TICKET_SIGNING_SECRET. Times are room time: milliseconds since the Unix epoch.
//
//   Ticket        { k: "ticket", r: code, role, pid, name, exp }   valid for 60 seconds
//   Rejoin token  { k: "rejoin", r: code, role, pid, name, iat }   valid for the life of the room
//
// The host's `pid` is "host" and its `name` is empty. Every check requires the expected `k` and
// the room code from the path, so a rejoin token never passes as a ticket, or the other way round.
// Any decoding problem means "not valid", never an exception.

/** How long a ticket opens a socket. */
export const ticketLifetimeMs = 60_000;

/** A signing secret shorter than this refuses every token. The owner sets 32 random bytes. */
export const minSecretLength = 32;

/** Tokens longer than this are refused before any decoding. Real ones are about 200 characters. */
const maxTokenLength = 512;

type TokenKind = "ticket" | "rejoin";

interface TokenPayload {
  k: TokenKind;
  r: string;
  role: SocketIdentity["role"];
  pid: string;
  name: string;
  exp?: number;
  iat?: number;
}

/** True when `secret` is long enough to sign and verify tokens. */
export function isUsableSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= minSecretLength;
}

/** Signs a 60-second ticket that opens one socket for `identity` in room `code`. */
export function signTicket(
  secret: string | undefined,
  code: string,
  identity: SocketIdentity,
  now = Date.now(),
): Promise<string> {
  return sign(secret, { k: "ticket", ...subject(code, identity), exp: now + ticketLifetimeMs });
}

/** Signs a rejoin token for `identity` in room `code`. It swaps for fresh tickets. */
export function signRejoinToken(
  secret: string | undefined,
  code: string,
  identity: SocketIdentity,
  now = Date.now(),
): Promise<string> {
  return sign(secret, { k: "rejoin", ...subject(code, identity), iat: now });
}

/** Who a ticket for room `code` belongs to, or null when it isn't a valid, unexpired ticket. */
export async function verifyTicket(
  secret: string | undefined,
  token: string | null | undefined,
  code: string,
  now = Date.now(),
): Promise<SocketIdentity | null> {
  const payload = await verify(secret, token, "ticket", code);
  if (!payload || typeof payload.exp !== "number" || payload.exp <= now) return null;
  return identityOf(payload);
}

/**
 * Who a rejoin token for room `code` belongs to, or null when it isn't valid. The room still checks
 * kicked, revoked and the seat window when the socket connects.
 */
export async function verifyRejoinToken(
  secret: string | undefined,
  token: string | null | undefined,
  code: string,
): Promise<SocketIdentity | null> {
  const payload = await verify(secret, token, "rejoin", code);
  if (!payload || typeof payload.iat !== "number") return null;
  return identityOf(payload);
}

// ---- Signing -----------------------------------------------------------------------------------

function subject(code: string, identity: SocketIdentity): Omit<TokenPayload, "k"> {
  return identity.role === "host"
    ? { r: code, role: "host", pid: hostPlayerId, name: "" }
    : { r: code, role: "player", pid: identity.playerId, name: identity.name };
}

async function sign(secret: string | undefined, payload: TokenPayload): Promise<string> {
  if (!isUsableSecret(secret)) throw new Error("TICKET_SIGNING_SECRET is missing or too short");
  const body = encodeBase64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(body),
  );
  return `${body}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verify(
  secret: string | undefined,
  token: string | null | undefined,
  kind: TokenKind,
  code: string,
): Promise<TokenPayload | null> {
  if (!isUsableSecret(secret) || typeof token !== "string" || token.length > maxTokenLength) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body = "", signaturePart = ""] = parts;
  const signature = decodeBase64Url(signaturePart);
  if (!signature || !isBase64Url(body)) return null;
  // crypto.subtle.verify compares the signatures in constant time.
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(secret),
    signature,
    encoder.encode(body),
  );
  if (!valid) return null;

  const payload = parsePayload(decodeBase64Url(body));
  if (!payload || payload.k !== kind || payload.r !== code) return null;
  return payload;
}

function identityOf(payload: TokenPayload): SocketIdentity | null {
  if (payload.role === "host") return payload.pid === hostPlayerId ? { role: "host" } : null;
  const playerId = playerIdSchema.safeParse(payload.pid);
  const name = playerNameSchema.safeParse(payload.name);
  if (!playerId.success || !name.success) return null;
  return { role: "player", playerId: playerId.data, name: name.data };
}

function parsePayload(bytes: Uint8Array | null): TokenPayload | null {
  if (!bytes) return null;
  let value: unknown;
  try {
    value = JSON.parse(strictDecoder.decode(bytes));
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const { k, r, role, pid, name, exp, iat } = value as Record<string, unknown>;
  if (k !== "ticket" && k !== "rejoin") return null;
  if (role !== "host" && role !== "player") return null;
  if (!roomCodeSchema.safeParse(r).success) return null;
  if (typeof pid !== "string" || typeof name !== "string") return null;
  if (exp !== undefined && typeof exp !== "number") return null;
  if (iat !== undefined && typeof iat !== "number") return null;
  return { k, r: r as string, role, pid, name, exp, iat };
}

/** The HMAC key, imported once per isolate and again only when the secret changes. */
let cachedKey: { secret: string; key: Promise<CryptoKey> } | undefined;

function signingKey(secret: string): Promise<CryptoKey> {
  if (cachedKey?.secret !== secret) {
    const key = crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
    cachedKey = { secret, key };
  }
  return cachedKey.key;
}

// ---- base64url ---------------------------------------------------------------------------------

const encoder = new TextEncoder();
const strictDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

function isBase64Url(value: string): boolean {
  return base64UrlPattern.test(value) && value.length % 4 !== 1;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeBase64Url(value: string): Uint8Array | null {
  if (!isBase64Url(value)) return null;
  try {
    const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}
