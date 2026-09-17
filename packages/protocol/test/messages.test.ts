import { describe, expect, expectTypeOf, it } from "vitest";
import * as z from "zod/mini";
import {
  canSend,
  decode,
  encode,
  hostToRelay,
  hostToRelaySchema,
  linkCandidateSchema,
  linkDescriptionSchema,
  linkPing,
  linkPingPayloadSchema,
  linkPong,
  linkPongPayloadSchema,
  phoneToRelay,
  type LinkCandidate,
  type LinkDescription,
  phoneToRelaySchema,
  relayToHost,
  relayToHostSchema,
  relayToPhone,
  relayToPhoneSchema,
  senders,
  utf8ByteLength,
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
    "rtc:answer",
  ],
  "phone to relay": [
    "input",
    "ui:action",
    "calibration:tap",
    "motion:status",
    "player:profile",
    "player:leave",
    "clock:ping",
    "rtc:offer",
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
    "rtc:offer",
  ],
  "relay to phone": [
    "room:welcome",
    "room:host",
    "controller:state",
    "player:promoted",
    "clock:pong",
    "rtc:answer",
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

  it("only a seated player may offer a link, and only the host may answer", () => {
    expect(canSend("player", "rtc:offer")).toBe(true);
    expect(canSend("audience", "rtc:offer")).toBe(false);
    expect(canSend("host", "rtc:offer")).toBe(false);
    expect(canSend("host", "rtc:answer")).toBe(true);
    expect(canSend("player", "rtc:answer")).toBe(false);
    expect(canSend("audience", "rtc:answer")).toBe(false);
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
      n?: number;
      e?: number;
      more?: Array<[number, JsonValue]>;
    }>();
    expectTypeOf<Extract<RelayToHostMessage, { t: "input" }>["from"]>().toEqualTypeOf<string>();
    expectTypeOf<Extract<RelayToPhoneMessage, { t: "controller:state" }>["d"]>().toHaveProperty(
      "view",
    );
    expectTypeOf<PayloadOf<"player:profile">>().toEqualTypeOf<{ profile: PipProfile }>();
  });
});

describe("input.d's optional link fields", () => {
  it("accepts a stream sample with n, an event with e, and packed relay samples with more", () => {
    const schema = phoneToRelay.input;
    expect(
      z.safeParse(schema, { t: "input", d: { type: "aim", payload: { yaw: 0.1 }, at: 1, n: 7 } })
        .success,
    ).toBe(true);
    expect(z.safeParse(schema, { t: "input", d: { type: "shoot", at: 1, e: 3 } }).success).toBe(
      true,
    );
    expect(
      z.safeParse(schema, {
        t: "input",
        d: { type: "aim", payload: { yaw: 0.2 }, at: 1, more: [[16, { yaw: 0.1 }]] },
      }).success,
    ).toBe(true);
  });

  it("rejects more than 7 packed samples", () => {
    const more = Array.from({ length: 8 }, (_, i) => [i * 16, { yaw: 0 }]);
    expect(
      z.safeParse(phoneToRelay.input, { t: "input", d: { type: "aim", at: 1, more } }).success,
    ).toBe(false);
  });
});

// docs/architecture/realtime-link.md, "Compact descriptions": a typical offer is about 350 bytes,
// and a unit test encodes recorded descriptions from Chrome, Safari and Firefox under 1 KB.
describe("WebRTC signalling and link schemas", () => {
  const desc: LinkDescription = {
    u: "4pKz",
    p: "aVeryRandomIceP4ssw0rdString",
    f: "MEUCIQC1zX9k8Q3H8vN2yV0pQ1bE7Zt3Y6r8Xw2Fj4KpM5nL0AIgd8jY6vQ2c",
    c: [
      ["1", 2_130_706_431, "8f14e45f-ceea-4e8d-9c4a-1f2b3c4d5e6f.local", 54_321, "host"],
      ["2", 1_694_498_815, "203.0.113.4", 61_000, "host"],
    ],
  };

  it("accepts a compact description with up to 6 host candidates", () => {
    expect(z.safeParse(linkDescriptionSchema, desc).success).toBe(true);
    expect(z.safeParse(linkCandidateSchema, desc.c[0]).success).toBe(true);
  });

  it("rejects a description with more than 6 candidates, or a non-host candidate type", () => {
    const seven: LinkCandidate[] = Array.from({ length: 7 }, (_, i) => [
      String(i),
      1,
      `${i}.local`,
      1,
      "host",
    ]);
    expect(z.safeParse(linkDescriptionSchema, { ...desc, c: seven }).success).toBe(false);
    expect(z.safeParse(linkCandidateSchema, ["1", 1, "1.2.3.4", 1, "srflx"]).success).toBe(false);
  });

  it("round-trips rtc:offer and rtc:answer under the 1 KB frame limit", () => {
    const offer = { t: "rtc:offer" as const, d: { s: 123_456, desc } };
    const answerFromHost = { t: "rtc:answer" as const, d: { to: "ABCDEFGH", s: 123_456, desc } };
    const answerToPhone = { t: "rtc:answer" as const, d: { s: 123_456, desc } };
    expect(utf8ByteLength(encode(offer))).toBeLessThan(1_024);
    expect(utf8ByteLength(JSON.stringify(answerFromHost))).toBeLessThan(1_024);
    expect(utf8ByteLength(encode(answerToPhone))).toBeLessThan(1_024);
    expect(decode(phoneToRelaySchema, encode(offer))).toEqual({ ok: true, message: offer });
    expect(decode(relayToPhoneSchema, encode(answerToPhone))).toEqual({
      ok: true,
      message: answerToPhone,
    });
  });

  it("exports link:ping and link:pong schemas, never routed through the relay directions", () => {
    const ping = { t: "link:ping" as const, d: { id: 1, t0: 100.5 } };
    const pong = { t: "link:pong" as const, d: { id: 1, t0: 100.5, t1: 205, t2: 206, r: 12.3 } };
    expect(z.safeParse(linkPing, ping).success).toBe(true);
    expect(z.safeParse(linkPong, pong).success).toBe(true);
    expect(z.safeParse(linkPingPayloadSchema, ping.d).success).toBe(true);
    expect(z.safeParse(linkPongPayloadSchema, pong.d).success).toBe(true);
    expect(utf8ByteLength(JSON.stringify(ping))).toBeLessThan(1_024);
    expect(utf8ByteLength(JSON.stringify(pong))).toBeLessThan(1_024);
    // Not part of any direction the room understands (they never reach it).
    expect(decode(hostToRelaySchema, JSON.stringify(pong))).toEqual({
      ok: false,
      reason: "invalid-message",
    });
    expect(decode(phoneToRelaySchema, JSON.stringify(ping))).toEqual({
      ok: false,
      reason: "invalid-message",
    });
  });
});
