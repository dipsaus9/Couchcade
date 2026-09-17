<script setup lang="ts">
/**
 * The touch aim pad (docs/games/target-range.md, "Touch controls"): a touchpad above the big action
 * and a quiet "Centre" button under it. It only reports pointers; `createAimDrag` turns them into
 * aim. One finger at a time drives it.
 */
import { CcButton } from "@couchcade/ui";
import type { PointerPoint } from "@couchcade/motion/fallbacks";

const emit = defineEmits<{
  point: [point: PointerPoint];
  centre: [t: number];
}>();

let active: number | null = null;

function report(event: PointerEvent, type: PointerPoint["type"]): void {
  emit("point", { t: event.timeStamp, x: event.clientX, y: event.clientY, type });
}

function onDown(event: PointerEvent): void {
  if (active !== null) return;
  active = event.pointerId;
  const target = event.currentTarget;
  if (target instanceof Element) {
    try {
      target.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events carry no active pointer. The drag still works without capture.
    }
  }
  report(event, "down");
}

function onMove(event: PointerEvent): void {
  if (event.pointerId === active) report(event, "move");
}

function onEnd(event: PointerEvent): void {
  if (event.pointerId !== active) return;
  active = null;
  report(event, event.type === "pointerup" ? "up" : "cancel");
}
</script>

<template>
  <div class="aim-pad">
    <div
      class="pad"
      role="application"
      aria-label="Aim pad"
      @pointerdown="onDown"
      @pointermove="onMove"
      @pointerup="onEnd"
      @pointercancel="onEnd"
    />
    <CcButton
      variant="quiet"
      trigger="pointerdown"
      @press="(event) => emit('centre', event.timeStamp)"
    >
      Centre
    </CcButton>
  </div>
</template>

<style scoped>
.aim-pad {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--cc-space-3);
}

.pad {
  box-sizing: border-box;
  inline-size: 100%;
  block-size: clamp(6rem, 22dvh, 10rem);
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: var(--cc-radius-panel);
  background: var(--cc-chalk);
  box-shadow: var(--cc-depth-panel);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
</style>
