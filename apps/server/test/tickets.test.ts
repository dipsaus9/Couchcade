import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import {
  isUsableSecret,
  signRejoinToken,
  signTicket,
  ticketLifetimeMs,
  verifyRejoinToken,
  verifyTicket,
} from "../src/security/tickets.ts";
import { playerIdentity } from "./helpers.ts";

const secret = env.TICKET_SIGNING_SECRET;
const now = 1_800_000_000_000;
const player = playerIdentity("Zoë");

function decodePart(part: string): unknown {
  const binary = atob(part.replaceAll("-", "+").replaceAll("_", "/"));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** Re-encodes a payload without signing it again. */
function withPayload(token: string, change: Record<string, unknown>): string {
  const [body, signature] = token.split(".");
  const payload = { ...(decodePart(body ?? "") as object), ...change };
  return `${toBase64Url(new TextEncoder().encode(JSON.stringify(payload)))}.${signature}`;
}

describe("tickets", () => {
  it("uses the test-only signing secret from the pool bindings", () => {
    expect(isUsableSecret(secret)).toBe(true);
  });

  it("is base64url(JSON payload).base64url(HMAC-SHA-256 signature)", async () => {
    const ticket = await signTicket(secret, "ABCD", player, now);
    expect(ticket).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    const [body = ""] = ticket.split(".");
    expect(decodePart(body)).toEqual({
      k: "ticket",
      r: "ABCD",
      role: "player",
      pid: player.playerId,
      name: "Zoë",
      exp: now + 60_000,
    });
    expect(ticketLifetimeMs).toBe(60_000);
  });

  it("gives the host the fixed player id host", async () => {
    const ticket = await signTicket(secret, "ABCD", { role: "host" }, now);
    expect(decodePart(ticket.split(".")[0] ?? "")).toMatchObject({ role: "host", pid: "host" });
    expect(await verifyTicket(secret, ticket, "ABCD", now)).toEqual({ role: "host" });
  });

  it("verifies a ticket for its room and role within 60 seconds", async () => {
    const ticket = await signTicket(secret, "ABCD", player, now);
    expect(await verifyTicket(secret, ticket, "ABCD", now + 59_999)).toEqual(player);
    expect(await verifyTicket(secret, ticket, "ABCD", now + 60_000)).toBeNull();
    expect(await verifyTicket(secret, ticket, "ABCE", now)).toBeNull();
  });

  it("refuses a ticket with a changed payload or another secret", async () => {
    const ticket = await signTicket(secret, "ABCD", player, now);
    expect(
      await verifyTicket(secret, withPayload(ticket, { role: "host" }), "ABCD", now),
    ).toBeNull();
    expect(await verifyTicket(secret, withPayload(ticket, { r: "ABCE" }), "ABCE", now)).toBeNull();
    expect(
      await verifyTicket(secret, withPayload(ticket, { exp: now + 999_999 }), "ABCD", now + 70_000),
    ).toBeNull();
    const other = `${secret}-rotated`;
    expect(await verifyTicket(other, ticket, "ABCD", now)).toBeNull();
  });

  it("keeps tickets and rejoin tokens apart", async () => {
    const ticket = await signTicket(secret, "ABCD", player, now);
    const rejoin = await signRejoinToken(secret, "ABCD", player, now);
    expect(decodePart(rejoin.split(".")[0] ?? "")).toMatchObject({ k: "rejoin", iat: now });
    expect(await verifyTicket(secret, rejoin, "ABCD", now)).toBeNull();
    expect(await verifyRejoinToken(secret, ticket, "ABCD")).toBeNull();
    expect(await verifyRejoinToken(secret, rejoin, "ABCD")).toEqual(player);
    expect(await verifyRejoinToken(secret, rejoin, "ABCE")).toBeNull();
  });

  it.each([null, "", "no-dot", "a.b.c", "!!!.???", "e30.", ".e30", "a".repeat(600)])(
    "answers null, never throws, for the malformed token %s",
    async (token) => {
      expect(await verifyTicket(secret, token, "ABCD", now)).toBeNull();
      expect(await verifyRejoinToken(secret, token, "ABCD")).toBeNull();
    },
  );

  it("refuses a correctly signed payload that isn't a valid identity", async () => {
    const valid = { k: "ticket", r: "ABCD", role: "player", pid: player.playerId, name: "Pat" };
    expect(
      await verifyTicket(secret, await signRaw({ ...valid, exp: now + 1 }), "ABCD", now),
    ).toEqual({ role: "player", playerId: player.playerId, name: "Pat" });
    for (const payload of [
      { ...valid, exp: now + 1, pid: "host" },
      { ...valid, exp: now + 1, name: "" },
      { ...valid, exp: now + 1, name: "A name far too long" },
      { ...valid, exp: now + 1, role: "audience" },
      { ...valid, exp: now + 1, role: "host", pid: player.playerId },
      { ...valid, exp: now + 1, r: "abcd" },
      { ...valid, exp: String(now + 1) },
      { ...valid },
      [valid],
      "ticket",
    ]) {
      expect(await verifyTicket(secret, await signRaw(payload), "ABCD", now)).toBeNull();
    }
    expect(await verifyTicket(secret, await signRaw("{not json", false), "ABCD", now)).toBeNull();
  });

  it("refuses to sign or verify without a long enough secret", async () => {
    expect(isUsableSecret(undefined)).toBe(false);
    expect(isUsableSecret("change-me")).toBe(false);
    await expect(signTicket(undefined, "ABCD", player, now)).rejects.toThrow(
      "TICKET_SIGNING_SECRET",
    );
    await expect(signTicket("short", "ABCD", player, now)).rejects.toThrow("TICKET_SIGNING_SECRET");
    const ticket = await signTicket(secret, "ABCD", player, now);
    expect(await verifyTicket(undefined, ticket, "ABCD", now)).toBeNull();
  });
});

/** Signs any payload with the test secret, bypassing the payload rules of `signTicket`. */
async function signRaw(payload: unknown, asJson = true): Promise<string> {
  const text = asJson ? JSON.stringify(payload) : String(payload);
  const body = toBase64Url(new TextEncoder().encode(text));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}
