<script setup lang="ts">
import type { PlayerShape } from "@couchcade/theme";
import { computed } from "vue";

// A player's shape in their colour, so colour is never the only cue (docs/HOUSE_STYLE.md).
// Plain placeholder until the UI kit (CC-4.4) ships its outlined shapes; CC-4.8 swaps it.

const props = withDefaults(
  defineProps<{
    shape: PlayerShape;
    /** CSS colour, normally a theme variable such as `var(--cc-player-cherry)`. */
    fill: string;
    label: string;
    size?: number;
  }>(),
  { size: 32 },
);

const ring = (points: number, radius: (i: number) => number, cy = 12): string =>
  "M" +
  Array.from({ length: points }, (_, i) => {
    const angle = ((-90 + (i * 360) / points) * Math.PI) / 180;
    const r = radius(i);
    return `${(12 + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }).join(" L") +
  " Z";

const paths: Record<PlayerShape, string> = {
  circle: "M12 2.2 A9.8 9.8 0 1 1 11.99 2.2 Z",
  square: "M2.8 2.8 H21.2 V21.2 H2.8 Z",
  triangle: "M12 2.2 L22.4 20.8 H1.6 Z",
  diamond: "M12 1.2 L22.8 12 L12 22.8 L1.2 12 Z",
  star: ring(10, (i) => (i % 2 ? 4.9 : 11.2), 12.8),
  hexagon: ring(6, () => 10.8),
  heart:
    "M12 21.6 C4 16 1.4 12 1.4 8.2 C1.4 4.8 3.9 2.4 7 2.4 C9.2 2.4 11 3.7 12 5.6 C13 3.7 14.8 2.4 17 2.4 C20.1 2.4 22.6 4.8 22.6 8.2 C22.6 12 20 16 12 21.6 Z",
  plus: "M8.4 1.4 H15.6 V8.4 H22.6 V15.6 H15.6 V22.6 H8.4 V15.6 H1.4 V8.4 H8.4 Z",
};

const d = computed(() => paths[props.shape]);
</script>

<template>
  <svg
    class="player-shape"
    :width="size"
    :height="size"
    viewBox="-2 -2 28 28"
    role="img"
    :aria-label="label"
  >
    <path :d="d" :style="{ fill }" />
  </svg>
</template>

<style scoped>
.player-shape {
  display: block;
  flex: none;
}

.player-shape path {
  stroke: var(--cc-ink);
  stroke-width: 2.5;
  stroke-linejoin: round;
}
</style>
