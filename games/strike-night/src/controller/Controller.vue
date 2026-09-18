<script setup lang="ts">
/**
 * Strike Night's phone entry (docs/architecture/platform.md, "How the phone shows a controller").
 * Phones load only this file's folder, never games/strike-night/src/index.ts, so the rules, the
 * host scene and Phaser never reach a phone (owner decision, 16 September 2026).
 *
 * This placeholder only shows the game's own view data; CC-12.3 replaces it with the move bar,
 * the hold-swing-release grip and the touch swipe fallback from docs/games/strike-night.md,
 * "Phone controller". `send` is typed against the real `bowl`/`move`/`grip` schema so this file
 * (and CC-12.3's) type-checks against it, but this placeholder never calls it: the game stays
 * `hidden` until CC-12.3 and CC-12.4 land.
 */
import { computed } from "vue";
import type { Player } from "@couchcade/game-sdk/contract";
import type { StrikeNightInput } from "../shared/input.ts";
import type { StrikeNightView } from "../shared/view.ts";

const props = defineProps<{
  screen: string;
  data: StrikeNightView;
  player: Player;
  send(input: StrikeNightInput, eventTimeStamp?: number): void;
}>();

const status = computed(() =>
  props.data.bowler === null ? "Waiting for the lane" : `${props.data.bowler} is bowling`,
);
</script>

<template>
  <section class="screen">
    <p class="status" role="status">{{ status }}</p>
    <p class="hint">Frame {{ data.frame }} of {{ data.frames }} · you have {{ data.total }}</p>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-6);
}

.status,
.hint {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-body-weight);
}
</style>
