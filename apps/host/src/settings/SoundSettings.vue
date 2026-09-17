<script setup lang="ts">
import { CcButton, CcPanel } from "@couchcade/ui";
import { ref } from "vue";
import { patchSettings, settings } from "./store.ts";

// The TV lobby's quiet "Sound" button and the panel it opens (docs/architecture/audio.md "Host
// settings" rule 3). No approved design exists for this panel yet, so it reuses the lock button's
// icon-toggle pattern from LobbyScreen.vue and @couchcade/ui's panel and button; the PR calls out
// a screenshot for a quick owner look.
const open = ref(false);

function onMusicInput(event: Event): void {
  patchSettings({ music: Number((event.target as HTMLInputElement).value) });
}

function onEffectsInput(event: Event): void {
  patchSettings({ effects: Number((event.target as HTMLInputElement).value) });
}
</script>

<template>
  <div class="sound-settings">
    <CcButton
      screen="tv"
      variant="quiet"
      v-bind="{ 'aria-expanded': open, 'aria-controls': 'sound-panel' }"
      @press="open = !open"
    >
      <svg class="icon" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
        <path d="M6 15 V25 H13 L22 32 V8 L13 15 Z" />
        <path v-if="!settings.muted" class="wave" d="M27 13 A11 11 0 0 1 27 27" />
        <path v-if="settings.muted" class="mute-x" d="M28 15 L36 25 M36 15 L28 25" />
      </svg>
      Sound
    </CcButton>
    <CcPanel
      v-if="open"
      class="panel"
      screen="tv"
      as="section"
      tab="Sound"
      v-bind="{ id: 'sound-panel' }"
    >
      <div class="row">
        <span class="label">Mute</span>
        <CcButton
          screen="tv"
          small
          :variant="settings.muted ? 'primary' : 'quiet'"
          v-bind="{ 'aria-pressed': settings.muted }"
          @press="patchSettings({ muted: !settings.muted })"
        >
          {{ settings.muted ? "Muted" : "Mute" }}
        </CcButton>
      </div>
      <label class="row">
        <span class="label">Music</span>
        <input
          class="slider"
          type="range"
          min="0"
          max="10"
          step="1"
          :value="settings.music"
          @input="onMusicInput"
        />
        <span class="value">{{ settings.music }}</span>
      </label>
      <label class="row">
        <span class="label">Effects</span>
        <input
          class="slider"
          type="range"
          min="0"
          max="10"
          step="1"
          :value="settings.effects"
          @input="onEffectsInput"
        />
        <span class="value">{{ settings.effects }}</span>
      </label>
      <div class="row">
        <span class="label">Reduced motion</span>
        <CcButton
          screen="tv"
          small
          :variant="settings.reducedMotion ? 'primary' : 'quiet'"
          v-bind="{ 'aria-pressed': settings.reducedMotion }"
          @press="patchSettings({ reducedMotion: !settings.reducedMotion })"
        >
          {{ settings.reducedMotion ? "On" : "Off" }}
        </CcButton>
      </div>
    </CcPanel>
  </div>
</template>

<style scoped>
.sound-settings {
  position: relative;
}
.icon {
  fill: var(--cc-ink);
  stroke: var(--cc-ink);
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.icon .wave,
.icon .mute-x {
  fill: none;
}
.panel {
  position: absolute;
  z-index: 1;
  inset-block-start: calc(100% + var(--cc-space-4));
  inset-inline-end: 0;
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-4);
  width: 480px;
}
.row {
  display: flex;
  align-items: center;
  gap: var(--cc-space-4);
}
.label {
  flex: 1;
  font: 700 var(--cc-text-small-tv) var(--cc-text-small-font);
}
.value {
  min-width: 2ch;
  text-align: right;
  font-family: var(--cc-font-pixel);
  font-size: var(--cc-text-small-tv);
}
.slider {
  flex: 2;
  -webkit-appearance: none;
  appearance: none;
  height: var(--cc-outline-tv);
  margin: 0;
  background: var(--cc-chalk);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 32px;
  height: 32px;
  background: var(--cc-sunny);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  cursor: pointer;
}
.slider::-moz-range-thumb {
  width: 32px;
  height: 32px;
  background: var(--cc-sunny);
  border: var(--cc-outline-tv) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  cursor: pointer;
}
.slider:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}
</style>
