<script setup lang="ts">
import { CcPanel } from "@couchcade/ui";
import { offlineCopy } from "./copy.ts";

// "You're offline", shown app-wide whenever the browser's own online/offline signal says there's
// no network (errors/network.ts), over whatever screen was showing. Not in the approved errors
// canvas (docs/design/platform-screens.md, "Not in this canvas"): follows the same panel + badge
// pattern as the approved Room is full / Kicked screens, with a Chalk badge for a waiting/info
// situation rather than the Signal badge those stop situations use. Recovers on its own once the
// browser fires `online` again -- there's nothing useful to press.
</script>

<template>
  <section class="screen">
    <p class="brand">Couchcade</p>
    <CcPanel as="div" class="card">
      <svg class="badge" viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
        <circle class="disc" cx="48" cy="48" r="44" />
        <path
          class="icon"
          d="M24 40 a 34 34 0 0 1 48 0 M32 50 a 22 22 0 0 1 32 0 M40 60 a 10 10 0 0 1 16 0 M48 70 v 2"
        />
        <path class="slash" d="M20 20 L76 76" />
      </svg>
      <div role="status">
        <h1 class="title">{{ offlineCopy.title }}</h1>
        <p class="body">{{ offlineCopy.body }}</p>
      </div>
    </CcPanel>
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
  fill: var(--cc-chalk);
  stroke: var(--cc-ink);
  stroke-width: 4;
}

.icon,
.slash {
  fill: none;
  stroke: var(--cc-ink);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
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
