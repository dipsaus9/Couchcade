<script setup lang="ts">
import { CcButton, CcPanel } from "@couchcade/ui";

// "Kicked" after the host removed this phone (close 4003), from the approved errors artboard
// (docs/design/platform-screens.md, "Errors"). The rejoin token no longer works, so the only way
// on is another room.

defineProps<{ code: string }>();
defineEmits<{ leave: [] }>();
</script>

<template>
  <section class="screen">
    <p class="brand">Couchcade</p>
    <CcPanel as="div" class="card">
      <svg class="badge" viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
        <circle class="disc" cx="48" cy="48" r="44" />
        <rect class="door" x="24" y="22" width="30" height="52" rx="4" />
        <path class="arrow-halo" d="M50 48 H76 M66 38 L76 48 L66 58" />
        <path class="arrow" d="M50 48 H76 M66 38 L76 48 L66 58" />
      </svg>
      <div role="alert">
        <h1 class="title">Kicked</h1>
        <p class="body">The host removed you from room {{ code }}.</p>
      </div>
    </CcPanel>
    <CcButton block @press="$emit('leave')">Join another room</CcButton>
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
  stroke: var(--cc-ink);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.disc {
  fill: var(--cc-signal);
}

.door {
  fill: var(--cc-chalk);
}

.arrow-halo,
.arrow {
  fill: none;
}

.arrow-halo {
  stroke: var(--cc-chalk);
  stroke-width: 10;
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
