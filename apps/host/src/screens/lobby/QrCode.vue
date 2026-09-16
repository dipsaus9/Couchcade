<script setup lang="ts">
import { encode } from "uqr";
import { computed } from "vue";

const props = defineProps<{ value: string; size: number; label: string }>();

// One path of 1×1 squares, drawn in Ink on a Chalk quiet zone. Medium error correction survives
// glare on a TV screen.
const qr = computed(() => {
  const { data, size } = encode(props.value, { ecc: "M", border: 2 });
  let d = "";
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { d, size };
});
</script>

<template>
  <svg
    class="qr"
    :width="size"
    :height="size"
    :viewBox="`0 0 ${qr.size} ${qr.size}`"
    role="img"
    :aria-label="label"
    shape-rendering="crispEdges"
  >
    <rect class="qr-light" :width="qr.size" :height="qr.size" />
    <path class="qr-dark" :d="qr.d" />
  </svg>
</template>

<style scoped>
.qr {
  display: block;
}
.qr-light {
  fill: var(--cc-chalk);
}
.qr-dark {
  fill: var(--cc-ink);
}
</style>
