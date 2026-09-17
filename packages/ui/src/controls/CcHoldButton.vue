<script setup lang="ts">
import { watch } from "vue";
import { usePress } from "../components/press.ts";
import type { ButtonVariant, Screen } from "../components/types.ts";

/**
 * A button read as a hold: `press` the moment a finger lands and `release` only when it lifts,
 * cancels or the button is disabled mid-hold. Unlike `CcButton`, the pointer is captured, so
 * sliding off the button while holding never drops the press. Both events carry the native
 * `PointerEvent` (or `KeyboardEvent`), so a caller reads `event.timeStamp` for `at` (platform.md).
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
  press: [event: Event];
  release: [event: Event];
}>();

const { pressed, down, up } = usePress(() => props.disabled, { capture: true });

function onPointerdown(event: PointerEvent): void {
  if (down(event)) emit("press", event);
}

function onPointerup(event: Event): void {
  if (up()) emit("release", event);
}

function onKeydown(event: KeyboardEvent): void {
  if ((event.key !== " " && event.key !== "Enter") || props.disabled || event.repeat) return;
  event.preventDefault();
  if (pressed.value) return;
  pressed.value = true;
  emit("press", event);
}

function onKeyup(event: KeyboardEvent): void {
  if (event.key !== " " && event.key !== "Enter") return;
  event.preventDefault();
  if (up()) emit("release", event);
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled && up()) emit("release", new Event("cancel"));
  },
);
</script>

<template>
  <button
    type="button"
    class="cc-hold-button"
    :class="[
      `cc-hold-button--${variant}`,
      `cc-hold-button--${screen}`,
      { 'cc-hold-button--block': block, 'is-pressed': pressed },
    ]"
    :disabled="disabled"
    @pointerdown="onPointerdown"
    @pointerup="onPointerup"
    @pointercancel="onPointerup"
    @lostpointercapture="onPointerup"
    @keydown="onKeydown"
    @keyup="onKeyup"
    @click.prevent
    @contextmenu.prevent
  >
    <slot />
  </button>
</template>

<style scoped>
.cc-hold-button {
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

.cc-hold-button--tv {
  --_outline: var(--cc-outline-tv);
  --_height: 88px;
  --_padding: var(--cc-space-7);
  --_font-size: var(--cc-text-action-tv);
  --_label-stroke: 3px;
}

.cc-hold-button--block {
  display: flex;
  inline-size: 100%;
}

.cc-hold-button--primary {
  background: var(--cc-sunny);
}

.cc-hold-button--go,
.cc-hold-button--stop {
  color: var(--cc-chalk);
  -webkit-text-stroke: var(--_label-stroke) var(--cc-ink);
  paint-order: stroke fill;
  text-shadow: 0 var(--_label-stroke) 0 var(--cc-ink);
}

.cc-hold-button--go {
  background: var(--cc-turf);
}

.cc-hold-button--stop {
  background: var(--cc-signal);
}

.cc-hold-button:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}

.cc-hold-button.is-pressed {
  box-shadow: var(--cc-depth-pressed);
  transform: translateY(var(--cc-press-offset));
}

.cc-hold-button:disabled {
  border-color: var(--cc-ink-20);
  background: var(--cc-chalk);
  box-shadow: none;
  color: var(--cc-ink-45);
  -webkit-text-stroke: 0;
  text-shadow: none;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .cc-hold-button {
    transition: none;
  }
}
</style>
