import { maxPlayers } from "../src/contract/index.ts";
import type { Player } from "../src/contract/index.ts";
import { pipPartCounts, roomCodeAlphabet } from "@couchcade/protocol";

/** Room time the fake players joined at: 2026-09-16, one second apart. */
const firstJoinedAt = 1_789_516_800_000;

/**
 * Seated, connected test players in join order: ids `AAAAAAAA`, `BBBBBBBB`, …, names
 * `Player 1` to `Player 8`, slots 0 to 7. The first one is the VIP.
 */
export function createPlayers(count: number): Player[] {
  if (!Number.isInteger(count) || count < 1 || count > maxPlayers) {
    throw new RangeError(`createPlayers needs 1 to ${maxPlayers} players, got ${count}`);
  }
  return Array.from({ length: count }, (_, slot) => ({
    id: roomCodeAlphabet.charAt(slot).repeat(8),
    name: `Player ${slot + 1}`,
    slot,
    profile: {
      skin: slot % pipPartCounts.skin,
      hair: slot % pipPartCounts.hair,
      hairColour: slot % pipPartCounts.hairColour,
    },
    joinedAt: firstJoinedAt + slot * 1000,
    connected: true,
  }));
}
