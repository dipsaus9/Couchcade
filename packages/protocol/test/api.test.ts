import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import {
  apiErrorSchema,
  closeCodes,
  createRoomRequestSchema,
  createRoomResponseSchema,
  joinRoomRequestSchema,
  joinRoomResponseSchema,
  reconnectCloseCodes,
  rejoinRequestSchema,
  rejoinResponseSchema,
} from "../src/index.ts";

const cases: Array<[string, z.ZodMiniType, unknown, unknown]> = [
  [
    "create room request",
    createRoomRequestSchema,
    { passcode: "open sesame", turnstile: "0.token" },
    { passcode: "open sesame" },
  ],
  [
    "create room response",
    createRoomResponseSchema,
    { code: "QRST", ticket: "a.b", rejoinToken: "c.d" },
    { code: "qrst", ticket: "a.b", rejoinToken: "c.d" },
  ],
  [
    "join request",
    joinRoomRequestSchema,
    { name: "  Dennis ", turnstile: "0.token", profile: { skin: 0, hair: 0, hairColour: 0 } },
    { name: "Dennis", turnstile: "0.token", profile: { skin: 0, hair: 8, hairColour: 0 } },
  ],
  [
    "join response",
    joinRoomResponseSchema,
    { playerId: "ABCDEFGH", name: "Dennis", ticket: "a.b", rejoinToken: "c.d" },
    { playerId: "ABCDEFGH", name: "A name that is too long", ticket: "a.b", rejoinToken: "c.d" },
  ],
  ["rejoin request", rejoinRequestSchema, { rejoinToken: "c.d" }, { rejoinToken: "" }],
  ["rejoin response", rejoinResponseSchema, { ticket: "a.b" }, {}],
  ["error body", apiErrorSchema, { error: "room-locked" }, { error: 423 }],
];

describe.each(cases)("%s", (_name, schema, valid, invalid) => {
  it("accepts a valid body and survives a JSON round trip", () => {
    const parsed = z.safeParse(schema, JSON.parse(JSON.stringify(valid)));
    expect(parsed).toEqual({ success: true, data: valid });
  });

  it("rejects an invalid body", () => {
    expect(z.safeParse(schema, invalid).success).toBe(false);
  });
});

describe("close codes", () => {
  it("keeps terminal codes apart from the codes clients reconnect after", () => {
    const terminal: number[] = Object.values(closeCodes);
    expect(terminal).toEqual([4003, 4004, 4008, 4009, 4011]);
    expect(reconnectCloseCodes.some((code) => terminal.includes(code))).toBe(false);
  });
});
