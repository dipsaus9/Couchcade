<script setup lang="ts">
import { CcPanel } from "@couchcade/ui";
import { offlineCopy } from "./copy.ts";

// "This TV is offline", shown app-wide whenever the laptop's own online/offline signal says
// there's no network (errors/network.ts). Not in the approved errors canvas (docs/design/
// platform-screens.md, "Not in this canvas"): follows the same panel + badge pattern as the
// phone's approved Room is full / Kicked screens, scaled to the TV, with a Chalk badge for a
// waiting/info situation rather than the Signal badge those stop situations use. Recovers on its
// own once the browser fires `online` again.
</script>

<template>
  <main class="screen">
    <CcPanel class="panel" screen="tv" as="div">
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
  </main>
</template>

<style scoped>
.screen {
  display: grid;
  place-items: center;
  height: 100%;
}

.panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-3);
  width: 880px;
  padding-top: calc(var(--cc-space-8) + var(--cc-space-5));
  text-align: center;
}

.badge {
  margin-top: calc(-2 * var(--cc-space-8));
  width: 128px;
  height: 128px;
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
  font: var(--cc-text-title-weight) var(--cc-text-title-tv) var(--cc-text-title-font);
}

.body {
  margin: 0;
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-text-body-font);
}
</style>
