import type { PhoneToRelayMessage, PipProfile, PlayerInfo } from "@couchcade/protocol";
import { ref, type Ref } from "vue";
import {
  browserPlayerStorage,
  loadStoredPlayer,
  saveStoredPlayer,
  type PlayerStorageLike,
} from "./pip-record.ts";
import { createProfileSender } from "./profile-sender.ts";
import { firstRandomPip, shufflePip } from "./random-pip.ts";
import { profileToReconcile } from "./sync.ts";

export interface PipCustomiserOptions {
  you: Pick<PlayerInfo, "name" | "profile">;
  /** Sends over the room socket, same as the phone's other screens (session.ts's `send`). */
  send(message: PhoneToRelayMessage): void;
  storage?: PlayerStorageLike | null;
}

export interface PipCustomiser {
  profile: Readonly<Ref<PipProfile>>;
  /** Sets one part (skin, hair or hairColour) to `index`: a tile tap. */
  setPart(part: keyof PipProfile, index: number): void;
  /** "Shuffle": a new random look, guaranteed to differ from the current one. */
  shuffle(): void;
  dispose(): void;
}

/**
 * Owns the customiser's state (docs/architecture/pips.md "Customiser"): loads or creates the
 * `couchcade:player` record, reconciles it with the room if the two disagree (the room seats
 * every player as `{0,0,0}` until a later story lands, "Found while writing this spec" item 1),
 * and keeps the record and the room in sync with every change through the Pip send rule.
 *
 * Vue-reactivity only (`ref`), no lifecycle hooks, so it runs the same in a component's `setup()`
 * and in a plain unit test.
 */
export function createPipCustomiser({
  you,
  send,
  storage = browserPlayerStorage(),
}: PipCustomiserOptions): PipCustomiser {
  const stored = loadStoredPlayer(storage, firstRandomPip);
  const profile = ref<PipProfile>(stored?.profile ?? firstRandomPip());

  saveStoredPlayer(storage, { v: 1, name: you.name, profile: profile.value });

  const sender = createProfileSender({
    initial: you.profile,
    send: (next) => send({ t: "player:profile", d: { profile: next } }),
  });

  const toReconcile = profileToReconcile(profile.value, you.profile);
  if (toReconcile) sender.update(toReconcile);

  function apply(next: PipProfile): void {
    profile.value = next;
    saveStoredPlayer(storage, { v: 1, name: you.name, profile: next });
    sender.update(next);
  }

  function setPart(part: keyof PipProfile, index: number): void {
    apply({ ...profile.value, [part]: index });
  }

  function shuffle(): void {
    apply(shufflePip(profile.value));
  }

  return { profile, setPart, shuffle, dispose: () => sender.dispose() };
}
