<script setup lang="ts">
import type { PhoneToRelayMessage } from "@couchcade/protocol";
import { CcBigAction, CcButton } from "@couchcade/ui";
import {
  calibrationActions,
  createCalibrationTapper,
  type CalibrationView,
} from "./calibration-view.ts";

// The TV lag check on the phone (docs/architecture/session-flow.md, "TV lag calibration"): one big
// button to tap along with the flash on the TV. The VIP can also skip. CC-4.8 restyles it.

const props = defineProps<{ view: CalibrationView }>();
const emit = defineEmits<{ send: [message: PhoneToRelayMessage] }>();

const tap = createCalibrationTapper({ sendMessage: (message) => emit("send", message) });

function onPress(event: Event): void {
  if (props.view.active) tap(event.timeStamp);
}
</script>

<template>
  <section class="screen">
    <div class="status" role="status">
      <h1 class="title">{{ view.active ? "Tap along" : "Watch the TV" }}</h1>
      <p class="body">
        {{ view.active ? "Tap in time, not after" : "The TV is checking its lag." }}
      </p>
    </div>

    <CcBigAction
      :state="view.active ? 'act-now' : 'waiting'"
      :label="view.active ? 'Tap with the flash' : 'Watch the TV'"
      @press="onPress"
    />

    <CcButton v-if="view.vip" block @press="emit('send', calibrationActions.skip())">
      Skip
    </CcButton>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cc-space-6);
}

.status {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-2);
  text-align: center;
}

.title,
.body {
  margin: 0;
}

.title {
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.body {
  font-size: var(--cc-text-body-phone);
}
</style>
