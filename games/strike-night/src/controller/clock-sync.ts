/**
 * Whether this phone can trust the room clock yet (docs/games/strike-night.md, "Screens": "The
 * grip stays off until the clock module has a sample, as in Quick Draw"). Before that, a `bowl`'s
 * `at` would be stamped against an untrusted offset.
 *
 * `roomClock.synced` is a plain getter, not a Vue ref, so this polls it. A reconnect resets it on
 * the shared clock, and the poll picks that up too. Games can't import each other, so this mirrors
 * Quick Draw's and Target Range's identical helper.
 */
import { onMounted, onUnmounted, ref } from "vue";
import type { Ref } from "vue";
import { roomClock } from "@couchcade/game-sdk/clock";

/** The slice of `RoomClock` this needs. */
export interface SyncedClock {
  readonly synced: boolean;
}

export function useClockSynced(
  clock: SyncedClock = roomClock,
  pollMs = 200,
): Readonly<Ref<boolean>> {
  const synced = ref(clock.synced);
  let handle: ReturnType<typeof setInterval> | undefined;

  onMounted(() => {
    handle = setInterval(() => {
      if (clock.synced !== synced.value) synced.value = clock.synced;
    }, pollMs);
  });

  onUnmounted(() => {
    if (handle !== undefined) clearInterval(handle);
  });

  return synced;
}
