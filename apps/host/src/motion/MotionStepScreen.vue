<script setup lang="ts">
import { players as playerStyles } from "@couchcade/theme";
import { computed } from "vue";
import type { MotionScreenState } from "../runtime/host-runtime.ts";
import type { LobbyState } from "../screens/lobby/lobby-state.ts";
import PlayerShape from "../screens/lobby/PlayerShape.vue";
import type { MotionPlayerState } from "./motion-check.ts";

// The motion step on the TV (docs/architecture/motion.md, "Permission, calibration and resume
// flow"; session-flow.md shows the game's title card during `motion-check`). Every seated player's
// chip shows whether their phone is still deciding, uses motion, or plays with touch. Touch players
// get the touch icon. The game starts when every phone answered, or after 20 seconds. CC-4.7
// restyles it.
const props = defineProps<{
  lobby: LobbyState;
  motion: MotionScreenState;
}>();

const labels: Record<MotionPlayerState, string> = {
  waiting: "Deciding",
  motion: "Motion",
  touch: "Touch controls",
};

const chips = computed(() =>
  props.motion.players.map(({ player, state }) => ({
    player,
    state,
    label: labels[state],
    style: playerStyles[player.slot ?? 0]!,
  })),
);
const waiting = computed(() => chips.value.filter((chip) => chip.state === "waiting").length);
</script>

<template>
  <section class="motion" aria-label="Motion step">
    <header class="head">
      <span class="tag">Motion</span>
      <h1 class="title">{{ motion.game.title }}</h1>
      <p class="body">
        Check your phone: tap to enable motion, or play with touch. Clear a little space and hold on
        tight.
      </p>
    </header>

    <ul class="chips" aria-label="Players">
      <li v-for="chip in chips" :key="chip.player.id" class="chip" :class="chip.state">
        <PlayerShape
          class="shape"
          :shape="chip.style.shape"
          :size="32"
          :style="{ fill: `var(--cc-player-${chip.style.id})` }"
        />
        <span class="name">{{ chip.player.name }}</span>
        <svg
          v-if="chip.state === 'touch'"
          class="icon"
          viewBox="0 0 48 48"
          role="img"
          :aria-label="chip.label"
        >
          <!-- A pointing finger: the touch icon. -->
          <path
            d="M18 6 a4 4 0 0 1 8 0 V20 l10 2 a5 5 0 0 1 4 5.6 L38.4 38 A8 8 0 0 1 30.5 44 H22 a8 8 0 0 1 -6.4 -3.2 L8.6 31.4 a3.6 3.6 0 0 1 5.4 -4.7 L18 30 Z"
          />
        </svg>
        <svg
          v-else-if="chip.state === 'motion'"
          class="icon"
          viewBox="0 0 48 48"
          role="img"
          :aria-label="chip.label"
        >
          <!-- A phone with motion lines. -->
          <rect x="15" y="6" width="18" height="36" rx="4" />
          <path class="line" d="M7 16 q-4 8 0 16 M41 16 q4 8 0 16" />
        </svg>
        <span v-else class="state">{{ chip.label }}</span>
      </li>
    </ul>

    <footer class="foot">
      <div class="panel">
        <p class="body strong" role="status">
          {{
            waiting === 0
              ? "Everyone's ready"
              : `Waiting for ${waiting} ${waiting === 1 ? "phone" : "phones"}`
          }}
        </p>
        <p class="small">The game starts when every phone is ready, or in 20 seconds.</p>
      </div>
      <div class="panel code-panel">
        <p class="small">Room code</p>
        <p class="code">{{ lobby.code }}</p>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.motion {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-6);
  height: 100%;
}
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-3);
  padding-top: var(--cc-space-7);
  text-align: center;
}
.title,
.body,
.small,
.code {
  margin: 0;
}
.tag {
  padding: var(--cc-space-1) var(--cc-space-4);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  font: 700 var(--cc-text-small-tv) var(--cc-text-body-font);
}
.title {
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}
.body {
  max-width: 1200px;
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-text-body-font);
}
.strong {
  font-weight: 700;
}
.small,
.state {
  font: var(--cc-text-small-weight) var(--cc-text-small-tv) var(--cc-text-small-font);
}
.code {
  font: var(--cc-text-score-weight) var(--cc-text-score-tv) var(--cc-text-score-font);
}
.chips {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  align-content: center;
  justify-content: center;
  gap: var(--cc-space-5);
  margin: 0;
  padding: 0;
  list-style: none;
}
.chip {
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
  height: 88px;
  padding: 0 var(--cc-space-5) 0 var(--cc-space-4);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  box-shadow: var(--cc-depth-panel);
}
.shape {
  stroke: var(--cc-ink);
}
.name {
  font: 700 var(--cc-text-body-tv) var(--cc-text-body-font);
}
.state {
  color: var(--cc-ink-70);
}
.icon {
  width: 48px;
  height: 48px;
  fill: var(--cc-sky);
  stroke: var(--cc-ink);
  stroke-width: 3;
  stroke-linejoin: round;
}
.icon .line {
  fill: none;
  stroke-linecap: round;
}
.foot {
  display: flex;
  gap: var(--cc-space-6);
}
.panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--cc-space-1);
  padding: var(--cc-space-5) var(--cc-space-6);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-depth-panel);
}
.panel:first-child {
  flex: 1;
}
.code-panel {
  align-items: center;
}
</style>
