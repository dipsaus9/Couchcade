<script setup lang="ts">
import { audienceCopy, lineLabel, type AudienceView } from "./audience-view.ts";

// "Watching" for phones past the 8 seats, from the approved audience artboard
// (docs/design/platform-screens.md, "Waiting"). Audience members have no colour or shape, so the
// chip shows a plain Sky circle. The place in line comes from the host's `audience` view
// (docs/architecture/session-flow.md, "Screens").

defineProps<{ name: string; view: AudienceView | null }>();
</script>

<template>
  <section class="screen">
    <div class="chip">
      <span class="dot" aria-hidden="true" />
      <span class="name">{{ name }}</span>
      <span class="tag">{{ audienceCopy.tag }}</span>
    </div>

    <div class="status" role="status">
      <svg class="tv" viewBox="0 0 120 98" width="200" height="164" aria-hidden="true">
        <path class="line" d="M44 8 L58 20 L74 4" />
        <rect class="set" x="6" y="20" width="108" height="66" rx="12" />
        <rect class="screen-fill" x="16" y="30" width="88" height="46" rx="6" />
        <path class="line" d="M34 86 L28 94 M86 86 L92 94" />
        <rect class="floor" x="30" y="58" width="60" height="10" />
        <rect class="left-pip" x="40" y="40" width="10" height="18" />
        <rect class="right-pip" x="68" y="44" width="10" height="14" />
      </svg>
      <h1 class="title">{{ audienceCopy.title }}</h1>
      <p class="body">{{ audienceCopy.body }}</p>
      <p v-if="view" class="line-place">{{ lineLabel(view.position) }}</p>
    </div>

    <p class="hint">{{ audienceCopy.hint }}</p>
  </section>
</template>

<style scoped>
.screen {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--cc-space-6);
}

.chip {
  display: flex;
  align-items: center;
  gap: var(--cc-space-3);
  min-height: var(--cc-touch-min);
  padding: var(--cc-space-2) var(--cc-space-4) var(--cc-space-2) var(--cc-space-3);
  background: var(--cc-chalk);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  box-shadow: var(--cc-depth-panel);
}

.dot {
  width: var(--cc-space-7);
  height: var(--cc-space-7);
  background: var(--cc-sky);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
}

.name {
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-title-weight);
}

.tag {
  margin-left: auto;
  padding: var(--cc-space-1) var(--cc-space-3);
  background: var(--cc-chalk);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  font-size: var(--cc-text-small-phone);
  font-weight: var(--cc-text-title-weight);
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

.tv {
  margin-bottom: var(--cc-space-2);
  stroke: var(--cc-ink);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.line {
  fill: none;
}

.set {
  fill: var(--cc-chalk);
}

.screen-fill {
  fill: var(--cc-sky);
}

.floor {
  fill: var(--cc-sunny);
  stroke: none;
}

.left-pip,
.right-pip {
  stroke-width: 3;
}

.left-pip {
  fill: var(--cc-turf);
}

.right-pip {
  fill: var(--cc-signal);
}

.title,
.body,
.line-place,
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

.line-place {
  font-size: var(--cc-text-body-phone);
  font-weight: var(--cc-text-title-weight);
}

.hint {
  text-align: center;
  font-size: var(--cc-text-small-phone);
}
</style>
