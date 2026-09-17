<script setup lang="ts">
import { seatCount } from "@couchcade/protocol";
import { players as playerStyles } from "@couchcade/theme";
import { CcButton, CcPanel, CcPlayerShape } from "@couchcade/ui";
import { computed, onBeforeUnmount, onMounted, shallowRef } from "vue";
import type { CalibrationScreenState } from "../../runtime/host-runtime.ts";
import { seatedPlayers, type LobbyState } from "../lobby/lobby-state.ts";
import { countingFlashes, practiceFlashes, type FlashFrame } from "./calibration.ts";

// The TV lag check (docs/design/platform-screens.md, "TV lag calibration"; session-flow.md, "TV
// lag calibration"): a Turf panel flashes on a steady beat, players tap along on their phones, and
// each player's last tap shows in ms. The flash is a colour change at 1.3 per second, under the
// 3 per second flash limit, so it stays on with reduced motion: it is the measurement.
const props = defineProps<{
  lobby: LobbyState;
  calibration: CalibrationScreenState;
  /** Local time (`performance.timeOrigin + performance.now()` timeline) to room time. */
  toRoomTime: (localTimestamp: number) => number;
  /** Records and returns the beat for one animation frame's room time. */
  frame: (roomTime: number) => FlashFrame | null;
}>();
defineEmits<{ skip: []; retry: [] }>();

// Every animation frame asks the runtime what to draw. The frame that first lights a flash is its
// `flashAt`: the DOM change is made in this callback, and Vue patches it in a microtask before the
// browser paints this frame.
const beat = shallowRef<FlashFrame | null>(null);
let handle: number | null = null;
const onFrame = (timestamp: number) => {
  const next = props.frame(props.toRoomTime(performance.timeOrigin + timestamp));
  const current = beat.value;
  if (next?.index !== current?.index || next?.lit !== current?.lit) beat.value = next;
  handle = requestAnimationFrame(onFrame);
};
onMounted(() => {
  handle = requestAnimationFrame(onFrame);
});
onBeforeUnmount(() => {
  if (handle !== null) cancelAnimationFrame(handle);
});

const lit = computed(() => props.calibration.status === "running" && beat.value?.lit === true);
const practice = computed(() => beat.value === null || beat.value.practice);
const dots = computed(() => {
  const index = beat.value?.index ?? -1;
  const first = practice.value ? 0 : practiceFlashes;
  const count = practice.value ? practiceFlashes : countingFlashes;
  return Array.from({ length: count }, (_, i) => {
    const flash = first + i;
    return flash < index ? "done" : flash === index ? "now" : "next";
  });
});
const counted = computed(() => {
  const index = beat.value?.index ?? -1;
  return Math.max(0, Math.min(countingFlashes, index - practiceFlashes + 1));
});

const chips = computed(() =>
  seatedPlayers(props.lobby).map((player) => ({
    player,
    style: playerStyles[player.slot ?? 0]!,
    lastMs: props.calibration.measurement.players.get(player.id)?.lastMs ?? null,
  })),
);
const lagSoFar = computed(() => props.calibration.measurement.lagMs);
</script>

<template>
  <section class="calibration" aria-label="Check the TV lag">
    <header class="head">
      <h1 class="title">Check the TV lag</h1>
      <p class="body">
        Some TVs and Chromecasts show the picture a little late. One quick test keeps timing games
        fair.
      </p>
    </header>

    <main class="main">
      <div v-if="calibration.status === 'retry'" class="flash-wrap">
        <CcPanel class="retry" screen="tv" v-bind="{ role: 'status' }">
          <p class="retry-title">Let's try that again</p>
          <p class="body">Tap along with the flash on your phone, in time, not after it.</p>
          <div class="actions">
            <CcButton variant="primary" screen="tv" @press="$emit('retry')">Try again</CcButton>
            <CcButton screen="tv" @press="$emit('skip')">Skip</CcButton>
          </div>
        </CcPanel>
      </div>
      <div v-else class="flash-wrap">
        <CcPanel class="flash" screen="tv" :class="{ lit }">
          <span v-if="lit" class="callout">TAP!</span>
          <span v-else-if="beat === null" class="body">Get ready</span>
        </CcPanel>
        <div class="dots">
          <span class="body">{{ practice ? "Practice" : "Flash" }}</span>
          <span v-for="(state, i) in dots" :key="i" class="dot" :class="state" />
          <span v-if="!practice" class="score">{{ counted }}/{{ countingFlashes }}</span>
        </div>
      </div>

      <CcPanel class="taps" screen="tv" as="section" tab="Last tap">
        <ul class="chips">
          <li v-for="{ player, style, lastMs } in chips" :key="player.id" class="chip">
            <CcPlayerShape class="shape" :player="style.id" :size="32" screen="tv" />
            <span class="name">{{ player.name }}</span>
            <span class="ms" :class="{ waiting: lastMs === null }">{{ lastMs ?? "--" }}</span>
            <span class="unit">{{ lastMs === null ? "" : "ms" }}</span>
          </li>
        </ul>
      </CcPanel>
    </main>

    <footer class="foot">
      <CcPanel class="hint" screen="tv">
        <div class="hint-text">
          <p class="body strong">Tap your big button in time with the flash, not after it</p>
          <p class="small">
            Lag so far: <span class="lag">{{ lagSoFar ?? "--" }}</span> ms · {{ chips.length }}/{{
              seatCount
            }}
            players
          </p>
        </div>
        <CcButton screen="tv" @press="$emit('skip')">Skip</CcButton>
      </CcPanel>
      <CcPanel class="code-panel" screen="tv">
        <p class="small">Room code</p>
        <p class="code">{{ lobby.code }}</p>
      </CcPanel>
    </footer>
  </section>
</template>

<style scoped>
.calibration {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-6);
  height: 100%;
}
.head {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-2);
}
.title,
.body,
.small,
.code,
.retry-title {
  margin: 0;
}
.title,
.retry-title {
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}
.body {
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-text-body-font);
}
.strong {
  font-weight: 700;
}
.small,
.unit {
  font: var(--cc-text-small-weight) var(--cc-text-small-tv) var(--cc-text-small-font);
}
.score,
.code,
.ms {
  font: var(--cc-text-score-weight) var(--cc-text-score-tv) var(--cc-text-score-font);
}
.lag {
  font: var(--cc-text-score-weight) var(--cc-text-action-tv) var(--cc-text-score-font);
}
.main {
  display: flex;
  flex: 1;
  gap: var(--cc-space-6);
  min-height: 0;
}
.flash-wrap {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-6);
}
.flash {
  display: grid;
  place-items: center;
  width: 880px;
  height: 495px;
}
.flash.lit {
  background: var(--cc-turf);
}
.callout {
  display: inline-block;
  color: var(--cc-sunny);
  font: var(--cc-text-callout-weight) var(--cc-text-callout-tv) var(--cc-text-callout-font);
  -webkit-text-stroke: var(--cc-outline-tv) var(--cc-ink);
  paint-order: stroke fill;
  text-shadow: 0 5px 0 var(--cc-ink);
  transform: rotate(-4deg);
}
.retry {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-5);
  width: 880px;
  height: 495px;
  text-align: center;
}
.actions {
  display: flex;
  gap: var(--cc-space-5);
}
.dots {
  display: flex;
  align-items: center;
  gap: var(--cc-space-4);
}
.dot {
  box-sizing: border-box;
  width: 48px;
  height: 48px;
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: 50%;
}
.dot.done {
  background: var(--cc-turf);
}
.dot.now {
  outline: var(--cc-outline-tv) solid var(--cc-sunny);
  outline-offset: var(--cc-outline-tv);
}
.taps {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 600px;
  box-sizing: border-box;
}
.chips {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.chip {
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
  height: 80px;
  padding: 0 var(--cc-space-5) 0 var(--cc-space-3);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
}
.name {
  flex: 1;
  font: 700 var(--cc-text-body-tv) var(--cc-text-body-font);
}
.ms.waiting {
  color: var(--cc-ink-70);
}
.unit {
  width: 40px;
}
.foot {
  display: flex;
  gap: var(--cc-space-6);
}
.hint {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: var(--cc-space-5);
}
.hint-text {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-1);
}
.code-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}
</style>
