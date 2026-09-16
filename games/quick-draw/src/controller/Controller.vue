<script setup lang="ts">
/**
 * Quick Draw's phone entry (docs/games/quick-draw.md, "Phone controller"). One big red action:
 * players wait for DRAW without looking at their phone and tap it blind. The TV is the only place
 * DRAW! and its fakes ever show; this component never renders them, and never learns about a fake
 * either, so it can't leak one.
 *
 * During `qd-standoff` the whole area below the status line is the hit zone, not only the circle
 * (same doc), because players are watching the TV, not their thumb.
 */
import { CcBigAction } from "@couchcade/ui";
import { computed, ref, watch } from "vue";
import type { Player } from "@couchcade/game-sdk/contract";
import { useClockSynced } from "./clock-sync.ts";
import { playCue } from "./haptics.ts";
import { present } from "./present.ts";
import type { QuickDrawInput } from "../shared/input.ts";
import type { QuickDrawScreen, QuickDrawView } from "../shared/view.ts";

const props = defineProps<{
  screen: QuickDrawScreen;
  data: QuickDrawView;
  player: Player;
  send(input: QuickDrawInput, eventTimeStamp?: number): number | null;
}>();

const synced = useClockSynced();

// Local, not the host's: the phone disables itself the instant a finger lands, before any
// round-trip, so a second tap (or a palm) can never be sent (docs/games/quick-draw.md, "Edge
// cases": "Multi-touch or palm on the screen"). Resets the moment a new round's standoff arrives.
const tapped = ref(false);
let tappedRound: number | null = null;

watch(
  () => [props.screen, props.data.round] as const,
  ([screen, round]) => {
    if (screen === "qd-standoff" && round !== tappedRound) {
      tappedRound = round;
      tapped.value = false;
    }
  },
  { immediate: true },
);

const view = computed(() => present(props.screen, props.data, synced.value, tapped.value));

// Plays a presentation's cue exactly once, the moment it first appears.
let lastCueKey: string | null = null;
watch(
  view,
  (current) => {
    const key = `${props.screen}:${props.data.round}:${current.cue ?? ""}`;
    if (current.cue !== undefined && key !== lastCueKey) playCue(current.cue);
    lastCueKey = key;
  },
  { immediate: true },
);

function onPointerdown(event: PointerEvent): void {
  if (view.value.state !== "dont-tap") return;
  tapped.value = true;
  playCue("press");
  props.send({ type: "draw", payload: { round: props.data.round } }, event.timeStamp);
}
</script>

<template>
  <section class="screen">
    <p class="status" role="status">{{ view.statusLine }}</p>
    <div class="hit-area" @pointerdown="onPointerdown">
      <CcBigAction :state="view.state" :label="view.actionLabel" />
      <p class="hint">{{ view.hint }}</p>
    </div>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cc-space-6);
}

.status {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-body-weight);
}

.hit-area {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-4);
  /* The tap zone, not only the button (docs/games/quick-draw.md, "Phone controller"). */
  touch-action: none;
}

.hint {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-small-phone);
}
</style>
