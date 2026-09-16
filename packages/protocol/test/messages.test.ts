import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod/mini";
import {
  canSend,
  decode,
  encode,
  hostToRelay,
  hostToRelaySchema,
  phoneToRelay,
  phoneToRelaySchema,
  relayToHost,
  relayToHostSchema,
  relayToPhone,
  relayToPhoneSchema,
  senders,
  type Envelope,
  type JsonValue,
  type PayloadOf,
  type PipProfile,
  type RelayToHostMessage,
  type RelayToPhoneMessage,
} from "../src/index.ts";
import {
  hostToRelayFixtures,
  phoneToRelayFixtures,
  relayToHostFixtures,
  relayToPhoneFixtures,
} from "./fixtures.ts";

const directions = [
  ["host to relay", hostToRelay, hostToRelaySchema, hostToRelayFixtures],
  ["phone to relay", phoneToRelay, phoneToRelaySchema, phoneToRelayFixtures],
  ["relay to host", relayToHost, relayToHostSchema, relayToHostFixtures],
  ["relay to phone", relayToPhone, relayToPhoneSchema, relayToPhoneFixtures],
] as const;

// The full catalogue from docs/architecture/platform.md, per direction.
const catalogue = {
  "host to relay": [
    "controller:state",
    "room:kick",
    "room:lock",
    "room:phase",
    "room:snapshot",
    "room:end",
    "clock:ping",
  ],
  "phone to relay": [
    "input",
    "ui:action",
    "calibration:tap",
    "motion:status",
    "player:profile",
    "player:leave",
    "clock:ping",
  ],
  "relay to host": [
    "room:welcome",
    "player:joined",
    "player:left",
    "player:reconnected",
    "player:promoted",
    "player:profile",
    "input",
    "ui:action",
    "calibration:tap",
    "motion:status",
    "room:snapshot",
    "clock:pong",
  ],
  "relay to phone": [
    "room:welcome",
    "room:host",
    "controller:state",
    "player:promoted",
    "clock:pong",
  ],
};

describe.each(directions)("%s", (name, messages, union, fixtures) => {
  const cases = Object.entries(fixtures as Record<string, { valid: unknown; invalid: unknown }>);

  it("covers exactly the catalogue, with a fixture for every type", () => {
    expect(Object.keys(messages).toSorted()).toEqual(catalogue[name].toSorted());
    expect(Object.keys(fixtures).toSorted()).toEqual(catalogue[name].toSorted());
  });

  describe.each(cases)("%s", (type, { valid, invalid }) => {
    const schema = (messages as Record<string, z.ZodMiniType>)[type]!;

    it("accepts the valid fixture and survives an encode/decode round trip", () => {
      expect(z.safeParse(schema, valid).success).toBe(true);
      const decoded = decode(union, encode(valid as Envelope));
      expect(decoded).toEqual({ ok: true, message: valid });
    });

    it("rejects the invalid fixture", () => {
      expect(z.safeParse(schema, invalid).success).toBe(false);
      expect(decode(union, JSON.stringify(invalid))).toEqual({
        ok: false,
        reason: "invalid-message",
      });
    });
  });
});

describe("direction schemas", () => {
  it("reject a type that does not travel in that direction", () => {
    const pong = JSON.stringify({ t: "clock:pong", d: { id: 0, t0: 1, t1: 2 } });
    expect(decode(hostToRelaySchema, pong)).toEqual({ ok: false, reason: "invalid-message" });
    expect(decode(phoneToRelaySchema, pong)).toEqual({ ok: false, reason: "invalid-message" });
  });

  it("strip a `from` a client sends, so only the relay sets it", () => {
    const frame = JSON.stringify({ t: "player:leave", d: {}, from: "ABCDEFGH" });
    expect(decode(phoneToRelaySchema, frame)).toEqual({
      ok: true,
      message: { t: "player:leave", d: {} },
    });
  });
});

describe("canSend", () => {
  it("lets the host send only host messages", () => {
    expect(canSend("host", "room:kick")).toBe(true);
    expect(canSend("host", "clock:ping")).toBe(true);
    expect(canSend("host", "input")).toBe(false);
  });

  it("keeps audience phones out of game traffic", () => {
    for (const type of ["input", "ui:action", "calibration:tap", "motion:status"]) {
      expect(canSend("player", type)).toBe(true);
      expect(canSend("audience", type)).toBe(false);
    }
    expect(canSend("audience", "player:profile")).toBe(true);
    expect(canSend("audience", "player:leave")).toBe(true);
    expect(canSend("audience", "clock:ping")).toBe(true);
  });

  it("rejects types phones may not send and unknown types", () => {
    expect(canSend("player", "room:kick")).toBe(false);
    expect(canSend("player", "clock:pong")).toBe(false);
    expect(canSend("player", "toString")).toBe(false);
  });

  it("has a sender entry for every message a client sends", () => {
    const clientTypes = new Set([...Object.keys(hostToRelay), ...Object.keys(phoneToRelay)]);
    expect(Object.keys(senders).toSorted()).toEqual([...clientTypes].toSorted());
  });
});

describe("inferred types", () => {
  it("narrow a message by its type", () => {
    expectTypeOf<PayloadOf<"input">>().toEqualTypeOf<{
      type: string;
      payload?: JsonValue;
      at: number;
    }>();
    expectTypeOf<Extract<RelayToHostMessage, { t: "input" }>["from"]>().toEqualTypeOf<string>();
    expectTypeOf<Extract<RelayToPhoneMessage, { t: "controller:state" }>["d"]>().toHaveProperty(
      "view",
    );
    expectTypeOf<PayloadOf<"player:profile">>().toEqualTypeOf<{ profile: PipProfile }>();
  });
});
