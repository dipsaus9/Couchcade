import { randomPip, type PipProfile } from "@couchcade/utils/pips";

/** `crypto.getRandomValues` exists in browsers, Workers and Node, but not in the ES lib types (mirrors `@couchcade/utils/room-code`). */
type CryptoSource = { getRandomValues<T extends Uint8Array>(array: T): T };

function seedFrom(crypto: CryptoSource | undefined): number {
  const source = crypto ?? (globalThis as unknown as { crypto: CryptoSource }).crypto;
  const bytes = new Uint32Array(1);
  source.getRandomValues(new Uint8Array(bytes.buffer));
  return bytes[0] as number;
}

/**
 * A fresh, unpredictable Pip for a phone's first visit (pips.md "Random Pips", item 2), seeded
 * from `crypto.getRandomValues`. Pass a fake `crypto` in tests for a deterministic seed.
 */
export function firstRandomPip(crypto?: CryptoSource): PipProfile {
  return randomPip(seedFrom(crypto));
}

/**
 * A new look for the "Shuffle" button (pips.md "Random Pips", item 3, and decision 14): a fresh
 * random seed, redrawn with `seed + 1` if it happens to match the current Pip, so a tap always
 * changes something.
 */
export function shufflePip(current: PipProfile, crypto?: CryptoSource): PipProfile {
  const seed = seedFrom(crypto);
  const next = randomPip(seed);
  return sameProfile(next, current) ? randomPip(seed + 1) : next;
}

function sameProfile(a: PipProfile, b: PipProfile): boolean {
  return a.skin === b.skin && a.hair === b.hair && a.hairColour === b.hairColour;
}
