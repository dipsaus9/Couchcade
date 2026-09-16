<script setup lang="ts">
import type { PlayerInfo } from "@couchcade/protocol";
import { computed } from "vue";
import PlayerShape from "../../components/PlayerShape.vue";
import { lookForSlot } from "../../session/look.ts";

// The phone in the lobby: its name, colour and shape (docs/design/platform-screens.md, "Lobby").
// The Pip customiser (CC-6.5) and the VIP's game button (CC-3.2) come later; CC-4.8 restyles it.

const props = defineProps<{
  you: PlayerInfo;
  role: "player" | "audience";
  code: string;
  hostConnected: boolean;
  online: boolean;
}>();

const look = computed(() => (props.role === "player" ? lookForSlot(props.you.slot) : null));
</script>

<template>
  <section class="screen">
    <div class="chip">
      <PlayerShape
        v-if="look"
        :shape="look.shape"
        :fill="look.fill"
        :label="`${look.colourName} ${look.shape}`"
      />
      <span v-else class="audience-dot" aria-hidden="true" />
      <span class="name">{{ you.name }}</span>
      <span class="tag">{{ look ? look.seatLabel : "Audience" }}</span>
    </div>

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
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
  min-height: var(--cc-touch-min);
  padding: var(--cc-space-2) var(--cc-space-4) var(--cc-space-2) var(--cc-space-3);
  background: var(--cc-chalk);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  box-shadow: var(--cc-depth-panel);
}

.audience-dot {
  width: var(--cc-space-7);
  height: var(--cc-space-7);
  background: var(--cc-sky);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
}

.name {
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-title-weight);
}

.tag {
  margin-left: auto;
  padding: var(--cc-space-1) var(--cc-space-3);
  background: var(--cc-sky);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  font-size: var(--cc-text-small-phone);
  font-weight: var(--cc-text-title-weight);
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

.footnote {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-small-phone);
}
</style>
