<script setup lang="ts">
// A small Chalk pill in the safe-tv corner, the same idea as App.vue's own "Click for sound" chip.
// Shows "Reconnecting..." once the relay socket has been away for a beat (errors/
// connection-delay.ts), or "This TV is offline" once the browser's own network signal says there's
// none (errors/network.ts) -- App.vue picks which. Doesn't take over the screen: whatever's
// showing underneath stays fully visible and usable, and a running game never pauses for a dropped
// relay (docs/architecture/session-flow.md, "On the host"). Not in the approved errors canvas
// (docs/design/platform-screens.md, "Not in this canvas").
defineProps<{ text: string }>();
</script>

<template>
  <p class="chip" role="status">{{ text }}</p>
</template>

<style scoped>
.chip {
  position: absolute;
  top: 54px;
  left: 96px;
  margin: 0;
  padding: var(--cc-space-2) var(--cc-space-4);
  font: 700 var(--cc-text-small-tv) var(--cc-text-small-font);
  color: var(--cc-ink);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  box-shadow: var(--cc-depth-panel);
}
</style>
