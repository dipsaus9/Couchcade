<script setup lang="ts">
/**
 * Target Range's phone controller (docs/games/target-range.md, "Phone controller"). The phone is
 * the bow: hold it like a remote pointed at the TV, touch the big action and pull down to draw, let
 * go to shoot. Players who play with touch aim with the pad above the big action instead.
 *
 * The host only says `tr-watch` or `tr-shoot`. Drawing, too weak and shot are this phone's own
 * states, so the button answers the finger at once and a second shot can't happen.
 */
import { createInputStream } from "@couchcade/game-sdk/input";
import type { Player } from "@couchcade/game-sdk/contract";
import type { PointerPoint } from "@couchcade/motion/fallbacks";
import { CcBigAction } from "@couchcade/ui";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { TargetRangeInput } from "../shared/input.ts";
import type { TargetRangeScreen, TargetRangeView } from "../shared/view.ts";
import AimPad from "./AimPad.vue";
import { createShotAim, type TargetRangeMotion } from "./aim.ts";
import { useClockSynced } from "./clock-sync.ts";
import { powerOf, shoots } from "./draw.ts";
import { playCue } from "./haptics.ts";
import { present, type DrawPhase } from "./present.ts";

const props = defineProps<{
  screen: TargetRangeScreen;
  data: TargetRangeView;
  player: Player;
  send(input: TargetRangeInput, eventTimeStamp?: number): unknown;
  motion?: TargetRangeMotion;
}>();

const synced = useClockSynced();
const stream = createInputStream<TargetRangeInput>((input, t) => props.send(input, t));
const aim = createShotAim(stream);
const mode = ref(aim.mode());

watch(
  () => props.motion,
  (motion) => {
    aim.use(motion);
    mode.value = aim.mode();
  },
  { immediate: true },
);

const draw = ref<DrawPhase>("ready");
const power = ref(0);
/** The finger drawing right now: only the first one on the big action counts. */
let pointer: { id: number; startY: number } | null = null;
/** The last volley this phone saw open, so its `tr-watch` shows the result, not a round intro. */
const openedVolley = ref<number | null>(null);

watch(
  () => [props.screen, props.data.volley] as const,
  ([screen, volley]) => {
    if (screen === "tr-shoot") {
      if (volley === openedVolley.value) return;
      openedVolley.value = volley;
      pointer = null;
      draw.value = "ready";
      power.value = 0;
      aim.volleyOpened(performance.now());
      return;
    }
    // The volley closed while a finger was still down: nothing to send, the host has moved on.
    if (pointer !== null) {
      pointer = null;
      aim.stop();
    }
    draw.value = "ready";
    power.value = 0;
  },
  { immediate: true },
);

const view = computed(() =>
  present(props.screen, props.data, {
    mode: mode.value,
    synced: synced.value,
    draw: draw.value,
    power: power.value,
    afterVolley: props.screen === "tr-watch" && openedVolley.value === props.data.volley,
  }),
);

// Plays a presentation's cue once, the moment it first appears.
let lastCueKey: string | null = null;
watch(
  view,
  (current) => {
    const key = `${props.screen}:${props.data.volley}:${current.cue ?? ""}`;
    if (current.cue !== undefined && key !== lastCueKey) playCue(current.cue);
    lastCueKey = key;
  },
  { immediate: true },
);

function onPress(event: Event): void {
  if (!(event instanceof PointerEvent) || !view.value.canDraw || pointer !== null) return;
  pointer = { id: event.pointerId, startY: event.clientY };
  draw.value = "drawing";
  power.value = 0;
  playCue("press");
  aim.startDraw(event.timeStamp);
}

function onMove(event: PointerEvent): void {
  if (pointer === null || event.pointerId !== pointer.id) return;
  power.value = powerOf(event.clientY - pointer.startY);
}

function onEnd(event: PointerEvent): void {
  if (pointer === null || event.pointerId !== pointer.id) return;
  const released = powerOf(event.clientY - pointer.startY);
  pointer = null;
  power.value = 0;
  const volley = props.data.volley;
  if (event.type === "pointerup" && shoots(released)) {
    draw.value = "shot";
    playCue("press");
    aim.shoot(volley, released, event.timeStamp);
    return;
  }
  draw.value = "weak";
  aim.lower(volley, event.timeStamp);
}

function onPad(point: PointerPoint): void {
  if (view.value.pad) aim.pad(point);
}

onBeforeUnmount(() => {
  aim.dispose();
  stream.dispose();
});
</script>

<template>
  <section class="screen" :class="{ 'screen--touch': mode === 'touch' }">
    <p class="status" role="status">{{ view.statusLine }}</p>
    <AimPad v-if="view.pad" @point="onPad" @centre="aim.centre" />
    <div class="draw" @pointermove="onMove" @pointerup="onEnd" @pointercancel="onEnd">
      <CcBigAction :state="view.state" @press="onPress">
        <span class="fill" :style="{ blockSize: `${view.fill * 100}%` }" />
        <span class="label">{{ view.actionLabel }}</span>
      </CcBigAction>
    </div>
    <p class="hint">{{ view.hint }}</p>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: var(--cc-space-4);
}

.status {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-body-weight);
}

.draw {
  touch-action: none;
}

/* The circle fills from the bottom as the draw gains power. */
.draw :deep(.cc-big-action) {
  position: relative;
  overflow: hidden;
}

/* Touch mode fits the pad above the circle without scrolling, never below 200 px. */
.screen--touch .draw :deep(.cc-big-action) {
  inline-size: max(200px, min(85%, 34dvh));
}

.fill {
  position: absolute;
  inset-inline: 0;
  inset-block-end: 0;
  background: var(--cc-turf);
  pointer-events: none;
}

.label {
  position: relative;
}

.hint {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-small-phone);
}
</style>
