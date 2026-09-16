<script setup lang="ts">
import { computed, useId, useSlots } from "vue";
import type { Screen } from "./types.ts";

/**
 * A Chalk panel with an Ink outline, `radius-panel` corners and `depth-panel`. Not tappable, so it
 * never sinks. An optional Sky tab overlaps the top edge and labels the panel.
 */
const props = withDefaults(
  defineProps<{
    /** Tab text. The `tab` slot overrides it. */
    tab?: string;
    screen?: Screen;
    /** The root element, for example `section` or `aside`. */
    as?: string;
  }>(),
  { tab: undefined, screen: "phone", as: "div" },
);

const slots = useSlots();
const tabId = useId();
const hasTab = computed(() => Boolean(props.tab) || Boolean(slots.tab));
</script>

<template>
  <component
    :is="as"
    class="cc-panel"
    :class="[`cc-panel--${screen}`, { 'cc-panel--tabbed': hasTab }]"
    :aria-labelledby="hasTab && as !== 'div' ? tabId : undefined"
  >
    <span v-if="hasTab" :id="tabId" class="cc-panel__tab">
      <slot name="tab">{{ tab }}</slot>
    </span>
    <slot />
  </component>
</template>

<style scoped>
.cc-panel {
  --_outline: var(--cc-outline-phone);
  --_padding: var(--cc-space-4);
  --_tab-height: var(--cc-space-6);
  --_tab-inset: var(--cc-space-4);
  --_tab-font-size: var(--cc-text-small-phone);

  position: relative;
  box-sizing: border-box;
  padding: var(--_padding);
  border: var(--_outline) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  background: var(--cc-chalk);
  box-shadow: var(--cc-depth-panel);
  color: var(--cc-ink);
  font-family: var(--cc-text-body-font);
  font-weight: var(--cc-text-body-weight);
}

.cc-panel--tv {
  --_outline: var(--cc-outline-tv);
  --_padding: var(--cc-space-5);
  --_tab-height: var(--cc-space-7);
  --_tab-inset: var(--cc-space-5);
  --_tab-font-size: var(--cc-text-small-tv);
}

/* Room under the tab that overlaps the top edge. */
.cc-panel--tabbed {
  padding-block-start: calc(var(--_tab-height) / 2 + var(--_padding));
}

.cc-panel__tab {
  position: absolute;
  inset-block-start: calc(var(--_tab-height) / -2 - var(--_outline) / 2);
  inset-inline-start: var(--_tab-inset);
  box-sizing: border-box;
  display: flex;
  align-items: center;
  block-size: var(--_tab-height);
  padding: 0 var(--cc-space-3);
  border: var(--_outline) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  background: var(--cc-sky);
  color: var(--cc-ink);
  font-family: var(--cc-text-small-font);
  font-weight: 700;
  font-size: var(--_tab-font-size);
  line-height: 1;
  white-space: nowrap;
}
</style>
