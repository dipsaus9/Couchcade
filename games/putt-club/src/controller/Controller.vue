<script setup lang="ts">
/**
 * Putt Club's phone entry (docs/architecture/platform.md, "How the phone shows a controller").
 * Phones load only this file's folder, never games/putt-club/src/index.ts, so the rules, the host
 * scene and Phaser never reach a phone (owner decision, 16 September 2026).
 *
 * This is a placeholder: CC-13.3 builds the real aim-then-swing controller (docs/games/putt-club.md,
 * "Phone controller"). `meta.hidden` keeps the game off the menu until that story (and CC-13.4's TV
 * scene) land, so nothing here needs to send real input yet — it only proves the wiring compiles
 * against `../shared/view.ts` and `../shared/input.ts`.
 */
import { CcBigAction } from "@couchcade/ui";
import { computed } from "vue";
import type { Player } from "@couchcade/game-sdk/contract";
import type { PuttClubInput } from "../shared/input.ts";
import type { PuttClubView } from "../shared/view.ts";

const props = defineProps<{
  screen: string;
  data: PuttClubView;
  player: Player;
  send(input: PuttClubInput, eventTimeStamp?: number): void;
}>();

const status = computed(
  () => `Hole ${props.data.hole} of ${props.data.holes} · stroke ${props.data.stroke}`,
);
</script>

<template>
  <section class="screen">
    <p class="status" role="status">{{ status }}</p>
    <CcBigAction state="disabled" label="Coming soon" />
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

.status {
  margin: 0;
  text-align: center;
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-body-weight);
}
</style>
