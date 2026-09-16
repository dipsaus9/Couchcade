<script setup lang="ts">
import CcPlayerShape from "./CcPlayerShape.vue";
import type { PlayerId, Screen } from "./types.ts";

/**
 * A Chalk pill for a player: their shape on the left, name in Fredoka and an optional score in
 * Pixelify Sans on the right. The `avatar` slot sits before the shape, for an Interface Pip head.
 */
withDefaults(
  defineProps<{
    name: string;
    /** Omit for an audience member (plain Sky circle). */
    player?: PlayerId;
    score?: number | string;
    screen?: Screen;
  }>(),
  { player: undefined, score: undefined, screen: "phone" },
);
</script>

<template>
  <div class="cc-player-chip" :class="`cc-player-chip--${screen}`">
    <slot name="avatar" />
    <CcPlayerShape :player="player" :size="screen === 'tv' ? 32 : 24" :screen="screen" />
    <span class="cc-player-chip__name">{{ name }}</span>
    <span v-if="score !== undefined" class="cc-player-chip__score">{{ score }}</span>
  </div>
</template>

<style scoped>
.cc-player-chip {
  --_outline: var(--cc-outline-phone);
  --_height: var(--cc-space-8);
  --_name-size: var(--cc-text-body-phone);
  --_score-size: var(--cc-text-score-phone);

  display: inline-flex;
  align-items: center;
  gap: var(--cc-space-3);
  box-sizing: border-box;
  min-block-size: var(--_height);
  padding: 0 var(--cc-space-5) 0 var(--cc-space-4);
  border: var(--_outline) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-chalk);
  box-shadow: var(--cc-depth-panel);
  color: var(--cc-ink);
  white-space: nowrap;
}

.cc-player-chip--tv {
  --_outline: var(--cc-outline-tv);
  --_height: 72px;
  --_name-size: var(--cc-text-body-tv);
  --_score-size: var(--cc-text-score-tv);
}

.cc-player-chip__name {
  font-family: var(--cc-text-body-font);
  font-weight: var(--cc-text-body-weight);
  font-size: var(--_name-size);
  line-height: 1;
}

.cc-player-chip__score {
  margin-inline-start: auto;
  padding-inline-start: var(--cc-space-3);
  font-family: var(--cc-text-score-font);
  font-weight: var(--cc-text-score-weight);
  font-size: var(--_score-size);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
</style>
