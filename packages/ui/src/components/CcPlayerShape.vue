<script setup lang="ts">
import { players } from "@couchcade/theme";
import { computed } from "vue";
import { shapeGeometry } from "./shapes.ts";
import type { PlayerId, Screen } from "./types.ts";

/**
 * A player's shape in their colour with an Ink outline. The shape goes wherever the colour does,
 * so players never need to tell colours apart. Without a player it draws a plain Sky circle, the
 * mark for audience members, who have no player colour.
 */
const props = withDefaults(
  defineProps<{
    player?: PlayerId;
    /** Size in px. */
    size?: number;
    screen?: Screen;
  }>(),
  { player: undefined, size: 24, screen: "phone" },
);

const shape = computed(() => {
  const player = players.find((p) => p.id === props.player);
  return {
    geometry: shapeGeometry[player?.shape ?? "circle"],
    fill: player ? `var(--cc-player-${player.id})` : "var(--cc-sky)",
  };
});

// The outline keeps the house style weight at every size: 3px on phone, 4px on TV.
const strokeWidth = computed(() => ((props.screen === "tv" ? 4 : 3) * 28) / props.size);
</script>

<template>
  <svg
    class="cc-player-shape"
    :width="size"
    :height="size"
    viewBox="-2 -2 28 28"
    aria-hidden="true"
    focusable="false"
  >
    <component
      :is="shape.geometry.tag"
      v-bind="shape.geometry.attrs"
      :style="{ fill: shape.fill }"
      :stroke-width="strokeWidth"
    />
  </svg>
</template>

<style scoped>
.cc-player-shape {
  display: block;
  flex: none;
  stroke: var(--cc-ink);
  stroke-linejoin: round;
}
</style>
