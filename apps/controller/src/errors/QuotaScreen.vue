<script setup lang="ts">
import { CcPanel } from "@couchcade/ui";
import { computed } from "vue";
import { quotaCopy } from "./copy.ts";
import { nextQuotaResetLabel } from "./quota.ts";

// "Free plays used up for today" when the Cloudflare Workers Free daily request budget is spent
// (docs/architecture/platform.md, "Free-tier budget rules", rule 12). Not in the approved errors
// canvas (docs/design/platform-screens.md, "Not in this canvas"): follows the same panel + badge
// pattern as the approved Room is full screen, with a Chalk badge for a waiting/info situation and
// the reset time in `score`-style Pixelify Sans, the way the canvas describes this artboard.

const copy = computed(() => quotaCopy());
const resetLabel = computed(() => nextQuotaResetLabel());
</script>

<template>
  <section class="screen">
    <p class="brand">Couchcade</p>
    <CcPanel as="div" class="card">
      <svg class="badge" viewBox="0 0 96 96" width="96" height="96" aria-hidden="true">
        <circle class="disc" cx="48" cy="48" r="44" />
        <text class="reset" x="48" y="60" text-anchor="middle">{{ resetLabel }}</text>
      </svg>
      <div role="status">
        <h1 class="title">{{ copy.title }}</h1>
        <p class="body">{{ copy.body }}</p>
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

.reset {
  fill: var(--cc-ink);
  font-family: var(--cc-text-score-font);
  font-weight: var(--cc-text-score-weight);
  font-size: 24px;
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
