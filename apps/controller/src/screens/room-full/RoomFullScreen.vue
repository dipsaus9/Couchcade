<script setup lang="ts">
import { CcButton, CcPanel } from "@couchcade/ui";

// "Room is full" when 16 phones are already in the room, from the approved errors artboard
// (docs/design/platform-screens.md, "Errors"). A Signal badge with "8/8", and one way on: another
// code.

defineEmits<{ leave: [] }>();
</script>

<template>
  <section class="screen">
    <p class="brand">Couchcade</p>
    <CcPanel as="div" class="card">
      <svg class="badge" viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
        <circle class="disc" cx="48" cy="48" r="44" />
        <text class="count" x="48" y="60" text-anchor="middle">8/8</text>
      </svg>
      <div role="alert">
        <h1 class="title">Room is full</h1>
        <p class="body">Ask the host to start a new one.</p>
      </div>
    </CcPanel>
    <CcButton block @press="$emit('leave')">Try another code</CcButton>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cc-space-6);
}

.brand {
  margin: 0;
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-3);
  margin-block: auto;
  padding: var(--cc-space-7) var(--cc-space-5) var(--cc-space-5);
  text-align: center;
}

.badge {
  margin-top: calc(-2 * var(--cc-space-7));
}

.disc {
  fill: var(--cc-signal);
  stroke: var(--cc-ink);
  stroke-width: 4;
}

.count {
  fill: var(--cc-chalk);
  stroke: var(--cc-ink);
  stroke-width: 3;
  paint-order: stroke;
  font-family: var(--cc-text-score-font);
  font-weight: var(--cc-text-score-weight);
  font-size: 34px;
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
</style>
