<script setup lang="ts">
import type { PlayerShape } from "@couchcade/theme";
import { computed } from "vue";

// The eight player shapes from the approved platform screens canvas, on a 24-unit grid.
//
// Every other host screen draws a player's shape with `@couchcade/ui`'s CcPlayerShape, which
// looks the shape and colour up together from a player id. The lobby's empty seats need the
// shape a slot will get without that slot's colour ("Empty slots show the shape the next player
// will get", docs/design/platform-screens.md, "Join and lobby") -- CcPlayerShape's public API has
// no colour override, so this stays local for that one case (SeatCard.vue).
const props = defineProps<{ shape: PlayerShape; size: number }>();

// A fixed 4px outline at any size (HOUSE_STYLE "outline": 4px on the TV, apps/host is TV-only),
// matching CcPlayerShape's own formula so an empty seat's outline weight never looks out of step
// with a seated player's next to it.
const strokeWidth = computed(() => (4 * 28) / props.size);

function polygon(points: number, radius: (i: number) => number, cy: number): string {
  const corners = Array.from({ length: points }, (_, i) => {
    const angle = ((-90 + (i * 360) / points) * Math.PI) / 180;
    return `${(12 + radius(i) * Math.cos(angle)).toFixed(2)} ${(cy + radius(i) * Math.sin(angle)).toFixed(2)}`;
  });
  return `M${corners.join(" L")} Z`;
}

const paths: Record<PlayerShape, string> = {
  circle: "M12 2.2 A9.8 9.8 0 1 1 11.99 2.2 Z",
  square:
    "M5.3 2.8 H18.7 Q21.2 2.8 21.2 5.3 V18.7 Q21.2 21.2 18.7 21.2 H5.3 Q2.8 21.2 2.8 18.7 V5.3 Q2.8 2.8 5.3 2.8 Z",
  triangle: "M12 2.2 L22.4 20.8 H1.6 Z",
  diamond: "M12 1.2 L22.8 12 L12 22.8 L1.2 12 Z",
  star: polygon(10, (i) => (i % 2 ? 4.9 : 11.2), 12.8),
  hexagon: polygon(6, () => 10.8, 12),
  heart:
    "M12 21.6 C4 16 1.4 12 1.4 8.2 C1.4 4.8 3.9 2.4 7 2.4 C9.2 2.4 11 3.7 12 5.6 C13 3.7 14.8 2.4 17 2.4 C20.1 2.4 22.6 4.8 22.6 8.2 C22.6 12 20 16 12 21.6 Z",
  plus: "M8.4 1.4 H15.6 V8.4 H22.6 V15.6 H15.6 V22.6 H8.4 V15.6 H1.4 V8.4 H8.4 Z",
};
</script>

<template>
  <svg class="player-shape" :width="size" :height="size" viewBox="-2 -2 28 28" aria-hidden="true">
    <path :d="paths[shape]" :stroke-width="strokeWidth" stroke-linejoin="round" />
  </svg>
</template>

<style scoped>
.player-shape {
  display: block;
  flex: none;
}
</style>
