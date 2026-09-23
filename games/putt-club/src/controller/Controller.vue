<script setup lang="ts">
/**
 * Putt Club's phone controller (docs/games/putt-club.md, "Phone controller"). On your turn: point
 * the phone at the TV and turn it, an aim line swings out from your ball. Hold the big action to
 * lock the line, then swing your arm like a putter -- how hard decides the weight. Touch players
 * drag the pad above the big action to aim, and the big action itself becomes the swipe pad.
 *
 * The host only ever says `pc-watch`, `pc-next`, `pc-putt`, `pc-result` or `pc-end`. Locked,
 * unlocked-too-early and putt-away are this phone's own local states layered on top of `pc-putt`,
 * so the button answers the finger at once and a second putt can't happen.
 */
import type { InputChannel, Player } from "@couchcade/game-sdk/contract";
import type { PointerPoint } from "@couchcade/motion/fallbacks";
import { CcBigAction } from "@couchcade/ui";
import { haptic } from "@couchcade/ui/haptics";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { PuttClubInput } from "../shared/input.ts";
import type { PuttClubScreen, PuttClubView } from "../shared/view.ts";
import AimPad from "./AimPad.vue";
import { useClockSynced } from "./clock-sync.ts";
import { present } from "./present.ts";
import {
  createPuttController,
  type PuttChannel,
  type PuttPhase,
  type PuttClubMotion,
} from "./putt.ts";

const props = defineProps<{
  screen: PuttClubScreen;
  data: PuttClubView;
  player: Player;
  send(input: PuttClubInput, eventTimeStamp?: number): void;
  /** `aim`, `line` and `putt` all go through this one channel (CC-11.9). The runtime always has it
   * by the time a real-time game's controller mounts (realtime-link.md, "Join"); a no-op fallback
   * keeps tests and tools that leave it out from throwing. */
  input?: InputChannel<PuttClubInput>;
  motion?: PuttClubMotion;
}>();

const noopChannel: PuttChannel = {
  stream: () => {},
  fire: () => {},
  last: () => null,
  clear: () => {},
};

const synced = useClockSynced();
const putt = createPuttController(props.input ?? noopChannel);
const mode = ref(putt.mode());

watch(
  () => props.motion,
  (motion) => {
    putt.use(motion);
    mode.value = putt.mode();
  },
  { immediate: true },
);

const phase = ref<PuttPhase>("aiming");
const stopPhase = putt.on((next) => {
  phase.value = next;
});

/** The last turn this phone opened, so a re-render of the same turn doesn't recentre again. */
const openedTurn = ref<number | null>(null);
/** The finger locking and swinging right now: only the first one on the big action counts. */
let pointer: { id: number } | null = null;

watch(
  () => [props.screen, props.data.turn] as const,
  ([screen, turn]) => {
    if (screen === "pc-putt") {
      if (turn === openedTurn.value) return;
      openedTurn.value = turn;
      pointer = null;
      phase.value = "aiming";
      putt.turnOpened(turn, performance.now());
      return;
    }
    pointer = null;
    phase.value = "aiming";
    putt.close();
  },
  { immediate: true },
);

const view = computed(() =>
  present(props.screen, props.data, { mode: mode.value, synced: synced.value, phase: phase.value }),
);

// Plays a presentation's cue once, the moment it first appears.
let lastCueKey: string | null = null;
watch(
  view,
  (current) => {
    const key = `${props.screen}:${props.data.turn}:${phase.value}:${current.cue ?? ""}`;
    if (current.cue !== undefined && key !== lastCueKey) haptic(current.cue);
    lastCueKey = key;
  },
  { immediate: true },
);

function toPoint(event: PointerEvent, type: PointerPoint["type"]): PointerPoint {
  return { t: event.timeStamp, x: event.clientX, y: event.clientY, type };
}

function onPress(event: Event): void {
  // Pressing again from "unlocked too early" re-locks the line, the same as the first press
  // (docs/games/putt-club.md, "Screens"); `CcBigAction` itself already refuses a press while
  // `state` is "disabled" (unsynced, or the putt already away). Motion locks with a mark; touch's
  // swipe pad needs real coordinates, so (as Target Range does) only a real pointer locks.
  if (!(event instanceof PointerEvent)) return;
  if (phase.value === "locked" || phase.value === "away" || pointer !== null) return;
  pointer = { id: event.pointerId };
  const target = event.currentTarget;
  if (target instanceof Element) {
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events carry no active pointer. The lock and swipe still work without capture.
    }
  }
  putt.lock(toPoint(event, "down"));
}

function onMove(event: PointerEvent): void {
  if (pointer === null || event.pointerId !== pointer.id) return;
  putt.swipe(toPoint(event, "move"));
}

function onEnd(event: PointerEvent): void {
  if (pointer === null || event.pointerId !== pointer.id) return;
  pointer = null;
  const type = event.type === "pointerup" ? "up" : "cancel";
  const point = toPoint(event, type);
  if (type === "cancel") {
    putt.cancel(point);
    return;
  }
  // The swipe pad's own "up" point may itself fire the putt (a swing that qualifies); `unlock`
  // is then a safe no-op, since the line is no longer locked once a putt sends (docs/games/
  // putt-club.md, "Swipe to putt", and `putt.ts`'s own guards).
  putt.swipe(point);
  putt.unlock(point);
}

function onPad(point: PointerPoint): void {
  putt.pad(point);
}

onBeforeUnmount(() => {
  putt.dispose();
  stopPhase();
});
</script>

<template>
  <section class="screen" :class="{ 'screen--touch': mode === 'touch' }">
    <p class="status" role="status">{{ view.statusLine }}</p>
    <AimPad v-if="view.pad" @point="onPad" @centre="putt.centre" />
    <div class="action" @pointermove="onMove" @pointerup="onEnd" @pointercancel="onEnd">
      <CcBigAction :state="view.state" :label="view.actionLabel" @press="onPress" />
    </div>
    <p class="hint">{{ view.hint }}</p>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-4);
}

.status,
.hint {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-body-weight);
}

.hint {
  font-size: var(--cc-text-small-phone);
}

.action {
  touch-action: none;
}

/* Touch mode's big action doubles as the swipe pad: it fits above the fold with the aim pad and
 * Centre button, the same squeeze CC-11.3 solved for Target Range. */
.screen--touch .action :deep(.cc-big-action) {
  inline-size: max(180px, min(80%, 30dvh));
}
</style>
