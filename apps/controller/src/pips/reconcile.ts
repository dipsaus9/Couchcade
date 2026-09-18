import type { PhoneToRelayMessage, PlayerInfo } from "@couchcade/protocol";
import { browserPlayerStorage, ensureStoredPlayer, type PlayerStorageLike } from "./pip-record.ts";
import { firstRandomPip } from "./random-pip.ts";
import { profileToReconcile } from "./sync.ts";

/**
 * Runs once whenever a phone enters a room's lobby (docs/architecture/pips.md "On the phone",
 * "When the Pip is sent" item 2, and "Found while writing this spec" item 1): loads the
 * remembered `couchcade:player` record — making one with a fresh random Pip on a first visit —
 * and sends one `player:profile` if the room's seated look (`you.profile`) disagrees with it.
 *
 * This runs independent of the customiser (`PipCustomiser.vue`, a lazy chunk that may never load
 * this session): a returning player's TV look is fixed even if they never open "Edit my Pip".
 */
export function reconcileOnEntry(
  you: Pick<PlayerInfo, "name" | "profile">,
  send: (message: PhoneToRelayMessage) => void,
  storage: PlayerStorageLike | null = browserPlayerStorage(),
): void {
  const record = ensureStoredPlayer(storage, you.name, firstRandomPip);
  const toSend = profileToReconcile(record.profile, you.profile);
  if (toSend) send({ t: "player:profile", d: { profile: toSend } });
}
