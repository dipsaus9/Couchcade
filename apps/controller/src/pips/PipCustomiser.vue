<script setup lang="ts">
import type { PhoneToRelayMessage, PlayerInfo } from "@couchcade/protocol";
import { pipHairColourNames, pipHairNames, pipHairstyleIds, pipSkinNames } from "@couchcade/theme";
import { CcButton, CcPip } from "@couchcade/ui";
import { pipParts } from "@couchcade/utils/pips";
import { computed, onBeforeUnmount, ref } from "vue";
import { createPipCustomiser } from "./use-pip-customiser.ts";

// "Make your Pip" (docs/architecture/pips.md "Customiser", docs/design/platform-screens.md phone
// lobby). Three tabs of option tiles, a live preview and Shuffle. Every tap updates
// `couchcade:player` and sends `player:profile` through the send rule (CC-6.5 AC 1, 2).

const props = defineProps<{ you: PlayerInfo }>();
const emit = defineEmits<{ send: [message: PhoneToRelayMessage] }>();

const customiser = createPipCustomiser({
  you: props.you,
  send: (message) => emit("send", message),
});
const profile = customiser.profile;

onBeforeUnmount(() => customiser.dispose());

type Tab = "skin" | "hair" | "colour";
const tabs: { id: Tab; label: string }[] = [
  { id: "skin", label: "Skin" },
  { id: "hair", label: "Hair" },
  { id: "colour", label: "Colour" },
];

const activeTab = ref<Tab>("skin");

const isBald = computed(() => pipHairstyleIds[profile.value.hair] === "bald");

function selectTab(id: Tab): void {
  if (id === "colour" && isBald.value) return;
  activeTab.value = id;
}

const skinTiles = Array.from({ length: pipParts.skin }, (_, index) => ({
  index,
  label: pipSkinNames[index] ?? `Tone ${index + 1}`,
}));

const hairTiles = pipHairstyleIds.map((id, index) => ({
  index,
  label: pipHairNames[id],
}));

const colourTiles = Array.from({ length: pipParts.hairColour }, (_, index) => ({
  index,
  label: pipHairColourNames[index] ?? `Colour ${index + 1}`,
}));
</script>

<template>
  <section class="customiser">
    <div class="preview">
      <CcPip :profile="profile" :slot="you.slot" expression="happy" :size="150" surface="phone" />
      <CcButton @press="customiser.shuffle()">Shuffle</CcButton>
    </div>

    <div class="tabs" role="tablist" aria-label="Pip parts">
      <button
        v-for="t in tabs"
        :key="t.id"
        type="button"
        role="tab"
        class="tab"
        :class="{ active: activeTab === t.id, disabled: t.id === 'colour' && isBald }"
        :aria-selected="activeTab === t.id"
        :aria-disabled="t.id === 'colour' && isBald"
        @click="selectTab(t.id)"
      >
        {{ t.label }}
      </button>
    </div>
    <p v-if="isBald" class="hint">Bald Pips have no hair colour.</p>

    <div v-if="activeTab === 'skin'" class="tiles" role="radiogroup" aria-label="Skin tone">
      <button
        v-for="skin in skinTiles"
        :key="skin.index"
        type="button"
        role="radio"
        class="tile"
        :class="{ selected: profile.skin === skin.index }"
        :aria-checked="profile.skin === skin.index"
        :aria-label="skin.label"
        @click="customiser.setPart('skin', skin.index)"
      >
        <span class="swatch" :style="{ background: `var(--cc-skin-${skin.index + 1})` }" />
      </button>
    </div>

    <div v-else-if="activeTab === 'hair'" class="tiles" role="radiogroup" aria-label="Hairstyle">
      <button
        v-for="hair in hairTiles"
        :key="hair.index"
        type="button"
        role="radio"
        class="tile"
        :class="{ selected: profile.hair === hair.index }"
        :aria-checked="profile.hair === hair.index"
        :aria-label="hair.label"
        @click="customiser.setPart('hair', hair.index)"
      >
        <CcPip
          :profile="{ ...profile, hair: hair.index }"
          :slot="you.slot"
          crop="head"
          :size="52"
          surface="phone"
        />
      </button>
    </div>

    <div v-else class="tiles" role="radiogroup" aria-label="Hair colour">
      <button
        v-for="colour in colourTiles"
        :key="colour.index"
        type="button"
        role="radio"
        class="tile"
        :class="{ selected: profile.hairColour === colour.index }"
        :aria-checked="profile.hairColour === colour.index"
        :aria-label="colour.label"
        :disabled="isBald"
        @click="customiser.setPart('hairColour', colour.index)"
      >
        <span class="swatch" :style="{ background: `var(--cc-hair-${colour.index + 1})` }" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.customiser {
  display: flex;
  flex-direction: column;
  gap: var(--cc-space-4);
}

.preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-3);
}

.tabs {
  display: flex;
  gap: var(--cc-space-2);
}

.tab {
  flex: 1;
  min-height: 56px;
  padding: var(--cc-space-2) var(--cc-space-3);
  background: var(--cc-chalk);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  font-family: var(--cc-font-ui);
  font-size: var(--cc-text-small-phone);
  font-weight: var(--cc-text-title-weight);
  color: var(--cc-ink);
}

.tab.active {
  background: var(--cc-sky);
}

.tab.disabled {
  border-color: var(--cc-ink-20);
  color: var(--cc-ink-45);
}

.hint {
  margin: 0;
  font-size: var(--cc-text-small-phone);
  color: var(--cc-ink-70);
}

.tiles {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--cc-space-3);
}

.tile {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 56px;
  padding: var(--cc-space-2);
  background: var(--cc-chalk);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
}

.tile.selected {
  background: var(--cc-sky);
}

.tile:disabled {
  border-color: var(--cc-ink-20);
  opacity: 0.6;
}

.swatch {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: var(--cc-outline-phone) solid var(--cc-ink);
}
</style>
