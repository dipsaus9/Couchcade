/**
 * Whether this phone can trust the room clock yet (docs/games/quick-draw.md, "Edge cases": "Phone
 * not clock-synced yet (just reconnected). The controller shows qd-watch until the clock module
 * has [synced], then switches to qd-standoff."). Before that, `send`'s `at` would be stamped
 * against an untrusted offset, so a tap taken during that window can't be judged fairly.
 *
 * `roomClock.synced` (CC-1.14) is a plain getter backed by closure state, not a Vue ref, so it
 * never triggers a re-render on its own. This polls it instead of subscribing: a reconnect resets
 * `synced` back to `false` on the shared clock too, and the poll picks that up the same way it
 * picks up the first sync.
 */
import { onMounted, onUnmounted, ref } from "vue";
import type { Ref } from "vue";
import { roomClock } from "@couchcade/game-sdk/clock";

/** The slice of `RoomClock` this needs, so a test can pass a plain fake instead of the real clock. */
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
