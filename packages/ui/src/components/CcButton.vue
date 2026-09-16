<script setup lang="ts">
import { watch } from "vue";
import { usePress } from "./press.ts";
import type { ButtonTrigger, ButtonVariant, Screen } from "./types.ts";

/**
 * The house style button: pill, Ink outline, hard shadow, sinks while pressed.
 *
 * - `primary` (Sunny): the one main action on a screen
 * - `go` (Turf) and `stop` (Signal): Chalk label with an Ink outline and shadow
 * - `quiet` (Chalk): secondary actions
 */
const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    screen?: Screen;
    /** TV only: the 64px button, such as Kick on a lobby card. */
    small?: boolean;
    /** `pointerdown` during gameplay; keyboard presses still work through `click`. */
    trigger?: ButtonTrigger;
    /** Stretch to the full width of the parent. */
    block?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  {
    variant: "quiet",
    screen: "phone",
    small: false,
    trigger: "click",
    block: false,
    disabled: false,
    type: "button",
  },
);

const emit = defineEmits<{
  /** The button was activated: on pointerdown or click, depending on `trigger`. */
  press: [event: Event];
}>();

const { pressed, down, up } = usePress(() => props.disabled);

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) up();
  },
);

function onPointerdown(event: PointerEvent): void {
  if (!down(event)) return;
  if (props.trigger === "pointerdown") emit("press", event);
}

function onClick(event: MouseEvent): void {
  if (props.disabled) return;
  // In pointerdown mode the pointer already pressed. A click with detail 0 comes from the
  // keyboard (Enter or Space) or assistive tech, which never sends a pointerdown.
  if (props.trigger === "pointerdown" && event.detail !== 0) return;
  emit("press", event);
}
</script>

<template>
  <button
    :type="type"
    :disabled="disabled"
    class="cc-button"
    :class="[
      `cc-button--${variant}`,
      `cc-button--${screen}`,
      {
        'cc-button--small': small && screen === 'tv',
        'cc-button--block': block,
        'is-pressed': pressed,
      },
    ]"
    @pointerdown="onPointerdown"
    @pointerup="up"
    @pointercancel="up"
    @pointerleave="up"
    @click="onClick"
  >
    <slot />
  </button>
</template>

<style scoped>
.cc-button {
  /* Phone sizes. The TV modifier below swaps them. */
  --_outline: var(--cc-outline-phone);
  --_height: 64px;
  --_padding: var(--cc-space-6);
  --_font-size: var(--cc-text-action-phone);
  /* The label outline on Turf and Signal (HOUSE_STYLE colour rules). */
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

.cc-button--tv {
  --_outline: var(--cc-outline-tv);
  --_height: 88px;
  --_padding: var(--cc-space-7);
  --_font-size: var(--cc-text-action-tv);
  --_label-stroke: 3px;
}

.cc-button--small {
  --_height: var(--cc-tv-button-small);
  --_padding: var(--cc-space-6);
}

.cc-button--block {
  display: flex;
  inline-size: 100%;
}

.cc-button--primary {
  background: var(--cc-sunny);
}

.cc-button--go,
.cc-button--stop {
  color: var(--cc-chalk);
  -webkit-text-stroke: var(--_label-stroke) var(--cc-ink);
  paint-order: stroke fill;
  text-shadow: 0 var(--_label-stroke) 0 var(--cc-ink);
}

.cc-button--go {
  background: var(--cc-turf);
}

.cc-button--stop {
  background: var(--cc-signal);
}

.cc-button:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}

.cc-button.is-pressed,
.cc-button:active:not(:disabled) {
  box-shadow: var(--cc-depth-pressed);
  transform: translateY(var(--cc-press-offset));
}

.cc-button:disabled {
  border-color: var(--cc-ink-20);
  background: var(--cc-chalk);
  box-shadow: none;
  color: var(--cc-ink-45);
  -webkit-text-stroke: 0;
  text-shadow: none;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .cc-button {
    transition: none;
  }
}
</style>
