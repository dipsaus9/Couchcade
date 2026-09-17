<script setup lang="ts">
import { computed } from "vue";
import { usePress } from "../components/press.ts";
import type { DpadDirection } from "./types.ts";

/**
 * A 4-way directional pad: up, down, left and right, laid out in a cross. Each direction reports
 * its own press and release, so more than one can be held at once (for example up and right for a
 * diagonal). Arrow keys work the same way as touch.
 */
const props = withDefaults(
  defineProps<{
    /** Each button's side in px. */
    size?: number;
    disabled?: boolean;
  }>(),
  { size: 72, disabled: false },
);

const emit = defineEmits<{
  press: [direction: DpadDirection, event: Event];
  release: [direction: DpadDirection, event: Event];
}>();

const directions: readonly DpadDirection[] = ["up", "down", "left", "right"];
const labels: Record<DpadDirection, string> = { up: "▲", down: "▼", left: "◀", right: "▶" };
const keys: Record<string, DpadDirection> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const isDisabled = () => props.disabled;
const presses = Object.fromEntries(
  directions.map((direction) => [direction, usePress(isDisabled, { capture: true })]),
) as Record<DpadDirection, ReturnType<typeof usePress>>;

function onPointerdown(direction: DpadDirection, event: PointerEvent): void {
  if (presses[direction].down(event)) emit("press", direction, event);
}

function onPointerup(direction: DpadDirection, event: Event): void {
  if (presses[direction].up()) emit("release", direction, event);
}

function onKeydown(event: KeyboardEvent): void {
  const direction = keys[event.key];
  if (!direction || props.disabled || event.repeat) return;
  event.preventDefault();
  if (presses[direction].pressed.value) return;
  presses[direction].pressed.value = true;
  emit("press", direction, event);
}

function onKeyup(event: KeyboardEvent): void {
  const direction = keys[event.key];
  if (!direction) return;
  event.preventDefault();
  if (presses[direction].up()) emit("release", direction, event);
}

const sizePx = computed(() => `${props.size}px`);
</script>

<template>
  <div
    class="cc-dpad"
    :class="{ 'is-disabled': disabled }"
    role="group"
    aria-label="Direction pad"
    tabindex="0"
    @keydown="onKeydown"
    @keyup="onKeyup"
  >
    <button
      v-for="direction in directions"
      :key="direction"
      type="button"
      class="cc-dpad__button"
      :class="[`cc-dpad__button--${direction}`, { 'is-pressed': presses[direction].pressed.value }]"
      :disabled="disabled"
      :aria-label="direction"
      tabindex="-1"
      @pointerdown="onPointerdown(direction, $event)"
      @pointerup="onPointerup(direction, $event)"
      @pointercancel="onPointerup(direction, $event)"
      @lostpointercapture="onPointerup(direction, $event)"
      @contextmenu.prevent
    >
      {{ labels[direction] }}
    </button>
  </div>
</template>

<style scoped>
.cc-dpad {
  display: grid;
  grid-template-columns: repeat(3, v-bind(sizePx));
  grid-template-rows: repeat(3, v-bind(sizePx));
  gap: var(--cc-space-2);
  touch-action: manipulation;
}

.cc-dpad:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}

.cc-dpad__button {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  min-inline-size: var(--cc-touch-min);
  min-block-size: var(--cc-touch-min);
  margin: 0;
  padding: 0;
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-tag);
  background: var(--cc-chalk);
  box-shadow: var(--cc-depth-rest);
  color: var(--cc-ink);
  font-size: var(--cc-text-action-phone);
  line-height: 1;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform var(--cc-motion-press-duration) var(--cc-motion-press-ease),
    box-shadow var(--cc-motion-press-duration) var(--cc-motion-press-ease);
}

.cc-dpad__button--up {
  grid-area: 1 / 2;
}

.cc-dpad__button--left {
  grid-area: 2 / 1;
}

.cc-dpad__button--right {
  grid-area: 2 / 3;
}

.cc-dpad__button--down {
  grid-area: 3 / 2;
}

.cc-dpad__button.is-pressed {
  background: var(--cc-sunny);
  box-shadow: var(--cc-depth-pressed);
  transform: translateY(var(--cc-press-offset));
}

.cc-dpad__button:disabled {
  border-color: var(--cc-ink-20);
  box-shadow: none;
  color: var(--cc-ink-45);
  cursor: not-allowed;
}

.cc-dpad.is-disabled {
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .cc-dpad__button {
    transition: none;
  }
}
</style>
