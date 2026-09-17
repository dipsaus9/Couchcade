<script setup lang="ts">
import { CcButton, CcPanel } from "@couchcade/ui";
import { ref } from "vue";

// The host passcode screen. Not in the approved platform-screens canvas (docs/design/
// platform-screens.md, "Not in this canvas" -- CC-1.11); follows the same panel/button patterns.
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

// CcPanel's `as="form"` renders a native <form>, but the strict template checker only knows the
// component's own declared props -- an event listener needs the v-bind escape hatch, same as an
// unmodelled attribute (see SeatCard.vue's aria-label). The submit event still lands on the
// native element through Vue's normal attribute fallthrough.
function onSubmit(event: Event): void {
  event.preventDefault();
  void submit();
}
</script>

<template>
  <main class="passcode">
    <CcPanel class="panel" screen="tv" as="form" v-bind="{ onSubmit }">
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
      <CcButton
        variant="primary"
        screen="tv"
        type="submit"
        block
        :disabled="busy || passcode === ''"
      >
        {{ busy ? "Opening…" : "Open room" }}
      </CcButton>
    </CcPanel>
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
.field:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}
</style>
