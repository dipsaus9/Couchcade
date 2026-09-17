<script setup lang="ts">
import { computed, ref } from "vue";
import type { SliderOrientation } from "./types.ts";

/**
 * A drag slider (Paddle Panic's paddle): tapping or dragging anywhere on the track sets the
 * position, which is always an absolute 0 (track start) to 1 (track end) value, never a relative
 * delta. Arrow keys, Home and End work the same way.
 */
const props = withDefaults(
  defineProps<{
    modelValue: number;
    orientation?: SliderOrientation;
    /** Keyboard step per arrow key press. */
    step?: number;
    disabled?: boolean;
    label?: string;
  }>(),
  { orientation: "horizontal", step: 0.05, disabled: false, label: "Slider" },
);

const emit = defineEmits<{
  "update:modelValue": [value: number];
}>();

const trackEl = ref<HTMLElement>();
const dragging = ref(false);

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function valueAt(clientX: number, clientY: number): number {
  const track = trackEl.value;
  if (!track) return props.modelValue;
  const rect = track.getBoundingClientRect();
  if (props.orientation === "horizontal") {
    return rect.width === 0 ? props.modelValue : clamp((clientX - rect.left) / rect.width);
  }
  // Vertical: 0 at the bottom of the track, 1 at the top, like a volume slider.
  return rect.height === 0 ? props.modelValue : clamp((rect.bottom - clientY) / rect.height);
}

function setFrom(event: PointerEvent): void {
  emit("update:modelValue", valueAt(event.clientX, event.clientY));
}

function onPointerdown(event: PointerEvent): void {
  if (props.disabled || event.button !== 0) return;
  dragging.value = true;
  const target = event.currentTarget;
  if (target instanceof Element) {
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events carry no active pointer; dragging still works from pointermove.
    }
  }
  event.preventDefault();
  setFrom(event);
}

function onPointermove(event: PointerEvent): void {
  if (!dragging.value || props.disabled) return;
  event.preventDefault();
  setFrom(event);
}

function endDrag(): void {
  dragging.value = false;
}

function onKeydown(event: KeyboardEvent): void {
  if (props.disabled) return;
  const increaseKeys = props.orientation === "horizontal" ? ["ArrowRight"] : ["ArrowUp"];
  const decreaseKeys = props.orientation === "horizontal" ? ["ArrowLeft"] : ["ArrowDown"];
  if (increaseKeys.includes(event.key)) {
    event.preventDefault();
    emit("update:modelValue", clamp(props.modelValue + props.step));
  } else if (decreaseKeys.includes(event.key)) {
    event.preventDefault();
    emit("update:modelValue", clamp(props.modelValue - props.step));
  } else if (event.key === "Home") {
    event.preventDefault();
    emit("update:modelValue", 0);
  } else if (event.key === "End") {
    event.preventDefault();
    emit("update:modelValue", 1);
  }
}

const percent = computed(() => `${clamp(props.modelValue) * 100}%`);
</script>

<template>
  <div
    ref="trackEl"
    class="cc-drag-slider"
    :class="[
      `cc-drag-slider--${orientation}`,
      { 'is-disabled': disabled, 'is-dragging': dragging },
    ]"
    role="slider"
    :aria-label="label"
    :aria-orientation="orientation"
    aria-valuemin="0"
    aria-valuemax="1"
    :aria-valuenow="modelValue"
    :aria-disabled="disabled || undefined"
    :tabindex="disabled ? -1 : 0"
    @pointerdown="onPointerdown"
    @pointermove="onPointermove"
    @pointerup="endDrag"
    @pointercancel="endDrag"
    @lostpointercapture="endDrag"
    @keydown="onKeydown"
    @contextmenu.prevent
  >
    <div
      class="cc-drag-slider__fill"
      :style="{ [orientation === 'horizontal' ? 'inlineSize' : 'blockSize']: percent }"
    />
    <div
      class="cc-drag-slider__thumb"
      :style="{ [orientation === 'horizontal' ? 'insetInlineStart' : 'insetBlockEnd']: percent }"
    />
  </div>
</template>

<style scoped>
.cc-drag-slider {
  position: relative;
  box-sizing: border-box;
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-pill);
  background: var(--cc-chalk);
  box-shadow: var(--cc-depth-panel);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.cc-drag-slider--horizontal {
  inline-size: 100%;
  block-size: var(--cc-touch-min);
}

.cc-drag-slider--vertical {
  inline-size: var(--cc-touch-min);
  block-size: 100%;
}

.cc-drag-slider:focus-visible {
  outline: var(--cc-focus-ring-width) solid var(--cc-sunny);
  outline-offset: var(--cc-focus-ring-offset);
}

.cc-drag-slider__fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--cc-sky);
  pointer-events: none;
}

/* Horizontal grows from the left, so its right edge is free for the explicit inline-size. */
.cc-drag-slider--horizontal .cc-drag-slider__fill {
  inset-inline-end: auto;
}

/* Vertical grows from the bottom, so its top edge is free for the explicit block-size. */
.cc-drag-slider--vertical .cc-drag-slider__fill {
  inset-block-start: auto;
}

.cc-drag-slider__thumb {
  position: absolute;
  box-sizing: border-box;
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: 50%;
  background: var(--cc-sunny);
  box-shadow: var(--cc-depth-rest);
  pointer-events: none;
}

.cc-drag-slider--horizontal .cc-drag-slider__thumb {
  inset-block-start: 50%;
  inline-size: var(--cc-touch-min);
  block-size: var(--cc-touch-min);
  transform: translate(-50%, -50%);
}

.cc-drag-slider--vertical .cc-drag-slider__thumb {
  inset-inline-start: 50%;
  inline-size: var(--cc-touch-min);
  block-size: var(--cc-touch-min);
  transform: translate(-50%, 50%);
}

.cc-drag-slider.is-disabled {
  border-color: var(--cc-ink-20);
  box-shadow: none;
  cursor: not-allowed;
  pointer-events: none;
}

.cc-drag-slider.is-disabled .cc-drag-slider__thumb {
  border-color: var(--cc-ink-20);
  background: var(--cc-chalk);
  box-shadow: none;
}
</style>
