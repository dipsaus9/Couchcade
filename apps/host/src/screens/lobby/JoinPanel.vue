<script setup lang="ts">
import { computed } from "vue";
import { joinAddress, joinUrl } from "./join-url.ts";
import QrCode from "./QrCode.vue";

// How to join: a QR code for /?room=CODE, the address to type and the room code, bottom right.
const props = defineProps<{ code: string; origin: string }>();

const url = computed(() => joinUrl(props.origin, props.code));
const address = computed(() => joinAddress(props.origin));
</script>

<template>
  <section class="join" aria-label="Join on your phone">
    <span class="tab">Join on your phone</span>
    <QrCode :value="url" :size="360" label="QR code to join this room" />
    <p class="small">Scan with your phone camera</p>
    <p class="body">
      No camera? Go to<br /><strong>{{ address }}</strong>
    </p>
    <div class="spacer" />
    <p class="code" :aria-label="`Room code ${code.split('').join(' ')}`">
      <span v-for="(letter, i) in code" :key="i" class="tile">{{ letter }}</span>
    </p>
    <p class="small">Room code</p>
  </section>
</template>

<style scoped>
.join {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-4);
  width: 520px;
  flex: none;
  padding: var(--cc-space-7) var(--cc-space-6) var(--cc-space-6);
  text-align: center;
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  box-shadow: var(--cc-depth-panel);
}
.tab {
  position: absolute;
  top: -26px;
  left: var(--cc-space-5);
  padding: var(--cc-space-1) var(--cc-space-4);
  font: 700 var(--cc-text-small-tv) var(--cc-text-small-font);
  background: var(--cc-sky);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
}
.small,
.body,
.code {
  margin: 0;
}
.small {
  font: var(--cc-text-small-weight) var(--cc-text-small-tv) var(--cc-text-small-font);
}
.body {
  font: var(--cc-text-body-weight) var(--cc-text-body-tv) var(--cc-text-body-font);
}
.spacer {
  flex: 1;
}
.code {
  display: flex;
  gap: var(--cc-space-4);
}
.tile {
  display: grid;
  place-items: center;
  width: 96px;
  height: 112px;
  font: var(--cc-text-score-weight) var(--cc-text-score-tv) var(--cc-text-score-font);
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
}
</style>
