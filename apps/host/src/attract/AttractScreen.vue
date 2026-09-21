<script setup lang="ts">
import { CcPanel } from "@couchcade/ui";
import { computed } from "vue";
import type { ConnectionStatus } from "../net/relay-socket.ts";
import type { LobbyState } from "../screens/lobby/lobby-state.ts";
import JoinPanel from "../screens/lobby/JoinPanel.vue";
import { playerCountLabel } from "../screens/menu/menu.ts";
import type { AttractPreview } from "./attract-state.ts";

// The TV attract loop (CC-9.3): the lobby sat empty for 60 s, so the TV cycles game previews like
// an arcade cabinet's demo loop instead of showing an empty seat grid. The room code and QR code
// stay put (same JoinPanel the lobby uses) so a passer-by can still join straight from here --
// attract mode is a standing invitation, not a screensaver. A join ends it at once (AC2): the
// runtime just stops handing this component `screen.name === 'attract'` and the plain lobby comes
// back, driven by `attract-state.ts`'s own timer, not by anything in here.
const props = defineProps<{
  lobby: LobbyState;
  connection: ConnectionStatus;
  origin: string;
  preview: AttractPreview;
}>();

const game = computed(() => props.preview.game);
const dots = computed(() => Array.from({ length: props.preview.total }, (_, i) => i));
</script>

<template>
  <div class="attract">
    <header class="head">
      <p class="brand">Couchcade</p>
      <p class="tagline">Grab a phone and join in</p>
    </header>
    <main class="main">
      <CcPanel class="preview" screen="tv" as="section" tab="Coming up">
        <Transition name="preview" mode="out-in">
          <div :key="game.id" class="card">
            <p class="title">{{ game.title }}</p>
            <p class="meta">
              <span>{{ playerCountLabel(game.players) }}</span>
              <span v-if="game.needsMotion" class="tag">Motion</span>
            </p>
          </div>
        </Transition>
        <ul class="dots" aria-hidden="true">
          <li v-for="i in dots" :key="i" class="dot" :class="{ on: i === preview.index }" />
        </ul>
      </CcPanel>
      <JoinPanel :code="lobby.code" :origin="origin" />
    </main>
    <p v-if="connection !== 'open'" class="status" role="status">
      {{ connection === "connecting" ? "Connecting…" : "Reconnecting…" }}
    </p>
  </div>
</template>

<style scoped>
.attract {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-6);
  height: 100%;
}
.head {
  display: flex;
  align-items: baseline;
  gap: var(--cc-space-5);
  height: 88px;
}
.brand {
  margin: 0;
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}
.tagline,
.status {
  margin: 0;
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-text-body-font);
}
.main {
  display: flex;
  flex: 1;
  gap: var(--cc-space-6);
  min-height: 0;
}
.preview {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-6);
  min-width: 0;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-4);
  text-align: center;
}
.title {
  margin: 0;
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}
.meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-4);
  margin: 0;
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-text-body-font);
}
.tag {
  padding: 0 var(--cc-space-3);
  background: var(--cc-sky);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
}
.dots {
  display: flex;
  gap: var(--cc-space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}
.dot {
  width: var(--cc-space-3);
  height: var(--cc-space-3);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
}
.dot.on {
  background: var(--cc-sunny);
}
.preview-enter-active,
.preview-leave-active {
  transition: opacity var(--cc-motion-ui-duration) var(--cc-motion-ui-ease);
}
.preview-enter-from,
.preview-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .preview-enter-active,
  .preview-leave-active {
    transition: none;
  }
}
</style>
