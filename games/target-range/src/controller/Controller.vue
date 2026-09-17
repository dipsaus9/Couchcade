<script setup lang="ts">
/**
 * Target Range's phone entry (docs/architecture/platform.md, "How the phone shows a controller").
 * A placeholder from `pnpm create-game`: one big action that shoots straight ahead at full draw.
 * CC-11.3 builds the real controller with motion aim and the pull to draw. The game is `hidden`
 * until then, so this never reaches a real room.
 */
import { CcBigAction } from "@couchcade/ui";
import { computed, ref, watch } from "vue";
import type { Player } from "@couchcade/game-sdk/contract";
import type { TargetRangeInput } from "../shared/input.ts";
import type { TargetRangeView } from "../shared/view.ts";

const props = defineProps<{
  screen: string;
  data: TargetRangeView;
  player: Player;
  send(input: TargetRangeInput, eventTimeStamp?: number): void;
}>();

const shotVolley = ref<number | null>(null);
watch(
  () => props.data.volley,
  () => (shotVolley.value = null),
);

const canShoot = computed(
  () => props.screen === "tr-shoot" && shotVolley.value !== props.data.volley,
);

function onPress(event: Event): void {
  if (!canShoot.value) return;
  shotVolley.value = props.data.volley;
  props.send(
    { type: "shoot", payload: { volley: props.data.volley, aim: { yaw: 0, pitch: 0 }, power: 1 } },
    (event as PointerEvent).timeStamp,
  );
}
</script>

<template>
  <section class="screen">
    <p class="status" role="status">Round {{ data.round }} of 4 · {{ data.points }} points</p>
    <CcBigAction
      :state="canShoot ? 'hold' : 'waiting'"
      :label="canShoot ? 'Shoot' : 'Watch the TV'"
      @press="onPress"
    />
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
