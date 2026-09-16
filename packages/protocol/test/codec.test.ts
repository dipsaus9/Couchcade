import { describe, expect, it } from "vitest";
import {
  FrameTooLargeError,
  decode,
  encode,
  keepAlive,
  maxFrameBytes,
  phoneToRelaySchema,
  utf8ByteLength,
  type Envelope,
} from "../src/index.ts";

/** An `input` message whose encoded frame is exactly `bytes` long, padded with `fill`. */
function inputOfSize(bytes: number, fill = "a"): Envelope {
  const base = { t: "input", d: { type: "", at: 1 } } as const;
  const overhead = utf8ByteLength(JSON.stringify(base));
  const fillBytes = utf8ByteLength(fill);
  const padding = fill.repeat(Math.floor((bytes - overhead) / fillBytes));
  const rest = "a".repeat(bytes - overhead - utf8ByteLength(padding));
  return { t: "input", d: { type: padding + rest, at: 1 } };
}

describe("utf8ByteLength", () => {
  it("counts ASCII, accents, CJK, emoji and lone surrogates like a UTF-8 encoder", () => {
    const cases: Array<[string, number]> = [
      ["", 0],
      ["hello", 5],
      ["Zoë", 4],
      ["日本", 6],
      ["🎮 go", 7],
      ["\uD83D", 3],
      ["a\uDC00b", 5],
    ];
    for (const [text, bytes] of cases) expect(utf8ByteLength(text)).toBe(bytes);
  });
});

describe("encode", () => {
  it("returns the JSON text frame", () => {
    const message: Envelope = { t: "player:leave", d: {} };
    expect(encode(message)).toBe('{"t":"player:leave","d":{}}');
  });

  it("accepts a frame of exactly 1 KB", () => {
    expect(utf8ByteLength(encode(inputOfSize(maxFrameBytes)))).toBe(maxFrameBytes);
  });

  it("rejects a message larger than 1 KB", () => {
    expect(() => encode(inputOfSize(maxFrameBytes + 1))).toThrow(FrameTooLargeError);
  });

  it("counts UTF-8 bytes, not characters", () => {
    const message = inputOfSize(maxFrameBytes + 2, "é");
    expect(JSON.stringify(message).length).toBeLessThan(maxFrameBytes);
    expect(() => encode(message)).toThrow(FrameTooLargeError);
  });
});

describe("decode", () => {
  it("rejects a frame over 1 KB before parsing it", () => {
    const oversized = `{${" ".repeat(maxFrameBytes)}`;
    expect(decode(phoneToRelaySchema, oversized)).toEqual({ ok: false, reason: "too-large" });
    const multiByte = JSON.stringify(inputOfSize(maxFrameBytes + 2, "é"));
    expect(decode(phoneToRelaySchema, multiByte)).toEqual({ ok: false, reason: "too-large" });
  });

  it("accepts a frame of exactly 1 KB", () => {
    const frame = JSON.stringify(inputOfSize(maxFrameBytes));
    expect(decode(phoneToRelaySchema, frame).ok).toBe(true);
  });

  it("rejects text that is not JSON, such as a keep-alive frame", () => {
    expect(decode(phoneToRelaySchema, keepAlive.pong)).toEqual({
      ok: false,
      reason: "invalid-json",
    });
  });

  it("rejects binary frames", () => {
    const small = Uint8Array.from('{"t":"player:leave","d":{}}', (char) => char.charCodeAt(0));
    expect(decode(phoneToRelaySchema, small)).toEqual({ ok: false, reason: "not-text" });
    expect(decode(phoneToRelaySchema, new ArrayBuffer(maxFrameBytes + 1))).toEqual({
      ok: false,
      reason: "too-large",
    });
  });
});
