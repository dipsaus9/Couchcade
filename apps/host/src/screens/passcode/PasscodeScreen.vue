<script setup lang="ts">
import { ref } from "vue";

// The host passcode screen. Plain on purpose: CC-4.7 restyles every host screen.
const props = defineProps<{
  notice: string | null;
  /** Opens a room. Resolves to error copy, or null when the room is open. */
  openRoom: (passcode: string) => Promise<string | null>;
}>();

const passcode = ref("");
const busy = ref(false);
const error = ref<string | null>(null);

async function submit(): Promise<void> {
  if (busy.value || passcode.value === "") return;
  busy.value = true;
  error.value = null;
  const typed = passcode.value;
  // The passcode stays in memory only until the request finishes (security.md, "Host passcode").
  passcode.value = "";
  error.value = await props.openRoom(typed);
  busy.value = false;
}
</script>

<template>
  <main class="passcode">
    <form class="panel" @submit.prevent="submit">
      <h1 class="title">Open a room</h1>
      <p v-if="notice" class="notice">{{ notice }}</p>
      <label class="label" for="host-passcode">Host passcode</label>
      <input
        id="host-passcode"
        v-model="passcode"
        class="field"
        type="password"
        autocomplete="current-password"
        :disabled="busy"
        required
      />
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="button" type="submit" :disabled="busy || passcode === ''">
        {{ busy ? "Opening…" : "Open room" }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.passcode {
  display: grid;
  place-items: center;
  height: 100%;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-5);
  width: 880px;
  padding: var(--cc-space-8);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-depth-panel);
}
.title {
  margin: 0;
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}
.label {
  font: 700 var(--cc-text-small-tv) var(--cc-text-small-font);
}
.notice,
.error {
  margin: 0;
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-text-body-font);
}
.field {
  height: 88px;
  padding: 0 var(--cc-space-5);
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-text-body-font);
  color: var(--cc-ink);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
}
.button {
  height: 88px;
  font: var(--cc-text-action-weight) var(--cc-text-action-tv) var(--cc-text-action-font);
  color: var(--cc-ink);
  background: var(--cc-sunny);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  box-shadow: var(--cc-depth-rest);
  cursor: pointer;
}
.button:disabled {
  color: var(--cc-ink-45);
  background: var(--cc-chalk);
  border-color: var(--cc-ink-20);
  box-shadow: none;
  cursor: default;
}
.field:focus-visible,
.button:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}
</style>
