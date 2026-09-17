<script setup lang="ts">
import { CcButton } from "@couchcade/ui";
import { computed } from "vue";
import { motionCopy as copy } from "./copy.ts";
import type { PhonePlatform } from "./platform.ts";
import type { MotionGame } from "./session.ts";

// The motion step on the phone (docs/design/platform-screens.md, "Motion": ask for motion, hold
// still, motion denied). "Tap to enable motion" must reach the adapter inside the tap, so the
// buttons use CcButton's click trigger, which counts as a user gesture on iPhones.
// CC-4.8 restyles it with the artboards' illustrations.

const props = defineProps<{ game: MotionGame; platform: PhonePlatform }>();
const emit = defineEmits<{ enable: []; useTouch: []; acknowledge: [] }>();

const flow = computed(() => props.game.flow);
/** How full the Turf ring is, in percent. */
const percent = computed(() =>
  flow.value.kind === "still" ? Math.round(flow.value.progress * 100) : 0,
);
</script>

<template>
  <section class="screen">
    <template v-if="flow.kind === 'ask'">
      <div class="status" role="status">
        <h1 class="title">{{ copy.ask.title(game.title) }}</h1>
        <p class="body">{{ copy.ask.body }}</p>
      </div>
      <div class="actions">
        <CcButton variant="primary" block @press="emit('enable')">{{ copy.ask.enable }}</CcButton>
        <CcButton block @press="emit('useTouch')">{{ copy.ask.touch }}</CcButton>
        <p class="hint">{{ copy.ask.hint }}</p>
        <p v-if="platform === 'iphone'" class="hint">{{ copy.ask.iphoneHint }}</p>
      </div>
    </template>

    <template v-else-if="flow.kind === 'starting' || flow.kind === 'still'">
      <div class="status" role="status">
        <svg
          class="ring"
          viewBox="0 0 220 220"
          role="progressbar"
          aria-label="Holding still"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="percent"
        >
          <circle class="track" cx="110" cy="110" r="76" />
          <circle
            class="fill"
            cx="110"
            cy="110"
            r="76"
            pathLength="100"
            :stroke-dashoffset="100 - percent"
          />
        </svg>
        <h1 class="title">{{ copy.starting.title }}</h1>
        <p class="body">{{ copy.starting.body }}</p>
      </div>
      <p class="hint">{{ copy.starting.hint }}</p>
    </template>

    <div v-else-if="flow.kind === 'ready'" class="status" role="status">
      <h1 class="title">{{ copy.ready.title }}</h1>
      <p class="body">{{ copy.ready.body }}</p>
    </div>

    <div v-else-if="flow.acknowledged" class="status" role="status">
      <h1 class="title">{{ copy.acknowledged.title }}</h1>
      <p class="body">{{ copy.acknowledged.body }}</p>
    </div>

    <template v-else>
      <div class="status" role="status">
        <h1 class="title">{{ copy.touch.title }}</h1>
        <p class="body">
          {{ flow.reason === "denied" ? copy.touch.denied : copy.touch.unsupported }}
        </p>
      </div>
      <div class="actions">
        <CcButton variant="go" block @press="emit('acknowledge')">{{ copy.touch.ready }}</CcButton>
        <p v-if="flow.reason === 'denied'" class="hint">{{ copy.touch.deniedHint }}</p>
      </div>
    </template>
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

.actions {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-3);
}

.title,
.body,
.hint {
  margin: 0;
}

.title {
  font-size: var(--cc-text-title-phone);
  font-weight: var(--cc-text-title-weight);
}

.body {
  font-size: var(--cc-text-body-phone);
}

.hint {
  text-align: center;
  font-size: var(--cc-text-small-phone);
}

.ring {
  width: 220px;
  height: 220px;
  margin-bottom: var(--cc-space-4);
  fill: none;
  stroke-width: 18;
  transform: rotate(-90deg);
}

.track {
  stroke: var(--cc-ink-20);
}

.fill {
  stroke: var(--cc-turf);
  stroke-linecap: round;
  stroke-dasharray: 100;
  transition: stroke-dashoffset var(--cc-motion-ui-duration) ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .fill {
    transition: none;
  }
}
</style>
