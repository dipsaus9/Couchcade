<script setup lang="ts">
/**
 * A placeholder: `defineController` in `./index.ts` needs a component to load, but the real swing
 * controls (docs/games/bandeja.md, "Phone controller") are CC-23.3's story, not this one's. It
 * shows the score and nothing else, and sends no input at all, so it needs no real `send` calls
 * to fabricate — exactly the same non-interactive placeholder `pnpm create-game`'s own template
 * is before a game's real controller exists.
 */
import { CcBigAction } from "@couchcade/ui";
import { computed } from "vue";
import type { Player } from "@couchcade/game-sdk/contract";
import type { BandejaInput } from "../shared/input.ts";
import type { BandejaView } from "../shared/view.ts";

const props = defineProps<{
  screen: string;
  data: BandejaView;
  player: Player;
  send(input: BandejaInput, eventTimeStamp?: number): void;
}>();

const label = computed(() => `${props.data.scores[0]} - ${props.data.scores[1]}`);
</script>

<template>
  <section class="screen">
    <p class="status" role="status">Bandeja is coming soon</p>
    <CcBigAction state="disabled" :label="label" />
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
