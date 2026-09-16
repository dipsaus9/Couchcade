import type * as z from "zod/mini";
import type { Envelope } from "../messages/index.ts";

/** Largest frame either end sends or accepts, in UTF-8 bytes. */
export const maxFrameBytes = 1024;

/** Protocol version, sent as the `v` query parameter on the WebSocket URL. */
export const protocolVersion = 1;

/** Raw keep-alive frames, answered by the room's auto-response. They are not JSON. */
export const keepAlive = { ping: "ping", pong: "pong" } as const;

/** Thrown by `encode` when a message would not fit in `maxFrameBytes`. */
export class FrameTooLargeError extends Error {
  readonly bytes: number;

  constructor(bytes: number) {
    super(`Frame is ${bytes} bytes, over the ${maxFrameBytes} byte limit`);
    this.name = "FrameTooLargeError";
    this.bytes = bytes;
  }
}

/** UTF-8 length of a string, without allocating. Lone surrogates count as U+FFFD (3 bytes). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && isLowSurrogate(text.charCodeAt(i + 1))) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

function isLowSurrogate(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff;
}

/** Serialises a message to a JSON text frame. Throws `FrameTooLargeError` over 1 KB. */
export function encode(message: Envelope): string {
  const frame = JSON.stringify(message);
  const bytes = utf8ByteLength(frame);
  if (bytes > maxFrameBytes) throw new FrameTooLargeError(bytes);
  return frame;
}

export type DecodeFailure = "too-large" | "not-text" | "invalid-json" | "invalid-message";

export type DecodeResult<T> = { ok: true; message: T } | { ok: false; reason: DecodeFailure };

/**
 * Parses a frame and validates it against a direction schema, such as `relayToHostSchema`.
 * Frames over 1 KB are rejected before parsing. Binary frames are rejected: every platform
 * frame is JSON text. Callers drop failures silently.
 */
export function decode<S extends z.ZodMiniType>(
  schema: S,
  frame: string | ArrayBuffer | ArrayBufferView,
): DecodeResult<z.output<S>> {
  if (typeof frame !== "string") {
    return { ok: false, reason: frame.byteLength > maxFrameBytes ? "too-large" : "not-text" };
  }
  // Every UTF-16 code unit is at least one UTF-8 byte, so a long string is rejected without counting.
  if (frame.length > maxFrameBytes || utf8ByteLength(frame) > maxFrameBytes) {
    return { ok: false, reason: "too-large" };
  }
  let data: unknown;
  try {
    data = JSON.parse(frame);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  const result = schema.safeParse(data);
  return result.success
    ? { ok: true, message: result.data }
    : { ok: false, reason: "invalid-message" };
}
