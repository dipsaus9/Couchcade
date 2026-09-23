<script setup lang="ts">
/**
 * Bandeja's phone entry (docs/architecture/platform.md, "How the phone shows a controller").
 * Phones load only this file's folder, never games/bandeja/src/index.ts, so the rules, the host
 * scene and Phaser never reach a phone (owner decision, 16 September 2026).
 *
 * Everyone has controls for the whole match: swing your arm the instant the ball reaches you, or
 * tap left/right on the pad if motion is off (docs/games/bandeja.md, "Phone controller"). There is
 * no turn, no grip button and no serve gesture -- the swing detector's own grip window tracks the
 * *point* boundaries instead of a finger ("No grip button", "No separate serve step"). The TV's
 * closing ring is the only timing cue; this screen only ever shows score and context ("The phone
 * is never the timing cue").
 */
import type { InputChannel, Player } from "@couchcade/game-sdk/contract";
import type { PointerPoint } from "@couchcade/motion/fallbacks";
import { CcBigAction } from "@couchcade/ui";
import { haptic } from "@couchcade/ui/haptics";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { BandejaInput } from "../shared/input.ts";
import { pointEndMs } from "../shared/constants.ts";
import type { BandejaScreen, BandejaView } from "../shared/view.ts";
import { useClockSynced } from "./clock-sync.ts";
import { present } from "./present.ts";
import { type BandejaMotion, createSwingController, type SwingChannel } from "./swing.ts";

const props = defineProps<{
  screen: BandejaScreen;
  data: BandejaView;
  player: Player;
  send(input: BandejaInput, eventTimeStamp?: number): void;
  /** Every `swing` goes through this one channel (CC-11.9). The runtime always has it by the time
   * a real-time game's controller mounts (realtime-link.md, "Join"); a no-op fallback keeps tests
   * and tools that leave it out from throwing. */
  input?: InputChannel<BandejaInput>;
  motion?: BandejaMotion;
}>();

const noopChannel: SwingChannel = { fire: () => {} };
const channel: SwingChannel = props.input ?? noopChannel;

/** The pad's own element, read fresh on every tap so a resized pad still splits in half
 * (docs/games/bandeja.md, "Touch controls"). `.cc-big-action` is CcBigAction's single root
 * element; querying it by class, the way the test suite already does, avoids relying on a
 * script-setup child's (unexposed) component instance. */
const padWrapper = ref<HTMLElement | null>(null);
function padBounds(): { left: number; width: number } {
  const button = padWrapper.value?.querySelector<HTMLElement>(".cc-big-action");
  const rect = button?.getBoundingClientRect();
  return rect ? { left: rect.left, width: rect.width } : { left: 0, width: 0 };
}

const swing = createSwingController(channel, padBounds);
const mode = ref(swing.mode());

watch(
  () => props.motion,
  (motion) => {
    swing.use(motion);
    mode.value = swing.mode();
  },
  { immediate: true },
);

const synced = useClockSynced();

/** Flashes for 400 ms after a swing actually sends, in both motion and touch (docs/games/bandeja.md,
 * "Screens", the "swung" row): purely local, no round trip needed to know a swing registered. */
const swung = ref(false);
let swungTimer: ReturnType<typeof setTimeout> | undefined;
const stopSwungListener = swing.on(() => {
  haptic("press");
  swung.value = true;
  clearTimeout(swungTimer);
  swungTimer = setTimeout(() => {
    swung.value = false;
  }, 400);
});

/** True for `pointEndMs` after a fresh point arrives, then settles (present.ts's own doc comment
 * has the reasoning). Also where the swing detector's grip window is opened and closed: a new
 * `point` from the host is exactly "a point started, the previous one ended"
 * (docs/games/bandeja.md, "Motion controls"). */
const justEnded = ref(false);
let settleTimer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => [props.screen, props.data.point] as const,
  ([screen, point]) => {
    const t = performance.now();
    if (screen === "bj-end") swing.endMatch(t);
    else swing.newPoint(point, t);
    justEnded.value = true;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      justEnded.value = false;
    }, pointEndMs);
  },
  { immediate: true },
);

const view = computed(() =>
  present(props.screen, props.data, {
    mode: mode.value,
    synced: synced.value,
    justEnded: justEnded.value,
  }),
);

// Plays a presentation's cue once, the moment it first appears.
let lastCueKey: string | null = null;
watch(
  view,
  (current) => {
    const key = `${props.screen}:${props.data.point}:${current.cue ?? ""}`;
    if (current.cue !== undefined && key !== lastCueKey) haptic(current.cue);
    lastCueKey = key;
  },
  { immediate: true },
);

/** A tap on the pad. Disabled (motion mode) already refuses the press before this runs; keyboard
 * activation (Space/Enter) carries no coordinates, so it lands straight down the middle. */
function onPress(event: Event): void {
  if (mode.value !== "touch") return;
  const point: PointerPoint =
    event instanceof PointerEvent
      ? { t: event.timeStamp, x: event.clientX, y: event.clientY, type: "down" }
      : { t: performance.now(), x: padCentreX(), y: 0, type: "down" };
  swing.tap(point);
}

function padCentreX(): number {
  const { left, width } = padBounds();
  return left + width / 2;
}

onBeforeUnmount(() => {
  swing.dispose();
  stopSwungListener();
  clearTimeout(swungTimer);
  clearTimeout(settleTimer);
});
</script>

<template>
  <section class="screen">
    <p class="status" role="status">{{ view.statusLine }}</p>
    <div ref="padWrapper" class="pad" :class="{ 'pad--swung': swung }">
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

.pad {
  touch-action: none;
}

/* The 400 ms local flash after a swing sends (docs/games/bandeja.md, "Screens"): a brief glow, not
 * a state change, because the phone is never the timing cue and shouldn't look like one. */
.pad--swung :deep(.cc-big-action) {
  animation: bandeja-swung 400ms ease-out;
}

@keyframes bandeja-swung {
  0% {
    box-shadow: 0 0 0 6px var(--cc-sunny);
  }
  100% {
    box-shadow: var(--cc-depth-rest);
  }
}

@media (prefers-reduced-motion: reduce) {
  .pad--swung :deep(.cc-big-action) {
    animation: none;
  }
}
</style>
