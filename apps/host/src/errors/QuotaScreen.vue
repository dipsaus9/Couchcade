<script setup lang="ts">
import { CcPanel } from "@couchcade/ui";
import { computed } from "vue";
import { quotaCopy } from "./copy.ts";
import { nextQuotaResetLabel } from "./quota.ts";

// "Free plays used up for today" when opening a room hits the Cloudflare Workers Free daily
// request budget (docs/architecture/platform.md, "Free-tier budget rules", rule 12). Not in the
// approved errors canvas (docs/design/platform-screens.md, "Not in this canvas"): follows the
// same panel + badge pattern as the phone's approved Room is full screen, scaled to the TV, with
// a Chalk badge for a waiting/info situation and the reset time in `score`-style Pixelify Sans.

const copy = computed(() => quotaCopy());
const resetLabel = computed(() => nextQuotaResetLabel());
</script>

<template>
  <main class="screen">
    <CcPanel class="panel" screen="tv" as="div">
      <svg class="badge" viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
        <circle class="disc" cx="48" cy="48" r="44" />
        <text class="reset" x="48" y="60" text-anchor="middle">{{ resetLabel }}</text>
      </svg>
      <div role="status">
        <h1 class="title">{{ copy.title }}</h1>
        <p class="body">{{ copy.body }}</p>
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

.reset {
  fill: var(--cc-ink);
  font-family: var(--cc-text-score-font);
  font-weight: var(--cc-text-score-weight);
  font-size: 32px;
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
