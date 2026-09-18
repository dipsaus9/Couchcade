<script setup lang="ts">
/**
 * Strike Night's phone entry (docs/architecture/platform.md, "How the phone shows a controller").
 * Phones load only this file's folder, never games/strike-night/src/index.ts, so the rules, the
 * host scene and Phaser never reach a phone (owner decision, 16 September 2026).
 *
 * On your turn: drag the bar to pick where you stand, hold the big ball button, swing your arm
 * like a bowler and let go (or swipe up on touch). Twisting the wrist as you let go hooks the
 * ball. Everyone else watches (docs/games/strike-night.md, "Phone controller").
 */
import type { InputChannel, Player } from "@couchcade/game-sdk/contract";
import type { PointerPoint } from "@couchcade/motion/fallbacks";
import { CcBigAction, CcDragSlider } from "@couchcade/ui";
import { haptic } from "@couchcade/ui/haptics";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { StrikeNightInput } from "../shared/input.ts";
import type { StrikeNightScreen, StrikeNightView } from "../shared/view.ts";
import { type Bowl, type BowlChannel, createBowl, type StrikeNightMotion } from "./bowl.ts";
import { useClockSynced } from "./clock-sync.ts";
import { positionOf } from "./position.ts";
import { present } from "./present.ts";

const props = defineProps<{
  screen: StrikeNightScreen;
  data: StrikeNightView;
  player: Player;
  send(input: StrikeNightInput, eventTimeStamp?: number): void;
  /** `move`, `grip` and `bowl` all go through this one channel (CC-11.9). The runtime always has
   * it by the time a real-time game's controller mounts (realtime-link.md, "Join"); a no-op
   * fallback keeps tests and tools that leave it out from throwing. */
  input?: InputChannel<StrikeNightInput>;
  motion?: StrikeNightMotion;
}>();

const noopChannel: BowlChannel = { stream: () => {}, fire: () => {} };
const channel: BowlChannel = props.input ?? noopChannel;

const synced = useClockSynced();
const bowl: Bowl = createBowl(channel);
const mode = ref(bowl.mode());

watch(
  () => props.motion,
  (motion) => {
    bowl.use(motion);
    mode.value = bowl.mode();
  },
  { immediate: true },
);

type Phase = "ready" | "gripping" | "noSwing" | "away";
const phase = ref<Phase>("ready");
const standX = ref(props.data.x);
/** The turn this phone last opened a fresh `sn-bowl` for, so a resend of the same batch (or the
 * screen briefly flicking to `sn-watch`/`sn-next` on a stale message) doesn't reset a live grip. */
const openedTurn = ref<number | null>(null);
/** The finger gripping right now: only the first one on the big action counts. */
let pointer: number | null = null;

watch(
  () => [props.screen, props.data.turn] as const,
  ([screen, turn]) => {
    if (screen === "sn-bowl") {
      if (turn === openedTurn.value) return;
      openedTurn.value = turn;
      pointer = null;
      phase.value = "ready";
      standX.value = props.data.x;
      bowl.reset();
      return;
    }
    if (pointer !== null) {
      pointer = null;
      bowl.reset();
    }
    phase.value = "ready";
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

const barValue = computed(() => (standX.value + 1) / 2);

function onBarUpdate(sliderValue: number): void {
  const x = positionOf(sliderValue);
  if (x === standX.value) return;
  standX.value = x;
  channel.stream({ type: "move", payload: { turn: props.data.turn, x } });
}

function toPoint(event: PointerEvent, type: PointerPoint["type"]): PointerPoint {
  return { t: event.timeStamp, x: event.clientX, y: event.clientY, type };
}

function onPress(event: Event): void {
  if (!(event instanceof PointerEvent) || !view.value.canGrip || pointer !== null) return;
  pointer = event.pointerId;
  phase.value = "gripping";
  haptic("press");
  bowl.gripDown(props.data.turn, standX.value, toPoint(event, "down"));
}

function onMove(event: PointerEvent): void {
  if (pointer === null || event.pointerId !== pointer) return;
  bowl.gripMove(toPoint(event, "move"));
}

function onEnd(event: PointerEvent): void {
  if (pointer === null || event.pointerId !== pointer) return;
  pointer = null;
  if (event.type === "pointercancel") {
    bowl.gripCancel(props.data.turn, event.timeStamp);
    phase.value = "ready";
    return;
  }
  const bowled = bowl.gripUp(toPoint(event, "up"));
  phase.value = bowled ? "away" : "noSwing";
  if (bowled) haptic("press");
}

onBeforeUnmount(() => {
  bowl.dispose();
});
</script>

<template>
  <section class="screen">
    <p class="status" role="status">{{ view.statusLine }}</p>
    <div v-if="screen === 'sn-bowl'" class="move-bar">
      <CcDragSlider
        :model-value="barValue"
        :disabled="!view.bar"
        label="Where you stand"
        @update:model-value="onBarUpdate"
      />
    </div>
    <div class="grip" @pointermove="onMove" @pointerup="onEnd" @pointercancel="onEnd">
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

.move-bar {
  inline-size: 85%;
  max-inline-size: 360px;
}

.grip {
  touch-action: none;
}
</style>
