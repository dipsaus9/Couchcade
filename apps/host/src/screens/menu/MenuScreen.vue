<script setup lang="ts">
import { seatCount } from "@couchcade/protocol";
import { players as playerStyles } from "@couchcade/theme";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { MenuScreenState } from "../../runtime/host-runtime.ts";
import { audience, seatedPlayers, vip, type LobbyState } from "../lobby/lobby-state.ts";
import PlayerShape from "../lobby/PlayerShape.vue";
import { playerCountLabel, secondsLeft } from "./menu.ts";

// The TV game menu (docs/design/platform-screens.md, "Game menu"; session-flow.md, "Game menu"):
// every registered game as a card, grey when the player count doesn't fit, and the Sunny focus
// ring on the game the VIP picked while its countdown runs. CC-4.7 restyles it.
const props = defineProps<{
  lobby: LobbyState;
  menu: MenuScreenState;
  /** Room time now, for the countdown. */
  roomNow: () => number;
}>();

const seated = computed(() =>
  seatedPlayers(props.lobby).map((player) => ({
    player,
    style: playerStyles[player.slot ?? 0]!,
  })),
);
const watching = computed(() => audience(props.lobby).length);
const leader = computed(() => vip(props.lobby));
const picked = computed(() => props.menu.countdown?.gameId ?? null);
const pickedTitle = computed(
  () => props.menu.games.find((game) => game.id === picked.value)?.title ?? null,
);

// The countdown number, redrawn a few times a second while it runs.
const seconds = ref<number | null>(null);
let timer: ReturnType<typeof setInterval> | null = null;
const tick = () => {
  const countdown = props.menu.countdown;
  seconds.value = countdown ? secondsLeft(countdown.startsAt, props.roomNow()) : null;
};
watch(
  () => props.menu.countdown,
  (countdown) => {
    tick();
    if (countdown && timer === null) timer = setInterval(tick, 200);
    if (!countdown && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  if (timer !== null) clearInterval(timer);
});

const chooser = computed(() =>
  leader.value ? `${leader.value.name} is choosing on their phone` : "The VIP picks on their phone",
);
const detail = computed(() =>
  pickedTitle.value && seconds.value !== null
    ? `${pickedTitle.value} starts in ${seconds.value}`
    : "Games that don't fit this many players are greyed out",
);
</script>

<template>
  <section class="menu" aria-label="Game menu">
    <header class="head">
      <h1 class="title">Pick a game</h1>
      <p class="count">{{ seated.length }}/{{ seatCount }}</p>
      <p v-if="watching > 0" class="small">{{ watching }} watching</p>
      <ul class="chips" aria-label="Players">
        <li v-for="{ player, style } in seated" :key="player.id" class="chip">
          <PlayerShape
            class="shape"
            :shape="style.shape"
            :size="32"
            :style="{ fill: `var(--cc-player-${style.id})` }"
          />
          <span class="chip-name">{{ player.name }}</span>
        </li>
      </ul>
    </header>

    <ul class="grid" aria-label="Games">
      <li
        v-for="game in menu.games"
        :key="game.id"
        class="card"
        :class="{ off: !game.fits, focused: game.id === picked }"
        :aria-disabled="!game.fits"
        :aria-current="game.id === picked ? 'true' : undefined"
      >
        <p class="name">{{ game.title }}</p>
        <p class="meta">
          <span>{{ playerCountLabel(game) }}</span>
          <span v-if="game.needsMotion" class="tag">Motion</span>
        </p>
        <p v-if="game.id === picked && seconds !== null" class="starting" role="status">
          Starting in <span class="number">{{ seconds }}</span>
        </p>
      </li>
    </ul>

    <footer class="foot">
      <div class="panel">
        <p class="body">{{ chooser }}</p>
        <p class="small">{{ detail }}</p>
      </div>
      <div class="panel code-panel">
        <p class="small">Room code</p>
        <p class="code">{{ lobby.code }}</p>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.menu {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-6);
  height: 100%;
}
.head {
  display: flex;
  align-items: center;
  gap: var(--cc-space-5);
  min-height: 88px;
}
.title,
.count,
.small,
.body,
.name,
.meta,
.starting,
.code {
  margin: 0;
}
.title {
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}
.count,
.code,
.number {
  font: var(--cc-text-score-weight) var(--cc-text-score-tv) var(--cc-text-score-font);
}
.small,
.meta {
  font: var(--cc-text-small-weight) var(--cc-text-small-tv) var(--cc-text-small-font);
}
.body {
  font: 700 var(--cc-text-body-tv) var(--cc-text-body-font);
}
.chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--cc-space-3);
  margin: 0 0 0 auto;
  padding: 0;
  list-style: none;
}
.chip {
  display: flex;
  align-items: center;
  gap: var(--cc-space-2);
  height: 64px;
  padding: 0 var(--cc-space-5) 0 var(--cc-space-3);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  box-shadow: var(--cc-depth-panel);
}
.shape {
  stroke: var(--cc-ink);
}
.chip-name {
  font: 700 var(--cc-text-small-tv) var(--cc-text-body-font);
}
.grid {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-content: start;
  gap: var(--cc-space-6);
  margin: 0;
  padding: var(--cc-space-3) 0 0;
  list-style: none;
}
.card {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
  padding: var(--cc-space-5);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-depth-panel);
  transition: transform var(--cc-motion-ui-duration) var(--cc-motion-ui-ease);
}
.card.focused {
  outline: var(--cc-outline-tv) solid var(--cc-sunny);
  outline-offset: var(--cc-outline-tv);
  transform: translateY(calc(-1 * var(--cc-space-2)));
}
.card.off {
  border-color: var(--cc-ink-20);
  box-shadow: none;
}
.name {
  font: var(--cc-text-action-weight) var(--cc-text-action-tv) var(--cc-text-action-font);
}
.off .name {
  color: var(--cc-ink-45);
}
.meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--cc-space-3);
}
.tag {
  padding: 0 var(--cc-space-3);
  background: var(--cc-sky);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
}
.off .tag {
  border-color: var(--cc-ink-20);
  background: var(--cc-chalk);
}
.starting {
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
  font: 700 var(--cc-text-body-tv) var(--cc-text-body-font);
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
@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
}
</style>
