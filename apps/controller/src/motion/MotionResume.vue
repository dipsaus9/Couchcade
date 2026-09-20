<script setup lang="ts">
import { CcBigAction } from "@couchcade/ui";
import { computed } from "vue";
import { motionCopy as copy } from "./copy.ts";

// "Tap to resume" (docs/design/platform-screens.md, "Motion"; motion.md flow rule 6): after the
// screen slept during a motion game, this covers the controller until the player taps. The tap
// restarts the sensors and the wake lock, so it listens to `click`, which counts as a user
// gesture, rather than the big action's `press` on pointerdown, which doesn't on iPhones. A key press
// on the big action is a user gesture too.
//
// CC-5.13: the same screen also covers a game recovered after a reload (session.ts's `follow`),
// where the phone lost its sensors to the reload, not to sleep, so `reason` swaps in copy that
// says so.

const props = defineProps<{ name: string; reason?: "sleep" | "reload" }>();
const emit = defineEmits<{ resume: [] }>();

const body = computed(() =>
  props.reason === "reload" ? copy.resume.reloadBody : copy.resume.body,
);

function onPress(event: Event): void {
  if (event instanceof KeyboardEvent) emit("resume");
}
</script>

<template>
  <div class="resume" role="dialog" aria-modal="true" :aria-label="copy.resume.action">
    <div class="column">
      <div class="status" role="status">
        <h1 class="title">{{ copy.resume.title(name) }}</h1>
        <p class="body">{{ body }}</p>
      </div>
      <!-- A click bubbles up from the big action. Keys press it without a click. -->
      <div class="action" @click="emit('resume')">
        <CcBigAction state="hold" :label="copy.resume.action" @press="onPress" />
      </div>
      <p class="hint">{{ copy.resume.hint }}</p>
    </div>
  </div>
</template>

<style scoped>
.resume {
  position: fixed;
  inset: 0;
  z-index: 5;
  background: var(--cc-chalk);
}

.column {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-6);
  min-height: 100%;
  max-width: 30rem;
  margin-inline: auto;
  padding: max(var(--cc-space-4), env(safe-area-inset-top)) var(--cc-space-4)
    max(var(--cc-space-6), env(safe-area-inset-bottom));
}

.status {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-2);
  text-align: center;
}

.title,
.body,
.hint {
  margin: 0;
}

.title {
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.body {
  font-size: var(--cc-text-body-phone);
}

.hint {
  text-align: center;
  font-size: var(--cc-text-small-phone);
}
</style>
