<script setup lang="ts">
import { computed, watch } from "vue";
import { usePress } from "./press.ts";
import type { BigActionState } from "./types.ts";

/**
 * The in-game controller button: one big circle in the thumb zone, about 85% of the phone's
 * width. Its fill shows the state, so it works without reading the label.
 *
 * It fires `press` the moment a finger lands (pointerdown) and `release` when it lifts, so hold
 * games get both edges. Every state except `disabled` reports presses; a tap while `dont-tap` is
 * the game's to judge (usually a foul). Space and Enter press and release it from a keyboard.
 */
const props = withDefaults(
  defineProps<{
    state?: BigActionState;
    /** Short label, under 40 characters: "Tap!", "Watch the TV". The default slot overrides it. */
    label?: string;
  }>(),
  { state: "waiting", label: undefined },
);

const emit = defineEmits<{
  press: [event: Event];
  release: [event: Event];
}>();

const disabled = computed(() => props.state === "disabled");
const { pressed, down, up } = usePress(() => disabled.value, { capture: true });
const keyboard = new Set<string>();

function onPointerdown(event: PointerEvent): void {
  if (down(event)) emit("press", event);
}

function onPointerup(event: Event): void {
  if (up()) emit("release", event);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== " " && event.key !== "Enter") return;
  // The button's own click would fire on keyup (Space) or keydown (Enter); input is ours alone.
  event.preventDefault();
  if (disabled.value || event.repeat || keyboard.has(event.key)) return;
  keyboard.add(event.key);
  if (keyboard.size === 1 && !pressed.value) {
    pressed.value = true;
    emit("press", event);
  }
}

function onKeyup(event: KeyboardEvent): void {
  if (!keyboard.delete(event.key)) return;
  event.preventDefault();
  if (keyboard.size === 0 && up()) emit("release", event);
}

function onBlur(event: FocusEvent): void {
  if (keyboard.size === 0) return;
  keyboard.clear();
  if (up()) emit("release", event);
}

// Disabling mid-press ends the press, so a hold never gets stuck on.
watch(disabled, (isDisabled) => {
  if (!isDisabled) return;
  keyboard.clear();
  if (up()) emit("release", new Event("cancel"));
});
</script>

<template>
  <button
    type="button"
    class="cc-big-action"
    :class="[`cc-big-action--${state}`, { 'is-pressed': pressed }]"
    :disabled="disabled"
    @pointerdown="onPointerdown"
    @pointerup="onPointerup"
    @pointercancel="onPointerup"
    @lostpointercapture="onPointerup"
    @keydown="onKeydown"
    @keyup="onKeyup"
    @blur="onBlur"
    @click.prevent
    @contextmenu.prevent
  >
    <span class="cc-big-action__label"
      ><slot>{{ label }}</slot></span
    >
  </button>
</template>

<style scoped>
.cc-big-action {
  --_label-stroke: 2px;

  display: grid;
  place-items: center;
  box-sizing: border-box;
  inline-size: 85%;
  aspect-ratio: 1;
  margin: 0 auto;
  padding: var(--cc-space-5);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: 50%;
  background: var(--cc-chalk);
  box-shadow: var(--cc-depth-rest);
  color: var(--cc-ink);
  font-family: var(--cc-text-action-font);
  font-weight: var(--cc-text-action-weight);
  font-size: var(--cc-text-action-phone);
  line-height: 1.1;
  text-align: center;
  cursor: pointer;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--cc-motion-press-duration) var(--cc-motion-press-ease),
    box-shadow var(--cc-motion-press-duration) var(--cc-motion-press-ease),
    background-color var(--cc-motion-press-duration) var(--cc-motion-press-ease);
}

.cc-big-action--dont-tap {
  background: var(--cc-signal);
}

.cc-big-action--act-now {
  background: var(--cc-turf);
}

.cc-big-action--dont-tap,
.cc-big-action--act-now {
  color: var(--cc-chalk);
  -webkit-text-stroke: var(--_label-stroke) var(--cc-ink);
  paint-order: stroke fill;
  text-shadow: 0 var(--_label-stroke) 0 var(--cc-ink);
}

.cc-big-action--hold {
  background: var(--cc-sunny);
}

.cc-big-action--disabled {
  border-color: var(--cc-ink-20);
  box-shadow: none;
  color: var(--cc-ink-45);
  cursor: not-allowed;
}

.cc-big-action:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}

.cc-big-action.is-pressed {
  box-shadow: var(--cc-depth-pressed);
  transform: translateY(var(--cc-press-offset));
}

@media (prefers-reduced-motion: reduce) {
  .cc-big-action {
    transition: none;
  }
}
</style>
