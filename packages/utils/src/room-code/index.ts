import type { Rng } from "../rng/index.ts";

/** Letters a room code can use: A to Z without I and O, which read like 1 and 0 on a TV. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export const ROOM_CODE_LENGTH = 4;

const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/** `crypto.getRandomValues` exists in browsers, Workers and Node, but not in the ES lib types. */
type CryptoSource = { getRandomValues<T extends Uint8Array>(array: T): T };

/**
 * Returns a new room code: 4 uppercase letters from `ROOM_CODE_ALPHABET`.
 *
 * By default the letters come from `crypto.getRandomValues`, so codes can't be predicted. Pass a
 * seeded `Rng` to get repeatable codes, for example in tests.
 */
export function roomCode(rng?: Pick<Rng, "int">): string {
  const nextIndex = rng
    ? () => rng.int(0, ROOM_CODE_ALPHABET.length - 1)
    : secureIndex(ROOM_CODE_ALPHABET.length);
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[nextIndex()];
  }
  return code;
}

/** True when `value` is exactly a room code: 4 letters from the alphabet, uppercase. */
export function isRoomCode(value: string): boolean {
  return ROOM_CODE_PATTERN.test(value);
}

/** Uniform indexes in [0, size) from secure random bytes, rejecting bytes that would add bias. */
function secureIndex(size: number): () => number {
  const { crypto } = globalThis as unknown as { crypto: CryptoSource };
  const limit = 256 - (256 % size);
  const bytes = new Uint8Array(16);
  let offset = bytes.length;
  return () => {
    for (;;) {
      if (offset === bytes.length) {
        crypto.getRandomValues(bytes);
        offset = 0;
      }
      const byte = bytes[offset++] as number;
      if (byte < limit) return byte % size;
    }
  };
}
