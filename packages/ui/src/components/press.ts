import { ref } from "vue";
import type { Ref } from "vue";

export interface PressTracking {
  /** True from the moment a pointer lands until it lifts, cancels or the control is disabled. */
  pressed: Ref<boolean>;
  /** Call from `pointerdown`. Returns false for presses the control should ignore. */
  down: (event: PointerEvent) => boolean;
  /** Call when the pointer lifts, cancels or lets go. Returns true if it was pressed. */
  up: () => boolean;
}

/**
 * Tracks the sunk state of a pressable control. `:active` is unreliable on touch screens (iOS
 * Safari skips it without a touch listener), so the sink follows pointer events instead.
 */
export function usePress(
  isDisabled: () => boolean,
  { capture = false }: { capture?: boolean } = {},
): PressTracking {
  const pressed = ref(false);

  function down(event: PointerEvent): boolean {
    // Only the main button: a right click or a pen barrel button isn't a tap.
    if (isDisabled() || event.button !== 0) return false;
    pressed.value = true;
    // A hold keeps the pointer while the finger slides off, so it doesn't drop. Plain buttons
    // don't capture, so sliding off still cancels the click like any native button.
    const target = event.currentTarget;
    if (capture && target instanceof Element && target.isConnected) {
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic events carry no active pointer; the press still counts.
      }
    }
    return true;
  }

  function up(): boolean {
    const was = pressed.value;
    pressed.value = false;
    return was;
  }

  return { pressed, down, up };
}
