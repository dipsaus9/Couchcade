<script setup lang="ts">
import type { StoredDisplayLag } from "@couchcade/game-sdk/clock";
import { seatCount } from "@couchcade/protocol";
import { computed } from "vue";
import type { ConnectionStatus } from "../../net/relay-socket.ts";
import JoinPanel from "./JoinPanel.vue";
import { audience, seatedPlayers, seats, vip, type LobbyState } from "./lobby-state.ts";
import SeatCard from "./SeatCard.vue";

// The TV lobby: players on the left, how to join on the right (docs/design/platform-screens.md).
const props = defineProps<{
  lobby: LobbyState;
  connection: ConnectionStatus;
  origin: string;
  /** The stored TV lag, or null when this laptop never checked it. */
  displayLag: StoredDisplayLag | null;
}>();
defineEmits<{ end: []; checkTvLag: [] }>();

const seatList = computed(() => seats(props.lobby));
const playerCount = computed(() => seatedPlayers(props.lobby).length);
const watching = computed(() => audience(props.lobby).length);
const leader = computed(() => vip(props.lobby));
const hint = computed(() =>
  leader.value ? `${leader.value.name} starts the game from their phone` : "Scan the code to join",
);
</script>

<template>
  <div class="lobby">
    <header class="head">
      <p class="brand">Couchcade</p>
      <p v-if="connection !== 'open'" class="status" role="status">
        {{ connection === "connecting" ? "Connecting…" : "Reconnecting…" }}
      </p>
      <p v-if="displayLag" class="body">TV lag {{ displayLag.ms }} ms</p>
      <button
        class="button"
        type="button"
        :disabled="connection !== 'open'"
        @click="$emit('checkTvLag')"
      >
        Check TV lag
      </button>
      <button class="button" type="button" @click="$emit('end')">End room</button>
    </header>
    <main class="main">
      <section class="players" aria-label="Players">
        <div class="players-head">
          <h1 class="title">Players</h1>
          <p class="count">{{ playerCount }}/{{ seatCount }}</p>
          <p v-if="watching > 0" class="body">{{ watching }} watching</p>
          <p class="body hint">{{ hint }}</p>
        </div>
        <div class="grid">
          <SeatCard
            v-for="seat in seatList"
            :key="seat.slot"
            :seat="seat"
            :is-vip="seat.player !== null && seat.player.id === leader?.id"
          />
        </div>
      </section>
      <JoinPanel :code="lobby.code" :origin="origin" />
    </main>
  </div>
</template>

<style scoped>
.lobby {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-6);
  height: 100%;
}
.head {
  display: flex;
  align-items: center;
  gap: var(--cc-space-6);
  height: 88px;
}
.brand {
  margin: 0;
  flex: 1;
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}
.status,
.body {
  margin: 0;
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-text-body-font);
}
.button {
  height: 88px;
  padding: 0 var(--cc-space-6);
  font: var(--cc-text-action-weight) var(--cc-text-action-tv) var(--cc-text-action-font);
  color: var(--cc-ink);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  box-shadow: var(--cc-depth-rest);
  cursor: pointer;
}
.button:disabled {
  color: var(--cc-ink-45);
  border-color: var(--cc-ink-20);
  box-shadow: none;
  cursor: not-allowed;
}
.button:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}
.main {
  display: flex;
  flex: 1;
  gap: var(--cc-space-6);
  min-height: 0;
}
.players {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cc-space-5);
  min-width: 0;
  padding: var(--cc-space-6);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-depth-panel);
}
.players-head {
  display: flex;
  align-items: center;
  gap: var(--cc-space-5);
}
.title {
  margin: 0;
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}
.count {
  margin: 0;
  font: var(--cc-text-score-weight) var(--cc-text-score-tv) var(--cc-text-score-font);
}
.hint {
  margin-left: auto;
}
.grid {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: var(--cc-space-5);
}
</style>
