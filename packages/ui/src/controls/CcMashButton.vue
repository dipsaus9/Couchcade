<script setup lang="ts">
import { ref } from "vue";
import { usePress } from "../components/press.ts";
import type { ButtonVariant, Screen } from "../components/types.ts";

/**
 * A button built for rapid tapping (Pixel Derby-style mashing). Every tap fires `mash` with the
 * native event (so a caller reads `event.timeStamp` for `at`, platform.md) and the running tap
 * count. The count only ever grows; call the exposed `reset()` between rounds.
 *
 * Unlike `CcHoldButton`, the pointer isn't captured: each tap is a fresh, independent press, the
 * way mashing works on a real button.
 */
const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    screen?: Screen;
    block?: boolean;
    disabled?: boolean;
  }>(),
  { variant: "quiet", screen: "phone", block: false, disabled: false },
);

const emit = defineEmits<{
  mash: [event: Event, count: number];
}>();

const count = ref(0);
const { pressed, down, up } = usePress(() => props.disabled);

function tap(event: Event): void {
  count.value += 1;
  emit("mash", event, count.value);
}

function onPointerdown(event: PointerEvent): void {
  if (down(event)) tap(event);
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.key !== " " && event.key !== "Enter") || props.disabled || event.repeat) return;
  event.preventDefault();
  if (pressed.value) return;
  pressed.value = true;
  tap(event);
}

function onKeyup(event: KeyboardEvent): void {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  up();
}

function reset(): void {
  count.value = 0;
}

defineExpose({ reset, count });
</script>

<template>
  <button
    type="button"
    class="cc-mash-button"
    :class="[
      `cc-mash-button--${variant}`,
      `cc-mash-button--${screen}`,
      { 'cc-mash-button--block': block, 'is-pressed': pressed },
    ]"
    :disabled="disabled"
    @pointerdown="onPointerdown"
    @pointerup="up"
    @pointercancel="up"
    @pointerleave="up"
    @keydown="onKeydown"
    @keyup="onKeyup"
    @click.prevent
    @contextmenu.prevent
  >
    <slot />
  </button>
</template>

<style scoped>
.cc-mash-button {
  --_outline: var(--cc-outline-phone);
  --_height: 64px;
  --_padding: var(--cc-space-6);
  --_font-size: var(--cc-text-action-phone);
  --_label-stroke: 2px;

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--cc-space-3);
  box-sizing: border-box;
  min-block-size: max(var(--_height), var(--cc-touch-min));
  padding: 0 var(--_padding);
  margin: 0;
  border: var(--_outline) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-chalk);
  box-shadow: var(--cc-depth-rest);
  color: var(--cc-ink);
  font-family: var(--cc-text-action-font);
  font-weight: var(--cc-text-action-weight);
  font-size: var(--_font-size);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--cc-motion-press-duration) var(--cc-motion-press-ease),
    box-shadow var(--cc-motion-press-duration) var(--cc-motion-press-ease);
}

.cc-mash-button--tv {
  --_outline: var(--cc-outline-tv);
  --_height: 88px;
  --_padding: var(--cc-space-7);
  --_font-size: var(--cc-text-action-tv);
  --_label-stroke: 3px;
}

.cc-mash-button--block {
  display: flex;
  inline-size: 100%;
}

.cc-mash-button--primary {
  background: var(--cc-sunny);
}

.cc-mash-button--go,
.cc-mash-button--stop {
  color: var(--cc-chalk);
  -webkit-text-stroke: var(--_label-stroke) var(--cc-ink);
  paint-order: stroke fill;
  text-shadow: 0 var(--_label-stroke) 0 var(--cc-ink);
}

.cc-mash-button--go {
  background: var(--cc-turf);
}

.cc-mash-button--stop {
  background: var(--cc-signal);
}

.cc-mash-button:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}

.cc-mash-button.is-pressed {
  box-shadow: var(--cc-depth-pressed);
  transform: translateY(var(--cc-press-offset));
}

.cc-mash-button:disabled {
  border-color: var(--cc-ink-20);
  background: var(--cc-chalk);
  box-shadow: none;
  color: var(--cc-ink-45);
  -webkit-text-stroke: 0;
  text-shadow: none;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .cc-mash-button {
    transition: none;
  }
}
</style>
