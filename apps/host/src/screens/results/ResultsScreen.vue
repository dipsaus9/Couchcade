<script setup lang="ts">
import { players as playerStyles } from "@couchcade/theme";
import { computed } from "vue";
import type { ResultsScreenState } from "../../runtime/host-runtime.ts";
import { vip, type LobbyState } from "../lobby/lobby-state.ts";
import PlayerShape from "../lobby/PlayerShape.vue";
import { placeLabel } from "./results.ts";

// The TV results screen (docs/design/platform-screens.md, "Results"; session-flow.md, "Results"):
// the headline, a podium for places 1 to 3 and a standings chip per in-game player. Read-only: only
// the VIP's phone has "Play again" and "Back to menu" (session-flow.md owner decisions). CC-4.7
// restyles it with the stage and theme.
const props = defineProps<{ lobby: LobbyState; results: ResultsScreenState }>();

const leader = computed(() => vip(props.lobby));
const styleFor = (slot: number | null) => playerStyles[slot ?? 0]!;
const detail = computed(() =>
  props.results.canPlayAgain
    ? "Play again or back to menu, on their phone"
    : `${props.results.hint}, on their phone`,
);
</script>

<template>
  <section class="results" aria-label="Results">
    <header class="head">
      <span class="tag">{{ results.game.title }} · final standings</span>
      <h1 class="title">{{ results.headline }}</h1>
    </header>

    <main class="main">
      <ul class="podium" aria-label="Podium">
        <li
          v-for="entry in results.podium"
          :key="entry.player.id"
          class="step"
          :class="`place-${entry.place}`"
        >
          <PlayerShape
            class="shape"
            :shape="styleFor(entry.player.slot).shape"
            :size="40"
            :style="{ fill: `var(--cc-player-${styleFor(entry.player.slot).id})` }"
          />
          <p class="place">{{ placeLabel(entry.place) }}</p>
          <p class="name">{{ entry.player.name }}</p>
        </li>
      </ul>

      <section class="panel standings">
        <span class="tab">Points</span>
        <ul class="rows" aria-label="Standings">
          <li
            v-for="entry in results.standings"
            :key="entry.player.id"
            class="row"
            :class="{ top: entry.place === 1 }"
          >
            <span class="place">{{ entry.place }}</span>
            <PlayerShape
              class="shape"
              :shape="styleFor(entry.player.slot).shape"
              :size="28"
              :style="{ fill: `var(--cc-player-${styleFor(entry.player.slot).id})` }"
            />
            <span class="nm">{{ entry.player.name }}</span>
            <span v-if="entry.score !== undefined" class="sc">{{ entry.score }}</span>
          </li>
        </ul>
      </section>
    </main>

    <footer class="foot">
      <div class="panel" style="flex: 1">
        <p class="body">
          {{ leader ? `${leader.name} picks what's next` : "The VIP picks what's next" }}
        </p>
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
.results {
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
.tag {
  align-self: flex-start;
  padding: 0 var(--cc-space-3);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  font: var(--cc-text-small-weight) var(--cc-text-small-tv) var(--cc-text-small-font);
}
.title,
.small,
.body,
.name,
.code,
.nm {
  margin: 0;
}
.title {
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}
.small {
  font: var(--cc-text-small-weight) var(--cc-text-small-tv) var(--cc-text-small-font);
}
.body {
  font: 700 var(--cc-text-body-tv) var(--cc-text-body-font);
}
.main {
  display: flex;
  flex: 1;
  gap: var(--cc-space-6);
  min-height: 0;
}
.podium {
  display: flex;
  align-items: flex-end;
  gap: var(--cc-space-6);
  flex: 2;
  margin: 0;
  padding: 0;
  list-style: none;
}
.step {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-2);
  padding: var(--cc-space-5) var(--cc-space-4);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel) var(--cc-radius-panel) 0 0;
  box-shadow: var(--cc-depth-panel);
}
.step.place-1 {
  outline: var(--cc-outline-tv) solid var(--cc-sunny);
  outline-offset: var(--cc-outline-tv);
  transform: translateY(calc(-1 * var(--cc-space-2)));
}
.step .place {
  font: var(--cc-text-score-weight) var(--cc-text-score-tv) var(--cc-text-score-font);
}
.step .name {
  font: var(--cc-text-action-weight) var(--cc-text-action-tv) var(--cc-text-action-font);
}
.shape {
  stroke: var(--cc-ink);
}
.panel {
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-depth-panel);
}
.standings {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
  padding: var(--cc-space-5);
  overflow-y: auto;
}
.tab {
  position: absolute;
  top: calc(-1 * var(--cc-space-4));
  left: var(--cc-space-5);
  padding: 0 var(--cc-space-3);
  background: var(--cc-sky);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  font: 700 var(--cc-text-small-tv) var(--cc-text-small-font);
}
.rows {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
  margin: var(--cc-space-3) 0 0;
  padding: 0;
  list-style: none;
}
.row {
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
  height: 56px;
  padding: 0 var(--cc-space-4);
  background: var(--cc-sky);
  border-radius: var(--cc-radius-pill);
}
.row.top {
  outline: var(--cc-outline-tv) solid var(--cc-sunny);
}
.row .place {
  width: var(--cc-space-6);
  font: var(--cc-text-score-weight) var(--cc-text-small-tv) var(--cc-text-score-font);
}
.nm {
  font: 700 var(--cc-text-small-tv) var(--cc-text-body-font);
}
.sc {
  margin-left: auto;
  font: var(--cc-text-score-weight) var(--cc-text-small-tv) var(--cc-text-score-font);
  font-variant-numeric: tabular-nums;
}
.foot {
  display: flex;
  gap: var(--cc-space-6);
}
.foot .panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--cc-space-1);
  padding: var(--cc-space-5) var(--cc-space-6);
}
.code-panel {
  align-items: center;
}
</style>
