<script setup lang="ts">
import { create as createNippleZone } from "nipplejs";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { InputVector } from "./types.ts";

/**
 * A virtual joystick built on nipplejs: a fixed base with a thumb the player drags, emitting a
 * normalised `{ x, y }` vector on every move and resetting to the centre on release.
 *
 * Runs nipplejs in `dataOnly` mode and draws its own Chalk-and-Ink base and thumb, so the control
 * follows the house style instead of nipplejs's default look. This is a raw input primitive:
 * turning the vector into a game gesture (tilt, aim) is `@couchcade/motion`'s job.
 */
const props = withDefaults(
  defineProps<{
    /** Diameter in px. The thumb is half this size, as in nipplejs's own default proportions. */
    size?: number;
    disabled?: boolean;
    /** Read by assistive tech; there is no keyboard equivalent for a drag joystick. */
    label?: string;
  }>(),
  { size: 160, disabled: false, label: "Joystick" },
);

const emit = defineEmits<{
  /** Fires on every move while dragging, and once more with `{ x: 0, y: 0 }` on release. */
  move: [vector: InputVector];
}>();

const zoneEl = ref<HTMLElement>();
const active = ref(false);
const vector = ref<InputVector>({ x: 0, y: 0 });
const sizePx = computed(() => `${props.size}px`);
let manager: ReturnType<typeof createNippleZone> | undefined;

function thumbOffset(): number {
  // The thumb's centre may travel from the base's centre out to where its own edge meets the
  // base's edge: half the base radius, matching nipplejs's own default inner-circle proportion.
  return props.size / 4;
}

function create(): void {
  const zone = zoneEl.value;
  if (!zone || props.disabled) return;
  manager = createNippleZone({
    zone,
    dataOnly: true,
    mode: "static",
    position: { left: "50%", top: "50%" },
    size: props.size,
  });
  // nipplejs always sets `touch-action: none` on the zone it manages (its own belt-and-braces
  // measure; it also calls preventDefault() on every move event itself, so this isn't needed for
  // correct dragging). House style wants every control to agree on `touch-action: manipulation`
  // (AC 5), so this overrides nipplejs's inline style right back to that.
  zone.style.touchAction = "manipulation";
  manager.on("move", (evt) => {
    vector.value = { x: evt.data.vector.x, y: evt.data.vector.y };
    emit("move", vector.value);
  });
  manager.on("start", () => {
    active.value = true;
  });
  manager.on("end", () => {
    active.value = false;
    vector.value = { x: 0, y: 0 };
    emit("move", vector.value);
  });
}

function destroy(): void {
  manager?.destroy();
  manager = undefined;
  active.value = false;
  vector.value = { x: 0, y: 0 };
}

onMounted(create);
onBeforeUnmount(destroy);

// A joystick that starts disabled, or becomes disabled mid-hold, needs to (re)build its nipplejs
// manager rather than silently ignoring input forever.
watch(
  () => props.disabled,
  (disabled) => {
    destroy();
    if (!disabled) create();
    else emit("move", { x: 0, y: 0 });
  },
);
</script>

<template>
  <div
    ref="zoneEl"
    class="cc-joystick"
    :class="{ 'is-active': active, 'is-disabled': disabled }"
    role="img"
    :aria-label="label"
  >
    <div class="cc-joystick__base" />
    <div
      class="cc-joystick__thumb"
      :style="{
        transform: `translate(${vector.x * thumbOffset()}px, ${-vector.y * thumbOffset()}px)`,
      }"
    />
  </div>
</template>

<style scoped>
.cc-joystick {
  position: relative;
  box-sizing: border-box;
  display: block;
  inline-size: v-bind(sizePx);
  block-size: v-bind(sizePx);
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
}

.cc-joystick__base {
  position: absolute;
  inset: 0;
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: 50%;
  background: var(--cc-chalk);
  box-shadow: var(--cc-depth-panel);
}

.cc-joystick__thumb {
  position: absolute;
  inset-inline-start: 25%;
  inset-block-start: 25%;
  box-sizing: border-box;
  inline-size: 50%;
  block-size: 50%;
  border: var(--cc-outline-phone) solid var(--cc-ink);
  border-radius: 50%;
  background: var(--cc-sunny);
  pointer-events: none;
  transition: none;
}

.cc-joystick.is-active .cc-joystick__thumb {
  background: var(--cc-turf);
}

.cc-joystick.is-disabled {
  pointer-events: none;
  opacity: 0.6;
}

.cc-joystick.is-disabled .cc-joystick__base {
  border-color: var(--cc-ink-20);
  box-shadow: none;
}
</style>
