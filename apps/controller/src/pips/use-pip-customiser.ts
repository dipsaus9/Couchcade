import type { PhoneToRelayMessage, PipProfile, PlayerInfo } from "@couchcade/protocol";
import { ref, type Ref } from "vue";
import {
  browserPlayerStorage,
  ensureStoredPlayer,
  saveStoredPlayer,
  type PlayerStorageLike,
} from "./pip-record.ts";
import { createProfileSender } from "./profile-sender.ts";
import { firstRandomPip, shufflePip } from "./random-pip.ts";

export interface PipCustomiserOptions {
  you: Pick<PlayerInfo, "name">;
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
 * Owns the customiser panel's state (docs/architecture/pips.md "Customiser"): loads the
 * remembered `couchcade:player` record (`reconcile.ts`'s `reconcileOnEntry` already made one and
 * reconciled it with the room before the panel can open) and keeps the record and the room in
 * sync with every tile tap or Shuffle through the Pip send rule. The panel itself never reconciles
 * on its own — a phone that never opens it still gets fixed up by `reconcileOnEntry`.
 *
 * Vue-reactivity only (`ref`), no lifecycle hooks, so it runs the same in a component's `setup()`
 * and in a plain unit test.
 */
export function createPipCustomiser({
  you,
  send,
  storage = browserPlayerStorage(),
}: PipCustomiserOptions): PipCustomiser {
  const record = ensureStoredPlayer(storage, you.name, firstRandomPip);
  const profile = ref<PipProfile>(record.profile);

  const sender = createProfileSender({
    initial: record.profile,
    send: (next) => send({ t: "player:profile", d: { profile: next } }),
  });

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
