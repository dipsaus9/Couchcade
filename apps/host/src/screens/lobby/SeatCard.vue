<script setup lang="ts">
import { CcButton, CcPip } from "@couchcade/ui";
import { computed } from "vue";
import type { Seat } from "./lobby-state.ts";
import PlayerShape from "./PlayerShape.vue";

// One of the 8 lobby cards. An empty seat previews the shape the next player gets. A seated one
// shows the player's Interface Pip, full crop, 140px (docs/architecture/pips.md "Pips on the TV";
// CC-6.6). Hovering or focusing a player's card shows the 64px Kick button in place of the status
// line (docs/design/platform-screens.md, "Join and lobby").
const props = defineProps<{ seat: Seat; isVip: boolean; canKick: boolean }>();
defineEmits<{ kick: [id: string] }>();

const status = computed(() => {
  const { player, slot } = props.seat;
  if (!player) return "Scan to join";
  if (!player.connected) return "Away";
  return props.isVip ? "VIP" : `Player ${slot + 1}`;
});
</script>

<template>
  <article
    class="seat"
    :class="{ empty: !seat.player, away: seat.player && !seat.player.connected }"
  >
    <CcPip
      v-if="seat.player"
      :profile="seat.player.profile"
      :slot="seat.slot"
      crop="full"
      :size="140"
      surface="tv"
    />
    <PlayerShape v-else class="shape" :shape="seat.style.shape" :size="72" />
    <p v-if="seat.player" class="name">{{ seat.player.name }}</p>
    <p v-else class="name small">Slot {{ seat.slot + 1 }}</p>
    <div class="foot">
      <p class="status" :class="{ tag: isVip && seat.player?.connected }">{{ status }}</p>
      <!-- Screen readers hear "Kick Ana". The label falls through to the <button>; strict templates
           only type-check declared props, so it is bound as an object. -->
      <CcButton
        v-if="seat.player"
        class="kick"
        variant="stop"
        screen="tv"
        small
        :disabled="!canKick"
        v-bind="{ 'aria-label': `Kick ${seat.player.name}` }"
        @press="$emit('kick', seat.player.id)"
      >
        Kick
      </CcButton>
    </div>
  </article>
</template>

<style scoped>
.seat {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-2);
  padding: var(--cc-space-4);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-depth-panel);
  min-width: 0;
}
.seat:not(.empty):hover,
.seat:not(.empty):focus-within {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}
.seat.empty {
  background: var(--cc-sky);
  border-color: var(--cc-ink-20-on-sky);
  box-shadow: none;
}
.shape {
  stroke: var(--cc-ink);
}
.empty .shape {
  fill: var(--cc-sky);
  stroke: var(--cc-ink-20-on-sky);
}
.name,
.status {
  margin: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name {
  font: 700 var(--cc-text-body-tv) var(--cc-text-body-font);
}
.name.small,
.status {
  font: var(--cc-text-small-weight) var(--cc-text-small-tv) var(--cc-text-small-font);
}
.away .status {
  color: var(--cc-ink-70);
}
.tag {
  padding: 0 var(--cc-space-3);
  font-weight: 700;
  background: var(--cc-sky);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
}
/* The status and the Kick button share one spot, so the card never changes height. */
.foot {
  display: grid;
  place-items: center;
  max-width: 100%;
}
.foot > * {
  grid-area: 1 / 1;
}
.kick {
  opacity: 0;
}
.seat:hover .kick,
.seat:focus-within .kick {
  opacity: 1;
}
.seat:hover .foot:has(.kick) .status,
.seat:focus-within .foot:has(.kick) .status {
  visibility: hidden;
}
</style>
