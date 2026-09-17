<script setup lang="ts">
/**
 * __TITLE__'s phone entry (docs/architecture/platform.md, "How the phone shows a controller").
 * Phones load only this file's folder, never games/__ID__/src/index.ts, so the rules, the host
 * scene and Phaser never reach a phone (owner decision, 16 September 2026). One big action: tap
 * to score, built from the UI kit so the interface follows house style without drawing anything
 * by hand.
 */
import { CcBigAction } from "@couchcade/ui";
import { computed } from "vue";
import type { Player } from "@couchcade/game-sdk/contract";
import type { __ID_PASCAL__Input } from "../shared/input.ts";
import type { __ID_PASCAL__View } from "../shared/rules.ts";

const props = defineProps<{
  screen: string;
  data: __ID_PASCAL__View;
  player: Player;
  send(input: __ID_PASCAL__Input, eventTimeStamp?: number): void;
}>();

const done = computed(() => props.data.winnerId !== null);
const label = computed(() =>
  done.value ? "Round over" : `${props.data.yours} / ${props.data.target}`,
);

function onPress(event: Event): void {
  if (done.value) return;
  props.send({ type: "tap" }, (event as PointerEvent).timeStamp);
}
</script>

<template>
  <section class="screen">
    <p class="status" role="status">
      {{ done ? "Wait for the next round" : "Tap as fast as you can!" }}
    </p>
    <CcBigAction :state="done ? 'disabled' : 'act-now'" :label="label" @press="onPress" />
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
