<script setup lang="ts">
import { computed, onBeforeUnmount } from "vue";
import RotateNotice from "./components/RotateNotice.vue";
import JoinScreen from "./screens/join/JoinScreen.vue";
import LobbyScreen from "./screens/lobby/LobbyScreen.vue";
import { waitingCopy } from "./screens/waiting/copy.ts";
import WaitingScreen from "./screens/waiting/WaitingScreen.vue";
import { createPhoneSession } from "./session/session.ts";
import { screenOf } from "./session/state.ts";

const session = createPhoneSession();
const state = session.state;
const screen = computed(() => screenOf(state.value));

onBeforeUnmount(() => session.dispose());
</script>

<template>
  <main class="app">
    <JoinScreen
      v-if="state.status === 'join'"
      :draft="state.draft"
      :submitting="state.submitting"
      :notice="state.notice"
      @join="session.join"
    />
    <LobbyScreen
      v-else-if="state.status === 'room' && screen === 'lobby'"
      :you="state.you"
      :role="state.role"
      :code="state.session.code"
      :host-connected="state.hostConnected"
      :online="state.online"
    />
    <WaitingScreen v-else v-bind="waitingCopy(state)" />
  </main>
  <RotateNotice />
</template>

<style>
:root {
  color-scheme: light;
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  color: var(--cc-ink);
  background: var(--cc-sky);
  font-family: var(--cc-font-ui);
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-body-weight);
  line-height: 1.35;
}

.app {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  max-width: 30rem;
  margin-inline: auto;
  padding: max(var(--cc-space-4), env(safe-area-inset-top)) var(--cc-space-4)
    max(var(--cc-space-6), env(safe-area-inset-bottom));
}
</style>
