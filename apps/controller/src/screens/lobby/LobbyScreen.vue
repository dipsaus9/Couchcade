<script setup lang="ts">
import type { PhoneToRelayMessage, PlayerInfo } from "@couchcade/protocol";
import { players } from "@couchcade/theme";
import { CcButton, CcPlayerChip } from "@couchcade/ui";
import { computed } from "vue";
import { lookForSlot } from "../../session/look.ts";
import { menuActions } from "../menu/menu-view.ts";

// The phone in the lobby: its name, colour and shape (docs/design/platform-screens.md, "Lobby").
// The VIP also gets "Choose a game" and "Surprise me" (CC-3.2). The Pip customiser (CC-6.5) comes
// later; built from the UI kit's CcPlayerChip, whose plain Sky circle is the audience look.

const props = defineProps<{
  you: PlayerInfo;
  role: "player" | "audience";
  code: string;
  hostConnected: boolean;
  online: boolean;
  /** True when the host made this phone the VIP. */
  vip: boolean;
}>();
const emit = defineEmits<{ send: [message: PhoneToRelayMessage] }>();

const look = computed(() => (props.role === "player" ? lookForSlot(props.you.slot) : null));
// CcPlayerChip takes the theme's player id, not the look's colour/shape pair.
const playerId = computed(() =>
  props.role === "player" && props.you.slot !== null ? players[props.you.slot]?.id : undefined,
);
</script>

<template>
  <section class="screen">
    <CcPlayerChip class="chip" :player="playerId" :name="you.name" />

    <div class="status" role="status">
      <template v-if="look">
        <h1 class="title">You're in, {{ you.name }}</h1>
        <p class="body">You're {{ look.colourName }}, the {{ look.shape }}. Watch the TV.</p>
      </template>
      <template v-else>
        <h1 class="title">Watching</h1>
        <p class="body">All 8 player spots are taken. You get the next free spot between games.</p>
      </template>
      <p v-if="!online" class="body">Reconnecting you as {{ you.name }}. Keep this page open.</p>
      <p v-else-if="!hostConnected" class="body">Waiting for the TV. Keep this page open.</p>
    </div>

    <div v-if="vip && look && online && hostConnected" class="vip">
      <p class="body">You're the VIP. Pick the first game when everyone's in.</p>
      <CcButton variant="primary" block @press="emit('send', menuActions.chooseGame())">
        Choose a game
      </CcButton>
      <CcButton block @press="emit('send', menuActions.surpriseMe())">Surprise me</CcButton>
    </div>

    <p class="footnote">Room {{ code }}. The first player starts the game.</p>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cc-space-6);
}

.chip {
  align-self: flex-start;
}

.status {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  gap: var(--cc-space-2);
}

.title {
  margin: 0;
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.body {
  margin: 0;
  font-size: var(--cc-text-body-phone);
}

.vip {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
}

.footnote {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-small-phone);
}
</style>
