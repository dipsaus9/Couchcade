<script setup lang="ts">
import type { StoredDisplayLag } from "@couchcade/game-sdk/clock";
import { seatCount } from "@couchcade/protocol";
import { CcButton, CcPanel } from "@couchcade/ui";
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
defineEmits<{ end: []; checkTvLag: []; kick: [id: string]; lock: [locked: boolean] }>();

const seatList = computed(() => seats(props.lobby));
const playerCount = computed(() => seatedPlayers(props.lobby).length);
const watching = computed(() => audience(props.lobby).length);
const leader = computed(() => vip(props.lobby));
const online = computed(() => props.connection === "open");
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
      <CcButton screen="tv" :disabled="!online" @press="$emit('checkTvLag')">
        Check TV lag
      </CcButton>
      <CcButton
        class="lock"
        screen="tv"
        :variant="lobby.locked ? 'primary' : 'quiet'"
        v-bind="{ 'aria-pressed': lobby.locked }"
        :disabled="!online"
        @press="$emit('lock', !lobby.locked)"
      >
        <svg class="icon" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
          <path v-if="lobby.locked" d="M12 18 V13 a8 8 0 0 1 16 0 V18" />
          <path v-else d="M12 18 V13 a8 8 0 0 1 16 0 V9" />
          <rect x="7" y="18" width="26" height="18" rx="4" />
        </svg>
        Lock room
      </CcButton>
      <CcButton screen="tv" @press="$emit('end')">End room</CcButton>
    </header>
    <main class="main">
      <CcPanel class="players" screen="tv" as="section" v-bind="{ 'aria-label': 'Players' }">
        <div class="players-head">
          <h1 class="title">Players</h1>
          <p class="count">{{ playerCount }}/{{ seatCount }}</p>
          <p v-if="watching > 0" class="body">{{ watching }} watching</p>
          <p v-if="lobby.locked" class="locked" role="status">Room locked</p>
          <p class="body hint">{{ hint }}</p>
        </div>
        <div class="grid">
          <SeatCard
            v-for="seat in seatList"
            :key="seat.slot"
            :seat="seat"
            :is-vip="seat.player !== null && seat.player.id === leader?.id"
            :can-kick="online"
            @kick="$emit('kick', $event)"
          />
        </div>
      </CcPanel>
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
.lock {
  display: inline-flex;
  align-items: center;
  gap: var(--cc-space-3);
}
.icon {
  fill: var(--cc-chalk);
  stroke: var(--cc-ink);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.icon path {
  fill: none;
}
.locked {
  margin: 0;
  padding: 0 var(--cc-space-3);
  font: 700 var(--cc-text-small-tv) var(--cc-text-small-font);
  color: var(--cc-chalk);
  -webkit-text-stroke: 3px var(--cc-ink);
  paint-order: stroke fill;
  text-shadow: 0 3px 0 var(--cc-ink);
  background: var(--cc-signal);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  white-space: nowrap;
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
