<script setup lang="ts">
import { CcButton } from "@couchcade/ui";
import { computed } from "vue";
import { motionCopy as copy } from "./copy.ts";
import type { RecalibrateProgress } from "./session.ts";

// "Fix my controls" (CC-5.11): a manual fast-path on top of CC-5.14's continuous rest
// calibration (docs/architecture/motion.md, "Where aim's zero comes from (CC-5.12)", "How this
// sits with CC-5.11"). Most bad calibrations self-correct within seconds on their own; this
// button is for the player who doesn't want to wait for the next quiet moment. Mounted by
// App.vue as a fixed overlay above the running game's own controller, opposite the VIP's "End
// game" button, only while motion is ready, playing and not paused -- so it never appears for a
// touch player and never survives a sleep (session.ts clears `recalibrating` on pause).

const props = defineProps<{ recalibrating: RecalibrateProgress | null }>();
const emit = defineEmits<{ recalibrate: [] }>();

const label = computed(() =>
  props.recalibrating
    ? copy.recalibrate.active(Math.round(props.recalibrating.progress * 100))
    : copy.recalibrate.action,
);
</script>

<template>
  <CcButton
    class="recalibrate"
    variant="quiet"
    :disabled="recalibrating !== null"
    @press="emit('recalibrate')"
  >
    {{ label }}
  </CcButton>
</template>

<style scoped>
.recalibrate {
  position: fixed;
  top: var(--cc-space-4);
  left: var(--cc-space-4);
  z-index: 999;
}
</style>
